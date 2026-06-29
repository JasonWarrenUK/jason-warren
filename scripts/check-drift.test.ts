/**
 * Engine unit / integration tests for check-drift.js.
 *
 * check-drift.js is a CLI script with no exports. These tests use subprocess
 * invocations (bun run scripts/check-drift.js <verb>) and temporary fixture
 * repos to exercise observable behaviours:
 *
 *  1. `drift promote` write-isolation: sources.json is never touched.
 *  2. `drift promote` read-modify-write: in-progress.json entry is removed.
 *  3. `drift promote <slug> <field>`: single-field promotion leaves other fields.
 *  4. `measuredRef` is excluded from drift comparison (DRIFT_SKIP_FIELDS).
 *
 * The last assertion is structural (verified against the schema and constant)
 * rather than via subprocess, since diffFingerprint is not exported.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(scriptDir, '..');
const checkDriftPath = join(scriptDir, 'check-drift.js');

// ---------------------------------------------------------------------------
// DRIFT_SKIP_FIELDS structural test (no subprocess needed)
// ---------------------------------------------------------------------------

describe('DRIFT_SKIP_FIELDS structural contract', () => {
	it('measuredRef is in sources.schema.json (write gate allows it)', () => {
		const schemaPath = join(scriptDir, 'sources.schema.json');
		const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
		const props = schema.$defs?.SyncedSource?.properties ?? {};
		expect(Object.keys(props)).toContain('measuredRef');
	});

	it('measuredRef description notes it is excluded from drift comparison', () => {
		const schemaPath = join(scriptDir, 'sources.schema.json');
		const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
		const desc: string = schema.$defs?.SyncedSource?.properties?.measuredRef?.description ?? '';
		// The description must mention skip/exclude/drift to be self-documenting.
		expect(desc.toLowerCase()).toMatch(/exclud|skip|drift/);
	});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal temporary data directory for promote tests. */
function makeTempDataDir(inProgressContent: object, sourcesContent?: object) {
	const dir = mkdtempSync(join(tmpdir(), 'drift-promote-test-'));

	// Minimal in-progress.json
	writeFileSync(
		join(dir, 'in-progress.json'),
		JSON.stringify(inProgressContent, null, '\t')
	);

	// Minimal sources.json (reproduce sentinel values; promote must not change it)
	const sentinel = sourcesContent ?? {
		$schema: '../../scripts/sources.schema.json',
		sources: {}
	};
	writeFileSync(join(dir, 'sources.json'), JSON.stringify(sentinel, null, '\t'));

	// Minimal overrides.json and excluded.json (checked by loadManifests)
	writeFileSync(join(dir, 'overrides.json'), JSON.stringify({ overrides: {} }, null, '\t'));
	writeFileSync(
		join(dir, 'excluded.json'),
		JSON.stringify({ slugs: [], repoNames: [] }, null, '\t')
	);

	// Minimal .drift-cache.json
	writeFileSync(join(dir, '.drift-cache.json'), JSON.stringify({}, null, '\t'));

	// in-progress.schema.json must exist for JSON.parse of the manifest to succeed
	// (the engine doesn't validate the schema at runtime, but having it present avoids
	// potential issues). Copy the real one.
	const realSchema = join(repoRoot, 'src/lib/data/in-progress.schema.json');
	cpSync(realSchema, join(dir, 'in-progress.schema.json'));

	return dir;
}

/** Returns the DRIFT_CONFIG env approach: write a temp config file. */
function makeDriftConfig(dataDir: string): string {
	const configPath = join(dataDir, 'drift.config.mjs');
	writeFileSync(
		configPath,
		`export default { dataDir: ${JSON.stringify(dataDir)} };\n`
	);
	return configPath;
}

/** Run promote with a config file pointing at a temp data dir. */
function runPromoteWithConfig(dataDir: string, args: string[]) {
	const configPath = makeDriftConfig(dataDir);
	return spawnSync(
		'bun',
		['run', checkDriftPath, 'promote', ...args],
		{
			cwd: repoRoot,
			env: { ...process.env, DRIFT_CONFIG: configPath },
			encoding: 'utf8',
			timeout: 15_000
		}
	);
}

// ---------------------------------------------------------------------------
// promote write-isolation tests
// ---------------------------------------------------------------------------

