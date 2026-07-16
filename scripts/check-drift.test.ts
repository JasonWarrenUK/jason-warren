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
 *
 * Heavy blocking I/O warning: this file's spawnSync calls (up to 30s each)
 * block their worker's event loop long enough to miss vitest's internal
 * worker RPC heartbeat if this file shares a worker pool with the rest of
 * the suite — that produced an intermittent, CI-failing
 * "[vitest-worker]: Timeout calling onTaskUpdate" even when every test here
 * passed. package.json's "test" script runs this file as its own separate
 * `vitest run` invocation for that reason; don't fold it back into a single
 * `vitest run` without re-isolating it (its own pool/fork config, or keeping
 * the split invocation).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
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
// Project slug shape — mirrors check-drift.js's validateProjectSlug/runRelate
// regex (`/^[a-z0-9]+(-[a-z0-9]+)*$/`). check-drift.js is a CLI script with
// no exports, so this can't import the function directly; the regex is
// duplicated here as the single source of truth's OWN contract check, and
// the "drift relate" describe block below exercises the wired-up behaviour
// end-to-end via the real CLI ('exits 1 on a malformed project slug').
// If this regex and the one in check-drift.js ever diverge, this test and
// the CLI-level test will disagree, surfacing the drift.
// ---------------------------------------------------------------------------

describe('project slug shape (validateProjectSlug / runRelate contract)', () => {
	const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

	it.each([
		['my-project', true],
		['nib', true],
		['a1-b2-c3', true],
		['already-hyphenated-many-times', true]
	])('%s is valid: %s', (value, expected) => {
		expect(SLUG_PATTERN.test(value)).toBe(expected);
	});

	it.each([
		['Bad-Slug', false], // uppercase
		['bad_slug', false], // underscore
		['-leading-hyphen', false],
		['trailing-hyphen-', false],
		['double--hyphen', false],
		['', false], // empty
		['has space', false]
	])('%s is invalid: %s', (value, expected) => {
		expect(SLUG_PATTERN.test(value)).toBe(expected);
	});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal temporary data directory for promote tests. */
function makeTempDataDir(inProgressContent: object, sourcesContent?: object) {
	const dir = mkdtempSync(join(tmpdir(), 'drift-promote-test-'));

	// Minimal in-progress.json
	writeFileSync(join(dir, 'in-progress.json'), JSON.stringify(inProgressContent, null, '\t'));

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
	writeFileSync(configPath, `export default { dataDir: ${JSON.stringify(dataDir)} };\n`);
	return configPath;
}

/** Run promote with a config file pointing at a temp data dir. */
function runPromoteWithConfig(dataDir: string, args: string[]) {
	const configPath = makeDriftConfig(dataDir);
	return spawnSync('bun', ['run', checkDriftPath, 'promote', ...args], {
		cwd: repoRoot,
		env: { ...process.env, DRIFT_CONFIG: configPath },
		encoding: 'utf8',
		timeout: 15_000
	});
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
	writeFileSync(configPath, `export default { dataDir: ${JSON.stringify(dir)} };\n`);
	return spawnSync('bun', ['run', checkDriftPath, 'init', '--no-color'], {
		cwd: repoRoot,
		env: { ...process.env, DRIFT_CONFIG: configPath },
		encoding: 'utf8',
		timeout: 15_000
	});
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
// drift tech tests
// ---------------------------------------------------------------------------

const EMPTY_TECH_OVERLAYS = [
	"import type { TechOverlay } from './types.js';",
	'',
	'export const techOverlays: TechOverlay[] = [];',
	''
].join('\n');

describe('drift tech', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
		writeFileSync(join(dir, 'tech-overlays.ts'), EMPTY_TECH_OVERLAYS);
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('set creates a record with the given fields, resolving label casing', () => {
		const result = runVerbInSandbox(configPath, [
			'tech',
			'set',
			'ink',
			'--first-used',
			'2019-06-15',
			'--note',
			'Where it all began.'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/Using 'Ink' for 'ink'/);

		const source = readFileSync(join(dir, 'tech-overlays.ts'), 'utf8');
		expect(source).toContain('label: "Ink"');
		expect(source).toContain('firstUsed: "2019-06-15"');
		expect(source).toContain('Where it all began.');
	});

	it('set updates one field leaving the others intact, and is idempotent', () => {
		runVerbInSandbox(configPath, ['tech', 'set', 'Ink', '--note', 'Original note.']);
		runVerbInSandbox(configPath, ['tech', 'set', 'Ink', '--first-used', '2019-06-15']);
		const source = readFileSync(join(dir, 'tech-overlays.ts'), 'utf8');
		expect(source).toContain('Original note.');
		expect(source).toContain('firstUsed: "2019-06-15"');

		const repeat = runVerbInSandbox(configPath, [
			'tech',
			'set',
			'Ink',
			'--first-used',
			'2019-06-15'
		]);
		expect(repeat.status, repeat.stderr).toBe(0);
		expect(repeat.stdout).toMatch(/already/i);
		expect(readFileSync(join(dir, 'tech-overlays.ts'), 'utf8')).toBe(source);
	});

	it('set with no field flags exits 1', () => {
		const result = runVerbInSandbox(configPath, ['tech', 'set', 'Ink']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/nothing to change/i);
	});

	it('set rejects an unknown label and a malformed date', () => {
		const unknown = runVerbInSandbox(configPath, ['tech', 'set', 'Bogus', '--note', 'x']);
		expect(unknown.status).toBe(1);
		expect(unknown.stderr).toMatch(/unknown tech label 'Bogus'/i);

		const badDate = runVerbInSandbox(configPath, [
			'tech',
			'set',
			'Ink',
			'--first-used',
			'2019-13-01'
		]);
		expect(badDate.status).toBe(1);
		expect(badDate.stderr).toMatch(/ISO date/i);
	});

	it('hide defaults to all four surfaces; unhide peels them back', () => {
		const hide = runVerbInSandbox(configPath, ['tech', 'hide', 'Ink']);
		expect(hide.status, hide.stderr).toBe(0);
		expect(readFileSync(join(dir, 'tech-overlays.ts'), 'utf8')).toContain(
			'hiddenFrom: ["toolkit", "map", "stack", "relate"]'
		);

		const unhide = runVerbInSandbox(configPath, ['tech', 'unhide', 'Ink', '--from', 'map,stack']);
		expect(unhide.status, unhide.stderr).toBe(0);
		expect(readFileSync(join(dir, 'tech-overlays.ts'), 'utf8')).toContain(
			'hiddenFrom: ["toolkit", "relate"]'
		);
	});

	it('hide is idempotent per surface and unions new surfaces in', () => {
		runVerbInSandbox(configPath, ['tech', 'hide', 'Ink', '--from', 'toolkit']);
		const before = readFileSync(join(dir, 'tech-overlays.ts'), 'utf8');
		const repeat = runVerbInSandbox(configPath, ['tech', 'hide', 'Ink', '--from', 'toolkit']);
		expect(repeat.stdout).toMatch(/already hidden/i);
		expect(readFileSync(join(dir, 'tech-overlays.ts'), 'utf8')).toBe(before);

		runVerbInSandbox(configPath, ['tech', 'hide', 'Ink', '--from', 'relate']);
		expect(readFileSync(join(dir, 'tech-overlays.ts'), 'utf8')).toContain(
			'hiddenFrom: ["toolkit", "relate"]'
		);
	});

	it('unhide --all removes a bare record entirely', () => {
		runVerbInSandbox(configPath, ['tech', 'hide', 'Ink']);
		const result = runVerbInSandbox(configPath, ['tech', 'unhide', 'Ink', '--all']);
		expect(result.status, result.stderr).toBe(0);
		const source = readFileSync(join(dir, 'tech-overlays.ts'), 'utf8');
		expect(source).not.toContain('Ink');
	});

	it('unhide of a label hidden nowhere is a soft no-op', () => {
		const result = runVerbInSandbox(configPath, ['tech', 'unhide', 'Ink']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/not hidden anywhere/i);
	});

	it('rejects an unknown surface token', () => {
		const result = runVerbInSandbox(configPath, ['tech', 'hide', 'Ink', '--from', 'toolbox']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/unknown surface 'toolbox'/i);
	});

	it('a relate-hidden label disappears from relate resolution but stays visible to tech', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [];',
				''
			].join('\n')
		);
		runVerbInSandbox(configPath, ['tech', 'hide', 'Ink', '--from', 'relate']);

		const relate = runVerbInSandbox(configPath, ['relate', 'tech', 'Ink', 'leads-to', 'inkjs']);
		expect(relate.status).toBe(1);
		expect(relate.stderr).toMatch(/unknown tech label 'Ink'/i);

		const detail = runVerbInSandbox(configPath, ['tech', 'list', 'Ink']);
		expect(detail.status, detail.stderr).toBe(0);
		expect(detail.stdout).toMatch(/hidden from relate/i);
	});

	it('mutating actions exit 1 when tech-overlays.ts is missing; write isolation holds', () => {
		rmSync(join(dir, 'tech-overlays.ts'));
		const result = runVerbInSandbox(configPath, ['tech', 'hide', 'Ink']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/not found/i);

		// Re-seed and confirm a tech write touches nothing else.
		writeFileSync(join(dir, 'tech-overlays.ts'), EMPTY_TECH_OVERLAYS);
		const sentinel = "export const sentinel = { slug: 'sentinel' };\n";
		writeFileSync(join(dir, 'projects', 'sentinel.ts'), sentinel);
		runVerbInSandbox(configPath, ['tech', 'set', 'Ink', '--note', 'n']);
		expect(readFileSync(join(dir, 'projects', 'sentinel.ts'), 'utf8')).toBe(sentinel);
	});
});

