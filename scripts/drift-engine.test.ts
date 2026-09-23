/**
 * Engine unit tests for config resolution and fingerprint comparison (5DR.8).
 *
 * check-drift.test.ts covers the CLI verbs end-to-end via subprocess, and its
 * own header documents why: check-drift.js has no exports, and its subprocess
 * tests already sit at 40-80s wall time with a vitest worker RPC heartbeat
 * flake that scripts/run-drift-tests.sh exists solely to tolerate. This file
 * covers the gap those subprocess tests leave: the pure comparison logic
 * (diffFingerprint, mergeFingerprint, mergeCompanionFingerprints) and config
 * resolution (loadConfig), both testable in-process with no subprocess and no
 * fixture git repo. It joins the main `vitest run` pool — package.json only
 * excludes check-drift.test.ts by name — so it runs in milliseconds, not
 * seconds.
 *
 * Scan orchestration (computeDrift's worker pool over real git worktrees, its
 * ref+TTL cache, its recursive repo scan) is deliberately NOT covered here.
 * Unit-testing that would mean rebuilding the temp-git-repo scaffolding the
 * `sync` and `enrich` subprocess blocks already provide, and would reintroduce
 * the blocking-I/O cost this file exists to avoid. Its observable behaviour
 * stays covered there; the pure helpers it delegates to (diffFingerprint et
 * al.) are what this file covers directly — which is what "drift computation"
 * means at the unit level.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';

import {
	diffFingerprint,
	mergeFingerprint,
	mergeCompanionFingerprints,
	FINGERPRINT_FIELDS,
	ARRAY_FINGERPRINT_FIELDS,
	DRIFT_SKIP_FIELDS
} from './check-drift.js';
import { loadConfig, DEFAULTS, repoRoot } from './drift-config.js';
import exampleConfig from '../drift.config.example.ts';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'drift-engine-test-'));
	tempDirs.push(dir);
	return dir;
}

/** Writes a temp .mjs config file, mirroring makeDriftConfig in check-drift.test.ts. */
function writeConfig(dir: string, body: string): string {
	const configPath = join(dir, 'drift.config.mjs');
	writeFileSync(configPath, body);
	return configPath;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

// ---------------------------------------------------------------------------
// Config resolution — loadConfig()
// ---------------------------------------------------------------------------

describe('loadConfig resolution order', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('DRIFT_CONFIG (absolute path) takes precedence and resolves dataDir relative to it', async () => {
		const dir = makeTempDir();
		const configPath = writeConfig(dir, `export default { dataDir: 'custom-data' };\n`);
		vi.stubEnv('DRIFT_CONFIG', configPath);

		const cfg = await loadConfig();
		expect(cfg.paths.sources).toBe(join(repoRoot, 'custom-data', 'sources.json'));
	});

	it('DRIFT_CONFIG (relative path) resolves from repoRoot, not cwd', async () => {
		// Uses the template already checked into the repo root rather than
		// planting a temp file there — a failed cleanup of a repo-root temp
		// file would break the repo-wide `prettier --check .` lint gate.
		vi.stubEnv('DRIFT_CONFIG', 'drift.config.example.ts');

		const cfg = await loadConfig();
		// Asserted against the example file's own value, not a hardcoded literal
		// or a bare "not DEFAULTS" check — either would keep passing if the file
		// changed scanRoot to something else, or would fail uninformatively if
		// the key were dropped. This ties the test to the file it's meant to prove loaded.
		expect(cfg.scanRoot).toBe(exampleConfig.scanRoot);
	});

	it('falls back to DEFAULTS when no DRIFT_CONFIG and no drift.config.ts is reachable', async () => {
		const dir = makeTempDir();
		// Point at a config path inside an empty temp dir: no file exists there,
		// so loadConfig must fall back rather than throw.
		vi.stubEnv('DRIFT_CONFIG', join(dir, 'nonexistent.config.mjs'));

		const cfg = await loadConfig();
		expect(cfg.scanRoot).toBe(DEFAULTS.scanRoot);
		expect(cfg.scanDepth).toBe(DEFAULTS.scanDepth);
		expect(cfg.theme).toEqual(DEFAULTS.theme);
	});

	it('never throws on a config file that fails to import, and warns on stderr', async () => {
		const dir = makeTempDir();
		const configPath = writeConfig(dir, `this is not valid javascript {{{\n`);
		vi.stubEnv('DRIFT_CONFIG', configPath);

		const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		try {
			const cfg = await loadConfig();
			expect(cfg.scanRoot).toBe(DEFAULTS.scanRoot);
			expect(stderrSpy).toHaveBeenCalled();
			expect(stderrSpy.mock.calls[0][0]).toContain('could not load');
		} finally {
			stderrSpy.mockRestore();
		}
	});

	it('accepts export default, export const config, and a bare module-object shape', async () => {
		// Case 1: export default
		{
			const d = makeTempDir();
			const p = writeConfig(d, `export default { scanDepth: 7 };\n`);
			vi.stubEnv('DRIFT_CONFIG', p);
			const cfg = await loadConfig();
			expect(cfg.scanDepth).toBe(7);
		}
		// Case 2: export const config
		{
			const d = makeTempDir();
			const p = writeConfig(d, `export const config = { scanDepth: 8 };\n`);
			vi.stubEnv('DRIFT_CONFIG', p);
			const cfg = await loadConfig();
			expect(cfg.scanDepth).toBe(8);
		}
		// Case 3: bare module object (no default, no `config` export) — mod itself is used
		{
			const d = makeTempDir();
			const p = writeConfig(d, `export const scanDepth = 9;\n`);
			vi.stubEnv('DRIFT_CONFIG', p);
			const cfg = await loadConfig();
			expect(cfg.scanDepth).toBe(9);
		}
	});
});