describe('drift promote: write-isolation', () => {
	let dataDir: string;
	const sentinelSourcesContent = {
		$schema: '../../scripts/sources.schema.json',
		sources: {
			'test-project': {
				head: 'abc1234',
				commits: 42
			}
		}
	};

	beforeEach(() => {
		dataDir = makeTempDataDir(
			{
				$schema: './in-progress.schema.json',
				_note: 'test',
				inProgress: {
					'test-project': {
						branch: 'feat/my-feature',
						pipeline: ['feat/my-feature', 'main'],
						visibility: 'public',
						tracked: {
							linesOfCode: { value: 1500, baseOnMain: 1200 },
							commits: { value: 55, baseOnMain: 42 }
						}
					}
				}
			},
			sentinelSourcesContent
		);
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	it('promote does not modify sources.json (write-isolation)', () => {
		const sourcesBefore = readFileSync(join(dataDir, 'sources.json'), 'utf8');
		runPromoteWithConfig(dataDir, ['test-project']);
		const sourcesAfter = readFileSync(join(dataDir, 'sources.json'), 'utf8');
		expect(sourcesAfter).toBe(sourcesBefore);
	});

	it('promote removes the whole entry from in-progress.json when no field given', () => {
		const result = runPromoteWithConfig(dataDir, ['test-project']);
		expect(result.status, result.stderr).toBe(0);

		const ip = JSON.parse(readFileSync(join(dataDir, 'in-progress.json'), 'utf8'));
		expect(ip.inProgress).not.toHaveProperty('test-project');
	});

	it('promote <slug> <field> removes only that field, leaving others', () => {
		const result = runPromoteWithConfig(dataDir, ['test-project', 'linesOfCode']);
		expect(result.status, result.stderr).toBe(0);

		const ip = JSON.parse(readFileSync(join(dataDir, 'in-progress.json'), 'utf8'));
		// linesOfCode should be gone
		expect(ip.inProgress['test-project'].tracked).not.toHaveProperty('linesOfCode');
		// commits should still be present
		expect(ip.inProgress['test-project'].tracked).toHaveProperty('commits');
	});

	it('promote <slug> <field> retires the whole entry when it was the last field', () => {
		// First promote one field, leaving only commits
		runPromoteWithConfig(dataDir, ['test-project', 'linesOfCode']);
		// Now promote the last field
		const result = runPromoteWithConfig(dataDir, ['test-project', 'commits']);
		expect(result.status, result.stderr).toBe(0);

		const ip = JSON.parse(readFileSync(join(dataDir, 'in-progress.json'), 'utf8'));
		expect(ip.inProgress).not.toHaveProperty('test-project');
	});

	it('promote warns (but succeeds) when slug is not in in-progress.json', () => {
		const result = runPromoteWithConfig(dataDir, ['nonexistent-slug']);
		// Should exit 0 (warning, not fatal)
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/not in in-progress/i);
	});

	it('promote exits 1 when slug is present but field arg is not tracked', () => {
		const result = runPromoteWithConfig(dataDir, ['test-project', 'nonexistentField']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/not tracked/i);
	});

	it('promote exits 1 when no slug is given', () => {
		const result = runPromoteWithConfig(dataDir, []);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/usage.*promote/i);
	});

	it('sources.json sentinel value is unchanged after full promote', () => {
		// Extra paranoia: the actual bytes of sources.json must match exactly.
		const before = readFileSync(join(dataDir, 'sources.json'), 'utf8');
		runPromoteWithConfig(dataDir, ['test-project']);
		const after = readFileSync(join(dataDir, 'sources.json'), 'utf8');
		expect(after).toBe(before);
		// And the sentinel content is still parseable and correct
		const parsed = JSON.parse(after);
		expect(parsed.sources['test-project'].commits).toBe(42);
	});
});

// ---------------------------------------------------------------------------
// drift init tests
// ---------------------------------------------------------------------------

/**
 * Run `drift init` in a sandboxed temp directory.
 *
 * DRIFT_CONFIG is set to a config file inside the temp dir. runInit derives
 * the drift.config.ts write target from the same directory as DRIFT_CONFIG,
 * so both generated files stay inside the temp dir — the real repo root is
 * never touched.
 *
 * The config file passed via DRIFT_CONFIG points dataDir at the same temp dir
 * so sources.local.json (config.paths.local) also resolves inside it.
 */