// ---------------------------------------------------------------------------
// drift tag tests
// ---------------------------------------------------------------------------

describe('drift tag', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('add creates the overlay and a tags property, inferring a known label kind', () => {
		const result = runVerbInSandbox(configPath, ['tag', 'add', 'my-proj', 'ink']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/Using 'Ink' for 'ink'/);
		expect(result.stdout).toMatch(/Tagged: 'my-proj' with 'Ink' \(language\)/);

		const source = readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8');
		expect(source).toContain('label: "Ink"');
		expect(source).toContain('kind: "language"');
	});

	it('add of an unknown label requires --kind, then becomes addable', () => {
		const bare = runVerbInSandbox(configPath, ['tag', 'add', 'my-proj', 'Quantum Foam']);
		expect(bare.status).toBe(1);
		expect(bare.stderr).toMatch(/unknown tech label 'Quantum Foam'/i);

		const withKind = runVerbInSandbox(configPath, [
			'tag',
			'add',
			'my-proj',
			'Quantum Foam',
			'--kind',
			'concept'
		]);
		expect(withKind.status, withKind.stderr).toBe(0);
		const source = readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8');
		expect(source).toContain('label: "Quantum Foam"');
		expect(source).toContain('kind: "concept"');
	});

	it('add is idempotent across casings and lifts an existing suppression', () => {
		runVerbInSandbox(configPath, ['tag', 'hide', 'my-proj', 'Ink']);
		const add = runVerbInSandbox(configPath, ['tag', 'add', 'my-proj', 'INK']);
		expect(add.status, add.stderr).toBe(0);
		expect(add.stdout).toMatch(/lifted suppression/i);
		const source = readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8');
		expect(source).not.toContain('suppressTags');

		const repeat = runVerbInSandbox(configPath, ['tag', 'add', 'my-proj', 'ink']);
		expect(repeat.stdout).toMatch(/already carries/i);
		expect(readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8')).toBe(source);
	});

	it('hide suppresses a label the project does not yet infer, with a note', () => {
		const result = runVerbInSandbox(configPath, ['tag', 'hide', 'my-proj', 'typescript']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/does not currently infer/i);
		expect(readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8')).toContain(
			'suppressTags: ["TypeScript"]'
		);

		const repeat = runVerbInSandbox(configPath, ['tag', 'hide', 'my-proj', 'TypeScript']);
		expect(repeat.stdout).toMatch(/already suppressed/i);
	});

	it('unhide removes the suppression, dropping an emptied property; soft no-ops otherwise', () => {
		runVerbInSandbox(configPath, ['tag', 'hide', 'my-proj', 'TypeScript']);
		const result = runVerbInSandbox(configPath, ['tag', 'unhide', 'my-proj', 'TypeScript']);
		expect(result.status, result.stderr).toBe(0);
		expect(readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8')).not.toContain('suppressTags');

		const missing = runVerbInSandbox(configPath, ['tag', 'unhide', 'no-overlay', 'Ink']);
		expect(missing.status, missing.stderr).toBe(0);
		expect(missing.stdout).toMatch(/no overlay/i);
	});

	it('list shows authored, suppressed and effective labels', () => {
		runVerbInSandbox(configPath, ['tag', 'add', 'my-proj', 'Neo4j']);
		runVerbInSandbox(configPath, ['tag', 'hide', 'my-proj', 'TypeScript']);
		const result = runVerbInSandbox(configPath, ['tag', 'list', 'my-proj']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/authored\s+Neo4j \(data\)/);
		expect(result.stdout).toMatch(/suppressed\s+TypeScript/);
		expect(result.stdout).toMatch(/effective\s+Neo4j/);
	});

	it('rejects a malformed slug and never touches other file families', () => {
		const bad = runVerbInSandbox(configPath, ['tag', 'add', 'Bad/Slug', 'Ink']);
		expect(bad.status).toBe(1);
		expect(bad.stderr).toMatch(/kebab-case/i);

		const overlaysSeed =
			"import type { TechOverlay } from './types.js';\n\nexport const techOverlays: TechOverlay[] = [];\n";
		writeFileSync(join(dir, 'tech-overlays.ts'), overlaysSeed);
		runVerbInSandbox(configPath, ['tag', 'add', 'my-proj', 'Ink']);
		expect(readFileSync(join(dir, 'tech-overlays.ts'), 'utf8')).toBe(overlaysSeed);
	});
});

// ---------------------------------------------------------------------------
// drift theme tests
// ---------------------------------------------------------------------------

const SEED_THEMES = [
	"import type { Theme } from './types.js';",
	'',
	'export const themes: Theme[] = [',
	'\t{',
	"\t\tid: 'first-theme',",
	"\t\tname: 'First Theme',",
	"\t\tblurb: 'The original.',",
	"\t\tslugs: ['alpha', 'beta']",
	'\t},',
	'\t{',
	"\t\tid: 'second-theme',",
	"\t\tname: 'Second Theme',",
	"\t\tblurb: 'The other one.',",
	"\t\tslugs: ['gamma', 'delta']",
	'\t}',
	'];',
	''
].join('\n');

describe('drift theme', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
		writeFileSync(join(dir, 'themes.ts'), SEED_THEMES);
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('create appends a theme with members; duplicate ids exit 1', () => {
		const result = runVerbInSandbox(configPath, [
			'theme',
			'create',
			'new-theme',
			'--name',
			'New Theme',
			'--blurb',
			'Fresh.',
			'--slug',
			'alpha',
			'--slug',
			'gamma'
		]);
		expect(result.status, result.stderr).toBe(0);
		const source = readFileSync(join(dir, 'themes.ts'), 'utf8');
		expect(source).toContain('id: "new-theme"');
		expect(source).toContain('slugs: ["alpha", "gamma"]');

		const duplicate = runVerbInSandbox(configPath, [
			'theme',
			'create',
			'first-theme',
			'--name',
			'X'
		]);
		expect(duplicate.status).toBe(1);
		expect(duplicate.stderr).toMatch(/already exists/i);
	});

	it('create warns below two members and requires --name', () => {
		const thin = runVerbInSandbox(configPath, ['theme', 'create', 'thin-theme', '--name', 'Thin']);
		expect(thin.status, thin.stderr).toBe(0);
		expect(thin.stdout).toMatch(/at least 2/i);

		const nameless = runVerbInSandbox(configPath, ['theme', 'create', 'no-name']);
		expect(nameless.status).toBe(1);
		expect(nameless.stderr).toMatch(/requires --name/i);
	});

	it('edit changes only the named fields, leaving the sibling theme untouched', () => {
		const result = runVerbInSandbox(configPath, [
			'theme',
			'edit',
			'first-theme',
			'--blurb',
			'Rewritten.'
		]);
		expect(result.status, result.stderr).toBe(0);
		const source = readFileSync(join(dir, 'themes.ts'), 'utf8');
		expect(source).toContain('Rewritten.');
		// Prettier may renormalise quotes; assert content, not quote style.
		expect(source).toMatch(/name: ["']First Theme["']/);
		expect(source).toMatch(/id: ["']second-theme["']/);
		expect(source).toContain('The other one.');

		const nothing = runVerbInSandbox(configPath, ['theme', 'edit', 'first-theme']);
		expect(nothing.status).toBe(1);
		expect(nothing.stderr).toMatch(/nothing to change/i);
	});

	it('add and remove manage membership with idempotence and a below-2 warning', () => {
		const add = runVerbInSandbox(configPath, ['theme', 'add', 'first-theme', 'epsilon']);
		expect(add.status, add.stderr).toBe(0);
		expect(readFileSync(join(dir, 'themes.ts'), 'utf8')).toMatch(
			/slugs: \[["']alpha["'], ["']beta["'], ["']epsilon["']\]/
		);

		const again = runVerbInSandbox(configPath, ['theme', 'add', 'first-theme', 'epsilon']);
		expect(again.stdout).toMatch(/already in theme/i);

		runVerbInSandbox(configPath, ['theme', 'remove', 'first-theme', 'epsilon']);
		const below = runVerbInSandbox(configPath, ['theme', 'remove', 'first-theme', 'beta']);
		expect(below.status, below.stderr).toBe(0);
		expect(below.stdout).toMatch(/at least 2/i);

		const absent = runVerbInSandbox(configPath, ['theme', 'remove', 'first-theme', 'zeta']);
		expect(absent.status, absent.stderr).toBe(0);
		expect(absent.stdout).toMatch(/not in theme/i);
	});

	it('delete removes a theme; a missing id is a soft no-op', () => {
		const result = runVerbInSandbox(configPath, ['theme', 'delete', 'second-theme']);
		expect(result.status, result.stderr).toBe(0);
		const source = readFileSync(join(dir, 'themes.ts'), 'utf8');
		expect(source).not.toContain('second-theme');
		expect(source).toContain('first-theme');

		const missing = runVerbInSandbox(configPath, ['theme', 'delete', 'never-existed']);
		expect(missing.status, missing.stderr).toBe(0);
		expect(missing.stdout).toMatch(/nothing to delete/i);
	});

	it('the collection alias dispatches identically, including help', () => {
		const list = runVerbInSandbox(configPath, ['collection', 'list']);
		expect(list.status, list.stderr).toBe(0);
		expect(list.stdout).toMatch(/first-theme/);
		expect(list.stdout).toMatch(/2 themes/);

		const help = runVerbInSandbox(configPath, ['help', 'collection']);
		expect(help.status, help.stderr).toBe(0);
		expect(help.stdout).toMatch(/drift theme/);
	});

	it('exits 1 when themes.ts is missing and never touches other file families', () => {
		const sentinel = readFileSync(join(dir, 'themes.ts'), 'utf8');
		runVerbInSandbox(configPath, ['theme', 'add', 'first-theme', 'epsilon']);
		// themes changed, but nothing else exists to change — now prove the converse:
		writeFileSync(join(dir, 'themes.ts'), sentinel);
		const overlaysSeed =
			"import type { TechOverlay } from './types.js';\n\nexport const techOverlays: TechOverlay[] = [];\n";
		writeFileSync(join(dir, 'tech-overlays.ts'), overlaysSeed);
		runVerbInSandbox(configPath, ['theme', 'edit', 'first-theme', '--name', 'Renamed']);
		expect(readFileSync(join(dir, 'tech-overlays.ts'), 'utf8')).toBe(overlaysSeed);

		rmSync(join(dir, 'themes.ts'));
		const missing = runVerbInSandbox(configPath, ['theme', 'list']);
		expect(missing.status).toBe(1);
		expect(missing.stderr).toMatch(/not found/i);
	});
});

// ---------------------------------------------------------------------------
// drift author field-edit tests
// ---------------------------------------------------------------------------

describe('drift author field edit', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('sets a prose field in place, creating the overlay when absent', () => {
		const result = runVerbInSandbox(configPath, [
			'author',
			'my-proj',
			'tagline',
			'A tool that does one thing well.'
		]);
		expect(result.status, result.stderr).toBe(0);
		const source = readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8');
		expect(source).toContain('A tool that does one thing well.');
	});

	it('replaces an existing value and is idempotent on a repeat', () => {
		runVerbInSandbox(configPath, ['author', 'my-proj', 'status', 'live']);
		runVerbInSandbox(configPath, ['author', 'my-proj', 'status', 'archived']);
		const source = readFileSync(join(dir, 'projects', 'my-proj.ts'), 'utf8');
		expect(source).toMatch(/status: ["']archived["']/);
		expect(source).not.toMatch(/status: ["']live["']/);

		const repeat = runVerbInSandbox(configPath, ['author', 'my-proj', 'status', 'archived']);
		expect(repeat.stdout).toMatch(/already holds/i);
	});

	it('validates enum fields and rejects unknown or flag fields', () => {
		const badStatus = runVerbInSandbox(configPath, ['author', 'my-proj', 'status', 'zombie']);
		expect(badStatus.status).toBe(1);
		expect(badStatus.stderr).toMatch(/invalid status 'zombie'/i);

		const unknown = runVerbInSandbox(configPath, ['author', 'my-proj', 'sparkles', 'yes']);
		expect(unknown.status).toBe(1);
		expect(unknown.stderr).toMatch(/unknown or non-scalar field/i);

		const flag = runVerbInSandbox(configPath, ['author', 'my-proj', 'pin', 'true']);
		expect(flag.status).toBe(1);
		expect(flag.stderr).toMatch(/drift flag my-proj --pin/);
	});

	it('errors when no value is given outside a TTY', () => {
		const result = runVerbInSandbox(configPath, ['author', 'my-proj', 'name']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/no interactive TTY/i);
	});

	it('the scaffold template writes liveUrl, matching the AuthoredProject type', () => {
		runVerbInSandbox(configPath, ['author', 'template-check']);
		const source = readFileSync(join(dir, 'projects', 'template-check.ts'), 'utf8');
		expect(source).toContain('liveUrl');
		expect(source).not.toContain('repoUrl');
	});
});

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
		expect(source).toContain('export const myProject: AuthoredProject');
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

	it('falls back to git core.editor when $EDITOR and $VISUAL are unset', () => {
		// Write a minimal git config that sets core.editor, completely isolated
		// from the real user config so the test is deterministic on any machine.
		const gitConfigPath = join(dir, 'git-config-test');
		writeFileSync(gitConfigPath, '[core]\n\teditor = test-editor-sentinel\n');
		const result = spawnSync(
			'bun',
			['run', checkDriftPath, 'author', 'editor-test', '--no-color'],
			{
				cwd: repoRoot,
				env: {
					...process.env,
					DRIFT_CONFIG: configPath,
					EDITOR: '',
					VISUAL: '',
					// Override git config lookup to our isolated file only.
					GIT_CONFIG_GLOBAL: gitConfigPath,
					GIT_CONFIG_SYSTEM: '/dev/null'
				},
				encoding: 'utf8',
				timeout: 30_000
			}
		);
		// The verb should succeed (exit 0): overlay created, editor resolved.
		// The editor command itself ("test-editor-sentinel") will fail to launch,
		// but spawnSync with shell:true exits non-zero without crashing the verb.
		// What matters: the "No editor found" fallback message must NOT appear.
		expect(result.stdout).not.toMatch(/No editor found/);
		expect(readFileSync(join(dir, 'projects', 'editor-test.ts'), 'utf8')).toContain(
			'AuthoredProject'
		);
	});

	it('prints the "No editor found" message when all editor sources are empty', () => {
		const gitConfigPath = join(dir, 'git-config-empty');
		writeFileSync(gitConfigPath, '[core]\n\t# no editor set\n');
		const result = spawnSync(
			'bun',
			['run', checkDriftPath, 'author', 'no-editor-test', '--no-color'],
			{
				cwd: repoRoot,
				env: {
					...process.env,
					DRIFT_CONFIG: configPath,
					EDITOR: '',
					VISUAL: '',
					GIT_CONFIG_GLOBAL: gitConfigPath,
					GIT_CONFIG_SYSTEM: '/dev/null'
				},
				encoding: 'utf8',
				timeout: 30_000
			}
		);
		// Non-TTY path: should print the plain "Edit the file directly" message
		// (the full TTY editor-open path is exercised manually, not in CI).
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('no-editor-test.ts');
	});
});

// ---------------------------------------------------------------------------
// drift pin tests
// ---------------------------------------------------------------------------

describe('drift flag', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	// ---- --pin flag -----------------------------------------------------------

	it('--pin creates the overlay and sets pin: true when the overlay is absent', () => {
		const result = runVerbInSandbox(configPath, ['flag', 'fresh-slug', '--pin']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/pin/i);

		const source = readFileSync(join(dir, 'projects', 'fresh-slug.ts'), 'utf8');
		expect(source).toContain('pin: true');
		expect(source).toContain('fresh-slug');
	});

	it('--pin inserts pin: true into an existing overlay that lacks it, leaving other fields intact', () => {
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

		const result = runVerbInSandbox(configPath, ['flag', 'has-no-pin', '--pin']);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('pin: true');
		// Sibling fields must survive (write-isolation).
		expect(modified).toContain('Has No Pin');
		expect(modified).toContain('A test overlay without a pin field.');
	});

	it('--pin flips pin: false to pin: true', () => {
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

		const result = runVerbInSandbox(configPath, ['flag', 'pinned-false', '--pin']);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('pin: true');
		expect(modified).not.toContain('pin: false');
	});

	it('--pin is idempotent when already pin: true', () => {
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

		const result = runVerbInSandbox(configPath, ['flag', 'already-pinned', '--pin']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/already/i);

		// File bytes must be unchanged.
		expect(readFileSync(overlayPath, 'utf8')).toBe(before);
	});

	// ---- --hide flag ----------------------------------------------------------

	it('--hide creates the overlay and sets hide: true when the overlay is absent', () => {
		const result = runVerbInSandbox(configPath, ['flag', 'hide-me', '--hide']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/hid/i);

		const source = readFileSync(join(dir, 'projects', 'hide-me.ts'), 'utf8');
		expect(source).toContain('hide: true');
		expect(source).toContain('hide-me');
	});

	it('--hide inserts hide: true independently, leaving a pre-existing pin: true untouched', () => {
		const overlayPath = join(dir, 'projects', 'has-pin-no-hide.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const hasPinNoHide: AuthoredProject = {',
				"\tslug: 'has-pin-no-hide',",
				'\tpin: true,',
				'\thighlights: [],',
				'\trelationships: [],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, ['flag', 'has-pin-no-hide', '--hide']);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('hide: true');
		// Pre-existing pin must survive.
		expect(modified).toContain('pin: true');
	});

	it('--hide is idempotent when already hide: true', () => {
		const overlayPath = join(dir, 'projects', 'already-hidden.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const alreadyHidden: AuthoredProject = {',
				"\tslug: 'already-hidden',",
				'\thide: true,',
				'\thighlights: [],',
				'\trelationships: [],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);
		const before = readFileSync(overlayPath, 'utf8');

		const result = runVerbInSandbox(configPath, ['flag', 'already-hidden', '--hide']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/already/i);

		// File bytes must be unchanged.
		expect(readFileSync(overlayPath, 'utf8')).toBe(before);
	});

	// ---- validation -----------------------------------------------------------

	it('exits 1 on a missing slug argument', () => {
		const result = runVerbInSandbox(configPath, ['flag']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/usage.*flag/i);
	});

	it('exits 1 when neither --pin nor --hide is given', () => {
		const result = runVerbInSandbox(configPath, ['flag', 'iris']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/--pin|--hide/i);
	});

	it('exits 1 when both --pin and --hide are given', () => {
		const result = runVerbInSandbox(configPath, ['flag', 'iris', '--pin', '--hide']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/mutually exclusive/i);
	});

	it('exits 1 on a malformed slug', () => {
		const result = runVerbInSandbox(configPath, ['flag', 'Bad/Slug', '--pin']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/invalid slug/i);
	});

	it('the modified overlay has balanced braces after --pin', () => {
		runVerbInSandbox(configPath, ['flag', 'importable', '--pin']);
		const source = readFileSync(join(dir, 'projects', 'importable.ts'), 'utf8');
		expect(source).toContain('pin: true');
		const openBraces = (source.match(/\{/g) ?? []).length;
		const closeBraces = (source.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});

	it('the modified overlay has balanced braces after --hide', () => {
		runVerbInSandbox(configPath, ['flag', 'importable-hide', '--hide']);
		const source = readFileSync(join(dir, 'projects', 'importable-hide.ts'), 'utf8');
		expect(source).toContain('hide: true');
		const openBraces = (source.match(/\{/g) ?? []).length;
		const closeBraces = (source.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});
});

// ---------------------------------------------------------------------------
// drift relate tests
// ---------------------------------------------------------------------------

describe('drift relate', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	// ---- project mode -----------------------------------------------------

	it('project mode creates the overlay and appends a relationship when absent', () => {
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'lonely',
			'powers',
			'nib',
			'--note',
			'Feeds nib somehow.'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/related/i);

		const source = readFileSync(join(dir, 'projects', 'lonely.ts'), 'utf8');
		expect(source).toContain('kind: "powers"');
		expect(source).toContain('target: "nib"');
		expect(source).toContain('Feeds nib somehow.');
	});

	it('project mode appends to a populated relationships array, leaving the existing entry intact', () => {
		const overlayPath = join(dir, 'projects', 'nib.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const nib: AuthoredProject = {',
				"\tslug: 'nib',",
				'\thighlights: [],',
				'\trelationships: [',
				'\t\t{',
				"\t\t\tkind: 'powers',",
				"\t\t\ttarget: 'the-work',",
				"\t\t\tnote: 'Existing note.'",
				'\t\t}',
				'\t],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, ['relate', 'project', 'nib', 'related', 'lonely']);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('target: "the-work"');
		expect(modified).toContain('Existing note.');
		expect(modified).toContain('kind: "related"');
		expect(modified).toContain('target: "lonely"');
	});

	it('project mode inserts a relationships property when the overlay has none', () => {
		const overlayPath = join(dir, 'projects', 'no-relationships.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const noRelationships: AuthoredProject = {',
				"\tslug: 'no-relationships',",
				'\thighlights: [],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'no-relationships',
			'related',
			'lonely'
		]);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('relationships');
		expect(modified).toContain('target: "lonely"');
	});

	it('project mode is idempotent on an identical (kind, target) pair', () => {
		runVerbInSandbox(configPath, ['relate', 'project', 'nib', 'powers', 'the-work']);
		const before = readFileSync(join(dir, 'projects', 'nib.ts'), 'utf8');

		const result = runVerbInSandbox(configPath, ['relate', 'project', 'nib', 'powers', 'the-work']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/already/i);
		expect(readFileSync(join(dir, 'projects', 'nib.ts'), 'utf8')).toBe(before);
	});

	it('prints the reciprocal reminder after a "powers" write', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'project', 'nib', 'powers', 'the-work']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/extracted-from nib/);
	});

	it('prints the reciprocal reminder after an "extracted-from" write', () => {
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'the-work',
			'extracted-from',
			'nib'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/powers the-work/);
	});

	it('does not print a reciprocal reminder for a "related" write', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'project', 'nib', 'related', 'lonely']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).not.toMatch(/Reciprocal/);
	});

	// ---- tech mode ----------------------------------------------------------

	it('tech mode appends a relationship to the exported array', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [];',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'Ink',
			'leads-to',
			'inkjs',
			'--note',
			'Ink needs a runtime.'
		]);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(join(dir, 'tech-relationships.ts'), 'utf8');
		expect(modified).toContain('kind: "leads-to"');
		expect(modified).toContain('source: "Ink"');
		expect(modified).toContain('target: "inkjs"');
		expect(modified).toContain('Ink needs a runtime.');
	});

	it('tech mode appends to a populated array, leaving existing entries intact', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [',
				'\t{',
				"\t\tkind: 'replaced-by',",
				"\t\tsource: 'Node.js',",
				"\t\ttarget: 'Bun'",
				'\t}',
				'];',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'Oak']);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(join(dir, 'tech-relationships.ts'), 'utf8');
		expect(modified).toContain('source: "Node.js"');
		expect(modified).toContain('target: "Bun"');
		expect(modified).toContain('source: "Deno"');
		expect(modified).toContain('target: "Oak"');
	});

	it('tech mode is idempotent on an identical (kind, source, target) triple', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [];',
				''
			].join('\n')
		);
		runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'Oak']);
		const before = readFileSync(join(dir, 'tech-relationships.ts'), 'utf8');

		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'Oak']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/already/i);
		expect(readFileSync(join(dir, 'tech-relationships.ts'), 'utf8')).toBe(before);
	});

	it('tech mode resolves label casing to the canonical tag labels', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [];',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'ink', 'leads-to', 'INKJS']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/Using 'Ink' for 'ink'/);
		expect(result.stdout).toMatch(/Using 'inkjs' for 'INKJS'/);

		const modified = readFileSync(join(dir, 'tech-relationships.ts'), 'utf8');
		expect(modified).toContain('source: "Ink"');
		expect(modified).toContain('target: "inkjs"');
		expect(modified).not.toContain('"INKJS"');
	});

	it('tech mode is idempotent across label casings', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [];',
				''
			].join('\n')
		);
		runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'Oak']);
		const before = readFileSync(join(dir, 'tech-relationships.ts'), 'utf8');

		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'deno', 'leads-to', 'oak']);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/already/i);
		expect(readFileSync(join(dir, 'tech-relationships.ts'), 'utf8')).toBe(before);
	});

	it('tech mode removes an edge located with different casing', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [',
				'\t{',
				"\t\tkind: 'leads-to',",
				"\t\tsource: 'Deno',",
				"\t\ttarget: 'Oak'",
				'\t}',
				'];',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'deno',
			'leads-to',
			'oak',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/removed/i);
		expect(readFileSync(join(dir, 'tech-relationships.ts'), 'utf8')).not.toContain("'Deno'");
	});

	it('tech mode exits 1 on an unknown label when adding', () => {
		writeFileSync(
			join(dir, 'tech-relationships.ts'),
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [];',
				''
			].join('\n')
		);

		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'Oka']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/unknown tech label 'Oka'/i);
	});

	it('tech mode rejects a self-edge spelled with different casings', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'deno']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/cannot relate to itself/i);
	});

	it('tech mode exits 1 when tech-relationships.ts is missing', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'Oak']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/not found/i);
	});

	// ---- validation -----------------------------------------------------------

	it('exits 1 when the mode is neither "project" nor "tech"', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'bogus', 'nib', 'powers', 'the-work']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/project.*tech/i);
	});

	it('exits 1 on a missing argument', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'project', 'nib', 'powers']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/missing arguments/i);
	});

	it('exits 1 on an invalid project relationship kind', () => {
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'bogus-kind',
			'the-work'
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/invalid kind/i);
	});

	it('exits 1 on an invalid tech relationship kind', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'bogus-kind', 'Oak']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/invalid kind/i);
	});

	it('exits 1 on a project self-edge', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'project', 'nib', 'related', 'nib']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/cannot relate to itself/i);
	});

	it('exits 1 on a tech self-edge', () => {
		const result = runVerbInSandbox(configPath, ['relate', 'tech', 'Deno', 'leads-to', 'Deno']);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/cannot relate to itself/i);
	});

	it('exits 1 on a malformed project slug', () => {
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'Bad/Slug',
			'powers',
			'the-work'
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/kebab-case/i);
	});

	it('the modified overlay has balanced braces after a project-mode write', () => {
		runVerbInSandbox(configPath, ['relate', 'project', 'balanced', 'powers', 'the-work']);
		const source = readFileSync(join(dir, 'projects', 'balanced.ts'), 'utf8');
		const openBraces = (source.match(/\{/g) ?? []).length;
		const closeBraces = (source.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});

	// ---- project mode: --remove ----------------------------------------------

	function writeNibWithRelationships(dir: string, relationships: string[]): string {
		const overlayPath = join(dir, 'projects', 'nib.ts');
		writeFileSync(
			overlayPath,
			[
				"import type { AuthoredProject } from '../types.js';",
				'',
				'export const nib: AuthoredProject = {',
				"\tslug: 'nib',",
				'\thighlights: [],',
				'\trelationships: [',
				...relationships,
				'\t],',
				'\ttags: []',
				'};',
				''
			].join('\n')
		);
		return overlayPath;
	}

	it('--remove deletes an existing project edge, leaving siblings intact', () => {
		const overlayPath = writeNibWithRelationships(dir, [
			"\t\t{ kind: 'powers', target: 'the-work', note: 'Existing note.' },",
			"\t\t{ kind: 'related', target: 'flyt' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/removed/i);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).not.toContain('the-work');
		expect(modified).toContain('target: "flyt"');
		const openBraces = (modified.match(/\{/g) ?? []).length;
		const closeBraces = (modified.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});

	it('--remove on the first of several edges leaves the rest intact', () => {
		const overlayPath = writeNibWithRelationships(dir, [
			"\t\t{ kind: 'powers', target: 'the-work' },",
			"\t\t{ kind: 'related', target: 'flyt' },",
			"\t\t{ kind: 'related', target: 'lonely' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).not.toContain('the-work');
		expect(modified).toContain('target: "flyt"');
		expect(modified).toContain('target: "lonely"');
		const openBraces = (modified.match(/\{/g) ?? []).length;
		const closeBraces = (modified.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});

	it('--remove on the last remaining edge leaves relationships: []', () => {
		const overlayPath = writeNibWithRelationships(dir, [
			"\t\t{ kind: 'powers', target: 'the-work' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).not.toContain('the-work');
		expect(modified).toMatch(/relationships:\s*\[\]/);
		const openBraces = (modified.match(/\{/g) ?? []).length;
		const closeBraces = (modified.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});

	it('--remove on a nonexistent edge is a soft no-op', () => {
		const overlayPath = writeNibWithRelationships(dir, [
			"\t\t{ kind: 'powers', target: 'the-work' },"
		]);
		const before = readFileSync(overlayPath, 'utf8');

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'related',
			'flyt',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/not found|nothing to remove/i);
		expect(readFileSync(overlayPath, 'utf8')).toBe(before);
	});

	it('--remove on a slug with no overlay is a soft no-op and does not create one', () => {
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'ghost-project',
			'powers',
			'the-work',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/nothing to remove/i);
		expect(existsSync(join(dir, 'projects', 'ghost-project.ts'))).toBe(false);
	});

	it('--remove prints the reciprocal reminder for "powers"', () => {
		writeNibWithRelationships(dir, ["\t\t{ kind: 'powers', target: 'the-work' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/extracted-from nib.*--remove/);
	});

	it('--remove does not print a reciprocal reminder for "related"', () => {
		writeNibWithRelationships(dir, ["\t\t{ kind: 'related', target: 'flyt' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'related',
			'flyt',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).not.toMatch(/Reciprocal/);
	});

	// ---- project mode: --edit -------------------------------------------------

	it('--edit --note changes only the note, leaving kind and siblings intact', () => {
		const overlayPath = writeNibWithRelationships(dir, [
			"\t\t{ kind: 'powers', target: 'the-work', note: 'Old note.' },",
			"\t\t{ kind: 'related', target: 'flyt' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--edit',
			'--note',
			'New note.'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/edited/i);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('kind: "powers"');
		expect(modified).toContain('New note.');
		expect(modified).not.toContain('Old note.');
		expect(modified).toContain('target: "flyt"');
	});

	it('--edit --kind changes only the kind, leaving the note intact', () => {
		const overlayPath = writeNibWithRelationships(dir, [
			"\t\t{ kind: 'powers', target: 'the-work', note: 'Keep me.' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--edit',
			'--kind',
			'related'
		]);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(overlayPath, 'utf8');
		expect(modified).toContain('kind: "related"');
		expect(modified).not.toContain('kind: "powers"');
		expect(modified).toContain('Keep me.');
	});

	it('--edit on a nonexistent edge exits 1', () => {
		const overlayPath = writeNibWithRelationships(dir, [
			"\t\t{ kind: 'powers', target: 'the-work' },"
		]);
		const before = readFileSync(overlayPath, 'utf8');

		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'related',
			'flyt',
			'--edit',
			'--note',
			'x'
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/not found/i);
		expect(readFileSync(overlayPath, 'utf8')).toBe(before);
	});

	it('--edit prints the reciprocal reminder when the kind changes to/from powers or extracted-from', () => {
		writeNibWithRelationships(dir, ["\t\t{ kind: 'powers', target: 'the-work' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--edit',
			'--kind',
			'related'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/Reciprocal/);
	});

	it('--edit does not print a reciprocal reminder for a note-only change', () => {
		writeNibWithRelationships(dir, ["\t\t{ kind: 'related', target: 'flyt' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'related',
			'flyt',
			'--edit',
			'--note',
			'a new note'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).not.toMatch(/Reciprocal/);
	});

	// ---- validation: --remove / --edit -----------------------------------------

	it('exits 1 when --remove and --edit are both given', () => {
		writeNibWithRelationships(dir, ["\t\t{ kind: 'powers', target: 'the-work' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--remove',
			'--edit'
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/mutually exclusive/i);
	});

	it('exits 1 when --edit is given with neither --kind nor --note', () => {
		writeNibWithRelationships(dir, ["\t\t{ kind: 'powers', target: 'the-work' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--edit'
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/nothing to change/i);
	});

	it('exits 1 on an invalid --kind for --edit', () => {
		writeNibWithRelationships(dir, ["\t\t{ kind: 'powers', target: 'the-work' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'project',
			'nib',
			'powers',
			'the-work',
			'--edit',
			'--kind',
			'bogus-kind'
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/invalid --kind/i);
	});

	// ---- tech mode: --remove / --edit -------------------------------------------

	function writeTechRelationships(dir: string, entries: string[]): string {
		const path = join(dir, 'tech-relationships.ts');
		writeFileSync(
			path,
			[
				"import type { TechRelationship } from './types.js';",
				'',
				'export const techRelationships: TechRelationship[] = [',
				...entries,
				'];',
				''
			].join('\n')
		);
		return path;
	}

	it('tech mode --remove deletes an existing edge, leaving siblings intact', () => {
		const path = writeTechRelationships(dir, [
			"\t{ kind: 'leads-to', source: 'Deno', target: 'Oak', note: 'Note.' },",
			"\t{ kind: 'replaced-by', source: 'Node.js', target: 'Bun' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'Deno',
			'leads-to',
			'Oak',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/removed/i);

		const modified = readFileSync(path, 'utf8');
		expect(modified).not.toContain('source: "Deno"');
		expect(modified).toContain('source: "Node.js"');
		const openBraces = (modified.match(/\{/g) ?? []).length;
		const closeBraces = (modified.match(/\}/g) ?? []).length;
		expect(openBraces).toBe(closeBraces);
	});

	it('tech mode --remove on a nonexistent edge is a soft no-op', () => {
		const path = writeTechRelationships(dir, [
			"\t{ kind: 'leads-to', source: 'Deno', target: 'Oak' },"
		]);
		const before = readFileSync(path, 'utf8');

		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'Deno',
			'replaced-by',
			'Oak',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/not found|nothing to remove/i);
		expect(readFileSync(path, 'utf8')).toBe(before);
	});

	it('tech mode --edit --note changes only the note', () => {
		const path = writeTechRelationships(dir, [
			"\t{ kind: 'leads-to', source: 'Deno', target: 'Oak', note: 'Old.' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'Deno',
			'leads-to',
			'Oak',
			'--edit',
			'--note',
			'New.'
		]);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(path, 'utf8');
		expect(modified).toContain('kind: "leads-to"');
		expect(modified).toContain('New.');
		expect(modified).not.toContain('Old.');
	});

	it('tech mode --edit --kind changes only the kind', () => {
		const path = writeTechRelationships(dir, [
			"\t{ kind: 'leads-to', source: 'Deno', target: 'Oak' },"
		]);

		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'Deno',
			'leads-to',
			'Oak',
			'--edit',
			'--kind',
			'replaced-by'
		]);
		expect(result.status, result.stderr).toBe(0);

		const modified = readFileSync(path, 'utf8');
		expect(modified).toContain('kind: "replaced-by"');
		expect(modified).not.toContain('kind: "leads-to"');
	});

	it('tech mode --edit on a nonexistent edge exits 1', () => {
		const path = writeTechRelationships(dir, [
			"\t{ kind: 'leads-to', source: 'Deno', target: 'Oak' },"
		]);
		const before = readFileSync(path, 'utf8');

		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'Deno',
			'replaced-by',
			'Oak',
			'--edit',
			'--note',
			'x'
		]);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(/not found/i);
		expect(readFileSync(path, 'utf8')).toBe(before);
	});

	it('tech mode --remove never prints a reciprocal reminder', () => {
		writeTechRelationships(dir, ["\t{ kind: 'leads-to', source: 'Deno', target: 'Oak' },"]);
		const result = runVerbInSandbox(configPath, [
			'relate',
			'tech',
			'Deno',
			'leads-to',
			'Oak',
			'--remove'
		]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).not.toMatch(/Reciprocal/);
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
		tagline?: string;
		blurb?: string;
	}
) {
	const {
		description = '',
		highlights = [],
		role = 'solo',
		contributionNote,
		tagline,
		blurb
	} = fields;
	const contribution = contributionNote
		? `{ role: '${role}', contributionNote: ${JSON.stringify(contributionNote)} }`
		: `{ role: '${role}' }`;
	const binding = slug.replace(/-([a-z0-9])/g, (_: string, c: string) => c.toUpperCase());
	const source = [
		`export const ${binding} = {`,
		`\tslug: ${JSON.stringify(slug)},`,
		tagline !== undefined ? `\ttagline: ${JSON.stringify(tagline)},` : null,
		blurb !== undefined ? `\tblurb: ${JSON.stringify(blurb)},` : null,
		`\tdescription: ${JSON.stringify(description)},`,
		`\thighlights: ${JSON.stringify(highlights)},`,
		`\tcontribution: ${contribution}`,
		'};',
		''
	]
		.filter((line) => line !== null)
		.join('\n');
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
		writeFixture(dir, 'full-2', {
			description: fullDesc,
			highlights: ['h1', 'h2', 'h3', 'h4', 'h5']
		});

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

// ---------------------------------------------------------------------------
// drift audit: volatile-prose tests
//
// Advisory only — every case here also asserts the tier is unaffected, since
// the whole point of the check is that it never changes the depth verdict.
// ---------------------------------------------------------------------------

describe('drift audit volatile prose', () => {
	let dir: string;
	let configPath: string;

	beforeEach(() => {
		({ dir, configPath } = makeOverlaySandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	function runAuditJSON(): {
		summary: Record<string, number>;
		entries: Record<string, unknown>[];
	} {
		const result = runVerbInSandbox(configPath, ['audit', '--json']);
		expect(result.status, result.stderr).toBe(0);
		return JSON.parse(result.stdout);
	}

	const fullDesc = Array(90).fill('word').join(' ');
	const fullHighlights = ['h1', 'h2', 'h3', 'h4', 'h5'];

	it('flags a metric-number and a status-tense phrase in the same highlight', () => {
		writeFixture(dir, 'metric-and-tense', {
			description: fullDesc,
			highlights: [
				'Version 5.0.0 across 666 commits; full ADRs and technical specs.',
				...fullHighlights.slice(1)
			]
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e) => e.slug === 'metric-and-tense') as {
			tier: string;
			volatile: Array<{ field: string; pattern: string }>;
		};
		const patterns = entry.volatile.map((v) => v.pattern);
		expect(patterns).toContain('metric-number');
		expect(patterns).toContain('status-tense');
		expect(entry.volatile.some((v) => v.field === 'highlights[0]')).toBe(true);
	});

	it('flags status-tense phrasing in the description', () => {
		writeFixture(dir, 'status-tense-desc', {
			description: `The current phase is building the evaluation harness. ${fullDesc}`,
			highlights: fullHighlights
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e) => e.slug === 'status-tense-desc') as {
			volatile: Array<{ field: string; pattern: string }>;
		};
		expect(
			entry.volatile.some((v) => v.pattern === 'status-tense' && v.field === 'description')
		).toBe(true);
	});

	it('flags a hardcoded ISO date', () => {
		writeFixture(dir, 'iso-date', {
			description: fullDesc,
			tagline: 'Released 2026-06-12.'
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e) => e.slug === 'iso-date') as {
			volatile: Array<{ field: string; pattern: string }>;
		};
		expect(
			entry.volatile.some((v) => v.pattern === 'hardcoded-date' && v.field === 'tagline')
		).toBe(true);
	});

	it('flags a "Month YYYY" date', () => {
		writeFixture(dir, 'month-year-date', {
			description: fullDesc,
			blurb: 'Following a March 2024 prototype.'
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e) => e.slug === 'month-year-date') as {
			volatile: Array<{ field: string; pattern: string }>;
		};
		expect(entry.volatile.some((v) => v.pattern === 'hardcoded-date' && v.field === 'blurb')).toBe(
			true
		);
	});

	it('flags a hardcoded model name', () => {
		writeFixture(dir, 'model-name', {
			description: fullDesc,
			blurb: 'An LLM correction pass powered by gpt-5.4-nano verifies each record.'
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e) => e.slug === 'model-name') as {
			volatile: Array<{ field: string; pattern: string }>;
		};
		expect(entry.volatile.some((v) => v.pattern === 'model-name' && v.field === 'blurb')).toBe(
			true
		);
	});

	it('false-positive guard: technical specificity does not trigger any pattern', () => {
		writeFixture(dir, 'clean-entry', {
			description: fullDesc,
			tagline: '384-dimension embeddings power semantic search across six axes.',
			highlights: [
				'Built with Svelte 5 and validated to UUID v5 semantics.',
				...fullHighlights.slice(1)
			]
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e) => e.slug === 'clean-entry') as {
			volatile: Array<{ field: string; pattern: string }>;
		};
		expect(entry.volatile).toEqual([]);
	});

	it('volatile findings do not change the tier', () => {
		writeFixture(dir, 'full-but-volatile', {
			description: fullDesc,
			highlights: ['Version 5.0.0 across 666 commits.', ...fullHighlights.slice(1)]
		});
		const { entries } = runAuditJSON();
		const entry = entries.find((e) => e.slug === 'full-but-volatile') as {
			tier: string;
			volatile: unknown[];
		};
		expect(entry.volatile.length).toBeGreaterThan(0);
		expect(entry.tier).toBe('Full');
	});

	it('summary.volatile counts entries with at least one finding', () => {
		writeFixture(dir, 'clean-1', { description: fullDesc, highlights: fullHighlights });
		writeFixture(dir, 'volatile-1', {
			description: fullDesc,
			highlights: ['666 commits and counting.', ...fullHighlights.slice(1)]
		});
		writeFixture(dir, 'volatile-2', {
			description: fullDesc,
			tagline: 'Currently in progress.'
		});
		const { summary } = runAuditJSON();
		expect(summary.volatile).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// drift sync tests
//
// sync requires a real git repo mapped via sources.local.json, so the fixture
// creates a temp git repo with one commit. computeDrift only populates
// result.fresh[slug] when localPaths[slug] resolves to a real working tree.
//
// Gap not covered: the null-preservation path (preservedFields) requires a
// getFingerprint call that returns null for a specific field, which needs a
// failing git sub-command — too brittle to fake in a subprocess test. The
// preservation logic is guarded by the mergeFingerprint unit contract and the
// write-path behaviour visible in the companion real-sync test.
// ---------------------------------------------------------------------------

/** Isolated git env so the temp repo ignores host signing/config. */
function makeGitEnv() {
	return {
		...process.env,
		GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_CONFIG_SYSTEM: '/dev/null',
		GIT_AUTHOR_DATE: '2000-01-01T00:00:00+00:00',
		GIT_COMMITTER_DATE: '2000-01-01T00:00:00+00:00',
		GIT_AUTHOR_NAME: 'Test',
		GIT_AUTHOR_EMAIL: 'test@example.com',
		GIT_COMMITTER_NAME: 'Test',
		GIT_COMMITTER_EMAIL: 'test@example.com'
	};
}

/**
 * Creates a minimal dataDir with a real git repo mapped via sources.local.json.
 * Returns the dataDir path and the slug used.
 */
function makeSyncSandbox(slug = 'sync-test-repo'): { dir: string; slug: string } {
	const dir = mkdtempSync(join(tmpdir(), 'drift-sync-test-'));

	// Real git repo — computeDrift needs a resolvable working tree.
	const repoPath = join(dir, 'repo');
	mkdirSync(repoPath);
	const gitEnv = makeGitEnv();
	const git = (args: string[]) =>
		spawnSync('git', args, { cwd: repoPath, env: gitEnv, encoding: 'utf8' });

	git(['init', '-b', 'main']);
	git(['config', 'user.email', 'test@example.com']);
	git(['config', 'user.name', 'Test']);
	writeFileSync(join(repoPath, 'readme.md'), '# test\n');
	writeFileSync(
		join(repoPath, 'package.json'),
		JSON.stringify({
			devDependencies: {
				svelte: '^5.45.6',
				'@sveltejs/kit': '^2.49.1',
				'@tailwindcss/vite': '^4.3.1'
			}
		})
	);
	git(['add', '-A']);
	git(['commit', '-m', 'init', '--no-gpg-sign']);

	// sources.json: a saved entry that will differ from the fresh fingerprint
	// (head set to a fake SHA so the first sync visibly updates it).
	writeFileSync(
		join(dir, 'sources.json'),
		JSON.stringify(
			{
				$schema: '../../scripts/sources.schema.json',
				sources: { [slug]: { head: 'deadbeef00000000000000000000000000000000', commits: 0 } }
			},
			null,
			'\t'
		)
	);

	// sources.local.json: maps the slug to the temp repo path.
	writeFileSync(
		join(dir, 'sources.local.json'),
		JSON.stringify({ paths: { [slug]: repoPath } }, null, '\t')
	);

	// Minimal sibling files that loadManifests reads.
	writeFileSync(join(dir, 'overrides.json'), JSON.stringify({ overrides: {} }, null, '\t'));
	writeFileSync(
		join(dir, 'excluded.json'),
		JSON.stringify({ slugs: [], repoNames: [] }, null, '\t')
	);
	writeFileSync(join(dir, '.drift-cache.json'), JSON.stringify({}, null, '\t'));
	writeFileSync(join(dir, 'in-progress.json'), JSON.stringify({ inProgress: {} }, null, '\t'));

	// in-progress.schema.json must exist (loadManifests does not validate but
	// some paths reference it). Copy the real one.
	const realSchema = join(repoRoot, 'src/lib/data/in-progress.schema.json');
	cpSync(realSchema, join(dir, 'in-progress.schema.json'));

	return { dir, slug };
}

/** Run `drift sync` (plus any extra args) with a DRIFT_CONFIG pointing at dir. */
function runSyncWithConfig(dir: string, extraArgs: string[]) {
	const configPath = makeDriftConfig(dir);
	return spawnSync(
		'bun',
		['run', checkDriftPath, 'sync', ...extraArgs, '--no-color', '--no-cache'],
		{
			cwd: repoRoot,
			env: { ...process.env, DRIFT_CONFIG: configPath },
			encoding: 'utf8',
			timeout: 30_000
		}
	);
}

describe('drift sync', () => {
	let dir: string;
	let slug: string;

	beforeEach(() => {
		({ dir, slug } = makeSyncSandbox());
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('--dry-run writes nothing (sources.json byte-identical)', () => {
		const before = readFileSync(join(dir, 'sources.json'), 'utf8');

		const result = runSyncWithConfig(dir, ['--dry-run']);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toMatch(/dry run/i);
		expect(result.stdout).toContain(slug);

		const after = readFileSync(join(dir, 'sources.json'), 'utf8');
		expect(after).toBe(before);
	});

	it('plain sync updates sources.json with fresh fingerprint', () => {
		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('sources.json synced.');

		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		const entry = parsed.sources[slug];

		// The test repo has one commit; the sentinel value was 0.
		expect(entry.commits).toBe(1);
		// head must have been updated from the dummy SHA.
		expect(entry.head).not.toBe('deadbeef00000000000000000000000000000000');
		expect(entry.framework).toEqual(['@sveltejs/kit', 'svelte-5', 'tailwindcss-4']);
		// lastSyncedAt is set on the manifest root (not per-entry).
		expect(parsed.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('detects Tailwind 3 as its own per-major identity, not Tailwind 4', () => {
		writeFileSync(
			join(dir, 'repo', 'package.json'),
			JSON.stringify({
				dependencies: { next: '^14.1.0', react: '^18.2.0' },
				devDependencies: { tailwindcss: '^3.4.1', vite: '^5.0.0' }
			})
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug].framework).toEqual(['next', 'react', 'vite', 'tailwindcss-3']);
	});

	it('falls back to the versionless tailwind identity for unparseable ranges', () => {
		writeFileSync(
			join(dir, 'repo', 'package.json'),
			JSON.stringify({
				devDependencies: { tailwindcss: 'latest' }
			})
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug].framework).toEqual(['tailwindcss']);
	});

	it('collapses bare svelte into svelte-5 when a non-SvelteKit repo is on Svelte 5', () => {
		writeFileSync(
			join(dir, 'repo', 'package.json'),
			JSON.stringify({
				dependencies: { svelte: '^5.1.0' },
				devDependencies: { vite: '^5.0.0' }
			})
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		// Bare 'svelte' would otherwise sit alongside 'svelte-5' as a redundant
		// adoption-timeline node for the same non-Kit Svelte 5 project.
		expect(parsed.sources[slug].framework).toEqual(['svelte-5', 'vite']);
	});

	it('detects other svelte majors as their own per-major identities', () => {
		writeFileSync(
			join(dir, 'repo', 'package.json'),
			JSON.stringify({
				dependencies: { svelte: '^4.2.0' }
			})
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug].framework).toEqual(['svelte-4']);
	});

	it('detects Deno from a root lock file without package.json', () => {
		rmSync(join(dir, 'repo', 'package.json'));
		writeFileSync(join(dir, 'repo', 'deno.lock'), '{}\n');
		writeFileSync(
			join(dir, 'repo', 'deno.jsonc'),
			`{
	// Import evidence may live in commented JSONC.
	"imports": {
		"oak": "jsr:@oak/oak",
		"svelte": "npm:svelte@5",
		"@sveltejs/kit": "npm:@sveltejs/kit@^2.22.0",
		"vite": "npm:vite@^7.0.0",
		"tailwindcss": "npm:tailwindcss@4",
		"neo4j": "npm:neo4j-driver@^5.27.0",
		"supabase": "jsr:@supabase/supabase-js@2"
	}
}\n`
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		const entry = parsed.sources[slug];
		expect(entry.runtime).toEqual(['deno']);
		expect(entry.framework).toEqual(['oak', '@sveltejs/kit', 'svelte-5', 'vite', 'tailwindcss-4']);
		expect(entry.database).toEqual(['neo4j-driver', '@supabase/supabase-js', 'supabase-postgres']);
	});

	it('detects Supabase and its PostgreSQL foundation from a package dependency', () => {
		writeFileSync(
			join(dir, 'repo', 'package.json'),
			JSON.stringify({
				dependencies: {
					'@supabase/supabase-js': '^2.49.8',
					graphql: '^16.8.0',
					'@deno/svelte-adapter': '^0.1.1'
				}
			})
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug].runtime).toEqual(['node', 'deno']);
		expect(parsed.sources[slug].database).toEqual([
			'@supabase/supabase-js',
			'supabase-postgres',
			'graphql'
		]);
	});

	it('detects Bubble Tea from go.mod', () => {
		rmSync(join(dir, 'repo', 'package.json'));
		writeFileSync(
			join(dir, 'repo', 'go.mod'),
			'module example.com/test\n\nrequire charm.land/bubbletea/v2 v2.0.2\n'
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug].runtime).toEqual(['go']);
		expect(parsed.sources[slug].framework).toEqual(['bubble-tea']);
	});

	it('detects Bun, Ink and Svelte 5 from committed source signals', () => {
		rmSync(join(dir, 'repo', 'package.json'));
		writeFileSync(
			join(dir, 'repo', 'engine.svelte.ts'),
			`import { Story } from 'inkjs';\nexport const story = new Story('');\n`
		);
		writeFileSync(join(dir, 'repo', 'files.ts'), `export const source = Bun.file('input.json');\n`);
		const gitEnv = makeGitEnv();
		spawnSync('git', ['add', '-A'], { cwd: join(dir, 'repo'), env: gitEnv, encoding: 'utf8' });
		spawnSync('git', ['commit', '-m', 'add source signals', '--no-gpg-sign'], {
			cwd: join(dir, 'repo'),
			env: gitEnv,
			encoding: 'utf8'
		});

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug].runtime).toEqual(['bun', 'inkjs']);
		expect(parsed.sources[slug].framework).toEqual(['svelte-5']);
	});

	it('source-grep-only signals (inkjs) are absent from techFirstSeen', () => {
		rmSync(join(dir, 'repo', 'package.json'));
		writeFileSync(
			join(dir, 'repo', 'engine.svelte.ts'),
			`import { Story } from 'inkjs';\nexport const story = new Story('');\n`
		);
		const gitEnv = makeGitEnv();
		spawnSync('git', ['add', '-A'], { cwd: join(dir, 'repo'), env: gitEnv, encoding: 'utf8' });
		spawnSync('git', ['commit', '-m', 'add source signals', '--no-gpg-sign'], {
			cwd: join(dir, 'repo'),
			env: gitEnv,
			encoding: 'utf8'
		});

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug].runtime).toContain('inkjs');
		expect(parsed.sources[slug].techFirstSeen?.inkjs).toBeUndefined();
	});

	it("dates a dependency to the commit that introduced it, not the repo's inception", () => {
		// makeSyncSandbox's init commit (package.json with svelte/@sveltejs/kit/
		// @tailwindcss/vite) is dated 2000-01-01 by makeGitEnv. Add react in a
		// LATER commit, dated explicitly, to prove techFirstSeen decouples from
		// firstCommit — the core regression for the-work's Svelte 5 bug.
		const repoPath = join(dir, 'repo');
		const laterEnv = {
			...makeGitEnv(),
			GIT_AUTHOR_DATE: '2025-05-01T00:00:00+00:00',
			GIT_COMMITTER_DATE: '2025-05-01T00:00:00+00:00'
		};
		writeFileSync(
			join(repoPath, 'package.json'),
			JSON.stringify({
				devDependencies: {
					svelte: '^5.45.6',
					'@sveltejs/kit': '^2.49.1',
					'@tailwindcss/vite': '^4.3.1',
					react: '^18.2.0'
				}
			})
		);
		spawnSync('git', ['add', '-A'], { cwd: repoPath, env: laterEnv, encoding: 'utf8' });
		spawnSync('git', ['commit', '-m', 'add react', '--no-gpg-sign'], {
			cwd: repoPath,
			env: laterEnv,
			encoding: 'utf8'
		});

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		const entry = parsed.sources[slug];
		expect(entry.firstCommit).toBe('2000-01-01');
		expect(entry.techFirstSeen.react).toBe('2025-05-01');
		// svelte/@sveltejs/kit/tailwindcss-4 entered at the repo's init commit —
		// decoupled from firstCommit only in that it's independently derived,
		// not necessarily a different value.
		expect(entry.techFirstSeen['svelte-5']).toBe('2000-01-01');
		expect(entry.techFirstSeen['@sveltejs/kit']).toBe('2000-01-01');
	});

	it('dates a version-qualified migration to the migration commit, not the first dependency of any version', () => {
		// makeSyncSandbox's own init commit already carries svelte ^5.45.6, which
		// would make any later "reintroduction" of the v5 pattern read as its
		// FIRST appearance in history (git log -G reports every commit where a
		// pattern's match count changes, so toggling v5 -> v4 -> v5 within one
		// repo's history is not equivalent to a real one-way migration and would
		// wrongly assert the original date). Build a wholly fresh repo instead,
		// so the v4 commit genuinely is the first svelte dependency ever
		// committed, and the v5 commit genuinely is its only migration.
		const repoPath = join(dir, 'repo');
		rmSync(join(repoPath, '.git'), { recursive: true, force: true });
		const v4Env = {
			...makeGitEnv(),
			GIT_AUTHOR_DATE: '2022-01-01T00:00:00+00:00',
			GIT_COMMITTER_DATE: '2022-01-01T00:00:00+00:00'
		};
		spawnSync('git', ['init', '-b', 'main'], { cwd: repoPath, env: v4Env, encoding: 'utf8' });
		spawnSync('git', ['config', 'user.email', 'test@example.com'], {
			cwd: repoPath,
			env: v4Env,
			encoding: 'utf8'
		});
		spawnSync('git', ['config', 'user.name', 'Test'], {
			cwd: repoPath,
			env: v4Env,
			encoding: 'utf8'
		});
		writeFileSync(
			join(repoPath, 'package.json'),
			JSON.stringify({ devDependencies: { svelte: '^4.2.0' } })
		);
		spawnSync('git', ['add', '-A'], { cwd: repoPath, env: v4Env, encoding: 'utf8' });
		spawnSync('git', ['commit', '-m', 'init on svelte 4', '--no-gpg-sign'], {
			cwd: repoPath,
			env: v4Env,
			encoding: 'utf8'
		});

		const v5Env = {
			...makeGitEnv(),
			GIT_AUTHOR_DATE: '2025-05-01T00:00:00+00:00',
			GIT_COMMITTER_DATE: '2025-05-01T00:00:00+00:00'
		};
		writeFileSync(
			join(repoPath, 'package.json'),
			JSON.stringify({ devDependencies: { svelte: '^5.45.6' } })
		);
		spawnSync('git', ['add', '-A'], { cwd: repoPath, env: v5Env, encoding: 'utf8' });
		spawnSync('git', ['commit', '-m', 'migrate to svelte 5', '--no-gpg-sign'], {
			cwd: repoPath,
			env: v5Env,
			encoding: 'utf8'
		});

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		// The migration commit's date, not the repo's 2022-01-01 inception
		// (which only ever had svelte 4).
		expect(parsed.sources[slug].firstCommit).toBe('2022-01-01');
		expect(parsed.sources[slug].techFirstSeen['svelte-5']).toBe('2025-05-01');
	});

	it('monorepo: takes the earliest date across workspaces for the same identity', () => {
		const repoPath = join(dir, 'repo');
		mkdirSync(join(repoPath, 'apps', 'web'), { recursive: true });
		const earlyEnv = {
			...makeGitEnv(),
			GIT_AUTHOR_DATE: '2021-01-01T00:00:00+00:00',
			GIT_COMMITTER_DATE: '2021-01-01T00:00:00+00:00'
		};
		writeFileSync(
			join(repoPath, 'apps', 'web', 'package.json'),
			JSON.stringify({ dependencies: { vite: '^5.0.0' } })
		);
		spawnSync('git', ['add', '-A'], { cwd: repoPath, env: earlyEnv, encoding: 'utf8' });
		spawnSync('git', ['commit', '-m', 'add nested vite earlier', '--no-gpg-sign'], {
			cwd: repoPath,
			env: earlyEnv,
			encoding: 'utf8'
		});

		// Root package.json (from makeSyncSandbox) does not have vite; add it now,
		// later than the nested workspace's vite commit above.
		const laterEnv = {
			...makeGitEnv(),
			GIT_AUTHOR_DATE: '2024-01-01T00:00:00+00:00',
			GIT_COMMITTER_DATE: '2024-01-01T00:00:00+00:00'
		};
		writeFileSync(
			join(repoPath, 'package.json'),
			JSON.stringify({
				devDependencies: {
					svelte: '^5.45.6',
					'@sveltejs/kit': '^2.49.1',
					'@tailwindcss/vite': '^4.3.1',
					vite: '^5.0.0'
				}
			})
		);
		spawnSync('git', ['add', '-A'], { cwd: repoPath, env: laterEnv, encoding: 'utf8' });
		spawnSync('git', ['commit', '-m', 'add root vite later', '--no-gpg-sign'], {
			cwd: repoPath,
			env: laterEnv,
			encoding: 'utf8'
		});

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		// Earliest across both manifests wins, not the root (later) one.
		expect(parsed.sources[slug].techFirstSeen.vite).toBe('2021-01-01');
	});

	it('detects .NET runtime, web framework and database packages from a root project', () => {
		rmSync(join(dir, 'repo', 'package.json'));
		writeFileSync(
			join(dir, 'repo', 'app.csproj'),
			`<Project Sdk="Microsoft.NET.Sdk.Web">
	<PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
	<ItemGroup>
		<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="8.0.2" />
		<PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="8.0.2" />
	</ItemGroup>
</Project>\n`
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		const entry = parsed.sources[slug];
		expect(entry.runtime).toEqual(['dotnet-8']);
		expect(entry.framework).toEqual(['aspnet-core']);
		expect(entry.database).toEqual(['entity-framework-core', 'npgsql']);
	});

	it('detects nested package and Python manifests in a monorepo', () => {
		mkdirSync(join(dir, 'repo', 'apps', 'web'), { recursive: true });
		mkdirSync(join(dir, 'repo', 'services', 'api'), { recursive: true });
		writeFileSync(join(dir, 'repo', 'bun.lock'), '');
		writeFileSync(
			join(dir, 'repo', 'apps', 'web', 'package.json'),
			JSON.stringify({
				dependencies: {
					svelte: '^5.55.2',
					'@sveltejs/kit': '^2.57.0',
					'@sqlite.org/sqlite-wasm': '^3.53.0'
				}
			})
		);
		writeFileSync(
			join(dir, 'repo', 'services', 'api', 'requirements.txt'),
			'fastapi==0.104.1\nsupabase==2.28.2\n'
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		const entry = parsed.sources[slug];
		expect(entry.runtime).toEqual(['bun', 'python']);
		expect(entry.framework).toEqual(
			expect.arrayContaining(['@sveltejs/kit', 'svelte-5', 'fastapi'])
		);
		expect(entry.database).toEqual(['@sqlite.org/sqlite-wasm', 'supabase-py', 'supabase-postgres']);
	});

	it('merges companion stack and remotes while retaining primary metrics', () => {
		const primaryPath = join(dir, 'repo');
		const companionPath = join(dir, 'companion');
		mkdirSync(companionPath);
		const gitEnv = makeGitEnv();
		const companionGit = (args: string[]) =>
			spawnSync('git', args, { cwd: companionPath, env: gitEnv, encoding: 'utf8' });

		spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/example/backend.git'], {
			cwd: primaryPath,
			encoding: 'utf8'
		});
		companionGit(['init', '-b', 'main']);
		companionGit(['config', 'user.email', 'test@example.com']);
		companionGit(['config', 'user.name', 'Test']);
		companionGit(['remote', 'add', 'origin', 'https://github.com/example/frontend.git']);
		writeFileSync(join(companionPath, 'index.js'), 'export const companion = true;\n');
		writeFileSync(
			join(companionPath, 'package.json'),
			JSON.stringify({ dependencies: { react: '^19.0.0' } })
		);
		writeFileSync(join(companionPath, 'deno.lock'), '{}\n');
		companionGit(['add', '-A']);
		companionGit(['commit', '-m', 'init', '--no-gpg-sign']);

		writeFileSync(
			join(dir, 'sources.local.json'),
			JSON.stringify({ paths: { [slug]: primaryPath, 'companion-ui': companionPath } }, null, '\t')
		);
		writeFileSync(
			join(dir, 'source-topology.json'),
			JSON.stringify({
				projects: { [slug]: { primary: slug, companions: ['companion-ui'] } }
			})
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		const entry = parsed.sources[slug];
		expect(entry.commits).toBe(1);
		expect(entry.remote).toBe('https://github.com/example/backend');
		expect(entry.companionRemotes).toEqual(['https://github.com/example/frontend']);
		expect(entry.languages).toEqual(expect.arrayContaining(['JavaScript']));
		expect(entry.runtime).toEqual(expect.arrayContaining(['node', 'deno']));
		expect(entry.framework).toEqual(
			expect.arrayContaining(['@sveltejs/kit', 'svelte-5', 'tailwindcss-4', 'react'])
		);

		const configPath = makeDriftConfig(dir);
		const runCachedReport = () =>
			spawnSync('bun', ['run', checkDriftPath, '--json', '--no-color'], {
				cwd: repoRoot,
				env: { ...process.env, DRIFT_CONFIG: configPath },
				encoding: 'utf8',
				timeout: 30_000
			});
		const firstReport = runCachedReport();
		expect(firstReport.status, firstReport.stderr).toBe(0);
		const firstCache = JSON.parse(readFileSync(join(dir, '.drift-cache.json'), 'utf8'));
		expect(firstCache[slug].heads).toHaveLength(2);

		writeFileSync(join(companionPath, 'cache-change.js'), 'export const changed = true;\n');
		companionGit(['add', '-A']);
		companionGit(['commit', '-m', 'companion change', '--no-gpg-sign']);
		const secondReport = runCachedReport();
		expect(secondReport.status, secondReport.stderr).toBe(0);
		const secondCache = JSON.parse(readFileSync(join(dir, '.drift-cache.json'), 'utf8'));
		expect(secondCache[slug].heads[0]).toBe(firstCache[slug].heads[0]);
		expect(secondCache[slug].heads[1]).not.toBe(firstCache[slug].heads[1]);
	});

	it('does not write when a configured companion path is missing', () => {
		writeFileSync(
			join(dir, 'source-topology.json'),
			JSON.stringify({ projects: { [slug]: { primary: slug, companions: ['missing-ui'] } } })
		);
		const before = readFileSync(join(dir, 'sources.json'), 'utf8');

		const result = runSyncWithConfig(dir, [slug]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`no local path for source ID(s): missing-ui`);
		expect(readFileSync(join(dir, 'sources.json'), 'utf8')).toBe(before);
	});

	it('warns and continues instead of exiting when source-topology.json is malformed', () => {
		writeFileSync(join(dir, 'source-topology.json'), '{ not valid json');

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr).toContain('Cannot parse');
		expect(result.stderr).toContain('continuing without source topology');
		// Affected project falls back to companion-less sync rather than the
		// whole run aborting.
		const parsed = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
		expect(parsed.sources[slug]).toBeDefined();
	});

	it('drops a companion source ID that matches its own project as primary', () => {
		writeFileSync(
			join(dir, 'source-topology.json'),
			JSON.stringify({
				projects: { [slug]: { primary: slug, companions: [slug, 'missing-ui'] } }
			})
		);

		const result = runSyncWithConfig(dir, [slug]);

		expect(result.status, result.stderr).toBe(0);
		// Only the genuinely distinct companion should be reported missing;
		// the self-reference must have been deduped rather than double-counted.
		expect(result.stdout).toContain('no local path for source ID(s): missing-ui');
		expect(result.stdout).not.toMatch(/missing-ui.*missing-ui/);
	});

	it('warns when two projects claim the same companion source ID', () => {
		writeFileSync(
			join(dir, 'source-topology.json'),
			JSON.stringify({
				projects: {
					[slug]: { primary: slug, companions: ['shared-lib'] },
					'other-project': { primary: 'other-project', companions: ['shared-lib'] }
				}
			})
		);

		const result = runSyncWithConfig(dir, []);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr).toContain('shared-lib');
		expect(result.stderr).toMatch(/claimed by both/);
	});

	it('dry-run stdout mentions the fields that a real sync would write', () => {
		const dryResult = runSyncWithConfig(dir, ['--dry-run']);
		expect(dryResult.status, dryResult.stderr).toBe(0);

		// head and commits are both stale in the fixture — both should appear in
		// the preview. This asserts that the preview reports actual sync changes,
		// not a vacuous "nothing changed" output.
		expect(dryResult.stdout).toMatch(/commits|head/);

		// Dry-run must never claim to have written.
		expect(dryResult.stdout).not.toContain('sources.json synced.');
	});
});
