#!/usr/bin/env node
/**
 * Portfolio drift checker.
 *
 * Compares the last-synced fingerprints in src/lib/data/sources.json against
 * the current state of each source repo on this machine, then scans for new
 * git repos under ~/Code that are not yet in the portfolio.
 *
 * Run `drift --help` for full usage.
 *
 * Usage:
 *   drift [report]                    # compare synced state to current git state (default)
 *   drift sync                        # rewrite sources.json with current fingerprints
 *   drift keep <slug> <field>         # keep your override value, refresh its baseline
 *   drift keep --all-projects <field> # refresh one field's baseline across all projects
 *   drift keep-all                    # refresh every flagged override baseline
 *   drift hide <slug>                 # append a slug to excluded.json (hide from site)
 *   drift --full                      # field-level diff across ALL repos (no HEAD gate)
 */

import { execFile, spawn, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { cpus } from 'os';
import { parseArgs, promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// COUPLING [5DR.4]: resolved — tag taxonomy relocated to scripts/tag-taxonomy.js.
import { EXTENSION_LANGUAGE } from './tag-taxonomy.js';
import { loadConfig, DEFAULTS } from './drift-config.js';

// ---------------------------------------------------------------------------
// Config — load once at module init; every coupling below derives from this.
// Top-level await is valid in ESM and resolves before the run-guard calls main().
// ---------------------------------------------------------------------------

// COUPLING [5DR.3]: resolved — paths, author, scan root, excludes and theme now
// come from the config layer (scripts/drift-config.js). Built-in defaults in that
// module reproduce the previous hard-coded behaviour exactly.
const config = await loadConfig();

// ---------------------------------------------------------------------------
// Engine output schema — loaded once at module init.
// scripts/sources.schema.json is the canonical contract for SyncedSource records.
// If this file is missing or malformed every verb halts immediately — a missing
// contract should not silently produce unchecked output.
// ---------------------------------------------------------------------------

let SCHEMA;
try {
	SCHEMA = JSON.parse(
		readFileSync(new URL('./sources.schema.json', import.meta.url), 'utf8')
	);
} catch (err) {
	process.stderr.write(
		`drift: could not load sources.schema.json — ${err.message}\n` +
		`  Expected: scripts/sources.schema.json (engine output contract)\n`
	);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const sourcesPath = config.paths.sources;
const localPath = config.paths.local;
const overridesPath = config.paths.overrides;
const excludedPath = config.paths.excluded;
const cachePath = config.paths.cache;
const projectsDir = config.paths.projects;
const inProgressPath = config.paths.inProgress;

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function writeJson(filePath, data) {
	writeFileSync(filePath, JSON.stringify(data, null, '\t') + '\n', 'utf8');
	spawnSync('npx', ['prettier', '--write', filePath], { stdio: 'ignore' });
}

/**
 * Resolves the user's preferred editor command. Resolution order (first
 * non-empty value wins):
 *
 *   1. $VISUAL environment variable
 *   2. $EDITOR environment variable
 *   3. git config core.editor (covers the common case where a user
 *      configures their editor at the git level but never sets $EDITOR)
 *
 * @returns {string | null}
 */
function resolveEditor() {
	if (process.env.VISUAL) return process.env.VISUAL;
	if (process.env.EDITOR) return process.env.EDITOR;
	const result = spawnSync('git', ['config', '--get', 'core.editor'], { encoding: 'utf8' });
	if (result.status === 0) {
		const value = result.stdout.trim();
		if (value) return value;
	}
	return null;
}

/**
 * Converts a kebab-case project slug to a camelCase binding name for the
 * overlay's named export. The registry keys by `.slug` so the binding name is
 * functionally irrelevant, but it must be a valid identifier and should follow
 * the established convention (baby-names → babyNames, wyrd-tui → wyrdTui).
 *
 * @param {string} slug
 * @returns {string}
 */
function slugToBinding(slug) {
	return slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Load the per-machine HEAD-SHA cache. Returns {} on any read/parse failure (silent). */
function loadCache() {
	try {
		return JSON.parse(readFileSync(cachePath, 'utf8'));
	} catch {
		return {};
	}
}

/** Write the per-machine HEAD-SHA cache. Uses bare writeFileSync — no prettier. */
function writeCache(cache) {
	try {
		writeFileSync(cachePath, JSON.stringify(cache) + '\n', 'utf8');
	} catch {
		// Cache write failure is non-fatal — next run will just miss.
	}
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/**
 * Run a git command asynchronously. Accepts an argv array or a plain string
 * (split on spaces). Returns the same { ok, out } | { ok, err } shape as before.
 *
 * Using execFile (not execSync) means git subprocesses are non-blocking and
 * can run concurrently when called via Promise.all inside getFingerprint, or
 * across repos inside the bounded-concurrency pool in computeDrift.
 *
 * Note: argv tokens are passed directly to execFile — no shell is involved,
 * so --author and --since values must NOT be wrapped in extra quotes.
 *
 * @param {string | string[]} args
 * @param {string} cwd
 * @returns {Promise<{ ok: true; out: string } | { ok: false; err: string }>}
 */
async function git(args, cwd) {
	const argv = Array.isArray(args) ? args : args.split(' ');
	try {
		const { stdout } = await execFileAsync('git', argv, { cwd });
		return { ok: true, out: stdout.trim() };
	} catch (error) {
		const err = (error.stderr?.toString() || error.message || '').trim();
		return { ok: false, err };
	}
}

// COUPLING [5DR.3]: resolved — author identity and recent window come from config.
// Extended-regex alternation over the portfolio owner's git identities, so the
// "by me" metrics (recent commits, line churn) count their work and not a team's.
// A miss degrades to 0, never an error. Configure via drift.config.ts → author.pattern.
const AUTHOR_PATTERN = config.author.pattern;

// Trailing window for "recent" metrics. Appears in report output too.
// Configure via drift.config.ts → author.recentWindow.
const RECENT_WINDOW = config.author.recentWindow;

// Ordered list of every field getFingerprint returns. Derived from the engine's
// public output schema (scripts/sources.schema.json) so the schema is the single
// source of truth. Property order in the schema matches the desired field-drift
// display order — see the SyncedSource description comment in the schema.
const FINGERPRINT_FIELDS = Object.keys(SCHEMA.$defs.SyncedSource.properties);

// Array-typed fingerprint fields. Derived from the schema: any SyncedSource
// property whose type is 'array'. Compared by sorted join so element-order
// differences in detection do not produce spurious drift.
const ARRAY_FINGERPRINT_FIELDS = new Set(
	FINGERPRINT_FIELDS.filter(
		(f) => SCHEMA.$defs.SyncedSource.properties[f].type === 'array'
	)
);

// Fields excluded from drift comparison even though they live in the schema
// and persist in sources.json. These are metadata / provenance fields; their
// changes are surfaced via advisory report sections, not as field drift.
const DRIFT_SKIP_FIELDS = new Set(['measuredRef']);

// EXTENSION_LANGUAGE is imported from scripts/tag-taxonomy.js above.
// That module is the single source of truth shared between the CLI and the app.

/**
 * Fetch the tracked file listing for a repo at a given ref.
 * Called once per repo and shared between detectLanguages and countLinesOfCode
 * to avoid a double git spawn.
 *
 * Uses `git ls-tree -r --name-only <ref>` so the result reflects the ref's
 * tree rather than the checked-out working tree.
 *
 * @param {string} repoPath
 * @param {string} [ref='HEAD']
 * @returns {Promise<string | null>} Raw newline-separated file listing, or null on git failure.
 */
async function listFiles(repoPath, ref = 'HEAD') {
	const r = await git(['ls-tree', '-r', '--name-only', ref], repoPath);
	return r.ok ? r.out : null;
}

/**
 * Count lines across a set of source files in a repo at a given ref using
 * `git cat-file --batch`: a single long-lived child process that streams
 * all blob contents, avoiding a per-file spawn storm.
 *
 * Accepts the pre-fetched file listing (from listFiles) filtered to source
 * files by the EXTENSION_LANGUAGE gate. Only source files (those that pass
 * the extension gate) are measured, matching the old readFileSync behaviour.
 *
 * @param {string} repoPath
 * @param {string | null} listing  Result of listFiles(), or null.
 * @param {string} [ref='HEAD']
 * @returns {Promise<number | null>}
 */
async function countLinesViaBlobs(repoPath, listing, ref = 'HEAD') {
	if (!listing) return null;

	// Build the list of <ref>:<path> specs for source files only.
	const specs = listing
		.split('\n')
		.filter((file) => {
			if (!file) return false;
			const dot = file.lastIndexOf('.');
			if (dot < 0) return false;
			return !!EXTENSION_LANGUAGE[file.slice(dot + 1).toLowerCase()];
		})
		.map((file) => `${ref}:${file}`);

	if (specs.length === 0) return 0;

	return new Promise((resolve) => {
		let total = 0;
		let leftover = '';
		let inBlob = false; // currently consuming blob content lines
		let blobBytesRemaining = 0;
		let blobLinesBuffer = '';

		const child = spawn('git', ['cat-file', '--batch'], {
			cwd: repoPath,
			stdio: ['pipe', 'pipe', 'ignore']
		});

		child.stdout.on('data', (chunk) => {
			// We use line-count semantics (split on '\n') rather than byte-exact
			// framing to keep the parser simple. 'git cat-file --batch' emits:
			//   <sha> blob <size>\n<contents>\n
			// We accumulate output into a string buffer and process line-by-line.
			leftover += chunk.toString('utf8');
			const lines = leftover.split('\n');
			leftover = lines.pop() ?? ''; // last incomplete line stays in buffer

			for (const line of lines) {
				if (!inBlob) {
					// Header line: "<sha> blob <size>" or "<ref> missing"
					const match = line.match(/^[0-9a-f]+ blob (\d+)/);
					if (match) {
						// Start counting this blob's content lines.
						inBlob = true;
						blobBytesRemaining = Number(match[1]);
						blobLinesBuffer = '';
					}
					// else: missing, ambiguous, or empty; skip
				} else {
					// Content line inside a blob.
					// Track approximate byte consumption; once we have seen at
					// least blobBytesRemaining bytes (content + the trailing \n
					// that git cat-file emits) we close the blob. Because we
					// operate on decoded UTF-8 strings, we use an approximation
					// (byte length ≈ char length for typical source code).
					blobLinesBuffer += line + '\n';
					blobBytesRemaining -= Buffer.byteLength(line + '\n');
					if (blobBytesRemaining <= 0) {
						// Blob complete: count lines.
						if (blobLinesBuffer.length > 0) {
							total += blobLinesBuffer.split('\n').length - 1;
						}
						inBlob = false;
						blobLinesBuffer = '';
					}
				}
			}
		});

		child.on('close', () => {
			// Flush any remaining partial blob.
			if (inBlob && blobLinesBuffer.length > 0) {
				total += blobLinesBuffer.split('\n').length - 1;
			}
			resolve(total > 0 ? total : null);
		});

		child.on('error', () => resolve(null));

		// Write all specs to stdin and close the stream.
		child.stdin.write(specs.join('\n') + '\n');
		child.stdin.end();
	});
}

/**
 * Languages present in the repo, ordered by file count (most prevalent first).
 * Accepts a pre-fetched file listing so the caller can share one git ls-files result
 * between detectLanguages and countLinesOfCode.
 *
 * @param {string | null} listing  Result of listFiles(), or null.
 */
function detectLanguages(listing) {
	if (!listing) return [];
	const counts = new Map();
	for (const file of listing.split('\n')) {
		const dot = file.lastIndexOf('.');
		if (dot < 0) continue;
		const language = EXTENSION_LANGUAGE[file.slice(dot + 1).toLowerCase()];
		if (!language) continue;
		counts.set(language, (counts.get(language) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([language]) => language);
}

/**
 * Overall codebase size: total lines across tracked source files (all authors).
 * Delegates to countLinesViaBlobs which uses a single `git cat-file --batch`
 * subprocess so the count reflects the measured ref, not the working tree.
 *
 * @param {string} repoPath
 * @param {string | null} listing  Result of listFiles(), or null.
 * @param {string} [ref='HEAD']
 * @returns {Promise<number | null>}
 */
async function countLinesOfCode(repoPath, listing, ref = 'HEAD') {
	return countLinesViaBlobs(repoPath, listing, ref);
}

/**
 * Commit count for a repo, parameterised by author scope and time window.
 *
 * @param {string} repoPath
 * @param {{ mine?: boolean; recent?: boolean }} opts
 *   mine   — restrict to Jason's commits via AUTHOR_PATTERN (default: all authors)
 *   recent — restrict to the trailing RECENT_WINDOW (default: all of history)
 * @returns {number | null}
 */
async function countCommits(repoPath, { mine = false, recent = false, ref = 'HEAD' } = {}) {
	const flags = ['rev-list', '--count'];
	if (recent) flags.push(`--since=${RECENT_WINDOW}`);
	if (mine) flags.push('--extended-regexp', `--author=${AUTHOR_PATTERN}`);
	flags.push(ref);
	const r = await git(flags, repoPath);
	return r.ok ? Number(r.out) : null;
}

/**
 * Line churn for a repo, parameterised by author scope and time window.
 *
 * @param {string} repoPath
 * @param {{ mine?: boolean; recent?: boolean }} opts
 *   mine   — restrict to Jason's commits via AUTHOR_PATTERN (default: all authors)
 *   recent — restrict to the trailing RECENT_WINDOW (default: all of history)
 * @returns {{ added: number | null; removed: number | null }}
 */
async function countChurn(repoPath, { mine = false, recent = false, ref = 'HEAD' } = {}) {
	const flags = ['log'];
	if (recent) flags.push(`--since=${RECENT_WINDOW}`);
	if (mine) flags.push('--extended-regexp', `--author=${AUTHOR_PATTERN}`);
	flags.push('--pretty=tformat:', '--numstat', ref);
	const r = await git(flags, repoPath);
	if (!r.ok) return { added: null, removed: null };
	let added = 0;
	let removed = 0;
	for (const line of r.out.split('\n')) {
		if (!line.trim()) continue;
		const [a, r] = line.split('\t');
		if (a === '-' || r === '-') continue; // binary file, no line counts
		added += Number(a) || 0;
		removed += Number(r) || 0;
	}
	return { added, removed };
}

/**
 * Resolve the default branch for a repo so fingerprint metrics are measured
 * against the canonical project state rather than whatever is checked out.
 *
 * Resolution order:
 *   1. `git rev-parse --abbrev-ref origin/HEAD` → strip "origin/" prefix.
 *      This is the authoritative remote default (set by `git remote set-head`
 *      or `git clone`). Returns `{ ref, fellBack: false }` on success.
 *   2. Try `main`, then `master` via `git rev-parse --verify --quiet <name>`.
 *      Returns `{ ref, fellBack: false }` on the first local branch that exists.
 *   3. Fall back to bare `HEAD`. Returns `{ ref: 'HEAD', fellBack: true }`.
 *      `fellBack: true` drives the advisory report section.
 *
 * @param {string} repoPath
 * @returns {Promise<{ ref: string; fellBack: boolean }>}
 */
async function defaultBranch(repoPath) {
	// 1. Remote default via origin/HEAD symbolic ref.
	const originHead = await git(['rev-parse', '--abbrev-ref', 'origin/HEAD'], repoPath);
	if (originHead.ok && originHead.out && !originHead.out.startsWith('origin/HEAD')) {
		// Strip the "origin/" prefix to get the bare branch name.
		const ref = originHead.out.replace(/^origin\//, '');
		return { ref, fellBack: false };
	}

	// 2. Known default-branch names in preference order.
	for (const candidate of ['main', 'master']) {
		const r = await git(['rev-parse', '--verify', '--quiet', candidate], repoPath);
		if (r.ok) return { ref: candidate, fellBack: false };
	}

	// 3. Last resort: measure whatever is checked out.
	return { ref: 'HEAD', fellBack: true };
}

/** ISO date of the earliest root commit, the project's inception. */
async function getFirstCommit(repoPath, ref = 'HEAD') {
	const roots = await git(['log', '--max-parents=0', '--format=%cs', ref], repoPath);
	if (roots.ok && roots.out) {
		return roots.out.split('\n').sort()[0];
	}
	const reversed = await git(['log', '--reverse', '--format=%cs', ref], repoPath);
	return reversed.ok && reversed.out ? reversed.out.split('\n')[0] : null;
}

/**
 * Detects runtime, framework, and database dependencies from manifest files
 * in the repo. Each sub-detection is wrapped in try/catch — missing files are
 * normal; a failure degrades inference gracefully, never crashes.
 *
 * The identity strings returned MUST equal the keys in RUNTIME_TAGS,
 * FRAMEWORK_TAGS, and DATABASE_TAGS in scripts/tag-taxonomy.js — that is the
 * single contract binding the CLI parser to the app's tag inference.
 *
 * @param {string} repoPath
 * @returns {{ runtime: string[], framework: string[], database: string[] }}
 */
function detectDependencies(repoPath) {
	const runtime = [];
	const framework = [];
	const database = [];

	// -----------------------------------------------------------------------
	// package.json: JS/TS ecosystem
	// -----------------------------------------------------------------------
	try {
		const pkgPath = join(repoPath, 'package.json');
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
		const allDeps = {
			...(pkg.dependencies ?? {}),
			...(pkg.devDependencies ?? {})
		};

		// Runtime detection: lock-file presence wins over package.json alone.
		// Check lock files first; fall back to package.json existence for Node.
		const hasBunLock =
			existsSync(join(repoPath, 'bun.lock')) ||
			existsSync(join(repoPath, 'bun.lockb')) ||
			existsSync(join(repoPath, 'bunfig.toml'));
		const hasDenoLock =
			existsSync(join(repoPath, 'deno.json')) || existsSync(join(repoPath, 'deno.lock'));
		if (hasBunLock) runtime.push('bun');
		else if (hasDenoLock) runtime.push('deno');
		else runtime.push('node'); // package.json present, no bun/deno markers

		// Framework detection from deps
		// SvelteKit wins over bare Svelte if both present
		if ('@sveltejs/kit' in allDeps) {
			framework.push('@sveltejs/kit');
		} else if ('svelte' in allDeps) {
			framework.push('svelte');
		}
		if ('next' in allDeps) framework.push('next');
		else if ('react' in allDeps && !('@sveltejs/kit' in allDeps) && !('svelte' in allDeps)) {
			framework.push('react');
		}
		if ('express' in allDeps) framework.push('express');
		if ('@opentui/core' in allDeps) framework.push('@opentui/core');
		if ('@tauri-apps/api' in allDeps || 'tauri' in allDeps) framework.push('tauri');

		// Database detection from deps
		if ('pg' in allDeps) database.push('pg');
		else if ('postgres' in allDeps) database.push('postgres');
		if ('@supabase/supabase-js' in allDeps) database.push('@supabase/supabase-js');
		if ('neo4j-driver' in allDeps) database.push('neo4j-driver');
		if ('mongodb' in allDeps) database.push('mongodb');
		if ('rxdb' in allDeps) database.push('rxdb');
	} catch {
		// No package.json or malformed JSON — continue to other manifest types.
	}

	// -----------------------------------------------------------------------
	// Go: go.mod
	// -----------------------------------------------------------------------
	try {
		if (existsSync(join(repoPath, 'go.mod'))) {
			if (!runtime.includes('go')) runtime.push('go');
		}
	} catch {
		// Ignore
	}

	// -----------------------------------------------------------------------
	// Python: pyproject.toml or requirements.txt
	// -----------------------------------------------------------------------
	try {
		const hasPyproject = existsSync(join(repoPath, 'pyproject.toml'));
		const hasRequirements = existsSync(join(repoPath, 'requirements.txt'));
		if (hasPyproject || hasRequirements) {
			if (!runtime.includes('python')) runtime.push('python');

			// Framework detection from pyproject.toml dependencies
			if (hasPyproject) {
				const pyproject = readFileSync(join(repoPath, 'pyproject.toml'), 'utf8');
				if (/fastapi/i.test(pyproject)) framework.push('fastapi');
				else if (/flask/i.test(pyproject)) framework.push('flask');
				else if (/django/i.test(pyproject)) framework.push('django');

				// Database detection
				if (/psycopg2|psycopg/i.test(pyproject)) database.push('psycopg');
				if (/sqlalchemy/i.test(pyproject)) database.push('sqlalchemy');
			}
			if (hasRequirements) {
				const req = readFileSync(join(repoPath, 'requirements.txt'), 'utf8');
				if (!framework.some((f) => ['fastapi', 'flask', 'django'].includes(f))) {
					if (/fastapi/i.test(req)) framework.push('fastapi');
					else if (/flask/i.test(req)) framework.push('flask');
					else if (/django/i.test(req)) framework.push('django');
				}
				if (!database.includes('psycopg') && /psycopg/i.test(req)) database.push('psycopg');
				if (!database.includes('sqlalchemy') && /sqlalchemy/i.test(req))
					database.push('sqlalchemy');
			}
		}
	} catch {
		// Ignore
	}

	// -----------------------------------------------------------------------
	// Rust: Cargo.toml
	// -----------------------------------------------------------------------
	try {
		if (existsSync(join(repoPath, 'Cargo.toml'))) {
			// Rust projects may also be detected as having Tauri via Cargo.toml
			const cargo = readFileSync(join(repoPath, 'Cargo.toml'), 'utf8');
			if (/tauri/i.test(cargo) && !framework.includes('tauri')) {
				framework.push('tauri');
			}
		}
	} catch {
		// Ignore
	}

	return { runtime, framework, database };
}

/**
 * Normalises a git remote URL to HTTPS form.
 * Converts SSH git@github.com:org/repo.git -> https://github.com/org/repo.
 * Strips trailing .git from HTTPS remotes.
 * Returns null when remote is absent or malformed.
 *
 * @param {string | null} rawRemote
 * @returns {string | null}
 */
function normaliseRemote(rawRemote) {
	if (!rawRemote) return null;
	const trimmed = rawRemote.trim();
	// SSH form: git@github.com:org/repo.git
	const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
	if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
	// HTTPS form: https://github.com/org/repo.git
	if (trimmed.startsWith('https://')) return trimmed.replace(/\.git$/, '');
	return null;
}

/**
 * Computes all fingerprint metrics for a single repo. All independent git calls
 * are launched concurrently via Promise.all so the per-repo latency is the
 * slowest individual call (typically the full-history churn log), not their sum.
 *
 * Returns null if the path is not a git repo or the resolved ref is unresolvable.
 *
 * @param {string} repoPath
 * @param {{ ref?: string; fellBack?: boolean }} [resolvedRef]
 *   Optional pre-resolved ref from defaultBranch(). When omitted, the function
 *   resolves the ref internally. The computeDrift pool hoists the resolution so
 *   the cache fast-path and getFingerprint share the same ref without a duplicate
 *   defaultBranch() call.
 */
async function getFingerprint(repoPath, resolvedRef) {
	if (!existsSync(join(repoPath, '.git'))) return null;

	// Resolve the default branch once. This drives all seven previously HEAD-bound
	// measurement sites so metrics reflect the canonical project state, not whatever
	// branch happens to be checked out locally.
	const { ref } = resolvedRef ?? (await defaultBranch(repoPath));

	// Resolve the short SHA of the measured ref. Bails to null for empty/corrupt repos.
	const headR = await git(['rev-parse', '--short', ref], repoPath);
	if (!headR.ok || !headR.out) return null;
	const head = headR.out;

	// Fan out all independent git calls concurrently. Within a single repo, none
	// of these depend on each other's results, so they can all run in parallel.
	// Each call receives `ref` so it measures the resolved default branch.
	const [
		lcR,
		commits,
		commitsRecentAll,
		commitsMine,
		commitsRecent,
		churnMine,
		churnAll,
		churnMineRecent,
		churnAllRecent,
		remoteR,
		firstCommit,
		listing
	] = await Promise.all([
		git(['log', '-1', '--format=%cs', ref], repoPath), // lastCommit
		countCommits(repoPath, { ref }), // all, lifetime
		countCommits(repoPath, { recent: true, ref }), // all, recent
		countCommits(repoPath, { mine: true, ref }), // mine, lifetime
		countCommits(repoPath, { mine: true, recent: true, ref }), // mine, recent
		countChurn(repoPath, { mine: true, ref }), // mine, lifetime
		countChurn(repoPath, { ref }), // all, lifetime
		countChurn(repoPath, { mine: true, recent: true, ref }), // mine, recent
		countChurn(repoPath, { recent: true, ref }), // all, recent
		git(['remote', 'get-url', 'origin'], repoPath), // remote URL (ref-independent)
		getFirstCommit(repoPath, ref), // earliest commit date on default branch
		listFiles(repoPath, ref) // ref-aware file listing (git ls-tree)
	]);

	const lastCommit = lcR.ok ? lcR.out : null;
	const remote = normaliseRemote(remoteR.ok ? remoteR.out : null);
	const { runtime, framework, database } = detectDependencies(repoPath);

	// detectLanguages uses the ref-aware listing; countLinesOfCode reads blobs
	// from the ref via git cat-file --batch (no working-tree readFileSync).
	const languages = detectLanguages(listing);
	const linesOfCode = await countLinesOfCode(repoPath, listing, ref);

	return {
		head,
		// Record which ref was measured. Excluded from drift comparison (DRIFT_SKIP_FIELDS)
		// so a branch rename does not register as field drift. The HEAD-fallback advisory
		// report section surfaces the signal when fellBack is true.
		measuredRef: ref,
		commits,
		commitsRecentAll,
		commitsMine,
		commitsRecent,
		lastCommit,
		firstCommit,
		languages,
		linesOfCode,
		// mine, lifetime
		linesAdded: churnMine.added,
		linesRemoved: churnMine.removed,
		// all, lifetime
		linesAddedAll: churnAll.added,
		linesRemovedAll: churnAll.removed,
		// mine, recent
		linesAddedRecent: churnMineRecent.added,
		linesRemovedRecent: churnMineRecent.removed,
		// all, recent
		linesAddedRecentAll: churnAllRecent.added,
		linesRemovedRecentAll: churnAllRecent.removed,
		// Dependency-manifest fields
		...(remote && { remote }),
		...(runtime.length > 0 && { runtime }),
		...(framework.length > 0 && { framework }),
		...(database.length > 0 && { database })
	};
}

// ---------------------------------------------------------------------------
// Schema validation helpers.
// validateSource / validateManifest validate the assembled manifest against
// the engine's public output schema (scripts/sources.schema.json) before the
// single sanctioned write to sources.json. A violation means the engine emitted
// something off-contract — a programming error, not user data — so we throw
// rather than warn, and write nothing (fail-closed).
// ---------------------------------------------------------------------------

/**
 * Validate one SyncedSource record against the schema's $defs/SyncedSource.
 * Returns a list of human-readable violation strings, empty when the record is valid.
 *
 * @param {string} slug
 * @param {Record<string, unknown>} record
 * @returns {string[]}
 */
function validateSource(slug, record) {
	const props = SCHEMA.$defs.SyncedSource.properties;
	const violations = [];
	for (const [key, value] of Object.entries(record)) {
		if (!(key in props)) {
			violations.push(`${slug}.${key} — unknown field (not in SyncedSource schema)`);
			continue;
		}
		const spec = props[key];
		if (spec.type === 'string') {
			if (typeof value !== 'string') {
				violations.push(`${slug}.${key} — expected string, got ${typeof value}`);
			}
		} else if (spec.type === 'integer') {
			if (!Number.isInteger(value)) {
				violations.push(`${slug}.${key} — expected integer, got ${JSON.stringify(value)}`);
			} else if (typeof spec.minimum === 'number' && value < spec.minimum) {
				violations.push(`${slug}.${key} — value ${value} is below minimum ${spec.minimum}`);
			}
		} else if (spec.type === 'array') {
			if (!Array.isArray(value)) {
				violations.push(`${slug}.${key} — expected array, got ${typeof value}`);
			} else if (spec.items?.type) {
				const badItem = value.find((v) => typeof v !== spec.items.type);
				if (badItem !== undefined) {
					violations.push(
						`${slug}.${key} — array item ${JSON.stringify(badItem)} is not a ${spec.items.type}`
					);
				}
			}
		} else if (spec.type === 'boolean') {
			if (typeof value !== 'boolean') {
				violations.push(`${slug}.${key} — expected boolean, got ${typeof value}`);
			}
		}
		if (value === null) {
			violations.push(`${slug}.${key} — null not permitted in a written record`);
		}
	}
	return violations;
}

/**
 * Validate the full manifest object against sources.schema.json.
 * Checks top-level keys and each SyncedSource entry in manifest.sources.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
function validateManifest(manifest) {
	const violations = [];
	const rootProps = SCHEMA.properties;
	for (const key of Object.keys(manifest)) {
		if (!(key in rootProps)) {
			violations.push(`manifest.${key} — unknown top-level key`);
		}
	}
	for (const [slug, record] of Object.entries(manifest.sources ?? {})) {
		violations.push(...validateSource(slug, record));
	}
	return violations;
}

/**
 * Field-level comparison of a saved fingerprint against the current live one.
 * Returns an array of { field, was, now } for every field that differs or is
 * absent in `saved`. The `languages` array is compared by ordered join so a
 * shift in detected prevalence registers as real drift.
 *
 * This is the core of `--full` mode: by comparing all fields (not just head),
 * it surfaces windowed-metric decay as the RECENT_WINDOW slides forward, and
 * catches any field added to the schema after a repo was first synced (e.g.
 * firstCommit and placeholder dates seeded before real syncs).
 *
 * Limitation: only works for repos that resolve locally. A placeholder value
 * on a missing/offloaded repo cannot be re-derived from git.
 *
 * @param {Record<string, unknown>} saved
 * @param {Record<string, unknown>} current
 * @returns {{ field: string; was: unknown; now: unknown }[]}
 */
function diffFingerprint(saved, current) {
	const diffs = [];
	for (const field of FINGERPRINT_FIELDS) {
		// Metadata fields are excluded from drift comparison; changes are surfaced
		// via dedicated advisory report sections, not as field drift entries.
		if (DRIFT_SKIP_FIELDS.has(field)) continue;
		const now = current[field];
		const was = saved ? saved[field] : undefined;
		if (ARRAY_FINGERPRINT_FIELDS.has(field)) {
			// `languages` order (by file count) is meaningful — join preserves it.
			// `runtime`/`database`/`framework` order is not meaningful — sort before joining.
			const sortFn = field === 'languages' ? (a) => a : (a) => [...a].sort();
			const a = Array.isArray(was) ? sortFn(was).join(',') : '';
			const b = Array.isArray(now) ? sortFn(now).join(',') : '';
			if (a !== b) diffs.push({ field, was: was ?? null, now: now ?? null });
			continue;
		}
		if (was !== now) diffs.push({ field, was: was ?? null, now: now ?? null });
	}
	return diffs;
}

// ---------------------------------------------------------------------------
// Exclusion list — two axes:
//   repoNames — gates the directory scan by folder name (before a slug exists)
//               COUPLING [5DR.3]: resolved — now sourced from config.excludedRepoNames,
//               paired to config.scanRoot. Legacy repoNames in excluded.json are
//               merged in for backward-compat; new installs configure via drift.config.ts.
//   slugs     — gates the public site by manifest slug (after fingerprinting).
//               Live data written by `drift hide`; lives in excluded.json only.
// ---------------------------------------------------------------------------

/**
 * Load the exclusion list.
 *
 * `repoNames` is sourced from `config.excludedRepoNames` (paired to `config.scanRoot`).
 * Any `repoNames` still present in `excluded.json` are merged in for backward-compat,
 * so un-migrated files keep filtering correctly without any manual action.
 *
 * `slugs` remains live data in `excluded.json`, written by `drift hide`.
 *
 * Best-effort: an unreadable `excluded.json` warns on stderr but still applies the
 * config repoNames, so the scan is never left completely unfiltered.
 */
function loadExcluded() {
	let raw = {};
	try {
		raw = JSON.parse(readFileSync(excludedPath, 'utf8'));
	} catch {
		process.stderr.write(
			`[drift] Warning: could not read excluded.json at ${excludedPath}. Slug exclusions disabled.\n`
		);
	}
	return {
		excludedRepoNames: new Set([...config.excludedRepoNames, ...(raw.repoNames ?? [])]),
		excludedSlugs: new Set(raw.slugs ?? [])
	};
}

// ---------------------------------------------------------------------------
// Colour palette. Honour NO_COLOR (https://no-color.org) and non-TTY output:
// when colour is disabled every code resolves to '' so piped/redirected output
// (drift --json | jq, NO_COLOR=1 drift | cat) carries no escape sequences.
// ---------------------------------------------------------------------------

function colourEnabled(values) {
	if (values['no-color'] || process.env.NO_COLOR) return false;
	if (!process.stdout.isTTY) return false;
	return true;
}

function makePalette(enabled) {
	const code = (seq) => (enabled ? seq : '');
	return {
		RESET: code('\x1b[0m'),
		BOLD: code('\x1b[1m'),
		GREEN: code('\x1b[32m'),
		YELLOW: code('\x1b[33m'),
		// RED is used by applyCheckExit for the failure summary line.
		RED: code('\x1b[31m'),
		CYAN: code('\x1b[36m'),
		DIM: code('\x1b[2m')
	};
}

// ---------------------------------------------------------------------------
// gum capability gate.
// Resolve the gum binary path once per run inside main(); never at module
// level so test imports never shell out. useGum = gumPath() && stdin+stdout TTY
// AND colour is enabled (gum emits ANSI, so we honour --no-color / NO_COLOR).
// ---------------------------------------------------------------------------

function gumPath() {
	const out = spawnSync('which', ['gum'], { encoding: 'utf8' });
	return out.status === 0 ? out.stdout.trim() : null;
}

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

function loadManifests() {
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(sourcesPath, 'utf8'));
	} catch {
		console.error(`Cannot read ${sourcesPath}`);
		process.exit(1);
	}

	// Load manual overrides (best-effort: absence is the normal state, no warning).
	let overrideEntries = {};
	try {
		overrideEntries = JSON.parse(readFileSync(overridesPath, 'utf8')).overrides ?? {};
	} catch {
		// No overrides file or unreadable — fine.
	}

	// Load in-progress work entries (best-effort: absence is the normal state).
	let inProgress = {};
	try {
		inProgress = JSON.parse(readFileSync(inProgressPath, 'utf8')).inProgress ?? {};
	} catch {
		// No in-progress file or unreadable: fine.
	}

	let localPaths = {};
	if (existsSync(localPath)) {
		try {
			localPaths = JSON.parse(readFileSync(localPath, 'utf8')).paths ?? {};
		} catch {
			process.stderr.write(`Cannot parse ${localPath}: continuing without local path overrides\n`);
		}
	} else {
		process.stderr.write(
			'No sources.local.json found. Copy sources.local.json.example and fill in paths for this machine.\n'
		);
	}

	// Load per-machine HEAD-SHA cache (best-effort: missing/unreadable is silent).
	const cache = loadCache();

	return { manifest, overrideEntries, localPaths, cache, inProgress };
}

// ---------------------------------------------------------------------------
// Drift computation (the full fingerprint + scan pass).
//
// Every verb runs this pass so report/update/accept all share the same computed
// state (report needs all arrays, update and accept both need `fresh`, accept-all
// reads `conflicts`).
//
// Phase 2: async getFingerprint + bounded-concurrency worker pool so repos are
// fingerprinted in parallel up to cpus().length concurrent workers. Results are
// collected in an index-keyed map then assembled in original manifest order so
// output arrays remain deterministic regardless of completion order.
//
// HEAD+TTL cache: unchanged repos (same HEAD AND last-run < 24h ago) skip the
// full fingerprint and reuse the cached result. Bypassed when useCache is false
// (update always bypasses; --full and --no-cache also bypass).
//
// --full mode adds `fieldDrift`: a per-repo list of field-level differences
// between the saved fingerprint and the current live one. This surfaces
// windowed-metric decay (recent-window metrics shrink as the window slides)
// and fields that were seeded with placeholder values before real syncs.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function computeDrift(
	{ manifest, overrideEntries, localPaths, cache, inProgress = {} },
	{ full = false, onProgress = null, useCache = false } = {}
) {
	const { excludedRepoNames } = loadExcluded();

	const entries = Object.entries(manifest.sources);
	const total = entries.length;

	// Per-entry result store, keyed by original manifest index, assembled in order
	// after the pool drains to guarantee deterministic output order.
	const results = new Array(total);
	let completed = 0;

	// Bounded-concurrency worker pool. Each worker pulls the next unstarted entry
	// from the shared cursor until exhausted. Pool size = cpu count, floored at 1.
	const concurrency = Math.max(1, cpus().length);
	let cursor = 0;

	// Mutable cache copy — updated during the scan, written once after the pool drains.
	const updatedCache = { ...cache };
	const nowMs = Date.now();
	const nowISO = new Date(nowMs).toISOString();

	async function worker() {
		while (cursor < total) {
			const i = cursor++;
			const [slug, saved] = entries[i];

			const repoPath = localPaths[slug];
			if (!repoPath) {
				results[i] = {
					slug,
					missing: { slug, reason: 'no local path in sources.local.json' }
				};
				completed++;
				onProgress?.({ index: completed, total, slug });
				continue;
			}

			// Resolve the default branch once per entry. The resolved ref is shared
			// between the cache fast-path SHA comparison and getFingerprint so we
			// never resolve the branch twice and the cache key always matches the
			// measured ref (not bare HEAD).
			const resolvedRef = await defaultBranch(repoPath);
			const { ref, fellBack } = resolvedRef;

			// Ref+TTL cache check: skip full fingerprint when the measured ref's
			// tip SHA is unchanged and the cached entry is fresh enough.
			// Never cache null results.
			let current = null;
			let servedFromCache = false;
			if (useCache) {
				const entry = updatedCache[slug];
				if (entry && entry.fingerprint) {
					// Fast SHA check against the RESOLVED ref (not bare HEAD) so the
					// cache key stays coherent when the default branch is not checked out.
					const liveHeadR = await git(['rev-parse', '--short', ref], repoPath);
					if (liveHeadR.ok && liveHeadR.out === entry.head) {
						const age = nowMs - Date.parse(entry.syncedAt);
						if (age < CACHE_TTL_MS) {
							current = entry.fingerprint;
							servedFromCache = true;
						}
					}
				}
			}

			if (!current) {
				// Pass the pre-resolved ref to avoid a redundant defaultBranch() call.
				current = await getFingerprint(repoPath, resolvedRef);
				// Update cache for next run — only for valid fingerprints.
				if (current) {
					updatedCache[slug] = { head: current.head, fingerprint: current, syncedAt: nowISO };
				}
			}

			if (!current) {
				// Path configured but repo not found — could be offloaded.
				results[i] = {
					slug,
					missing: { slug, reason: `path not found or not a git repo: ${repoPath}` }
				};
				completed++;
				onProgress?.({ index: completed, total, slug });
				continue;
			}

			// Carry fellBack alongside the fingerprint so the report renderer can
			// surface the HEAD-fallback advisory for this repo without threading
			// extra state through computeDrift's return shape.
			results[i] = { slug, repoPath, saved, current, servedFromCache, fellBack };
			completed++;
			onProgress?.({ index: completed, total, slug });
		}
	}

	// Launch the pool and wait for all workers to drain the entry list.
	await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

	// Persist the updated cache once, after the pool finishes.
	if (useCache) {
		writeCache(updatedCache);
	}

	// Assemble output arrays in original manifest order.
	const changed = [];
	const missing = [];
	const conflicts = [];
	const fieldDrift = []; // populated only in --full mode
	const fresh = {};

	for (const entry of results) {
		if (!entry) continue; // shouldn't happen, but guard for safety
		if (entry.missing) {
			missing.push(entry.missing);
			continue;
		}
		const { slug, repoPath, saved, current } = entry;

		fresh[slug] = current;

		// Check for manual overrides whose syncedWhenSet baseline has drifted.
		// Runs regardless of whether head moved (catches head-static drift too).
		const slugOverrides = overrideEntries[slug];
		if (slugOverrides) {
			for (const [fieldName, ov] of Object.entries(slugOverrides)) {
				if (fieldName.startsWith('_')) continue; // skip _note, _setNote
				if (ov.syncedWhenSet === null) continue; // pure pin, no baseline to drift
				const syncedField = ov.syncedField ?? fieldName;
				const now = current[syncedField];
				if (now !== undefined && now !== ov.syncedWhenSet) {
					conflicts.push({
						slug,
						field: fieldName,
						value: ov.value,
						was: ov.syncedWhenSet,
						now
					});
				}
			}
		}

		if (current.head !== saved.head) {
			const delta = current.commits - saved.commits;
			// Negative delta signals a history rewrite or branch switch (the measured ref
			// changed so the baseline is ahead of the current count). Flag it so the
			// renderer can annotate rather than displaying a misleading bare "-N".
			const deltaUnreliable = delta < 0;
			changed.push({
				slug,
				path: repoPath,
				from: { head: saved.head, commits: saved.commits, lastCommit: saved.lastCommit },
				to: current,
				delta,
				deltaUnreliable
			});
		}

		// --full mode: compare every field, not just head. Surfaces windowed-metric
		// decay and placeholder values even when HEAD has not moved.
		if (full) {
			const fields = diffFingerprint(saved, current);
			if (fields.length > 0) fieldDrift.push({ slug, fields });
		}
	}

	// Scan for git repos not yet in the manifest.
	// COUPLING [5DR.3]: resolved — scan root and depth now come from config.
	// Configure via drift.config.ts → scanRoot / scanDepth.
	const knownSlugs = new Set(Object.keys(manifest.sources));
	const codeRoot = config.scanRoot;
	const newRepos = [];

	function scanForGitRepos(dir, depth = 0) {
		if (depth > config.scanDepth) return;
		let dirEntries;
		try {
			dirEntries = readdirSync(dir);
		} catch {
			return;
		}
		for (const dirEntry of dirEntries) {
			if (dirEntry.startsWith('.')) continue;
			const fullPath = join(dir, dirEntry);
			try {
				if (!statSync(fullPath).isDirectory()) continue;
			} catch {
				continue;
			}
			if (existsSync(join(fullPath, '.git'))) {
				const name = dirEntry;
				// Normalise: lowercase, convert to kebab-case (basic)
				const normalised = name.toLowerCase().replace(/[_\s]+/g, '-');
				if (!knownSlugs.has(normalised) && !knownSlugs.has(name)) {
					newRepos.push({ name, path: fullPath, normalised });
				}
				// Don't recurse into git repos
			} else {
				scanForGitRepos(fullPath, depth + 1);
			}
		}
	}

	scanForGitRepos(codeRoot);

	const filteredNew = newRepos.filter(
		(r) => !excludedRepoNames.has(r.name) && !excludedRepoNames.has(r.normalised)
	);

	// ---------------------------------------------------------------------------
	// Graduation detection (Phase 6 staging pipeline).
	//
	// For each in-progress entry whose slug has a resolved local repo, test whether
	// the branch has landed in the next pipeline stage via git merge-base --is-ancestor.
	// Produces an inProgressStatus array for the report renderer.
	// ---------------------------------------------------------------------------

	const inProgressStatus = [];

	for (const [slug, entry] of Object.entries(inProgress)) {
		const repoPath = localPaths[slug];
		if (!repoPath || !existsSync(join(repoPath, '.git'))) continue; // skip unresolvable repos

		const { branch, pipeline, visibility, tracked } = entry;

		// Walk the pipeline to find how far the branch has advanced.
		// pipeline[0] is the branch tip (source); subsequent entries are merge targets.
		// Find the furthest stage the branch tip has landed in.
		let landedStage = 0; // 0 = still on source branch (has not landed anywhere yet)
		for (let stageIdx = 1; stageIdx < pipeline.length; stageIdx++) {
			const target = pipeline[stageIdx];
			// --is-ancestor exits 0 when branchTip is an ancestor of target (i.e. already merged).
			const r = await git(['merge-base', '--is-ancestor', branch, target], repoPath);
			if (r.ok) {
				landedStage = stageIdx;
			} else {
				break; // Not yet landed at this stage; stop walking.
			}
		}

		const landed = landedStage >= pipeline.length - 1; // landed in the final target

		for (const [field, { value, baseOnMain }] of Object.entries(tracked)) {
			inProgressStatus.push({
				slug,
				field,
				branch,
				pipeline,
				stage: landedStage,
				value,
				baseOnMain,
				landed,
				visibility
			});
		}
	}

	return { changed, missing, conflicts, fresh, filteredNew, fieldDrift, inProgressStatus };
}

// ---------------------------------------------------------------------------
// gum report rendering
//
// Renders the human report as a single gum-formatted markdown document.
// Only called when gum is available and stdout is an interactive TTY with
// colour enabled. The plain console.log path below is the fallback and is
// byte-identical to the pre-gum output.
// ---------------------------------------------------------------------------

function renderReportMarkdown(result, manifest, full) {
	const { changed, missing, conflicts, filteredNew, fieldDrift, inProgressStatus = [] } = result;
	const lines = [];

	lines.push(`# Portfolio source drift report`);
	lines.push(`_Last synced: ${manifest.lastSyncedAt}_`);
	lines.push('');

	// Repos where no default branch could be resolved: measured bare HEAD.
	const headFallbacks = Object.entries(result.fresh ?? {})
		.filter(([, fp]) => fp.measuredRef === 'HEAD')
		.map(([slug]) => slug);

	const allClear =
		changed.length === 0 &&
		filteredNew.length === 0 &&
		missing.length === 0 &&
		conflicts.length === 0 &&
		headFallbacks.length === 0 &&
		inProgressStatus.length === 0 &&
		(!full || fieldDrift.length === 0);

	if (allClear) {
		lines.push(
			`All ${Object.keys(manifest.sources).length} tracked repos are up to date. No new repos detected.`
		);
		return lines.join('\n');
	}

	if (changed.length > 0) {
		lines.push(`## Changed repos (${changed.length})`);
		lines.push('');
		for (const r of changed) {
			const dir = r.delta > 0 ? '+' : '';
			// Annotate negative deltas (history rewrite or branch switch) instead of
			// rendering a misleading bare "-N commits".
			const deltaStr = r.deltaUnreliable
				? `${r.delta} commits _(baseline ahead, history rewrite or branch change?)_`
				: `${dir}${r.delta} commits`;
			lines.push(`### ${r.slug}`);
			lines.push('');
			lines.push(
				`\`${r.from.head}\` → \`${r.to.head}\` · ${deltaStr} · first: ${r.to.firstCommit ?? '?'}, last: ${r.to.lastCommit}`
			);
			lines.push('');
			lines.push(`size: ${r.to.linesOfCode ?? '?'} loc`);
			lines.push('');

			// Metric grid as a markdown table — commits and churn in separate rows.
			const cAll = r.to.commits ?? '?';
			const cMine = r.to.commitsMine ?? '?';
			const cAllR = r.to.commitsRecentAll ?? '?';
			const cMineR = r.to.commitsRecent ?? '?';
			const addM = r.to.linesAdded ?? '?';
			const remM = r.to.linesRemoved ?? '?';
			const addA = r.to.linesAddedAll ?? '?';
			const remA = r.to.linesRemovedAll ?? '?';
			const addMR = r.to.linesAddedRecent ?? '?';
			const remMR = r.to.linesRemovedRecent ?? '?';
			const addAR = r.to.linesAddedRecentAll ?? '?';
			const remAR = r.to.linesRemovedRecentAll ?? '?';

			lines.push(`| metric | life all | life mine | rec all | rec mine |`);
			lines.push(`| --- | --- | --- | --- | --- |`);
			lines.push(`| commits | ${cAll} | ${cMine} | ${cAllR} | ${cMineR} |`);
			lines.push(`| churn + | ${addA} | ${addM} | ${addAR} | ${addMR} |`);
			lines.push(`| churn - | ${remA} | ${remM} | ${remAR} | ${remMR} |`);
			lines.push('');

			if (r.to.languages.length > 0) {
				lines.push(`languages: ${r.to.languages.join(', ')}`);
				lines.push('');
			}
		}
	}

	if (full && fieldDrift.length > 0) {
		lines.push(`## Field-level drift - full scan (${fieldDrift.length})`);
		lines.push('');
		for (let i = 0; i < fieldDrift.length; i++) {
			const r = fieldDrift[i];
			const current = result.fresh?.[r.slug] ?? {};
			lines.push(
				...renderCardMarkdown({ slug: r.slug, current, fields: r.fields, firstCard: i === 0 })
			);
		}
	}

	if (full) {
		const { line1, line2 } = buildCoverageStats(manifest);
		lines.push(`## Coverage`);
		lines.push('');
		lines.push(line1);
		lines.push('');
		lines.push(line2);
		lines.push('');
	}

	if (conflicts.length > 0) {
		lines.push(`## Manual overrides to review (${conflicts.length})`);
		lines.push('');
		for (const c of conflicts) {
			lines.push(
				`- **${c.slug}.${c.field}**: you set \`${c.value}\` when synced was \`${c.was}\`; synced is now \`${c.now}\`. Run \`drift keep ${c.slug} ${c.field}\` to keep your value and dismiss.`
			);
		}
		lines.push('');
	}

	if (filteredNew.length > 0) {
		lines.push(`## New repos not yet in portfolio (${filteredNew.length})`);
		lines.push('');
		for (const r of filteredNew) {
			lines.push(`- \`${r.name}\` · ${r.path}`);
		}
		lines.push('');
	}

	if (missing.length > 0) {
		lines.push(`## Repos without local paths (${missing.length})`);
		lines.push('');
		for (const r of missing) {
			lines.push(`- ${r.slug}: ${r.reason}`);
		}
		lines.push('');
	}

	if (headFallbacks.length > 0) {
		lines.push(`## Repos measured on bare HEAD (${headFallbacks.length})`);
		lines.push('');
		lines.push(
			'These repos have no resolvable default branch (`origin/HEAD`, `main`, or `master`). ' +
				'Metrics reflect the currently checked-out branch, not the canonical default. ' +
				'Run `git remote set-head origin --auto` in the repo to fix.'
		);
		lines.push('');
		for (const slug of headFallbacks) {
			lines.push(`- \`${slug}\``);
		}
		lines.push('');
	}

	if (inProgressStatus.length > 0) {
		lines.push(`## In-progress work (${inProgressStatus.length})`);
		lines.push('');
		for (const s of inProgressStatus) {
			const target = s.pipeline[s.pipeline.length - 1];
			const pipelinePos = `pipeline ${s.stage}/${s.pipeline.length - 1}`;
			const landedNote = s.landed ? ' (landed, run `drift promote`)' : '';
			lines.push(
				`- \`${s.slug}.${s.field}\`: ${s.value} on \`${s.branch}\` (${s.baseOnMain} on \`${target}\`), ${pipelinePos}${landedNote}`
			);
		}
		lines.push('');
	}

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Coverage summary (used by both the gum markdown and plain ANSI paths)
// ---------------------------------------------------------------------------

/**
 * Computes coverage stats for the --full report.
 * Reads excluded.json and the projects/ directory at call time (cheap; called
 * once per report run) so the numbers always reflect the current state on disk.
 *
 * Returns two strings — callers format them for their output mode.
 *
 * Example:
 *   line1: "47 manifest slugs · 2 excluded · 33 with .ts overlay, 12 manifest-only"
 *   line2: "fields populated: languages 45, runtime 30, framework 28, database 14"
 */
function buildCoverageStats(manifest) {
	const manifestSlugs = Object.keys(manifest.sources);
	const total = manifestSlugs.length;

	const { excludedSlugs } = loadExcluded();
	const excludedCount = manifestSlugs.filter((s) => excludedSlugs.has(s)).length;

	// Count slugs that have a hand-authored .ts overlay in projects/
	const overlayFiles = new Set(
		readdirSync(projectsDir)
			.filter((f) => f.endsWith('.ts'))
			.map((f) => f.slice(0, -3))
	);
	const withOverlay = manifestSlugs.filter((s) => overlayFiles.has(s)).length;
	const manifestOnly = total - excludedCount - withOverlay;

	// Count how many manifest entries carry each dependency field
	const src = manifest.sources;
	const hasLanguages = manifestSlugs.filter((s) => (src[s].languages ?? []).length > 0).length;
	const hasRuntime = manifestSlugs.filter((s) => (src[s].runtime ?? []).length > 0).length;
	const hasFramework = manifestSlugs.filter((s) => (src[s].framework ?? []).length > 0).length;
	const hasDatabase = manifestSlugs.filter((s) => (src[s].database ?? []).length > 0).length;

	return {
		line1: `${total} manifest slugs · ${excludedCount} excluded · ${withOverlay} with .ts overlay, ${manifestOnly} manifest-only`,
		line2: `fields populated: languages ${hasLanguages}, runtime ${hasRuntime}, framework ${hasFramework}, database ${hasDatabase}`
	};
}

// ---------------------------------------------------------------------------
// Per-project card renderers
//
// A "card" is a self-contained block for one project slug, used by both the
// field-drift section of `report --full` and the new `snapshot` verb.
//
// Design:
//   - gum/markdown path:  `---` rule between cards + `###` slug heading
//     renders cleanly under `gum format --theme pink`, giving clear visual
//     breaks between projects.
//   - plain-ANSI path:    a dim `───` rule + coloured slug header.
//
// Both paths share the same content shape. The palette is passed in so the
// plain path can colourise individual values.
// ---------------------------------------------------------------------------

/**
 * Returns a short identity line for a fingerprint entry.
 * Always includes firstCommit and lastCommit so they appear as context even
 * when they did not drift. Remote is included when present.
 *
 * The optional `marker` callback receives (field, renderedValue) and returns
 * the value string with any desired emphasis applied (e.g. bold markdown or
 * ANSI colour). The default is the identity function, so callers that pass
 * nothing are byte-for-byte unchanged.
 *
 * Each caller constructs its own marker using whatever drift set and escape
 * codes are appropriate for its render path.
 *
 * @param {Record<string, unknown>} fp  current or saved fingerprint
 * @param {object} [opts]
 * @param {(field: string, value: string) => string} [opts.marker]  emphasis callback
 * @returns {string}
 */
function buildIdentityLine(fp, { marker = (_f, v) => v } = {}) {
	const first = marker('firstCommit', fp?.firstCommit ?? '?');
	const last = marker('lastCommit', fp?.lastCommit ?? '?');
	const commits = fp?.commits != null ? marker('commits', `${fp.commits} commits`) : null;
	const loc = fp?.linesOfCode != null ? marker('linesOfCode', `${fp.linesOfCode} loc`) : null;
	const remote = fp?.remote != null ? marker('remote', fp.remote) : null;

	const parts = [`first: ${first}`, `last: ${last}`];
	if (commits) parts.push(commits);
	if (loc) parts.push(loc);
	const line = parts.join(' · ');
	return remote ? `${remote}\n${line}` : line;
}

/**
 * Renders a single project card as markdown lines (gum path).
 *
 * @param {object} opts
 * @param {string}   opts.slug
 * @param {Record<string, unknown>} opts.current   live fingerprint
 * @param {Array<{field:string, was:unknown, now:unknown}>} opts.fields
 *   Fields to render as rows. Pass [] to show identity-only (snapshot for
 *   unchanged project). Pass drifted fields for the report diff view.
 *   Pass null to render ALL fields from current (full snapshot mode).
 * @param {boolean} [opts.firstCard=false]  suppress the leading `---` on first card
 * @returns {string[]}
 */
function renderCardMarkdown({ slug, current, fields, firstCard = false }) {
	const lines = [];

	if (!firstCard) lines.push('---');
	lines.push('');
	lines.push(`### ${slug}`);
	lines.push('');

	// Identity line: always show firstCommit/lastCommit/remote as context.
	// Bold any token whose field drifted vs saved, mirroring the field table below.
	const driftedIdentity = new Set((fields ?? []).map((f) => f.field));
	const identity = buildIdentityLine(current, {
		marker: (field, v) => (driftedIdentity.has(field) ? `**${v}**` : v)
	});
	for (const il of identity.split('\n')) lines.push(`_${il}_`);
	lines.push('');

	if (fields && fields.length > 0) {
		lines.push(`| field | was | now |`);
		lines.push(`| --- | --- | --- |`);
		for (const f of fields) {
			const was = Array.isArray(f.was) ? f.was.join(', ') : String(f.was ?? '?');
			const now = Array.isArray(f.now) ? f.now.join(', ') : String(f.now ?? '?');
			// Mark changed fields with a bullet so gum colour makes them pop
			lines.push(`| **${f.field}** | ${was} | ${now} |`);
		}
		lines.push('');
	}

	return lines;
}

/**
 * Renders a single project card as ANSI console output (plain fallback).
 * Returns void; writes directly via console.log.
 *
 * @param {object} opts
 * @param {string}   opts.slug
 * @param {Record<string, unknown>} opts.current   live fingerprint
 * @param {Array<{field:string, was:unknown, now:unknown}>} opts.fields
 * @param {boolean}  opts.firstCard   suppress leading rule on first card
 * @param {object}   opts.palette     ANSI colour codes
 */
function renderCardPlain({ slug, current, fields, firstCard = false, palette }) {
	const { RESET, BOLD, CYAN, DIM, YELLOW } = palette;

	if (!firstCard) {
		console.log(`${DIM}${'─'.repeat(60)}${RESET}`);
	}

	console.log(`${BOLD}${CYAN}${slug}${RESET}`);

	// Identity line: bold+yellow any token whose field drifted vs saved.
	// The whole line is wrapped in DIM by the console.log below; after a
	// marker reset, re-open DIM so the rest of the line stays dim.
	const driftedIdentity = new Set((fields ?? []).map((f) => f.field));
	const identity = buildIdentityLine(current, {
		marker: (field, v) => (driftedIdentity.has(field) ? `${YELLOW}${BOLD}${v}${RESET}${DIM}` : v)
	});
	for (const il of identity.split('\n')) {
		console.log(`  ${DIM}${il}${RESET}`);
	}

	if (fields && fields.length > 0) {
		console.log('');
		for (const f of fields) {
			const was = Array.isArray(f.was) ? f.was.join(', ') : (f.was ?? '?');
			const now = Array.isArray(f.now) ? f.now.join(', ') : (f.now ?? '?');
			console.log(
				`  ${YELLOW}${BOLD}${f.field}${RESET}  ${DIM}${was}${RESET} → ${BOLD}${now}${RESET}`
			);
		}
	}
	console.log('');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function runReport({ result, manifest, palette, json, full, useGum }) {
	const { changed, missing, conflicts, filteredNew, fieldDrift, inProgressStatus = [] } = result;
	const { RESET, BOLD, GREEN, YELLOW, CYAN, DIM } = palette;

	// Machine-readable mode: emit JSON and suppress the human report entirely.
	// Pipe-safe — palette is already empty when stdout is not a TTY, so no
	// escape sequences escape even if --json is omitted and output is piped.
	// This branch is structurally first: --json can never reach the gum path.
	if (json) {
		const payload = { changed, conflicts, filteredNew, missing, inProgressStatus };
		if (full) payload.fieldDrift = fieldDrift;
		process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
		return;
	}

	// gum markdown rendering — only when interactive with colour enabled.
	// Falls back to the plain console.log path on any failure.
	if (useGum && process.stdout.isTTY) {
		const md = renderReportMarkdown(result, manifest, full);
		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], { input: md, encoding: 'utf8' });
		if (out.status === 0 && out.stdout) {
			process.stdout.write('\n' + out.stdout + '\n');
			return;
		}
	}

	// Plain ANSI fallback — byte-identical to pre-gum output.
	console.log(
		`\n${BOLD}Portfolio source drift report${RESET} ${DIM}(${manifest.lastSyncedAt})${RESET}\n`
	);

	// Repos where no default branch could be resolved: measured bare HEAD.
	const headFallbacks = Object.entries(result.fresh ?? {})
		.filter(([, fp]) => fp.measuredRef === 'HEAD')
		.map(([slug]) => slug);

	const allClear =
		changed.length === 0 &&
		filteredNew.length === 0 &&
		missing.length === 0 &&
		conflicts.length === 0 &&
		headFallbacks.length === 0 &&
		inProgressStatus.length === 0 &&
		(!full || fieldDrift.length === 0);

	if (allClear) {
		console.log(
			`${GREEN}All ${Object.keys(manifest.sources).length} tracked repos are up to date. No new repos detected.${RESET}`
		);
		return;
	}

	if (changed.length > 0) {
		console.log(`${YELLOW}${BOLD}Changed repos (${changed.length}):${RESET}`);
		for (const r of changed) {
			const dir = r.delta > 0 ? '+' : '';
			// Annotate negative deltas (history rewrite or branch switch).
			const deltaStr = r.deltaUnreliable
				? `${r.delta} commits ${YELLOW}(baseline ahead, history rewrite or branch change?)${RESET}`
				: `${dir}${r.delta} commits`;
			console.log(`  ${CYAN}${r.slug}${RESET}`);
			console.log(
				`    ${r.from.head} → ${r.to.head}  (${deltaStr}, first: ${r.to.firstCommit ?? '?'}, last: ${r.to.lastCommit})`
			);
			// Commits: all/mine × lifetime/recent
			const cAll = r.to.commits ?? '?';
			const cMine = r.to.commitsMine ?? '?';
			const cAllR = r.to.commitsRecentAll ?? '?';
			const cMineR = r.to.commitsRecent ?? '?';
			// Churn: mine/all × lifetime/recent
			const addM = r.to.linesAdded ?? '?';
			const remM = r.to.linesRemoved ?? '?';
			const addA = r.to.linesAddedAll ?? '?';
			const remA = r.to.linesRemovedAll ?? '?';
			const addMR = r.to.linesAddedRecent ?? '?';
			const remMR = r.to.linesRemovedRecent ?? '?';
			const addAR = r.to.linesAddedRecentAll ?? '?';
			const remAR = r.to.linesRemovedRecentAll ?? '?';
			console.log(`    ${DIM}size: ${r.to.linesOfCode ?? '?'} loc${RESET}`);
			console.log(
				`    ${DIM}commits  lifetime: ${cAll} all / ${cMine} mine  ·  recent (${RECENT_WINDOW}): ${cAllR} all / ${cMineR} mine${RESET}`
			);
			console.log(
				`    ${DIM}churn    mine lifetime: +${addM}/−${remM}  ·  all lifetime: +${addA}/−${remA}${RESET}`
			);
			console.log(
				`    ${DIM}         mine recent:   +${addMR}/−${remMR}  ·  all recent:   +${addAR}/−${remAR}${RESET}`
			);
			if (r.to.languages.length > 0) {
				console.log(`    ${DIM}languages: ${r.to.languages.join(', ')}${RESET}`);
			}
		}
		console.log();
	}

	if (full && fieldDrift.length > 0) {
		console.log(`${YELLOW}${BOLD}Field-level drift - full scan (${fieldDrift.length}):${RESET}`);
		console.log();
		for (let i = 0; i < fieldDrift.length; i++) {
			const r = fieldDrift[i];
			const current = result.fresh?.[r.slug] ?? {};
			renderCardPlain({ slug: r.slug, current, fields: r.fields, firstCard: i === 0, palette });
		}
	}

	if (full) {
		const { line1, line2 } = buildCoverageStats(manifest);
		console.log(`${BOLD}Coverage:${RESET}`);
		console.log(`  ${DIM}${line1}${RESET}`);
		console.log(`  ${DIM}${line2}${RESET}`);
		console.log();
	}

	if (conflicts.length > 0) {
		console.log(`${YELLOW}${BOLD}Manual overrides to review (${conflicts.length}):${RESET}`);
		for (const c of conflicts) {
			console.log(
				`  ${YELLOW}${c.slug}.${c.field}: you set ${c.value} when synced was ${c.was}; synced is now ${c.now} (run \`drift keep ${c.slug} ${c.field}\` to keep your value and dismiss)${RESET}`
			);
		}
		console.log();
	}

	if (filteredNew.length > 0) {
		console.log(`${GREEN}${BOLD}New repos not yet in portfolio (${filteredNew.length}):${RESET}`);
		for (const r of filteredNew) {
			console.log(`  ${CYAN}${r.name}${RESET}  ${DIM}${r.path}${RESET}`);
		}
		console.log();
	}

	if (missing.length > 0) {
		console.log(`${DIM}${BOLD}Repos without local paths (${missing.length}):${RESET}`);
		for (const r of missing) {
			console.log(`  ${DIM}${r.slug}: ${r.reason}${RESET}`);
		}
		console.log();
	}

	if (headFallbacks.length > 0) {
		console.log(`${YELLOW}${BOLD}Repos measured on bare HEAD (${headFallbacks.length}):${RESET}`);
		console.log(
			`  ${YELLOW}No resolvable default branch (origin/HEAD, main, master). Metrics reflect${RESET}`
		);
		console.log(
			`  ${YELLOW}the checked-out branch. Run \`git remote set-head origin --auto\` to fix.${RESET}`
		);
		for (const slug of headFallbacks) {
			console.log(`  ${YELLOW}${slug}${RESET}`);
		}
		console.log();
	}

	if (inProgressStatus.length > 0) {
		console.log(`${BOLD}In-progress work (${inProgressStatus.length}):${RESET}`);
		for (const s of inProgressStatus) {
			const target = s.pipeline[s.pipeline.length - 1];
			const pipelinePos = `pipeline ${s.stage}/${s.pipeline.length - 1}`;
			if (s.landed) {
				// Green: ready to promote.
				console.log(
					`  ${GREEN}${s.slug}.${s.field}: ${s.value} on \`${s.branch}\` (${s.baseOnMain} on \`${target}\`), ${pipelinePos}, landed. Run \`drift promote ${s.slug} ${s.field}\`${RESET}`
				);
			} else {
				// Dim/cyan: still in flight.
				console.log(
					`  ${CYAN}${s.slug}.${s.field}${RESET}${DIM}: ${s.value} on \`${s.branch}\` (${s.baseOnMain} on \`${target}\`), ${pipelinePos}${RESET}`
				);
			}
		}
		console.log();
	}
}

// ---------------------------------------------------------------------------
// Sync: rewrite sources.json with current fingerprints.
// The ONE sanctioned write to sources.json. Never touches overrides.json.
// --full is accepted for symmetry but is a no-op: sync already backfills
// every resolvable repo regardless of HEAD movement.
// ---------------------------------------------------------------------------

function runUpdate({ result, manifest, palette, useGum, args = [], dryRun = false }) {
	const { fresh } = result;
	const { GREEN, YELLOW, RED, RESET, DIM } = palette;

	if (Object.keys(fresh).length === 0) return;

	// Per-repo scoping: if slug args were provided, restrict to those slugs only.
	// Unknown slugs get a soft warning (not an abort) so a typo doesn't block a batch.
	let scopedFresh = fresh;
	const isScoped = args.length > 0;
	if (isScoped) {
		for (const slug of args) {
			if (!fresh[slug]) {
				process.stdout.write(
					`${YELLOW}Warning: '${slug}' is not resolvable on this machine — skipped.${RESET}\n`
				);
			}
		}
		scopedFresh = Object.fromEntries(
			args.filter((slug) => fresh[slug]).map((slug) => [slug, fresh[slug]])
		);
		if (Object.keys(scopedFresh).length === 0) {
			console.log('No resolvable repos in the provided slugs — nothing to sync.');
			return;
		}
	}

	// Dry-run: show a field-level diff for each scoped repo and return without writing.
	if (dryRun) {
		const slugs = Object.keys(scopedFresh);
		console.log(
			`${DIM}Dry run — showing what ${slugs.length} repo${slugs.length === 1 ? '' : 's'} would change. Nothing will be written.${RESET}\n`
		);
		let firstCard = true;
		for (const [slug, current] of Object.entries(scopedFresh)) {
			const saved = manifest.sources[slug] ?? {};
			const fields = diffFingerprint(saved, current);
			renderCardPlain({ slug, current, fields, firstCard, palette });
			firstCard = false;
		}
		return;
	}

	// gum confirm gate — only when interactive. Writes nothing on cancel.
	if (useGum && process.stdout.isTTY) {
		const n = Object.keys(scopedFresh).length;
		const scope = isScoped ? `${n} scoped repo${n === 1 ? '' : 's'}` : `${n} fingerprints`;
		const res = spawnSync('gum', ['confirm', `Rewrite sources.json with ${scope}?`], {
			stdio: 'inherit'
		});
		if (res.status !== 0) {
			console.log('Update cancelled.');
			return;
		}
	}

	// Backfill every resolvable repo (or the scoped subset), not just those whose
	// head moved, so new fields (firstCommit, languages) populate across the manifest.
	// Field-merge: only overwrite when the fresh value is non-null, so a transient
	// git failure cannot clobber previously-good data with a null.
	console.log('Updating sources.json with current fingerprints...');
	for (const [slug, current] of Object.entries(scopedFresh)) {
		const saved = manifest.sources[slug] ?? {};
		const merged = { ...saved };
		const preserved = [];
		for (const [field, value] of Object.entries(current)) {
			if (value === null && saved[field] != null) {
				preserved.push(field);
			} else {
				merged[field] = value;
			}
		}
		manifest.sources[slug] = merged;
		if (preserved.length > 0) {
			console.log(
				`${YELLOW}${slug}: preserved ${preserved.join(', ')} from saved entry (git returned no value)${RESET}`
			);
		}
	}
	const today = new Date().toISOString().slice(0, 10);
	manifest.lastSyncedAt = today;

	// Only a full (un-scoped) update can declare all firstCommit values authoritative.
	// A scoped partial update touching one repo must not flip the provisional flag for
	// repos it never examined.
	if (!isScoped && manifest.firstCommitProvisional) {
		manifest.firstCommitProvisional = false;
		console.log(
			`${DIM}firstCommitProvisional cleared — firstCommit values are now authoritative.${RESET}`
		);
	}

	// Validate the fully-assembled manifest against the engine's public schema
	// before the single sanctioned write. A violation is a programming error in
	// the engine, not user data — throw and write nothing (fail-closed).
	const violations = validateManifest(manifest);
	if (violations.length > 0) {
		for (const v of violations) {
			process.stderr.write(`${RED}drift: schema violation — ${v}${RESET}\n`);
		}
		throw new Error(
			`sources.json failed schema validation (${violations.length} violation(s)); nothing written.`
		);
	}

	writeJson(sourcesPath, manifest);
	console.log(`${GREEN}sources.json synced.${RESET}`);
}

// ---------------------------------------------------------------------------
// Keep: refresh the syncedWhenSet baseline for one or all flagged override
// fields, keeping the manual value intact.
// The ONE sanctioned write to overrides.json. sync never touches it.
// ---------------------------------------------------------------------------

function runAccept({ result, args, acceptAll, allProjects, palette }) {
	const { conflicts, fresh } = result;
	const { GREEN, RESET } = palette;

	let fieldsToAccept;
	if (acceptAll) {
		// keep-all: refresh every currently-flagged conflict regardless of field name.
		fieldsToAccept = conflicts.map((c) => ({ slug: c.slug, field: c.field }));
	} else if (allProjects) {
		// keep --all-projects <field>: refresh one named field across every project
		// that currently has it flagged. Distinct from keep-all (which takes all fields).
		const field = args[0];
		if (!field) {
			process.stderr.write('Usage: drift keep --all-projects <field>\n');
			process.exit(1);
		}
		fieldsToAccept = conflicts
			.filter((c) => c.field === field)
			.map((c) => ({ slug: c.slug, field: c.field }));
		if (fieldsToAccept.length === 0) {
			console.log(`No flagged overrides for field ${field}.`);
			return; // friendly, exit 0
		}
	} else {
		// keep <slug> <field>: refresh one specific override.
		fieldsToAccept = [{ slug: args[0], field: args[1] }];
		if (!fieldsToAccept[0]?.slug || !fieldsToAccept[0]?.field) {
			process.stderr.write('Usage: drift keep <slug> <field>\n');
			process.exit(1);
		}
	}

	let overridesManifest;
	try {
		overridesManifest = JSON.parse(readFileSync(overridesPath, 'utf8'));
	} catch {
		process.stderr.write(`Cannot read ${overridesPath}\n`);
		process.exit(1);
	}

	let accepted = 0;
	for (const { slug, field } of fieldsToAccept) {
		const slugOv = overridesManifest.overrides?.[slug];
		if (!slugOv || !slugOv[field] || field.startsWith('_')) {
			process.stderr.write(`No override for ${slug}.${field} in overrides.json\n`);
			process.exit(1);
		}

		const entry = slugOv[field];
		const syncedField = entry.syncedField ?? field;
		const fp = fresh[slug];
		if (!fp) {
			process.stderr.write(
				`Cannot keep ${slug}.${field}: repo not resolvable on this machine (no local path or not a git repo)\n`
			);
			process.exit(1);
		}
		const now = fp[syncedField];
		if (now === undefined) {
			process.stderr.write(
				`Cannot keep ${slug}.${field}: synced field '${syncedField}' is absent from the current fingerprint\n`
			);
			process.exit(1);
		}

		entry.syncedWhenSet = now;
		console.log(
			`${GREEN}Kept ${slug}.${field}: baseline refreshed to ${now}, your value ${entry.value} kept.${RESET}`
		);
		accepted++;
	}

	if (accepted > 0) {
		writeJson(overridesPath, overridesManifest);
	}
}

// ---------------------------------------------------------------------------
// --check exit gating. Called after runReport when --check is set.
// Exits non-zero when drift, conflicts, or new repos are detected.
// 'missing' is EXCLUDED from this gate: missing local paths are routine when
// the user offloads dormant projects to free disk space, and should not fail CI.
// In --full mode, field-level drift also contributes to the non-zero exit.
// ---------------------------------------------------------------------------

function applyCheckExit(result, palette, full) {
	const { changed, conflicts, filteredNew, fieldDrift } = result;
	const { RED, RESET } = palette;
	const drift = changed.length + conflicts.length + filteredNew.length;
	const fieldCount = full ? fieldDrift.length : 0;
	if (drift + fieldCount > 0) {
		const fieldSuffix = full && fieldCount > 0 ? `, ${fieldCount} field-drift` : '';
		process.stderr.write(
			`${RED}drift detected: ${changed.length} changed, ${conflicts.length} conflicts, ${filteredNew.length} new${fieldSuffix}.${RESET}\n`
		);
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// drift hide — append a slug to excluded.json, removing it from the public site
// ---------------------------------------------------------------------------

/**
 * Appends a slug to excluded.json.slugs. Writes ONLY excluded.json.
 * Friendly no-op when already present; warns if slug is not a manifest key.
 *
 * @param {{ args: string[], manifest: object, palette: object }} options
 */
function runExclude({ args, manifest, palette }) {
	const { GREEN, RED, YELLOW, BOLD, RESET } = palette;
	const slug = args[0]?.trim();

	if (!slug) {
		process.stderr.write(`${RED}Usage: drift hide <slug>${RESET}\n`);
		process.exit(1);
	}

	// Warn if the slug is not in the manifest (it might not be fingerprinted yet).
	if (!manifest.sources[slug]) {
		process.stdout.write(
			`${YELLOW}Warning: '${slug}' is not a key in sources.json. ` +
				`It will be added to excluded.json but will have no effect until the slug is in the manifest.${RESET}\n`
		);
	}

	let excluded;
	try {
		excluded = JSON.parse(readFileSync(excludedPath, 'utf8'));
	} catch {
		process.stderr.write(`${RED}Error: could not read excluded.json at ${excludedPath}${RESET}\n`);
		process.exit(1);
	}

	if (excluded.slugs.includes(slug)) {
		process.stdout.write(
			`${YELLOW}'${slug}' is already in excluded.json.slugs — nothing to do.${RESET}\n`
		);
		return;
	}

	excluded.slugs = [...excluded.slugs, slug].sort();
	writeJson(excludedPath, excluded);
	process.stdout.write(
		`${GREEN}${BOLD}Hidden:${RESET} '${slug}' added to excluded.json.slugs.\n` +
			`Rebuild the site to remove it from the public portfolio.\n`
	);
}

// ---------------------------------------------------------------------------
// promote verb
// ---------------------------------------------------------------------------

/**
 * Graduates an in-progress entry out of in-progress.json once its branch has
 * landed. Writes ONLY in-progress.json (write-isolation contract).
 *
 * The tracked value graduates into sources.json on the next `drift sync` run
 * automatically: now that the branch has merged into the default branch,
 * getFingerprint (measuring the default branch) will pick up the higher counts
 * without any manual write to sources.json.
 *
 * @param {{ args: string[], result: object, palette: object }} options
 */
function runPromote({ args, palette }) {
	const { GREEN, YELLOW, BOLD, RED, RESET, DIM } = palette;
	const slug = args[0]?.trim();
	const fieldArg = args[1]?.trim();

	if (!slug) {
		process.stderr.write(`${RED}Usage: drift promote <slug> [field]${RESET}\n`);
		process.exit(1);
	}

	// Load the current in-progress manifest.
	let ipManifest;
	try {
		ipManifest = JSON.parse(readFileSync(inProgressPath, 'utf8'));
	} catch {
		process.stderr.write(
			`${RED}Error: could not read in-progress.json at ${inProgressPath}${RESET}\n`
		);
		process.exit(1);
	}

	const entry = ipManifest.inProgress?.[slug];
	if (!entry) {
		process.stdout.write(
			`${YELLOW}Warning: '${slug}' is not in in-progress.json, nothing to promote.${RESET}\n`
		);
		return;
	}

	if (fieldArg) {
		// Promote a single tracked field.
		if (!entry.tracked?.[fieldArg]) {
			process.stderr.write(
				`${RED}Error: field '${fieldArg}' is not tracked for '${slug}' in in-progress.json${RESET}\n`
			);
			process.exit(1);
		}
		const removedValue = entry.tracked[fieldArg].value;
		delete entry.tracked[fieldArg];

		// If no tracked fields remain, remove the whole entry.
		if (Object.keys(entry.tracked).length === 0) {
			delete ipManifest.inProgress[slug];
			process.stdout.write(
				`${GREEN}${BOLD}Promoted:${RESET} ${DIM}removed ${slug}.${fieldArg} (value: ${removedValue}); all tracked fields done, entry retired.${RESET}\n`
			);
		} else {
			process.stdout.write(
				`${GREEN}${BOLD}Promoted:${RESET} ${DIM}removed ${slug}.${fieldArg} (value: ${removedValue}) from in-progress.${RESET}\n`
			);
		}
	} else {
		// Promote the whole slug entry.
		const fields = Object.keys(entry.tracked ?? {});
		delete ipManifest.inProgress[slug];
		process.stdout.write(
			`${GREEN}${BOLD}Promoted:${RESET} ${DIM}retired in-progress entry for '${slug}' (${fields.length} field${fields.length === 1 ? '' : 's'}: ${fields.join(', ')}).${RESET}\n`
		);
	}

	writeJson(inProgressPath, ipManifest);
	process.stdout.write(
		`${DIM}Run \`drift sync\` to pick up the graduated values from the default branch.${RESET}\n`
	);
}

// ---------------------------------------------------------------------------
// init verb
//
// Scaffolds the two per-machine, gitignored config files that a fresh checkout
// needs: drift.config.ts (repo root) and sources.local.json (data dir).
// When an interactive TTY with gum is available, elicits values via gum input
// prompts pre-filled with the built-in defaults. In non-interactive mode (no
// gum, piped output, CI) writes the real built-in default values silently.
// Never overwrites an existing file.
// ---------------------------------------------------------------------------

/**
 * Prompts the user for a single value via gum input, pre-filled with the
 * default. Returns the typed value on success, or the default on cancel/error.
 *
 * @param {string} prompt   Label shown to the left of the input cursor.
 * @param {string} def      Default value (pre-filled and returned on cancel).
 * @returns {string}
 */
function gumInput(prompt, def) {
	const res = spawnSync(
		'gum',
		[
			'input',
			`--prompt=${prompt}: `,
			`--prompt.foreground=${BRAND_PRIMARY}`,
			`--value=${def}`
		],
		{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
	);
	return res.status === 0 && res.stdout.trim() ? res.stdout.trim() : def;
}

/**
 * Generates the text content of drift.config.ts from the given values.
 *
 * @param {{ scanRoot: string, scanDepth: number, authorPattern: string, recentWindow: string, excludedRepoNames: string[], primary: string, accent: string, markdownTheme: string }} v
 * @returns {string}
 */
function buildDriftConfigSource(v) {
	const excludes = JSON.stringify(v.excludedRepoNames, null, '\t').replace(/\n/g, '\n\t');
	return `/**
 * drift.config.ts — per-machine Drift engine config.
 *
 * Generated by \`drift init\`. Every key is optional; omitted keys fall back to
 * Drift's built-in defaults. Run \`bun run drift --help\` to confirm the config loads.
 *
 * Set the DRIFT_CONFIG env variable to an alternative path if you want to keep
 * the config somewhere other than the repository root.
 */

/** @type {import('./scripts/drift-config.js').DriftUserConfig} */
export default {
\t/**
\t * Where the four data files live, relative to the repo root (or absolute).
\t * Default: 'src/lib/data'
\t */
\tdataDir: 'src/lib/data',

\t/**
\t * Root directory scanned for git repos not yet in the manifest.
\t * Paired to \`excludedRepoNames\` — update both when configuring a new machine.
\t * Default: ~/Code
\t */
\tscanRoot: ${JSON.stringify(v.scanRoot)},

\t/**
\t * Maximum directory depth for the git-repo scan.
\t * Default: 3
\t */
\tscanDepth: ${v.scanDepth},

\tauthor: {
\t\t/**
\t\t * Extended-regexp alternation over your git identities across repos.
\t\t * Used as the --author flag in commit/churn queries so "by me" metrics
\t\t * count your work and not collaborators'. A miss degrades to 0, never an error.
\t\t */
\t\tpattern: ${JSON.stringify(v.authorPattern)},

\t\t/**
\t\t * Trailing window for "recent" metrics. Accepts git --since values.
\t\t * Default: '4 weeks ago'
\t\t */
\t\trecentWindow: ${JSON.stringify(v.recentWindow)}
\t},

\t/**
\t * Repository folder names excluded from the directory scan.
\t * Paired to \`scanRoot\` — these are the folder names that should never appear
\t * in the portfolio (the portfolio repo itself, sub-repos, non-project tooling).
\t */
\texcludedRepoNames: ${excludes},

\t/** gum UI theme. */
\ttheme: {
\t\t/** Cursor, selection, and border foreground colour (hex). Default: '#3E7F96' (teal). */
\t\tprimary: ${JSON.stringify(v.primary)},
\t\t/** Item and wordmark foreground colour (hex). Default: '#B34480' (magenta). */
\t\taccent: ${JSON.stringify(v.accent)},
\t\t/** Theme name passed to \`gum format --theme\`. Default: 'pink'. */
\t\tmarkdownTheme: ${JSON.stringify(v.markdownTheme)}
\t}
};
`;
}

/**
 * Scaffolds drift.config.ts and sources.local.json for this machine.
 * Interactive when useGum is true (gum input prompts pre-filled with defaults);
 * non-interactive otherwise (writes real built-in default values silently).
 * Never overwrites an existing file.
 *
 * The drift.config.ts write target is derived from localPath's directory
 * (when DRIFT_CONFIG is set, that file's parent is also the config write root)
 * so that test subprocess invocations remain fully sandboxed.
 *
 * @param {{ palette: object, useGum: boolean }} options
 */
function runInit({ palette, useGum }) {
	const { GREEN, YELLOW, BOLD, DIM, RESET } = palette;

	// Resolve the two target paths.
	// sources.local.json: always at localPath (derived from config.paths.local).
	// drift.config.ts: sits alongside the DRIFT_CONFIG file when one is set
	// (test-safe, keeps test subprocess writes sandboxed), otherwise at config.repoRoot.
	const configFileEnv = process.env.DRIFT_CONFIG;
	const configDir = configFileEnv
		? configFileEnv.replace(/\/[^/]+$/, '') // dirname without importing extra
		: config.repoRoot;
	const configPath = join(configDir, 'drift.config.ts');

	// Relative paths for display.
	const relLocal = localPath.replace(config.repoRoot + '/', '');
	const relConfig = configPath.replace(config.repoRoot + '/', '');

	// Collect default values from DEFAULTS.
	const defScanRoot = DEFAULTS.scanRoot;
	const defScanDepth = DEFAULTS.scanDepth;
	const defAuthorPattern = DEFAULTS.author.pattern;
	const defRecentWindow = DEFAULTS.author.recentWindow;
	const defExcludes = DEFAULTS.excludedRepoNames;
	const defPrimary = DEFAULTS.theme.primary;
	const defAccent = DEFAULTS.theme.accent;
	const defMarkdownTheme = DEFAULTS.theme.markdownTheme;

	// Gather values — interactive via gum or use defaults.
	let scanRoot = defScanRoot;
	let scanDepth = defScanDepth;
	let authorPattern = defAuthorPattern;
	let recentWindow = defRecentWindow;
	let excludedRepoNames = defExcludes;
	let primary = defPrimary;
	let accent = defAccent;
	let markdownTheme = defMarkdownTheme;

	if (useGum) {
		process.stdout.write(`\n${BOLD}drift init${RESET} — scaffold per-machine config files\n\n`);
		process.stdout.write(`${DIM}Press Enter to accept the default for each prompt. Ctrl-C to cancel a prompt and keep its default.${RESET}\n\n`);

		scanRoot = gumInput('Scan root (directory to scan for repos)', defScanRoot);
		scanDepth = parseInt(gumInput('Scan depth (max directory depth)', String(defScanDepth)), 10) || defScanDepth;
		authorPattern = gumInput('Author pattern (git --author alternation, pipe-separated)', defAuthorPattern);
		recentWindow = gumInput('Recent window (git --since value)', defRecentWindow);
		excludedRepoNames = gumInput('Excluded repo names (comma-separated)', defExcludes.join(','))
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		primary = gumInput('Theme primary colour (hex)', defPrimary);
		accent = gumInput('Theme accent colour (hex)', defAccent);
		markdownTheme = gumInput('Theme markdown theme (gum format --theme value)', defMarkdownTheme);

		process.stdout.write('\n');
	}

	let anyCreated = false;

	// sources.local.json
	if (existsSync(localPath)) {
		process.stdout.write(`${YELLOW}already exists, skipping:${RESET} ${relLocal}\n`);
	} else {
		writeJson(localPath, {
			_note: "Per-machine local paths for each source repo. Gitignored. Run `drift sync` after filling in paths.",
			paths: {}
		});
		process.stdout.write(`${GREEN}${BOLD}created${RESET} ${relLocal}\n`);
		anyCreated = true;
	}

	// drift.config.ts
	if (existsSync(configPath)) {
		process.stdout.write(`${YELLOW}already exists, skipping:${RESET} ${relConfig}\n`);
	} else {
		const source = buildDriftConfigSource({
			scanRoot,
			scanDepth,
			authorPattern,
			recentWindow,
			excludedRepoNames,
			primary,
			accent,
			markdownTheme
		});
		writeFileSync(configPath, source, 'utf8');
		spawnSync('npx', ['prettier', '--write', configPath], { stdio: 'ignore' });
		process.stdout.write(`${GREEN}${BOLD}created${RESET} ${relConfig}\n`);
		anyCreated = true;
	}

	if (anyCreated) {
		process.stdout.write(
			`\n${DIM}Fill in paths in ${relLocal}, then run \`bun run drift\` to see your portfolio state.${RESET}\n`
		);
	}
}

// ---------------------------------------------------------------------------
// author verb
//
// Scaffolds src/lib/data/projects/<slug>.ts from a full commented template if
// the file is absent, then opens it in the user's editor (when in a TTY).
// Editor resolution: $VISUAL → $EDITOR → git config core.editor.
// Never overwrites an existing overlay.
//
// Write-isolation: writes ONLY projects/<slug>.ts (create-if-absent).
// ---------------------------------------------------------------------------

/**
 * Generates the text content of a new project overlay file for the given slug.
 *
 * @param {string} slug
 * @returns {string}
 */
function buildOverlayTemplate(slug) {
	const binding = slugToBinding(slug);
	return `import type { AuthoredProject } from '../types.js';

// Authored overlay for "${slug}". Every field except \`slug\` is optional and
// overlays the Drift-derived manifest default. Delete any field you do not author.
// Depth rubric (\`drift audit\`): description >= 80 words AND >= 4 highlights
// (AND a contributionNote for team projects) earns a Full tier.
export const ${binding}: AuthoredProject = {
	slug: '${slug}',

	// Display name. Defaults to a title-cased slug if omitted.
	name: '',

	// One-sentence summary (meta tags, detail header, map tooltip). High visibility.
	tagline: '',

	// Short card face, roughly 1/3 of the tagline. Shown on collapsed cards.
	blurb: '',

	// Longer case-study body. Name the problem, the architecture or approach, and
	// a verification or outcome signal. Aim for >= 80 words for a Full tier.
	description: '',

	// One of: 'app' | 'game' | 'website' | 'toy' | 'library' | 'tool' | 'tui' | 'repo'
	kind: 'app',

	// For 'solo', no note is needed. For 'lead' | 'collaborator', add a specific
	// contributionNote (PRs, stats, named features) to reach Full tier.
	contribution: { role: 'solo' },

	// One of: 'live' | 'wip' | 'finished' | 'prototype' | 'archived' | 'uncategorised'
	status: 'wip',

	repoUrl: '',

	// 3-5 technically interesting things. Feature or technical detail, not tooling config.
	highlights: [],

	// e.g. { kind: 'extracted-from', target: 'other-slug', note: '...' }
	relationships: [],

	// e.g. { label: 'TypeScript', kind: 'language' }
	tags: []
};
`;
}

/**
 * Creates src/lib/data/projects/<slug>.ts from the template if it does not
 * already exist. Never overwrites. Shared by `runAuthor` and `runPin`.
 *
 * @param {string} slug
 * @returns {{ path: string, created: boolean }}
 */
function createOverlayIfAbsent(slug) {
	const overlayPath = join(projectsDir, `${slug}.ts`);
	if (existsSync(overlayPath)) return { path: overlayPath, created: false };
	writeFileSync(overlayPath, buildOverlayTemplate(slug), 'utf8');
	spawnSync('npx', ['prettier', '--write', overlayPath], { stdio: 'ignore' });
	return { path: overlayPath, created: true };
}

/**
 * Scaffolds a project overlay and opens it in the user's editor.
 * Writes ONLY projects/<slug>.ts (create-if-absent contract).
 *
 * Editor resolution: $VISUAL → $EDITOR → git config core.editor.
 *
 * @param {{ args: string[], palette: object, useGum: boolean }} options
 */
function runAuthor({ args, palette }) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;
	const slug = args[0]?.trim();

	if (!slug) {
		process.stderr.write(`${RED}Usage: drift author <slug>${RESET}\n`);
		process.exit(1);
	}

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
		process.stderr.write(
			`${RED}Error: invalid slug '${slug}'. Use lowercase kebab-case (e.g. my-project).${RESET}\n`
		);
		process.exit(1);
	}

	const { path, created } = createOverlayIfAbsent(slug);
	const relPath = path.replace(config.repoRoot + '/', '');

	if (created) {
		process.stdout.write(`${GREEN}${BOLD}created${RESET} ${relPath}\n`);
	} else {
		process.stdout.write(`${YELLOW}already exists, skipping create:${RESET} ${relPath}\n`);
	}

	// Open the file in the user's editor when in an interactive TTY.
	// Guarded on stdin.isTTY so CI and subprocess tests return cleanly.
	// Resolution order: $VISUAL → $EDITOR → git config core.editor.
	if (process.stdin.isTTY) {
		const editor = resolveEditor();
		if (editor) {
			// shell: true lets multi-word values (e.g. "zed --wait", "code --wait") work.
			spawnSync(editor, [path], { stdio: 'inherit', shell: true });
		} else {
			process.stdout.write(
				`${DIM}No editor found. Set $EDITOR or run: git config --global core.editor <cmd>\n` +
				`Edit the file directly: ${relPath}${RESET}\n`
			);
		}
	} else {
		process.stdout.write(`${DIM}Edit the file directly: ${relPath}${RESET}\n`);
	}
}

// ---------------------------------------------------------------------------
// pin verb
//
// Sets pin: true in the slug's .ts overlay, creating it from the template if
// absent. Uses the TypeScript compiler API for a targeted text-splice so no
// existing field or comment is disturbed. pin lives only in overlays, never
// in any of the four JSON data files.
//
// Write-isolation: writes ONLY projects/<slug>.ts.
//
// NOTE: runPin is the natural home to generalise into setOverlayFlag(slug,
// 'pin'|'hide') when 5DR.17 (drift hide <slug> overlay) lands. At that point
// replace the hard-coded 'pin' property name with a parameter.
// ---------------------------------------------------------------------------

/**
 * Sets pin: true in the slug's .ts overlay. Creates the overlay from the
 * template first when absent. Idempotent: no-op when already pinned.
 * Writes ONLY projects/<slug>.ts (write-isolation contract).
 *
 * @param {{ args: string[], palette: object, useGum: boolean }} options
 */
async function runPin({ args, palette }) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;
	const slug = args[0]?.trim();

	if (!slug) {
		process.stderr.write(`${RED}Usage: drift pin <slug>${RESET}\n`);
		process.exit(1);
	}

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
		process.stderr.write(
			`${RED}Error: invalid slug '${slug}'. Use lowercase kebab-case (e.g. my-project).${RESET}\n`
		);
		process.exit(1);
	}

	const { path, created } = createOverlayIfAbsent(slug);
	const relPath = path.replace(config.repoRoot + '/', '');

	if (created) {
		process.stdout.write(`${GREEN}${BOLD}created${RESET} ${relPath}\n`);
	}

	// Lazy-import the TypeScript compiler API. This avoids loading it on every
	// verb invocation; only pin (and future overlay-flag verbs) pay the cost.
	const ts = (await import('typescript')).default;

	const text = readFileSync(path, 'utf8');
	const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TS);

	// Find the single exported VariableStatement whose initializer is an
	// ObjectLiteralExpression. Every well-formed overlay has exactly one such export.
	let objLit = null;
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		if (!(stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
				objLit = decl.initializer;
				break;
			}
		}
		if (objLit) break;
	}

	if (!objLit) {
		process.stderr.write(
			`${RED}Error: could not locate the exported object literal in ${relPath}.\n` +
			`Expected one named export with an object literal initializer.${RESET}\n`
		);
		process.exit(1);
	}

	// Look for an existing `pin` property assignment.
	const pinProp = objLit.properties.find(
		(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'pin'
	);

	let splicedText;

	if (pinProp) {
		const initNode = pinProp.initializer;
		if (initNode.kind === ts.SyntaxKind.TrueKeyword) {
			// Already pinned — idempotent no-op.
			process.stdout.write(`${YELLOW}'${slug}' is already pinned — nothing to do.${RESET}\n`);
			return;
		}
		// Present but not true (e.g. false, variable reference) — splice to true.
		splicedText =
			text.slice(0, initNode.getStart(sf)) +
			'true' +
			text.slice(initNode.getEnd());
	} else {
		// Absent — insert `pin: true,` immediately after the opening brace.
		const insertPos = objLit.getStart(sf) + 1; // position just past '{'
		splicedText =
			text.slice(0, insertPos) +
			'\n\tpin: true,' +
			text.slice(insertPos);
	}

	writeFileSync(path, splicedText, 'utf8');
	spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });

	process.stdout.write(
		`${GREEN}${BOLD}Pinned:${RESET} '${slug}' now floats to the top of the hero pool.\n` +
		`${DIM}Rebuild the site to apply.${RESET}\n`
	);
}

// ---------------------------------------------------------------------------
// audit verb
//
// Scores every authored overlay against the content-depth rubric and emits a
// per-entry tier report (Full / Partial / Thin). Mechanical-proxy-only: no LLM
// judgement, no boilerplate keyword detection. Computes tiers from live files;
// never consults the stale committed scorecard in docs/audits/content-depth.md.
//
// Data access: enumerates projects/ via filename-only readdirSync (already
// sanctioned by buildCoverageStats), then await-imports each overlay via Bun's
// native ESM. This is a sanctioned read of overlay content (see the boundary
// doc, Audit overlay read [5DR.11]): it imports the typed export value, does
// NOT regex-scrape source text, and writes nothing.
//
// Tier thresholds (from content-depth.md):
//   description: >= 80 words = Full, 40-79 = Partial, < 40 = Thin
//   highlights:  >= 4        = Full,  3    = Partial,  <= 2 = Thin
//   teamNote:    contributionNote present (team projects only)
//   Final tier = WORST axis. Full requires all axes Full.
//
// Write-isolation: writes nothing.
// ---------------------------------------------------------------------------

/** Splits a string on whitespace and counts the non-empty tokens. */
function wordCount(s) {
	return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

const TIER_RANK = { Thin: 0, Partial: 1, Full: 2 };
const RANK_TIER = ['Thin', 'Partial', 'Full'];

/**
 * Dynamically imports every .ts overlay in projectsDir and returns the
 * exported project objects sorted by slug.
 *
 * @returns {Promise<Array<object>>}
 */
async function loadOverlays() {
	const files = readdirSync(projectsDir).filter((f) => f.endsWith('.ts'));
	const overlays = [];
	for (const f of files) {
		const abs = join(projectsDir, f);
		try {
			const mod = await import(pathToFileURL(abs).href);
			const exp = Object.values(mod).find((v) => v && typeof v === 'object' && 'slug' in v);
			if (exp) {
				overlays.push(exp);
			} else {
				overlays.push({ slug: f.slice(0, -3), _loadError: 'no slug export found' });
			}
		} catch (err) {
			overlays.push({ slug: f.slice(0, -3), _loadError: err.message ?? String(err) });
		}
	}
	return overlays.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Scores a single overlay object against the mechanical proxy rubric.
 *
 * @param {object} o  A loaded overlay object (may have `_loadError`).
 * @returns {{ slug: string, tier: string, axes: object, borderline: boolean, metrics: object, loadError?: string }}
 */
function scoreOverlay(o) {
	if (o._loadError) {
		return {
			slug: o.slug,
			tier: 'Thin',
			axes: {},
			borderline: true,
			metrics: {},
			loadError: o._loadError
		};
	}

	const words = wordCount(o.description);
	const hl = Array.isArray(o.highlights) ? o.highlights.length : 0;
	const role = o.contribution?.role;
	const isTeam = role && role !== 'solo';
	const noteText = o.contribution?.contributionNote ?? '';
	const hasNote = noteText.trim().length > 0;

	// Per-axis proxy tiers.
	const descTier = words >= 80 ? 'Full' : words >= 40 ? 'Partial' : 'Thin';
	const hlTier = hl >= 4 ? 'Full' : hl === 3 ? 'Partial' : 'Thin';
	// Team-note axis only constrains team projects; solo projects treat it as Full.
	const noteTier = !isTeam ? 'Full' : hasNote ? 'Full' : 'Thin';

	const axes = { description: descTier, highlights: hlTier, contributionNote: noteTier };

	// Final tier = worst axis (lowest rank). Full requires ALL axes Full.
	const tier = RANK_TIER[Math.min(TIER_RANK[descTier], TIER_RANK[hlTier], TIER_RANK[noteTier])];

	// Borderline flag: any axis near a threshold, or a short team note.
	// Surfaces entries for manual editorial review without automating the verdict.
	const borderline =
		(words >= 35 && words <= 45) ||
		(words >= 75 && words <= 85) ||
		hl === 3 ||
		hl === 4 ||
		(isTeam && hasNote && wordCount(noteText) < 12);

	return {
		slug: o.slug,
		tier,
		axes,
		borderline,
		metrics: { words, highlights: hl, isTeam: !!isTeam, hasNote }
	};
}

/**
 * Emits a plain-ANSI tier report (fallback when gum is unavailable).
 *
 * @param {Array<object>} scored
 * @param {object} palette
 */
function runAuditPlain(scored, palette) {
	const { GREEN, YELLOW, RED, BOLD, DIM, RESET } = palette;
	const tierColour = { Full: GREEN, Partial: YELLOW, Thin: RED };

	const summary = { Full: 0, Partial: 0, Thin: 0 };
	for (const s of scored) summary[s.tier]++;
	const borderlineCount = scored.filter((s) => s.borderline || s.loadError).length;
	const authored = scored.length;

	process.stdout.write(
		`${BOLD}drift audit${RESET} · content-depth proxy\n` +
		`${summary.Thin} Thin · ${summary.Partial} Partial · ${summary.Full} Full · ${authored} authored\n`
	);
	if (borderlineCount > 0) {
		process.stdout.write(`${DIM}${borderlineCount} entr${borderlineCount === 1 ? 'y' : 'ies'} flagged for manual review.${RESET}\n`);
	}
	process.stdout.write('\n');

	for (const tierName of ['Thin', 'Partial', 'Full']) {
		const entries = scored.filter((s) => s.tier === tierName);
		if (entries.length === 0) continue;
		const col = tierColour[tierName];
		process.stdout.write(`${col}${BOLD}${tierName} (${entries.length})${RESET}\n`);
		for (const s of entries) {
			const marker = s.borderline || s.loadError ? ' ⚠' : '';
			if (s.loadError) {
				process.stdout.write(`  ${s.slug}${marker}  ${DIM}load error: ${s.loadError}${RESET}\n`);
				continue;
			}
			const axisDetail = [
				`desc ${s.metrics.words}w (${s.axes.description})`,
				`${s.metrics.highlights} highlight${s.metrics.highlights === 1 ? '' : 's'} (${s.axes.highlights})`,
				s.metrics.isTeam
					? `team note ${s.metrics.hasNote ? 'present' : 'missing'} (${s.axes.contributionNote})`
					: null
			]
				.filter(Boolean)
				.join(' · ');
			process.stdout.write(`  ${BOLD}${s.slug}${RESET}${marker}  ${DIM}${axisDetail}${RESET}\n`);
		}
		process.stdout.write('\n');
	}
}

/**
 * Scores every authored overlay against the content-depth rubric and reports
 * per-entry tiers. Writes nothing.
 *
 * @param {{ palette: object, useGum: boolean, json: boolean }} options
 */
async function runAudit({ palette, useGum, json }) {
	const overlays = await loadOverlays();
	const scored = overlays.map(scoreOverlay);

	const summary = { Full: 0, Partial: 0, Thin: 0 };
	for (const s of scored) summary[s.tier]++;
	const borderlineCount = scored.filter((s) => s.borderline || s.loadError).length;

	// Machine-readable mode: emit structured JSON and return.
	if (json) {
		process.stdout.write(JSON.stringify({ summary, entries: scored }, null, 2) + '\n');
		return;
	}

	// gum markdown rendering path.
	if (useGum && process.stdout.isTTY) {
		const authored = scored.length;
		const borderlineNote =
			borderlineCount > 0
				? `\n_${borderlineCount} entr${borderlineCount === 1 ? 'y' : 'ies'} flagged for manual review (⚠)._`
				: '';

		let md = `# drift audit · content-depth proxy\n\n`;
		md += `${summary.Thin} Thin · ${summary.Partial} Partial · ${summary.Full} Full · ${authored} authored${borderlineNote}\n`;

		for (const tierName of ['Thin', 'Partial', 'Full']) {
			const entries = scored.filter((s) => s.tier === tierName);
			if (entries.length === 0) continue;
			md += `\n## ${tierName} (${entries.length})\n\n`;
			for (const s of entries) {
				const marker = s.borderline || s.loadError ? ' ⚠' : '';
				if (s.loadError) {
					md += `- \`${s.slug}\`${marker} — load error: ${s.loadError}\n`;
					continue;
				}
				const axisDetail = [
					`desc ${s.metrics.words}w (${s.axes.description})`,
					`${s.metrics.highlights} highlight${s.metrics.highlights === 1 ? '' : 's'} (${s.axes.highlights})`,
					s.metrics.isTeam
						? `team note ${s.metrics.hasNote ? 'present' : 'missing'} (${s.axes.contributionNote})`
						: null
				]
					.filter(Boolean)
					.join(' · ');
				md += `- \`${s.slug}\`${marker} — ${axisDetail}\n`;
			}
		}

		const out = spawnSync(
			'gum',
			['format', '--theme', config.theme.markdownTheme],
			{ input: md, encoding: 'utf8' }
		);
		if (out.status === 0 && out.stdout) {
			process.stdout.write('\n' + out.stdout + '\n');
			return;
		}
	}

	// Plain-ANSI fallback.
	runAuditPlain(scored, palette);
}

// ---------------------------------------------------------------------------
// snapshot verb
//
// Shows every current metric for every resolvable project, colourised so
// changed-vs-saved values stand out from unchanged ones.  Unlike `report`,
// which shows only deltas, `snapshot` always renders firstCommit and the
// full metric set. `--full` is accepted for symmetry but is a no-op.
// ---------------------------------------------------------------------------

/**
 * Derives per-project snapshot entries from computeDrift's return value.
 * Pure function — no git work; all data already in `result.fresh`.
 *
 * @param {{ fresh: Record<string, object>, missing: object[] }} result
 * @param {{ sources: Record<string, object> }} manifest
 * @returns {{ projects: Array<{slug, current, saved, driftedFields: Set<string>}>, missing: object[] }}
 */
function computeSnapshot(result, manifest) {
	const projects = [];
	for (const [slug, current] of Object.entries(result.fresh)) {
		const saved = manifest.sources[slug] ?? {};
		const drifted = new Set(diffFingerprint(saved, current).map((d) => d.field));
		projects.push({ slug, current, saved, driftedFields: drifted });
	}
	// Sort alphabetically for stable output
	projects.sort((a, b) => a.slug.localeCompare(b.slug));
	return { projects, missing: result.missing };
}

/**
 * Renders the snapshot as markdown (gum path).
 * Changed fields are highlighted; unchanged fields are shown as regular rows.
 *
 * @param {{ projects: Array, missing: object[] }} snapshot
 * @returns {string}
 */
function renderSnapshotMarkdown(snapshot) {
	const lines = [];
	lines.push(`# Portfolio snapshot`);
	lines.push(
		`_All current metrics for every resolvable project. **Bold** fields have changed since last sync._`
	);
	lines.push('');
	lines.push(
		`${snapshot.projects.length} resolvable · ${snapshot.missing.length} not resolvable on this machine`
	);
	lines.push('');

	for (let i = 0; i < snapshot.projects.length; i++) {
		const { slug, current, driftedFields } = snapshot.projects[i];

		if (i > 0) lines.push('---');
		lines.push('');
		lines.push(`### ${slug}`);
		lines.push('');

		// Identity line: bold any token whose field drifted vs saved.
		const identity = buildIdentityLine(current, {
			marker: (field, v) => (driftedFields.has(field) ? `**${v}**` : v)
		});
		for (const il of identity.split('\n')) lines.push(`_${il}_`);
		lines.push('');

		// Full metric table: every FINGERPRINT_FIELD, including absent ones.
		// Absent or empty-array fields render as `-` so their absence is visible.
		const IDENTITY_FIELDS = new Set([
			'firstCommit',
			'lastCommit',
			'commits',
			'linesOfCode',
			'remote'
		]);
		lines.push(`| field | value |`);
		lines.push(`| --- | --- |`);
		for (const field of FINGERPRINT_FIELDS) {
			// Skip fields already shown in the identity line above
			if (IDENTITY_FIELDS.has(field)) continue;
			const raw = current[field];
			const val =
				raw === undefined || (Array.isArray(raw) && raw.length === 0)
					? '-'
					: Array.isArray(raw)
						? raw.join(', ')
						: String(raw);
			// Bold the field name when it drifted
			const fieldCell = driftedFields.has(field) ? `**${field}**` : field;
			lines.push(`| ${fieldCell} | ${val} |`);
		}
		lines.push('');
	}

	if (snapshot.missing.length > 0) {
		lines.push('---');
		lines.push('');
		lines.push(`## Not resolvable on this machine (${snapshot.missing.length})`);
		lines.push('');
		for (const r of snapshot.missing) {
			lines.push(`- ${r.slug}: ${r.reason}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Plain ANSI fallback for the snapshot.
 * Changed fields are printed in yellow/bold; unchanged in dim.
 *
 * @param {{ projects: Array, missing: object[] }} snapshot
 * @param {object} palette
 */
function runSnapshotPlain(snapshot, palette) {
	const { RESET, BOLD, YELLOW, CYAN, DIM } = palette;

	console.log(
		`\n${BOLD}Portfolio snapshot${RESET} ${DIM}(all current metrics — changed fields highlighted)${RESET}\n`
	);
	console.log(
		`${DIM}${snapshot.projects.length} resolvable · ${snapshot.missing.length} not resolvable on this machine${RESET}\n`
	);

	for (let i = 0; i < snapshot.projects.length; i++) {
		const { slug, current, driftedFields } = snapshot.projects[i];

		if (i > 0) console.log(`${DIM}${'─'.repeat(60)}${RESET}`);
		console.log(`${BOLD}${CYAN}${slug}${RESET}`);

		// Identity line: yellow+bold any token whose field drifted vs saved.
		// After each marker reset, re-open DIM so the rest of the line stays dim.
		const identity = buildIdentityLine(current, {
			marker: (field, v) => (driftedFields.has(field) ? `${YELLOW}${BOLD}${v}${RESET}${DIM}` : v)
		});
		for (const il of identity.split('\n')) {
			console.log(`  ${DIM}${il}${RESET}`);
		}
		console.log('');

		// All FINGERPRINT_FIELDS, including absent ones (skip identity fields).
		// Absent or empty-array fields render as `-` so their absence is visible.
		const IDENTITY_FIELDS = new Set([
			'firstCommit',
			'lastCommit',
			'commits',
			'linesOfCode',
			'remote'
		]);
		for (const field of FINGERPRINT_FIELDS) {
			if (IDENTITY_FIELDS.has(field)) continue;
			const raw = current[field];
			const val =
				raw === undefined || (Array.isArray(raw) && raw.length === 0)
					? '-'
					: Array.isArray(raw)
						? raw.join(', ')
						: String(raw);
			const changed = driftedFields.has(field);
			if (changed) {
				console.log(`  ${YELLOW}${BOLD}${field}${RESET}  ${BOLD}${val}${RESET}`);
			} else {
				console.log(`  ${DIM}${field}  ${val}${RESET}`);
			}
		}
		console.log('');
	}

	if (snapshot.missing.length > 0) {
		console.log(
			`${DIM}${BOLD}Not resolvable on this machine (${snapshot.missing.length}):${RESET}`
		);
		for (const r of snapshot.missing) {
			console.log(`  ${DIM}${r.slug}: ${r.reason}${RESET}`);
		}
		console.log();
	}
}

/**
 * Entry point for the snapshot verb. Mirrors runReport's structure:
 * --json first (machine-readable), then gum markdown, then plain ANSI.
 *
 * @param {{ result: object, manifest: object, palette: object, json: boolean, useGum: boolean }} opts
 */
function runSnapshot({ result, manifest, palette, json, useGum }) {
	const snapshot = computeSnapshot(result, manifest);

	if (json) {
		const payload = snapshot.projects.map(({ slug, current, saved, driftedFields }) => ({
			slug,
			current,
			saved,
			drifted: [...driftedFields]
		}));
		process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
		return;
	}

	if (useGum && process.stdout.isTTY) {
		const md = renderSnapshotMarkdown(snapshot);
		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], { input: md, encoding: 'utf8' });
		if (out.status === 0 && out.stdout) {
			process.stdout.write('\n' + out.stdout + '\n');
			return;
		}
	}

	runSnapshotPlain(snapshot, palette);
}

// Markdown source for gum-formatted help — rendered via `gum format --theme pink`
// when interactive. The plain `banners` object below is the fallback.
// Coverage must stay in parity: any flag or form added here must also appear in
// the plain banners, and vice versa. No em-dashes; use colons or commas.
const helpMarkdown = {
	report: `# drift · portfolio source drift checker

Compare synced fingerprints against current git state and surface new repos.

## Usage

- \`drift [report] [--json] [--full] [--check] [--no-color]\`
- \`drift snapshot [--json] [--no-color]\`
- \`drift sync\`
- \`drift keep <slug> <field>\`
- \`drift keep --all-projects <field>\`
- \`drift keep-all\`
- \`drift hide <slug>\`
- \`drift author <slug>\`
- \`drift pin <slug>\`
- \`drift audit [--json]\`
- \`drift init\`

## Verbs

- \`report\` · compare synced fingerprints to current git state (default); shows only deltas
- \`snapshot\` · show ALL current metrics for every project, colourised changed vs unchanged
- \`sync\` · rewrite sources.json with current fingerprints
- \`keep\` · keep your manual override value, refreshing its synced baseline to dismiss the flag
- \`keep-all\` · refresh every flagged override baseline at once
- \`hide\` · append a slug to excluded.json, removing it from the public site
- \`author\` · scaffold src/lib/data/projects/\<slug\>.ts from a template, then open in \$EDITOR
- \`pin\` · set pin: true in the slug's overlay (creating it if absent) to float it above the hero score
- \`audit\` · score every authored overlay against the content-depth rubric and report per-entry tiers
- \`init\` · scaffold drift.config.ts and sources.local.json for this machine

## Flags

- \`--full\` · field-level diff across ALL resolvable repos, not just HEAD-moved ones; surfaces windowed-metric decay and placeholder dates; with \`--check\`, field drift also fails the gate
- \`--json\` · machine-readable report to stdout (suppresses the human report)
- \`--check\` · exit non-zero when drift, conflicts or new repos are detected
- \`--no-color\` · disable ANSI colour (also honoured via NO_COLOR env var and non-TTY)
- \`-h\`, \`--help\` · show help; combine with a verb for verb-specific help

Run \`drift help <verb>\` for verb-specific help. With no flags in an interactive terminal (and gum installed), drift opens a menu.`,

	sync: `# drift sync · rewrite sources.json with current fingerprints

Backfills every resolvable repo (not only those whose HEAD moved) so new
fields populate across the whole manifest. Writes sources.json only; never
touches overrides.json.

\`--full\` is accepted for symmetry but is a no-op: sync already covers all
resolvable repos regardless of HEAD movement.

In an interactive terminal with gum installed, drift will ask for confirmation
before writing.

## Usage

\`\`\`
drift sync
drift sync --full  # accepted; no-op
\`\`\``,

	keep: `# drift keep · dismiss override-drift flags

Refreshes an override's \`syncedWhenSet\` baseline to the current synced value,
keeping your manual value intact. Writes overrides.json only.

\`--all-projects <field>\` keeps that one named field on every project currently
flagged for it. Distinct from \`keep-all\`, which keeps every flagged field
regardless of name.

## Usage

\`\`\`
drift keep <slug> <field>
drift keep --all-projects <field>
\`\`\`

## Examples

\`\`\`
drift keep lyra-rose commitsMine
drift keep --all-projects commitsMine
\`\`\``,

	'keep-all': `# drift keep-all · dismiss every override-drift flag at once

Refreshes the syncedWhenSet baseline for all currently flagged override fields.
Writes overrides.json only.

Differs from \`drift keep --all-projects <field>\`, which targets a single named
field across projects (rather than every field across all projects).

## Usage

\`\`\`
drift keep-all
\`\`\``,

	hide: `# drift hide · remove a slug from the public site

Appends a slug to \`excluded.json.slugs\`. Hidden slugs are absent from the
projects registry, all filter views, the map, the timeline, the sitemap, and
OG prerender. Writes excluded.json only.

Warns when the slug is not yet in sources.json (exclusion will take effect
once the slug is fingerprinted).

## Usage

\`\`\`
drift hide <slug>
\`\`\`

## Examples

\`\`\`
drift hide mood-time
drift hide some-private-experiment
\`\`\``,

	snapshot: `# drift snapshot · view all current metrics

Shows every metric's current value for every resolvable project, colourised
so changed-vs-saved fields (since the last \`drift sync\`) stand out from
unchanged ones. Unlike \`report\`, which shows only deltas, snapshot always
shows firstCommit, the full commit grid, churn grid, languages, and
dependency fields.

Projects with no local path are listed separately as not resolvable.

\`--full\` is accepted for symmetry but is a no-op: snapshot always covers
all fields regardless. Does not write anything.

## Usage

\`\`\`
drift snapshot [--json] [--no-color]
\`\`\``,

	init: `# drift init · scaffold per-machine config files

Generates two gitignored files that a fresh checkout needs:

- \`drift.config.ts\` — per-machine config (scan root, author pattern, theme colours)
- \`src/lib/data/sources.local.json\` — local absolute paths for each project slug

In an interactive terminal with gum, prompts for each value pre-filled with the
built-in default. In non-interactive mode (piped, CI, no gum), writes the real
built-in defaults silently. Never overwrites an existing file.

Run \`drift init\` once per machine after cloning. Fill in the local paths in
\`sources.local.json\`, then run \`drift\` to see your portfolio state.

## Usage

\`\`\`
drift init
\`\`\``,

	author: `# drift author · scaffold a project overlay

Creates \`src/lib/data/projects/<slug>.ts\` from a full commented template and
opens it in \`\$EDITOR\` (when available and in an interactive terminal). Never
overwrites an existing overlay.

The template includes all editorial fields (name, tagline, blurb, description,
kind, contribution, status, repoUrl, highlights, relationships, tags) with
inline comments explaining the depth rubric and enum options. Delete any field
you do not need; the registry falls back to Drift-derived defaults for fields
left unset.

The \`pin\` field is not included in the scaffold — use \`drift pin <slug>\` to
float a project above the hero score.

## Usage

\`\`\`
drift author <slug>
\`\`\`

## Examples

\`\`\`
drift author my-new-project
drift author schema-forge
\`\`\``,

	pin: `# drift pin · float a project to the top of the hero pool

Sets \`pin: true\` in \`src/lib/data/projects/<slug>.ts\`. If the overlay does
not exist, creates it from the standard template first. Idempotent: no-op
when the overlay already has \`pin: true\`.

A pinned project appears above all score-ranked entries in the home-page hero
pool regardless of its drift metrics. Pin lives only in the authored overlay,
never in any of the four JSON data files.

## Usage

\`\`\`
drift pin <slug>
\`\`\`

## Examples

\`\`\`
drift pin iris
drift pin lyra-rose
\`\`\``,

	audit: `# drift audit · score every authored overlay against the depth rubric

Reads every \`src/lib/data/projects/*.ts\` overlay and computes a mechanical-
proxy tier (Full / Partial / Thin) for each. Tier thresholds from the
content-depth rubric (\`docs/audits/content-depth.md\`):

| Tier    | description | highlights | team contributionNote |
|---------|-------------|------------|-----------------------|
| Full    | ≥ 80 words  | ≥ 4        | present               |
| Partial | 40-79 words | 3          | present (generic ok)  |
| Thin    | < 40 words  | ≤ 2        | missing               |

Final tier is the **worst axis**. Full requires all axes Full. The team-note
axis only applies to lead / collaborator projects; solo projects are never
penalised for the absence of a note.

Entries within ±5 words of a threshold, or with exactly 3 or 4 highlights,
are flagged (⚠) for manual editorial review.

Writes nothing. Recomputes from live files every run.

## Usage

\`\`\`
drift audit
drift audit --json
\`\`\``
};

function printHelp(verb, palette, useGum) {
	// gum markdown rendering — falls back to plain banners on any failure.
	if (useGum && process.stdout.isTTY) {
		const md = helpMarkdown[verb] ?? helpMarkdown.report;
		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], { input: md, encoding: 'utf8' });
		if (out.status === 0 && out.stdout) {
			process.stdout.write('\n' + out.stdout + '\n');
			return;
		}
	}

	// Plain ANSI fallback — byte-identical to pre-gum output (+ Phase B additions).
	const { BOLD, RESET, DIM } = palette;
	const banners = {
		report: `${BOLD}drift${RESET} - portfolio source drift checker

${BOLD}Usage:${RESET}
  drift [report] [--json] [--full] [--check] [--no-color]
  drift snapshot [--json] [--no-color]
  drift sync
  drift keep <slug> <field>
  drift keep --all-projects <field>
  drift keep-all
  drift hide <slug>
  drift author <slug>
  drift pin <slug>
  drift audit [--json]
  drift init

${BOLD}Verbs:${RESET}
  report      Compare synced fingerprints to current git state (default). Shows only deltas.
  snapshot    Show ALL current metrics for every project, colourised changed vs unchanged.
  sync        Rewrite sources.json with current fingerprints.
  keep        Keep your manual override value, refreshing its baseline to dismiss the flag.
  keep-all    Refresh every flagged override baseline at once.
  hide        Append a slug to excluded.json, removing it from the public site.
  author      Scaffold projects/<slug>.ts from a template, then open in $EDITOR.
  pin         Set pin: true in the slug's overlay (creating it if absent).
  audit       Score every authored overlay against the content-depth rubric.
  init        Scaffold drift.config.ts and sources.local.json for this machine.

${BOLD}Flags:${RESET}
  --full        Field-level diff across ALL resolvable repos (surfaces windowed decay
                and placeholder dates). With --check, field drift also fails the gate.
  --json        Machine-readable report to stdout (suppresses the human report).
  --check       Exit non-zero when drift, conflicts or new repos are detected.
  --no-color    Disable ANSI colour (also honoured via NO_COLOR env var and non-TTY).
  -h, --help    Show help. Combine with a verb for verb-specific help.

${DIM}Run \`drift help <verb>\` for verb-specific help. With no flags in an interactive
terminal (and gum installed), drift opens a menu.${RESET}`,

		sync: `${BOLD}drift sync${RESET} - rewrite sources.json with current fingerprints

Backfills every resolvable repo (not only those whose HEAD moved), so new
fields populate across the whole manifest. Writes sources.json only; never
touches overrides.json.

${DIM}--full is accepted for symmetry but is a no-op: sync already covers all
resolvable repos. In an interactive terminal with gum, drift asks for
confirmation before writing.${RESET}

  Usage: drift sync`,

		keep: `${BOLD}drift keep <slug> <field>${RESET} - dismiss one override-drift flag

Keeps your manual override value, refreshing its syncedWhenSet baseline to
the current synced value. Writes overrides.json only.

${DIM}--all-projects <field> keeps that one field on every project currently
flagged for it. Differs from keep-all (which keeps every flagged field).${RESET}

  Usage:   drift keep <slug> <field>
           drift keep --all-projects <field>
  Example: drift keep lyra-rose commitsMine
           drift keep --all-projects commitsMine`,

		'keep-all': `${BOLD}drift keep-all${RESET} - dismiss every override-drift flag at once

Refreshes the baseline for all currently flagged override fields. Writes
overrides.json only.

${DIM}Differs from \`keep --all-projects <field>\`, which targets a single named
field across projects rather than every field.${RESET}

  Usage: drift keep-all`,

		hide: `${BOLD}drift hide <slug>${RESET} - remove a slug from the public site

Appends a slug to excluded.json.slugs. Writes excluded.json only. Rebuild
the site to apply the exclusion.

${DIM}Warns when the slug is not yet in sources.json.${RESET}

  Usage:   drift hide <slug>
  Example: drift hide some-private-experiment`,

		snapshot: `${BOLD}drift snapshot${RESET} - view all current metrics

Shows every metric's current value for every resolvable project, colourised
so changed-vs-saved fields (since the last drift sync) stand out from
unchanged ones. Unlike report, which shows only deltas, snapshot always
shows firstCommit, the full commit and churn grid, languages, and
dependency fields.

${DIM}--full is accepted for symmetry but is a no-op: snapshot always covers
all fields. Does not write anything.${RESET}

  Usage: drift snapshot [--json] [--no-color]`,

		init: `${BOLD}drift init${RESET} - scaffold per-machine config files

Generates two gitignored files that a fresh checkout needs:
  drift.config.ts              per-machine config (scan root, author pattern, theme colours)
  src/lib/data/sources.local.json  local absolute paths for each project slug

In an interactive terminal with gum, prompts for each value pre-filled with the
built-in default. In non-interactive mode, writes built-in defaults silently.
Never overwrites an existing file.

${DIM}Run once per machine after cloning. Fill in sources.local.json paths, then run \`drift\`.${RESET}

  Usage: drift init`,

		author: `${BOLD}drift author <slug>${RESET} - scaffold a project overlay

Creates src/lib/data/projects/<slug>.ts from a full commented template and
opens it in $EDITOR. Never overwrites an existing overlay.

${DIM}The template includes all editorial fields with inline comments explaining
the depth rubric and enum options. Use \`drift audit\` to check tiers.${RESET}

  Usage:   drift author <slug>
  Example: drift author my-new-project`,

		pin: `${BOLD}drift pin <slug>${RESET} - float a project to the top of the hero pool

Sets pin: true in projects/<slug>.ts. Creates the overlay from the standard
template if it does not exist. Idempotent when already pinned.

${DIM}Pin lives only in the authored overlay, never in any JSON data file.
Rebuild the site to apply.${RESET}

  Usage:   drift pin <slug>
  Example: drift pin iris`,

		audit: `${BOLD}drift audit${RESET} - score every authored overlay against the depth rubric

Reads every projects/*.ts overlay and reports a mechanical-proxy tier:
  Full    description >= 80w, >= 4 highlights, team note present
  Partial description 40-79w or 3 highlights (or team note present but generic)
  Thin    description < 40w or <= 2 highlights or team note missing

Final tier is the worst axis. Full requires all axes Full.
Entries near a threshold are flagged for manual review.

${DIM}Writes nothing. Recomputes from live files every run.${RESET}

  Usage: drift audit
         drift audit --json`
	};
	process.stdout.write((banners[verb] ?? banners.report) + '\n');
}

// ---------------------------------------------------------------------------
// Interactive gum menu (bare `drift` in a TTY with gum available).
// Single-shot: choose a verb, run it in-process, done.
// ---------------------------------------------------------------------------

// COUPLING [5DR.3]: resolved — brand colours come from config.theme.
// Configure via drift.config.ts → theme.primary / theme.accent.
const BRAND_PRIMARY = config.theme.primary; // teal: cursor, selection, borders
const BRAND_ACCENT = config.theme.accent; // magenta: item foreground, wordmark text

// ANSI Shadow figlet wordmark for the menu header.
// Generated via `npx figlet-cli -f "ANSI Shadow" DRIFT`; embedded as a
// hardcoded string so the menu works without figlet at runtime.
const DRIFT_WORDMARK = [
	'██████╗ ██████╗ ██╗███████╗████████╗',
	'██╔══██╗██╔══██╗██║██╔════╝╚══██╔══╝',
	'██║  ██║██████╔╝██║█████╗     ██║   ',
	'██║  ██║██╔══██╗██║██╔══╝     ██║   ',
	'██████╔╝██║  ██║██║██║        ██║   ',
	'╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   '
].join('\n');

/**
 * Renders the DRIFT wordmark inside a rounded, teal-bordered panel.
 * Prints directly to stdout via gum style. Call immediately before
 * `gum choose` so the wordmark sits above the interactive list.
 */
function printWordmark() {
	spawnSync(
		'gum',
		[
			'style',
			'--border',
			'rounded',
			'--border-foreground',
			BRAND_PRIMARY,
			'--foreground',
			BRAND_ACCENT,
			'--padding',
			'1 3',
			'--align',
			'center',
			DRIFT_WORDMARK
		],
		{ stdio: ['ignore', 'inherit', 'inherit'] }
	);
}

async function runInteractiveMenu({ manifests, palette, useGum, onProgress, clearProgress }) {
	// Lazy scan helper — runs only when a verb that needs data is selected.
	// Cache is bypassed in the interactive menu — always show live state.
	const scan = async (full) => {
		const r = await computeDrift(manifests, { full, onProgress, useCache: false });
		clearProgress();
		return r;
	};

	// Menu rows: [visible name, description, return value].
	// Descriptions must be colon-free (label-delimiter splits on ':').
	// Values are unchanged from the original menu, so the dispatch switch below
	// needs no edits.
	const menuRows = [
		['Report', 'Show repos whose metrics drifted since last sync', 'report'],
		[
			'Report (full scan)',
			'Per-field drift across every repo, not just moved HEADs',
			'report-full'
		],
		['Snapshot', 'Every current metric value, changed fields highlighted', 'snapshot'],
		['Sync', 'Rewrite sources.json with current git fingerprints', 'sync'],
		['Keep override', 'Keep your pinned value, dismiss one drift flag', 'keep'],
		[
			'Keep field everywhere',
			"Keep one field's value, dismiss its flag on every project",
			'keep-all-projects'
		],
		['Keep all', 'Keep every pinned value, dismiss all drift flags at once', 'keep-all'],
		['Hide', 'Append a slug to excluded.json, removing it from the site', 'hide'],
		['Author', 'Scaffold a project overlay and open it in your editor', 'author'],
		['Pin', 'Float a project to the top of the hero pool', 'pin'],
		['Audit', 'Score every authored overlay against the depth rubric', 'audit'],
		['Help', 'Show the command reference', 'help']
	];

	// Pad names to a fixed width so descriptions align in a second column.
	const nameWidth = Math.max(...menuRows.map(([n]) => n.length));
	const items = menuRows.map(
		([name, desc, value]) => `${name.padEnd(nameWidth + 3)}${desc}:${value}`
	);

	// Wordmark sits above the interactive list. gum choose takes over the TTY
	// immediately after, so the wordmark scrolls into history above the picker.
	printWordmark();

	const choose = spawnSync(
		'gum',
		[
			'choose',
			'--label-delimiter=:',
			'--cursor=> ',
			`--cursor.foreground=${BRAND_PRIMARY}`,
			`--selected.foreground=${BRAND_PRIMARY}`,
			`--item.foreground=${BRAND_ACCENT}`,
			...items
		],
		{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
	);

	if (choose.status !== 0 || !choose.stdout.trim()) return; // Esc or Ctrl-C — no scan

	const verb = choose.stdout.trim();

	switch (verb) {
		case 'help':
			printHelp('report', palette, useGum); // no scan
			break;
		case 'report':
			runReport({
				result: await scan(false),
				manifest: manifests.manifest,
				palette,
				json: false,
				full: false,
				useGum
			});
			break;
		case 'report-full':
			runReport({
				result: await scan(true),
				manifest: manifests.manifest,
				palette,
				json: false,
				full: true,
				useGum
			});
			break;
		case 'snapshot':
			runSnapshot({
				result: await scan(true),
				manifest: manifests.manifest,
				palette,
				json: false,
				useGum
			});
			break;
		case 'sync':
			runUpdate({
				result: await scan(false),
				manifest: manifests.manifest,
				palette,
				useGum,
				args: [],
				dryRun: false
			});
			break;
		case 'keep-all':
			runAccept({
				result: await scan(false),
				args: [],
				acceptAll: true,
				allProjects: false,
				palette
			});
			break;
		case 'keep': {
			const result = await scan(false);
			const { conflicts } = result;
			if (conflicts.length === 0) {
				console.log('No flagged overrides to keep.');
				return;
			}
			// Second picker: choose one conflict to keep.
			// Label is "slug.field" (human-readable); value is "slug field" (space-separated).
			const ovItems = conflicts.map((c) => `${c.slug}.${c.field}:${c.slug} ${c.field}`);
			const pick = spawnSync(
				'gum',
				[
					'choose',
					'--label-delimiter=:',
					'--cursor=> ',
					`--cursor.foreground=${BRAND_PRIMARY}`,
					`--selected.foreground=${BRAND_PRIMARY}`,
					`--item.foreground=${BRAND_ACCENT}`,
					...ovItems
				],
				{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
			);
			if (pick.status !== 0 || !pick.stdout.trim()) return;
			// Slugs are kebab-case, fields are camelCase — neither contains spaces.
			const [slug, field] = pick.stdout.trim().split(' ');
			runAccept({ result, args: [slug, field], acceptAll: false, allProjects: false, palette });
			break;
		}
		case 'keep-all-projects': {
			// Second picker: choose a field name to keep across all projects.
			const result = await scan(false);
			const { conflicts } = result;
			if (conflicts.length === 0) {
				console.log('No flagged overrides to keep.');
				return;
			}
			// Distinct field names across all conflicts.
			const fields = [...new Set(conflicts.map((c) => c.field))].sort();
			const fieldItems = fields.map((f) => `${f}:${f}`);
			const pick = spawnSync(
				'gum',
				[
					'choose',
					'--label-delimiter=:',
					'--header=Keep this field across all projects:',
					'--cursor=> ',
					`--cursor.foreground=${BRAND_PRIMARY}`,
					`--selected.foreground=${BRAND_PRIMARY}`,
					`--item.foreground=${BRAND_ACCENT}`,
					...fieldItems
				],
				{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
			);
			if (pick.status !== 0 || !pick.stdout.trim()) return;
			const chosenField = pick.stdout.trim();
			runAccept({ result, args: [chosenField], acceptAll: false, allProjects: true, palette });
			break;
		}
		case 'hide': {
			// Prompt for a slug to hide — offer the non-excluded manifest keys.
			const { excludedSlugs: currentExcluded } = loadExcluded();
			const manifest = manifests.manifest;
			const candidateSlugs = Object.keys(manifest.sources)
				.filter((s) => !currentExcluded.has(s))
				.sort();

			let chosenSlug;
			if (candidateSlugs.length > 0) {
				const slugItems = candidateSlugs.map((s) => `${s}:${s}`);
				const pick = spawnSync(
					'gum',
					[
						'choose',
						'--label-delimiter=:',
						'--header=Choose a slug to hide:',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						`--item.foreground=${BRAND_ACCENT}`,
						...slugItems
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (pick.status !== 0 || !pick.stdout.trim()) return;
				chosenSlug = pick.stdout.trim();
			} else {
				// Fallback: free-text input when all manifest slugs are already hidden.
				const input = spawnSync('gum', ['input', '--placeholder', 'slug to hide'], {
					stdio: ['inherit', 'pipe', 'inherit'],
					encoding: 'utf8'
				});
				if (input.status !== 0 || !input.stdout.trim()) return;
				chosenSlug = input.stdout.trim();
			}
			runExclude({ args: [chosenSlug], manifest, palette });
			break;
		}
		case 'author': {
			// Prompt for a slug to author — offer manifest keys as candidates.
			const candidateSlugs = Object.keys(manifests.manifest.sources).sort();
			let chosenSlug;
			if (candidateSlugs.length > 0) {
				const slugItems = candidateSlugs.map((s) => `${s}:${s}`);
				const pick = spawnSync(
					'gum',
					[
						'choose',
						'--label-delimiter=:',
						'--header=Choose a slug to author:',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						`--item.foreground=${BRAND_ACCENT}`,
						...slugItems
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (pick.status !== 0 || !pick.stdout.trim()) return;
				chosenSlug = pick.stdout.trim();
			} else {
				const input = spawnSync('gum', ['input', '--placeholder', 'project slug'], {
					stdio: ['inherit', 'pipe', 'inherit'],
					encoding: 'utf8'
				});
				if (input.status !== 0 || !input.stdout.trim()) return;
				chosenSlug = input.stdout.trim();
			}
			runAuthor({ args: [chosenSlug], palette, useGum });
			break;
		}
		case 'pin': {
			// Prompt for a slug to pin — offer manifest keys as candidates.
			const candidateSlugs = Object.keys(manifests.manifest.sources).sort();
			let chosenSlug;
			if (candidateSlugs.length > 0) {
				const slugItems = candidateSlugs.map((s) => `${s}:${s}`);
				const pick = spawnSync(
					'gum',
					[
						'choose',
						'--label-delimiter=:',
						'--header=Choose a slug to pin:',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						`--item.foreground=${BRAND_ACCENT}`,
						...slugItems
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (pick.status !== 0 || !pick.stdout.trim()) return;
				chosenSlug = pick.stdout.trim();
			} else {
				const input = spawnSync('gum', ['input', '--placeholder', 'project slug'], {
					stdio: ['inherit', 'pipe', 'inherit'],
					encoding: 'utf8'
				});
				if (input.status !== 0 || !input.stdout.trim()) return;
				chosenSlug = input.stdout.trim();
			}
			await runPin({ args: [chosenSlug], palette, useGum });
			break;
		}
		case 'audit':
			await runAudit({ palette, useGum, json: false });
			break;
	}
}

// ---------------------------------------------------------------------------
// --check exit gating — see applyCheckExit above.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
	let values, positionals;
	try {
		({ values, positionals } = parseArgs({
			allowPositionals: true, // verb + optional slug + optional field
			options: {
				json: { type: 'boolean', default: false },
				check: { type: 'boolean', default: false },
				full: { type: 'boolean', default: false },
				'all-projects': { type: 'boolean', default: false },
				'dry-run': { type: 'boolean', default: false },
				'no-cache': { type: 'boolean', default: false },
				'no-color': { type: 'boolean', default: false },
				help: { type: 'boolean', short: 'h', default: false }
			}
		}));
	} catch (err) {
		process.stderr.write(`drift: ${err.message}\nRun \`drift --help\` for usage.\n`);
		process.exit(1);
	}

	// Subcommand dispatcher. The first positional is the verb; slug/field follow.
	const KNOWN_VERBS = new Set(['report', 'snapshot', 'sync', 'keep', 'keep-all', 'hide', 'promote', 'author', 'pin', 'audit', 'init', 'help']);
	const verb = KNOWN_VERBS.has(positionals[0]) ? positionals[0] : 'report';
	// args[0] = slug, args[1] = field (for accept). When the verb was explicit,
	// slice it off; when the default 'report' was inferred, positionals are not args.
	const args = KNOWN_VERBS.has(positionals[0]) ? positionals.slice(1) : positionals;

	// gum capability gate: binary present AND interactive TTY AND colour enabled.
	// Computed here (not module-level) so test imports never shell out to `which`.
	const colourOn = colourEnabled(values);
	const palette = makePalette(colourOn);
	const useGum = !!gumPath() && process.stdin.isTTY && process.stdout.isTTY && colourOn;

	if (verb === 'help' || values.help) {
		// `drift help [verb]` and `drift [verb] --help` both work.
		// When `drift help update` is used, the target verb is in args[0].
		const helpTarget = verb === 'help' ? (args[0] ?? 'report') : verb;
		printHelp(helpTarget, palette, useGum);
		return;
	}

	// init / author / pin / audit do not need a manifest or drift scan; run them
	// immediately and return. Must come before loadManifests() so they work on a
	// bare checkout with no sources.json yet.
	if (verb === 'init') {
		runInit({ palette, useGum });
		return;
	}
	if (verb === 'author') {
		runAuthor({ args, palette, useGum });
		return;
	}
	if (verb === 'pin') {
		await runPin({ args, palette, useGum });
		return;
	}
	if (verb === 'audit') {
		await runAudit({ palette, useGum, json: values.json });
		return;
	}

	const manifests = loadManifests();

	// Progress counter on stderr — gated on stderr TTY and not --json so that
	// `drift --json | jq` and `drift | cat` and CI produce zero progress noise.
	const onProgress =
		process.stderr.isTTY && !values.json
			? ({ index, total, slug }) => process.stderr.write(`\r[${index}/${total}] ${slug}`.padEnd(60))
			: null;
	const clearProgress = () => {
		if (onProgress) process.stderr.write('\r' + ' '.repeat(60) + '\r');
	};

	// Bare invocation in an interactive TTY with gum: launch the menu BEFORE any
	// scan. Each menu selection runs only the scan level it needs.
	// "Bare" means: no explicit verb, no positionals, no flags that select a
	// non-default output mode.
	const bare =
		positionals.length === 0 &&
		!values.json &&
		!values.check &&
		!values.full &&
		!values['all-projects'];

	if (bare && useGum) {
		await runInteractiveMenu({ manifests, palette, useGum, onProgress, clearProgress });
		return;
	}

	// hide/promote do not need a drift scan; run them immediately and return.
	if (verb === 'hide') {
		runExclude({ args, manifest: manifests.manifest, palette });
		return;
	}
	if (verb === 'promote') {
		runPromote({ args, palette });
		return;
	}

	// snapshot always needs the full field comparison to compute drift per-project.
	const needsFullScan = values.full || verb === 'snapshot';
	// Cache is bypassed for sync (needs live values) and --full (windowed-metric
	// decay must be visible). --no-cache forces a fresh scan for any verb.
	const useCache = !values['no-cache'] && !needsFullScan && verb !== 'sync';
	const result = await computeDrift(manifests, { full: needsFullScan, onProgress, useCache });
	clearProgress();

	switch (verb) {
		case 'snapshot':
			runSnapshot({
				result,
				manifest: manifests.manifest,
				palette,
				json: values.json,
				useGum
			});
			break;
		case 'sync':
			runUpdate({
				result,
				manifest: manifests.manifest,
				palette,
				useGum,
				args,
				dryRun: values['dry-run']
			});
			break;
		case 'keep':
			runAccept({ result, args, acceptAll: false, allProjects: values['all-projects'], palette });
			break;
		case 'keep-all':
			runAccept({ result, args, acceptAll: true, allProjects: false, palette });
			break;
		case 'report':
		default:
			runReport({
				result,
				manifest: manifests.manifest,
				palette,
				json: values.json,
				full: values.full,
				useGum
			});
			if (values.check) applyCheckExit(result, palette, values.full);
	}
}

// Guard: only auto-run when executed directly, not when imported (e.g. in tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		process.stderr.write(`drift: unexpected error: ${err.message ?? err}\n`);
		process.exit(1);
	});
}