describe('loadConfig merge semantics', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('merges author/theme/files per-key without clobbering sibling keys', async () => {
		const dir = makeTempDir();
		const configPath = writeConfig(
			dir,
			`export default { author: { pattern: 'custom-pattern' } };\n`
		);
		vi.stubEnv('DRIFT_CONFIG', configPath);

		const cfg = await loadConfig();
		expect(cfg.author.pattern).toBe('custom-pattern');
		// recentWindow and botPattern were not overridden — sibling keys survive.
		expect(cfg.author.recentWindow).toBe(DEFAULTS.author!.recentWindow);
		expect(cfg.author.botPattern).toBe(DEFAULTS.author!.botPattern);
	});

	it('replaces excludedRepoNames wholesale rather than unioning with defaults', async () => {
		const dir = makeTempDir();
		const configPath = writeConfig(
			dir,
			`export default { excludedRepoNames: ['only-this-one'] };\n`
		);
		vi.stubEnv('DRIFT_CONFIG', configPath);

		const cfg = await loadConfig();
		expect(cfg.excludedRepoNames).toEqual(['only-this-one']);
		// None of the built-in defaults survive — this is a replace, not a
		// union. loadExcluded() in check-drift.js unions with excluded.json
		// instead; the two functions deliberately disagree on this point.
		expect(cfg.excludedRepoNames).not.toEqual(
			expect.arrayContaining([DEFAULTS.excludedRepoNames![0]])
		);
	});

	it('resolves a relative `files` override from repoRoot, not from dataDir', async () => {
		const dir = makeTempDir();
		const configPath = writeConfig(
			dir,
			`export default { dataDir: 'nested/data-dir', files: { sources: 'elsewhere/sources.json' } };\n`
		);
		vi.stubEnv('DRIFT_CONFIG', configPath);

		const cfg = await loadConfig();
		// Resolved from repoRoot, NOT from repoRoot/nested/data-dir.
		expect(cfg.paths.sources).toBe(join(repoRoot, 'elsewhere/sources.json'));
	});

	it('passes an absolute `files` override through unchanged', async () => {
		const dir = makeTempDir();
		const absoluteTarget = join(dir, 'absolute-sources.json');
		const configPath = writeConfig(
			dir,
			`export default { files: { sources: ${JSON.stringify(absoluteTarget)} } };\n`
		);
		vi.stubEnv('DRIFT_CONFIG', configPath);

		const cfg = await loadConfig();
		expect(cfg.paths.sources).toBe(absoluteTarget);
	});

	it('resolves all eight logical data paths under dataDir when unoverridden', async () => {
		const dir = makeTempDir();
		const configPath = writeConfig(dir, `export default { dataDir: 'my-data' };\n`);
		vi.stubEnv('DRIFT_CONFIG', configPath);

		const cfg = await loadConfig();
		const base = join(repoRoot, 'my-data');
		expect(cfg.paths).toEqual({
			sources: join(base, 'sources.json'),
			topology: join(base, 'source-topology.json'),
			local: join(base, 'sources.local.json'),
			overrides: join(base, 'overrides.json'),
			excluded: join(base, 'excluded.json'),
			cache: join(base, '.drift-cache.json'),
			projects: join(base, 'projects'),
			inProgress: join(base, 'in-progress.json')
		});
	});
});