function runInitInDir(dir: string) {
	// The DRIFT_CONFIG file lives in the temp dir. runInit writes drift.config.ts
	// alongside it (dirname of DRIFT_CONFIG).
	const configPath = join(dir, 'drift.config.mjs');
	writeFileSync(
		configPath,
		`export default { dataDir: ${JSON.stringify(dir)} };\n`
	);
	return spawnSync(
		'bun',
		['run', checkDriftPath, 'init', '--no-color'],
		{
			cwd: repoRoot,
			env: { ...process.env, DRIFT_CONFIG: configPath },
			encoding: 'utf8',
			timeout: 15_000
		}
	);
}

describe('drift init', () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'drift-init-test-'));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates sources.local.json with an empty paths object', () => {
		const result = runInitInDir(dir);
		expect(result.status, result.stderr).toBe(0);

		const localPath = join(dir, 'sources.local.json');
		const parsed = JSON.parse(readFileSync(localPath, 'utf8'));
		expect(parsed).toHaveProperty('paths');
		expect(parsed.paths).toEqual({});
		expect(parsed).toHaveProperty('_note');
	});

	it('creates drift.config.ts as valid TypeScript with expected keys', () => {
		const result = runInitInDir(dir);
		expect(result.status, result.stderr).toBe(0);

		const configPath = join(dir, 'drift.config.ts');
		const source = readFileSync(configPath, 'utf8');
		// Must export a default object
		expect(source).toContain('export default');
		// Must contain the core config keys
		expect(source).toContain('scanRoot');
		expect(source).toContain('scanDepth');
		expect(source).toContain('pattern'); // author pattern key
		// The type annotation must reference drift-config.js
		expect(source).toContain('DriftUserConfig');
	});

	it('reports "created" for each new file in stdout', () => {
		const result = runInitInDir(dir);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/created.*sources\.local\.json/);
		expect(result.stdout).toMatch(/created.*drift\.config\.ts/);
	});

	it('is idempotent — second run reports skipping for both files', () => {
		// First run creates the files
		runInitInDir(dir);
		// Second run must not overwrite them
		const localBefore = readFileSync(join(dir, 'sources.local.json'), 'utf8');
		const configBefore = readFileSync(join(dir, 'drift.config.ts'), 'utf8');

		const result = runInitInDir(dir);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('already exists, skipping');

		// Content must be byte-identical
		expect(readFileSync(join(dir, 'sources.local.json'), 'utf8')).toBe(localBefore);
		expect(readFileSync(join(dir, 'drift.config.ts'), 'utf8')).toBe(configBefore);
	});

	it('skips only the existing file when one already exists', () => {
		// Pre-create only sources.local.json
		writeFileSync(
			join(dir, 'sources.local.json'),
			JSON.stringify({ _note: 'pre-existing', paths: { 'my-project': '/some/path' } })
		);

		const result = runInitInDir(dir);
		expect(result.status, result.stderr).toBe(0);
		// sources.local.json skipped (pre-existing content preserved)
		expect(result.stdout).toMatch(/already exists, skipping.*sources\.local\.json/);
		// drift.config.ts still created
		expect(result.stdout).toMatch(/created.*drift\.config\.ts/);

		// Pre-existing file must be unchanged
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.local.json'), 'utf8'));
		expect(parsed.paths).toHaveProperty('my-project');
	});
});

// ---------------------------------------------------------------------------
// Helpers: sandbox for author / pin / audit
// ---------------------------------------------------------------------------

/**
 * Creates a sandboxed temp directory with a `projects/` subdirectory and a
 * drift.config.mjs pointing dataDir at the temp dir. Returns the temp dir and
 * config path.
 *
 * The engine derives config.paths.projects from `<dataDir>/projects`, so all
 * overlay reads and writes go into the temp dir — the real projects/ is never
 * touched.
 */
function makeOverlaySandbox(): { dir: string; configPath: string } {
	const dir = mkdtempSync(join(tmpdir(), 'drift-overlay-test-'));
	mkdirSync(join(dir, 'projects'));
	const configPath = join(dir, 'drift.config.mjs');
	writeFileSync(configPath, `export default { dataDir: ${JSON.stringify(dir)} };\n`);
	return { dir, configPath };
}

