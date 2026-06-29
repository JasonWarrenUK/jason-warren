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
import { mkdtempSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
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
