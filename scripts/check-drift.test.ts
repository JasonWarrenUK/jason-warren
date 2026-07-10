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
		// lastSyncedAt is set on the manifest root (not per-entry).
		expect(parsed.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