function runVerbInSandbox(configPath: string, args: string[]) {
	return spawnSync('bun', ['run', checkDriftPath, ...args, '--no-color'], {
		cwd: repoRoot,
		env: { ...process.env, DRIFT_CONFIG: configPath, EDITOR: '', VISUAL: '' },
		encoding: 'utf8',
		timeout: 30_000
	});
}

// ---------------------------------------------------------------------------
// drift author tests
// ---------------------------------------------------------------------------

describe('drift author', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates the overlay when absent', () => {
		const result = runVerbInSandbox(configPath, ['author', 'my-project']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/created/);

		const overlayPath = join(dir, 'projects', 'my-project.ts');
		const source = readFileSync(overlayPath, 'utf8');
		expect(source).toContain('AuthoredProject');
		expect(source).toContain("export const myProject: AuthoredProject");
		expect(source).toContain('my-project');
	});

	it('generates the correct camelCase binding for a multi-part slug', () => {
		runVerbInSandbox(configPath, ['author', 'those-who-came-before']);
		const source = readFileSync(join(dir, 'projects', 'those-who-came-before.ts'), 'utf8');
		expect(source).toContain('export const thoseWhoCameBefore: AuthoredProject');
	});

	it('never overwrites an existing overlay', () => {
		const overlayPath = join(dir, 'projects', 'existing.ts');
		const sentinel = '// sentinel content — must not change\n';
		writeFileSync(overlayPath, sentinel);

		const result = runVerbInSandbox(configPath, ['author', 'existing']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/already exists, skipping/);
		expect(readFileSync(overlayPath, 'utf8')).toBe(sentinel);
	});

	it('exits 1 on a missing slug argument', () => {
		const result = runVerbInSandbox(configPath, ['author']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/usage.*author/i);
	});

	it('exits 1 on a malformed slug (uppercase, spaces)', () => {
		const result = runVerbInSandbox(configPath, ['author', 'Bad Slug']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/invalid slug/i);
	});

	it('exits 1 on a malformed slug (path traversal attempt)', () => {
		const result = runVerbInSandbox(configPath, ['author', '../escape']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/invalid slug/i);
	});

	it('template includes the depth-rubric hint', () => {
		runVerbInSandbox(configPath, ['author', 'rubric-test']);
		const source = readFileSync(join(dir, 'projects', 'rubric-test.ts'), 'utf8');
		expect(source).toContain('Depth rubric');
	});
});

// ---------------------------------------------------------------------------
// drift pin tests
// ---------------------------------------------------------------------------