// ---------------------------------------------------------------------------
// Fingerprint comparison — diffFingerprint / mergeFingerprint
// ---------------------------------------------------------------------------

describe('diffFingerprint', () => {
	it('reports a changed scalar field', () => {
		const saved = { commitsAny: 10 };
		const current = { commitsAny: 15 };
		const diffs = diffFingerprint(saved, current);
		expect(diffs).toContainEqual({ field: 'commitsAny', was: 10, now: 15 });
	});

	it('skips DRIFT_SKIP_FIELDS even when they differ', () => {
		expect(DRIFT_SKIP_FIELDS.has('measuredRef')).toBe(true);
		const saved = { measuredRef: 'abc123' };
		const current = { measuredRef: 'def456' };
		const diffs = diffFingerprint(saved, current);
		expect(diffs.find((d) => d.field === 'measuredRef')).toBeUndefined();
	});

	it('treats detectedLanguages as order-sensitive (prevalence order is meaningful)', () => {
		const saved = { detectedLanguages: ['TypeScript', 'CSS'] };
		const current = { detectedLanguages: ['CSS', 'TypeScript'] };
		// Same elements, different order — order carries file-count prevalence,
		// so this must register as a change.
		const diffs = diffFingerprint(saved, current);
		expect(diffs.find((d) => d.field === 'detectedLanguages')).toBeDefined();
	});

	it('treats other array fields as order-insensitive (sorted before comparison)', () => {
		expect(ARRAY_FINGERPRINT_FIELDS.has('detectedRuntime')).toBe(true);
		const saved = { detectedRuntime: ['bun', 'node'] };
		const current = { detectedRuntime: ['node', 'bun'] };
		const diffs = diffFingerprint(saved, current);
		expect(diffs.find((d) => d.field === 'detectedRuntime')).toBeUndefined();
	});

	it('diffs every non-skipped field present in current when saved is empty (first sync)', () => {
		const current = { commitsAny: 3, commitsMe: 3, measuredRef: 'abc' };
		const diffs = diffFingerprint({}, current);
		const fields = diffs.map((d) => d.field);
		expect(fields).toContain('commitsAny');
		expect(fields).toContain('commitsMe');
		expect(fields).not.toContain('measuredRef');
	});

	it('does not report an unchanged field', () => {
		const saved = { commitsAny: 10 };
		const current = { commitsAny: 10 };
		const diffs = diffFingerprint(saved, current);
		expect(diffs.find((d) => d.field === 'commitsAny')).toBeUndefined();
	});
});