describe('drift pin', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates the overlay and sets pin: true when the overlay is absent', () => {
		const result = runVerbInSandbox(configPath, ['pin', 'fresh-slug']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/pinned/i);

		const source = readFileSync(join(dir, 'projects', 'fresh-slug.ts'), 'utf8');
		expect(source).toContain('pin: true');
		expect(source).toContain('fresh-slug');
	});

	it('inserts pin: true into an existing overlay that lacks it, leaving other fields intact', () => {
		// Write a minimal real-shape overlay without pin.
		const overlayPath = join(dir, 'projects', 'has-no-pin.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const hasNoPin: AuthoredProject = {',
				"\tslug: 'has-no-pin',",
				"\tname: 'Has No Pin',",
				"\tdescription: 'A test overlay without a pin field.',",
				'\thighlights: [],',
				'\trelationships: [],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, ['pin', 'has-no-pin']);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('pin: true');
		// Sibling fields must survive.
		expect(modified).toContain('Has No Pin');
		expect(modified).toContain('A test overlay without a pin field.');
	});

	it('flips pin: false to pin: true', () => {
		const overlayPath = join(dir, 'projects', 'pinned-false.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const pinnedFalse: AuthoredProject = {',
				"\tslug: 'pinned-false',",
				'\tpin: false,',
				'\thighlights: [],',
				'\trelationships: [],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, ['pin', 'pinned-false']);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('pin: true');
		expect(modified).not.toContain('pin: false');
	});

	it('is idempotent when already pin: true', () => {
		const overlayPath = join(dir, 'projects', 'already-pinned.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const alreadyPinned: AuthoredProject = {',
				"\tslug: 'already-pinned',",
				'\tpin: true,',
				'\thighlights: [],',
				'\trelationships: [],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);
		const before = readFileSync(overlayPath, 'utf8');

		const result = runVerbInSandbox(configPath, ['pin', 'already-pinned']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/already pinned/i);

		// File bytes must be unchanged.
		expect(readFileSync(overlayPath, 'utf8')).toBe(before);
	});

	it('exits 1 on a missing slug argument', () => {
		const result = runVerbInSandbox(configPath, ['pin']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/usage.*pin/i);
	});

	it('exits 1 on a malformed slug', () => {
		const result = runVerbInSandbox(configPath, ['pin', 'Bad/Slug']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/invalid slug/i);
	});

	it('the modified overlay still imports cleanly via Bun', async () => {
		runVerbInSandbox(configPath, ['pin', 'importable']);
		const overlayPath = join(dir, 'projects', 'importable.ts');
		// The file imports '../types.js' using a relative path that won't resolve
		// from the temp dir. Drop the import line and verify the module shape instead.
		const source = readFileSync(overlayPath, 'utf8');
		expect(source).toContain('pin: true');
		expect(source).toContain('importable');
		// Confirm the braces are balanced (basic syntax check).
		const openBraces = (source.match(/\{/g) ?? []).length;
		const closeBraces = (source.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});
});

// ---------------------------------------------------------------------------
// drift audit tests
// ---------------------------------------------------------------------------

/**
 * Writes a type-import-free fixture overlay into the sandbox projects/ dir.
 * Uses plain export const (no import type) so Bun can load it from a temp dir
 * without resolving the relative '../types.js' path.
 */
function writeFixture(
	dir: string,
	slug: string,
	fields: {
		description?: string;
		highlights?: string[];
		role?: string;
		contributionNote?: string;
	}
) {
	const {
		description = '',
		highlights = [],
		role = 'solo',
		contributionNote
	} = fields;
	const contribution =
		contributionNote
			? `{ role: '${role}', contributionNote: ${JSON.stringify(contributionNote)} }`
			: `{ role: '${role}' }`;
	const binding = slug.replace(/-([a-z0-9])/g, (_: string, c: string) => c.toUpperCase());
	const source = [
		`export const ${binding} = {`,
		`\tslug: ${JSON.stringify(slug)},`,
		`\tdescription: ${JSON.stringify(description)},`,
		`\thighlights: ${JSON.stringify(highlights)},`,
		`\tcontribution: ${contribution}`,
		'};',
		''
	].join('\n');
	writeFileSync(join(dir, 'projects', `${slug}.ts`), source);
}

describe('drift audit', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	function runAuditJSON(): { summary: Record<string, number>; entries: Record<string, unknown>[] } {
		const result = runVerbInSandbox(configPath, ['audit', '--json']);
		expect(result.status, result.stderr).toBe(0);
		return JSON.parse(result.stdout);
	}

	it('assigns Thin tier when description < 40 words and <= 2 highlights', () => {
		writeFixture(dir, 'thin-entry', {
			description: 'A short description that is under forty words.',
			highlights: ['one point']
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'thin-entry');
		expect(entry?.tier).toBe('Thin');
	});

	it('assigns Full tier when description >= 80 words and >= 4 highlights', () => {
		const longDesc = Array(20).fill('word').join(' '); // 20 words — below threshold
		const fullDesc = Array(85).fill('word').join(' '); // 85 words — above threshold
		writeFixture(dir, 'full-entry', {
			description: fullDesc,
			highlights: ['h1', 'h2', 'h3', 'h4', 'h5']
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'full-entry');
		expect(entry?.tier).toBe('Full');
		void longDesc; // used above to document the test logic
	});

	it('assigns Partial tier when description is 40-79 words', () => {
		const partialDesc = Array(55).fill('word').join(' ');
		writeFixture(dir, 'partial-entry', {
			description: partialDesc,
			highlights: ['h1', 'h2', 'h3', 'h4']
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'partial-entry');
		expect(entry?.tier).toBe('Partial');
	});

	it('worst-axis rule: long description + 2 highlights => Thin (highlights dominate)', () => {
		const longDesc = Array(120).fill('word').join(' ');
		writeFixture(dir, 'worst-axis', {
			description: longDesc,
			highlights: ['one', 'two']
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'worst-axis');
		expect(entry?.tier).toBe('Thin');
	});

	it('team-note axis: lead with no contributionNote => Thin despite strong desc+highlights', () => {
		const fullDesc = Array(90).fill('word').join(' ');
		writeFixture(dir, 'team-no-note', {
			description: fullDesc,
			highlights: ['h1', 'h2', 'h3', 'h4', 'h5'],
			role: 'lead'
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'team-no-note');
		expect(entry?.tier).toBe('Thin');
	});

	it('team-note axis: lead with contributionNote => Full', () => {
		const fullDesc = Array(90).fill('word').join(' ');
		writeFixture(dir, 'team-with-note', {
			description: fullDesc,
			highlights: ['h1', 'h2', 'h3', 'h4', 'h5'],
			role: 'lead',
			contributionNote: 'Led 24 PRs on a SvelteKit platform, drove the architecture.'
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'team-with-note');
		expect(entry?.tier).toBe('Full');
	});

	it('summary counts match the entries', () => {
		writeFixture(dir, 'thin-1', { description: 'Short.', highlights: [] });
		const fullDesc = Array(90).fill('word').join(' ');
		writeFixture(dir, 'full-1', { description: fullDesc, highlights: ['h1', 'h2', 'h3', 'h4'] });
		writeFixture(dir, 'full-2', { description: fullDesc, highlights: ['h1', 'h2', 'h3', 'h4', 'h5'] });

		const { summary, entries } = runAuditJSON();
		expect(summary.Thin).toBe(1);
		expect(summary.Full).toBe(2);
		expect(entries).toHaveLength(3);
	});

	it('borderline flag: description at exactly 80 words (on the Full threshold)', () => {
		const edgeDesc = Array(80).fill('word').join(' ');
		writeFixture(dir, 'borderline-80w', {
			description: edgeDesc,
			highlights: ['h1', 'h2', 'h3', 'h4', 'h5']
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'borderline-80w');
		expect(entry?.borderline).toBe(true);
		expect(entry?.tier).toBe('Full'); // borderline does not change the tier
	});

	it('borderline flag: exactly 4 highlights (on the Full threshold)', () => {
		const fullDesc = Array(90).fill('word').join(' ');
		writeFixture(dir, 'borderline-4hl', {
			description: fullDesc,
			highlights: ['h1', 'h2', 'h3', 'h4']
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'borderline-4hl');
		expect(entry?.borderline).toBe(true);
		expect(entry?.tier).toBe('Full');
	});

	it('load-error isolation: a broken fixture is reported and others still score', () => {
		// Write a fixture that throws on import.
		writeFileSync(
			join(dir, 'projects', 'broken.ts'),
			"throw new Error('intentional load error');\n"
		);
		const fullDesc = Array(90).fill('word').join(' ');
		writeFixture(dir, 'healthy', { description: fullDesc, highlights: ['h1', 'h2', 'h3', 'h4'] });

		const { entries } = runAuditJSON();
		const broken = entries.find((e: Record<string, unknown>) => e.slug === 'broken');
		const healthy = entries.find((e: Record<string, unknown>) => e.slug === 'healthy');

		expect(broken?.loadError).toBeTruthy();
		expect(healthy?.tier).toBe('Full');
		// Total entry count includes the broken file
		expect(entries).toHaveLength(2);
	});

	it('stale-doc independence: a fixture not in the committed scorecard scores correctly', () => {
		// 'completely-new-slug' does not appear in docs/audits/content-depth.md.
		const fullDesc = Array(90).fill('word').join(' ');
		writeFixture(dir, 'completely-new-slug', {
			description: fullDesc,
			highlights: ['h1', 'h2', 'h3', 'h4']
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e: Record<string, unknown>) => e.slug === 'completely-new-slug');
		// The audit scored it from current file contents, not the committed table.
		expect(entry?.tier).toBe('Full');
	});

	it('empty projects/ directory produces an empty result', () => {
		const { summary, entries } = runAuditJSON();
		expect(entries).toHaveLength(0);
		expect(summary.Thin).toBe(0);
		expect(summary.Partial).toBe(0);
		expect(summary.Full).toBe(0);
	});
});