describe('mergeFingerprint', () => {
	it('includes DRIFT_SKIP_FIELDS when changed — the documented asymmetry with diffFingerprint', () => {
		const saved = { measuredRef: 'abc123' };
		const current = { measuredRef: 'def456' };
		const { changedFields, merged } = mergeFingerprint(saved, current);
		// diffFingerprint would omit this field entirely; mergeFingerprint must
		// not, because it mirrors the real write loop and measuredRef is still
		// persisted (only excluded from the *report*).
		expect(changedFields.find((c) => c.field === 'measuredRef')).toBeDefined();
		expect(merged.measuredRef).toBe('def456');
	});

	it('preserves the saved value when current is null (transient probe failure)', () => {
		const saved = { commitsAny: 42 };
		const current = { commitsAny: null };
		const { merged, preservedFields, changedFields } = mergeFingerprint(saved, current);
		expect(merged.commitsAny).toBe(42);
		expect(preservedFields).toContain('commitsAny');
		// A preserved field must not also be reported as changed.
		expect(changedFields.find((c) => c.field === 'commitsAny')).toBeUndefined();
	});

	it('does not preserve when both saved and current are nullish', () => {
		const saved = {};
		const current = { commitsAny: null };
		const { merged, preservedFields } = mergeFingerprint(saved, current);
		expect(merged.commitsAny).toBeNull();
		expect(preservedFields).not.toContain('commitsAny');
	});

	it('writes a fresh non-null value over a previously null saved value', () => {
		const saved = { commitsAny: null };
		const current = { commitsAny: 5 };
		const { merged, changedFields } = mergeFingerprint(saved, current);
		expect(merged.commitsAny).toBe(5);
		expect(changedFields.find((c) => c.field === 'commitsAny')).toBeDefined();
	});

	it('applies order-sensitive vs order-insensitive array comparison identically to diffFingerprint', () => {
		const saved = { detectedLanguages: ['TypeScript', 'CSS'] };
		const current = { detectedLanguages: ['CSS', 'TypeScript'] };
		const { changedFields } = mergeFingerprint(saved, current);
		expect(changedFields.find((c) => c.field === 'detectedLanguages')).toBeDefined();

		const savedRt = { detectedRuntime: ['bun', 'node'] };
		const currentRt = { detectedRuntime: ['node', 'bun'] };
		const { changedFields: changedRt } = mergeFingerprint(savedRt, currentRt);
		expect(changedRt.find((c) => c.field === 'detectedRuntime')).toBeUndefined();
	});

	it('only iterates fields present in current, leaving other saved fields untouched', () => {
		const saved = { commitsAny: 10, commitsMe: 4 };
		const current = { commitsAny: 12 };
		const { merged, changedFields } = mergeFingerprint(saved, current);
		expect(merged.commitsMe).toBe(4);
		expect(changedFields).toHaveLength(1);
		expect(changedFields[0].field).toBe('commitsAny');
	});

	// 5DR.31: adoption-history ratchet. Without this, an identity absent from
	// current.detectedTechFirstSeen simply vanishes from merged — the bug that
	// dropped code-arcana's svelte-4 on its Svelte 5 migration.
	describe('adoption-history ratchet (5DR.31)', () => {
		it('retires an identity absent from current, recording detectedTechLastSeen', () => {
			const saved = { detectedTechFirstSeen: { 'svelte-4': '2022-01-01' } };
			const current = { detectedTechFirstSeen: { 'svelte-5': '2025-05-01' } };
			const { merged } = mergeFingerprint(saved, current, '2025-05-01');
			expect(merged.detectedTechFirstSeen).toEqual({
				'svelte-4': '2022-01-01',
				'svelte-5': '2025-05-01'
			});
			expect(merged.detectedTechLastSeen).toEqual({ 'svelte-4': '2025-05-01' });
		});

		it('does not re-date an identity already retired', () => {
			const saved = {
				detectedTechFirstSeen: { 'svelte-4': '2022-01-01' },
				detectedTechLastSeen: { 'svelte-4': '2025-05-01' }
			};
			const current = { detectedTechFirstSeen: { 'svelte-5': '2025-05-01' } };
			const { merged } = mergeFingerprint(saved, current, '2025-06-01');
			// The first sync to notice the absence dates it; a later sync must
			// not overwrite that date even though it runs the ratchet again.
			expect(merged.detectedTechLastSeen).toEqual({ 'svelte-4': '2025-05-01' });
		});

		it('resurrection: an identity that returns to detection clears its lastSeen', () => {
			const saved = {
				detectedTechFirstSeen: { 'svelte-4': '2022-01-01' },
				detectedTechLastSeen: { 'svelte-4': '2025-05-01' }
			};
			const current = { detectedTechFirstSeen: { 'svelte-4': '2022-01-01' } };
			const { merged } = mergeFingerprint(saved, current, '2025-08-01');
			expect(merged.detectedTechFirstSeen).toEqual({ 'svelte-4': '2022-01-01' });
			expect(merged.detectedTechLastSeen).toBeUndefined();
		});

		it('retires nothing when current has no detectedTechFirstSeen key at all', () => {
			// A failed or empty history walk must not read as "every tracked
			// identity retired" — the one genuinely destructive failure mode.
			const saved = { detectedTechFirstSeen: { 'svelte-4': '2022-01-01', bun: '2023-01-01' } };
			const current = { commitsAny: 5 };
			const { merged } = mergeFingerprint(saved, current, '2025-05-01');
			expect(merged.detectedTechFirstSeen).toEqual(saved.detectedTechFirstSeen);
			expect(merged.detectedTechLastSeen).toBeUndefined();
		});

		it('pushes a synthetic changedFields entry when a retirement fires, since detectedTechLastSeen is never a key of current', () => {
			const saved = { detectedTechFirstSeen: { 'svelte-4': '2022-01-01' } };
			const current = { detectedTechFirstSeen: { 'svelte-5': '2025-05-01' } };
			const { changedFields } = mergeFingerprint(saved, current, '2025-05-01');
			const entry = changedFields.find((c) => c.field === 'detectedTechLastSeen');
			expect(entry).toBeDefined();
			expect(entry?.was).toBeNull();
			expect(entry?.now).toEqual({ 'svelte-4': '2025-05-01' });
		});

		it('records no changedFields entry when nothing retires', () => {
			const saved = { detectedTechFirstSeen: { bun: '2023-01-01' } };
			const current = { detectedTechFirstSeen: { bun: '2023-01-01' } };
			const { changedFields } = mergeFingerprint(saved, current, '2025-05-01');
			expect(changedFields.find((c) => c.field === 'detectedTechLastSeen')).toBeUndefined();
		});
	});
});

describe('mergeCompanionFingerprints', () => {
	it('unions array-typed stack fields across primary and companions without duplicates', () => {
		const primary = { detectedRuntime: ['bun'], detectedFramework: ['sveltekit'] };
		const companions = [
			{ detectedRuntime: ['bun', 'node'], detectedFramework: [] },
			{ detectedRuntime: ['deno'], detectedFramework: ['sveltekit'] }
		];
		const merged = mergeCompanionFingerprints(primary, companions);
		expect(merged.detectedRuntime).toEqual(['bun', 'node', 'deno']);
		expect(merged.detectedFramework).toEqual(['sveltekit']);
	});

	it('retains every primary metric field untouched', () => {
		const primary = { commitsAny: 99, commitsMe: 50, detectedRuntime: ['bun'] };
		const merged = mergeCompanionFingerprints(primary, []);
		expect(merged.commitsAny).toBe(99);
		expect(merged.commitsMe).toBe(50);
	});

	it('collects companion urlRepo values into urlsRepoCompanion, dropping null entries', () => {
		const primary = { urlRepo: 'https://example.com/primary' };
		const companions = [
			{ urlRepo: 'https://example.com/companion-a' },
			{ urlRepo: null },
			{ urlRepo: 'https://example.com/companion-b' }
		];
		const merged = mergeCompanionFingerprints(primary, companions);
		expect(merged.urlsRepoCompanion).toEqual([
			'https://example.com/companion-a',
			'https://example.com/companion-b'
		]);
	});

	it('omits urlsRepoCompanion entirely when there are no companions', () => {
		const primary = { urlRepo: 'https://example.com/primary' };
		const merged = mergeCompanionFingerprints(primary, []);
		expect(merged).not.toHaveProperty('urlsRepoCompanion');
	});

	it('omits an array field entirely when neither primary nor any companion has entries', () => {
		const primary = {};
		const merged = mergeCompanionFingerprints(primary, [{}]);
		expect(merged).not.toHaveProperty('detectedLanguages');
		expect(merged).not.toHaveProperty('detectedDatabase');
	});

	// 5DR.31: previously had no detectedTechFirstSeen branch at all, so a
	// companion's adoption-history dates were dropped outright (only the
	// primary's own dates survived, via ...primary).
	it('unions detectedTechFirstSeen across primary and companions, earliest date wins', () => {
		const primary = { detectedTechFirstSeen: { svelte: '2023-01-01' } };
		const companions = [{ detectedTechFirstSeen: { svelte: '2023-06-01', bun: '2024-01-01' } }];
		const merged = mergeCompanionFingerprints(primary, companions);
		// svelte: primary's earlier date wins over the companion's later one,
		// because the family adopted a tech when its first workspace did.
		expect(merged.detectedTechFirstSeen).toEqual({ svelte: '2023-01-01', bun: '2024-01-01' });
	});

	// The detectedTechLastSeen branch is inert on every current code path: this
	// function runs over getFingerprint outputs, which never carry that field
	// (ratchetTechHistory produces it one stage downstream, from the saved
	// side). The inputs below are therefore a shape the live producer cannot
	// currently emit, constructed deliberately to pin the seam's behaviour for
	// the future producer it exists to serve. Kept rather than dropped so a
	// companion's retirement dates are not silently discarded the way
	// detectedTechFirstSeen's were before 5DR.31.
	it('unions detectedTechLastSeen across primary and companions, latest date wins', () => {
		const primary = { detectedTechLastSeen: { jquery: '2024-06-01' } };
		const companions = [{ detectedTechLastSeen: { jquery: '2024-01-01' } }];
		const merged = mergeCompanionFingerprints(primary, companions);
		// jquery: the LATER date wins. A family retires a tech when its last
		// remaining workspace does, so a workspace that dropped jQuery in
		// January must not shorten the family's true lifespan to January when
		// another workspace kept it until June.
		expect(merged.detectedTechLastSeen).toEqual({ jquery: '2024-06-01' });
	});

	it('does not emit detectedTechLastSeen for getFingerprint-shaped inputs, which never carry it', () => {
		// Guards the inertness claim above: if a future change makes
		// getFingerprint emit lastSeen, this test is the one that should be
		// revisited alongside the comment in mergeCompanionFingerprints.
		const merged = mergeCompanionFingerprints({ detectedTechFirstSeen: { svelte: '2023-01-01' } }, [
			{ detectedTechFirstSeen: { bun: '2024-01-01' } }
		]);
		expect(merged).not.toHaveProperty('detectedTechLastSeen');
		expect(merged.detectedTechFirstSeen).toEqual({ svelte: '2023-01-01', bun: '2024-01-01' });
	});

	it('omits detectedTechFirstSeen/detectedTechLastSeen entirely when neither primary nor any companion has entries', () => {
		const merged = mergeCompanionFingerprints({}, [{}]);
		expect(merged).not.toHaveProperty('detectedTechFirstSeen');
		expect(merged).not.toHaveProperty('detectedTechLastSeen');
	});
});

// ---------------------------------------------------------------------------
// Structural contract — schema is the single source of truth
// ---------------------------------------------------------------------------

describe('fingerprint field constants match the schema', () => {
	// Anchored on literals rather than re-derived from the schema. Both constants
	// are computed from sources.schema.json at check-drift.js:231, so an expected
	// value read back from that same file moves with it: deleting a property
	// would leave a re-derived assertion green while the field silently drops
	// out of drift detection. These lists are the contract; a deliberate schema
	// change updates them in the same commit.
	const EXPECTED_ARRAY_FIELDS = [
		'detectedLanguages',
		'urlsRepoCompanion',
		'detectedRuntime',
		'detectedDatabase',
		'detectedFramework'
	];

	// Fields the engine's comparison logic depends on by name. Not the full
	// property list: that grows as metrics are added, and pinning all of it
	// here would make every schema addition a two-file edit for no extra safety.
	const LOAD_BEARING_FIELDS = [
		'commitHead',
		'measuredRef',
		'commitsAny',
		'commitsMe',
		'detectedLanguages',
		'detectedTechFirstSeen',
		'detectedTechLastSeen'
	];

	it('ARRAY_FINGERPRINT_FIELDS matches the schema array properties exactly', () => {
		expect([...ARRAY_FINGERPRINT_FIELDS].sort()).toEqual([...EXPECTED_ARRAY_FIELDS].sort());
	});

	it('FINGERPRINT_FIELDS contains every load-bearing field', () => {
		for (const field of LOAD_BEARING_FIELDS) {
			expect(FINGERPRINT_FIELDS).toContain(field);
		}
	});

	it('FINGERPRINT_FIELDS preserves schema property order', () => {
		const schemaPath = join(scriptDir, 'sources.schema.json');
		const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
		const props = schema.$defs.SyncedSource.properties as Record<string, unknown>;
		// Order is display order for field drift, so it is worth pinning even
		// though the membership assertions above carry the regression cover.
		expect(FINGERPRINT_FIELDS).toEqual(Object.keys(props));
	});
});
