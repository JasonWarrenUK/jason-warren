#!/usr/bin/env node
const MANIFEST_SCAN_EXCLUSIONS = new Set([
	'.git',
	'node_modules',
	'build',
	'dist',
	'.svelte-kit',
	'.next'
]);

function findManifests(repoPath, fileNames, maxDepth = 3) {
	const matches = [];

	function visit(directory, depth) {
		if (depth > maxDepth) return;

		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!MANIFEST_SCAN_EXCLUSIONS.has(entry.name)) {
					visit(join(directory, entry.name), depth + 1);
				}
				continue;
			}

			if (fileNames.has(entry.name)) matches.push(join(directory, entry.name));
		}
	}

	visit(repoPath, 0);
	return matches.sort();
}

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
import { join, dirname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { cpus } from 'os';
import { parseArgs, promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// COUPLING [5DR.4]: resolved — tag taxonomy relocated to scripts/tag-taxonomy.js.
import {
	EXTENSION_LANGUAGE,
	LANGUAGE_TAGS,
	RUNTIME_TAGS,
	FRAMEWORK_TAGS,
	DATABASE_TAGS
} from './tag-taxonomy.js';
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
	SCHEMA = JSON.parse(readFileSync(new URL('./sources.schema.json', import.meta.url), 'utf8'));
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
const topologyPath = config.paths.topology;
const localPath = config.paths.local;
const overridesPath = config.paths.overrides;
const excludedPath = config.paths.excluded;
const cachePath = config.paths.cache;
const projectsDir = config.paths.projects;
const inProgressPath = config.paths.inProgress;
// tech-relationships.ts has no dedicated config.paths entry — it's a sibling
// of the projects overlay directory, not a per-project file.
const techRelationshipsPath = join(dirname(projectsDir), 'tech-relationships.ts');
const techOverlaysPath = join(dirname(projectsDir), 'tech-overlays.ts');
const themesPath = join(dirname(projectsDir), 'themes.ts');

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

// COUPLING [5DR.21]: non-human commit authors (CI bots, GitHub Actions, AI agents
// committing under their own identity). Excluded from the all-authors commit count
// so co-authorship means a human collaborator: without this, a solo repo where an
// agent authored most commits infers as a team project. Excluded from the
// denominator only — churn and lines-of-code still count every commit, because the
// code is in the tree either way. Configure via drift.config.ts → author.botPattern.
const BOT_PATTERN = config.author.botPattern;

// Ordered list of every field getFingerprint returns. Derived from the engine's
// public output schema (scripts/sources.schema.json) so the schema is the single
// source of truth. Property order in the schema matches the desired field-drift
// display order — see the SyncedSource description comment in the schema.
const FINGERPRINT_FIELDS = Object.keys(SCHEMA.$defs.SyncedSource.properties);

// Array-typed fingerprint fields. Derived from the schema: any SyncedSource
// property whose type is 'array'. Compared by sorted join so element-order
// differences in detection do not produce spurious drift.
const ARRAY_FINGERPRINT_FIELDS = new Set(
	FINGERPRINT_FIELDS.filter((f) => SCHEMA.$defs.SyncedSource.properties[f].type === 'array')
);

// Fields excluded from drift comparison even though they live in the schema
// and persist in sources.json. These are metadata / provenance fields; their
// changes are surfaced via advisory report sections, not as field drift.
// techFirstSeen is an object: the scalar `was !== now` comparison used for
// non-array fields is always true for object identity, which would flag it
// as drifted on every single sync. It is still fully persisted and written —
// only excluded from the drift *report*, same treatment as measuredRef.
const DRIFT_SKIP_FIELDS = new Set(['measuredRef', 'techFirstSeen']);

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
 * Run-level collector for file extensions seen during a scan that have no
 * EXTENSION_LANGUAGE mapping. Previously these vanished with zero trace —
 * detectLanguages silently `continue`d past them. Surfaced by `drift audit`
 * as an "Unmapped extensions" advisory so a real but untagged language (like
 * Ink before this map entry existed) is discoverable instead of invisible.
 *
 * Module-level rather than threaded through the fingerprint: unmapped
 * extensions are a scan-time diagnostic, not a persisted metric, so they
 * must stay out of the schema-validated sources.json shape and the
 * ref+TTL fingerprint cache. Reset at the start of each scan via
 * resetUnmappedExtensions().
 */
let unmappedExtensions = new Map();

function resetUnmappedExtensions() {
	unmappedExtensions = new Map();
}

/**
 * Languages present in the repo, ordered by file count (most prevalent first).
 * Accepts a pre-fetched file listing so the caller can share one git ls-files result
 * between detectLanguages and countLinesOfCode.
 *
 * Extensions with no EXTENSION_LANGUAGE mapping are folded into the module-level
 * unmappedExtensions collector rather than silently dropped.
 *
 * @param {string | null} listing  Result of listFiles(), or null.
 * @param {string} [slug]  Project slug, used to attribute unmapped extensions.
 */
function detectLanguages(listing, slug) {
	if (!listing) return [];
	const counts = new Map();
	for (const file of listing.split('\n')) {
		const dot = file.lastIndexOf('.');
		if (dot < 0) continue;
		const ext = file.slice(dot + 1).toLowerCase();
		const language = EXTENSION_LANGUAGE[ext];
		if (!language) {
			const entry = unmappedExtensions.get(ext) ?? { files: 0, repos: new Set() };
			entry.files += 1;
			if (slug) entry.repos.add(slug);
			unmappedExtensions.set(ext, entry);
			continue;
		}
		counts.set(language, (counts.get(language) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([language]) => language);
}

/**
 * Prints a short advisory listing file extensions seen this scan that have
 * no EXTENSION_LANGUAGE mapping, sorted by file count. Silent when nothing
 * was scanned or every extension seen is already mapped — this is advisory
 * noise, not a report section, so it stays out of --json output.
 *
 * @param {object} palette
 */
function printUnmappedExtensionsAdvisory(palette) {
	if (unmappedExtensions.size === 0) return;
	const { DIM, YELLOW, BOLD, RESET } = palette;
	const rows = [...unmappedExtensions.entries()].sort((a, b) => b[1].files - a[1].files);
	process.stderr.write(
		`${YELLOW}${BOLD}Unmapped extensions${RESET}${DIM} (not in EXTENSION_LANGUAGE — invisible to language detection):${RESET}\n`
	);
	for (const [ext, { files, repos }] of rows) {
		const repoCount = repos.size;
		process.stderr.write(
			`  ${DIM}.${ext}  ${files} file${files === 1 ? '' : 's'}, ${repoCount} repo${repoCount === 1 ? '' : 's'}${RESET}\n`
		);
	}
	process.stderr.write('\n');
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
 * `mine` and `humans` are mutually exclusive: Jason is already a human, so
 * combining them would be a redundant (and more expensive) query.
 *
 * @param {string} repoPath
 * @param {{ mine?: boolean; humans?: boolean; recent?: boolean }} opts
 *   mine   — restrict to Jason's commits via AUTHOR_PATTERN (default: all authors)
 *   humans — exclude non-human authors via BOT_PATTERN (default: all authors)
 *   recent — restrict to the trailing RECENT_WINDOW (default: all of history)
 * @returns {number | null}
 */
async function countCommits(
	repoPath,
	{ mine = false, humans = false, recent = false, ref = 'HEAD' } = {}
) {
	const flags = ['rev-list', '--count'];
	if (recent) flags.push(`--since=${RECENT_WINDOW}`);
	if (mine) {
		flags.push('--extended-regexp', `--author=${AUTHOR_PATTERN}`);
	} else if (humans) {
		// A negative lookahead is the only way to express "author does NOT match"
		// in a single git query: --invert-grep inverts the commit-message grep,
		// not --author. Requires a PCRE-enabled git (--perl-regexp).
		flags.push('--perl-regexp', `--author=^(?!.*(${BOT_PATTERN})).*$`);
	}
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

/**
 * Intra-span activity shape for Jason's commits: how much of his own span he
 * was actually active in, and the longest silence inside it.
 *
 * firstCommit and lastCommit describe only the endpoints of a project's life,
 * so a repo touched once in month 1 and once in month 30 is indistinguishable
 * from one worked continuously for 30 months. Sampling the commit dates makes
 * the gap between those two cases detectable.
 *
 * Author-scoped, matching getFirstCommit: the honest question for a portfolio
 * is whether *Jason* was sustained or bursty here, not whether the repo had a
 * pulse. On a team repo the two diverge sharply — on fac-cra the cohort was
 * active across 30 months while Jason's own work was a 2-month burst.
 *
 * Returns:
 *   activeMonths — distinct YYYY-MM buckets containing at least one commit
 *   spanMonths   — calendar months from first to last commit, inclusive
 *   maxGapDays   — longest run of consecutive days with no commit
 *
 * All three are null when Jason has no commits on the ref, so a team repo he
 * has not touched never reports a fabricated zero.
 *
 * @param {string} repoPath
 * @param {string} ref
 * @returns {Promise<{ activeMonths: number | null; spanMonths: number | null; maxGapDays: number | null }>}
 */
async function sampleActivity(repoPath, ref = 'HEAD') {
	const empty = { activeMonths: null, spanMonths: null, maxGapDays: null };
	const r = await git(
		['log', '--extended-regexp', `--author=${AUTHOR_PATTERN}`, '--format=%cs', ref],
		repoPath
	);
	if (!r.ok || !r.out) return empty;

	const dates = r.out
		.split('\n')
		.map((date) => date.trim())
		.filter(Boolean)
		.sort();
	if (dates.length === 0) return empty;

	const first = Date.parse(dates[0]);
	const last = Date.parse(dates[dates.length - 1]);
	if (Number.isNaN(first) || Number.isNaN(last)) return empty;

	const activeMonths = new Set(dates.map((date) => date.slice(0, 7))).size;

	// Inclusive calendar-month count: a project living entirely inside one month
	// spans 1, not 0, so activeMonths/spanMonths is always a usable ratio.
	const firstDate = new Date(first);
	const lastDate = new Date(last);
	const spanMonths =
		(lastDate.getUTCFullYear() - firstDate.getUTCFullYear()) * 12 +
		(lastDate.getUTCMonth() - firstDate.getUTCMonth()) +
		1;

	let maxGapDays = 0;
	for (let i = 1; i < dates.length; i += 1) {
		const gap = Math.round((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000);
		if (gap > maxGapDays) maxGapDays = gap;
	}

	return { activeMonths, spanMonths, maxGapDays };
}

/**
 * Whether Jason authored the repository's root commit: "I started this" as
 * distinct from "I joined this".
 *
 * Commit share alone cannot tell those apart — a late joiner who out-commits
 * everyone and a founder who handed the project on look identical in the
 * ratio. Role inference (5DR.21) uses this to separate the two.
 *
 * Returns null (not false) when the question is unanswerable — an empty or
 * unreadable repo — so a transient git failure never asserts "did not
 * originate" and mergeFingerprint's null-preservation keeps the saved value.
 *
 * @param {string} repoPath
 * @param {string} ref
 * @returns {Promise<boolean | null>}
 */
async function rootCommitIsMine(repoPath, ref = 'HEAD') {
	const roots = await git(['log', '--max-parents=0', '--format=%H', ref], repoPath);
	if (!roots.ok || !roots.out) return null;
	const mineRoots = await git(
		[
			'log',
			'--max-parents=0',
			'--extended-regexp',
			`--author=${AUTHOR_PATTERN}`,
			'--format=%H',
			ref
		],
		repoPath
	);
	if (!mineRoots.ok) return null;
	return mineRoots.out !== '';
}

/**
 * Number of distinct commit authors on the ref, counted by email.
 *
 * `humans` excludes non-human authors via BOT_PATTERN. The human count is the
 * one role inference wants: a repo with exactly one human author is solo work
 * regardless of how the commit share falls, which is what makes a
 * bot-dominated solo repo (see BOT_PATTERN) legible as solo rather than team.
 *
 * Counts *people*, not addresses. Jason commits under several identities (a
 * personal address, a work address, a GitHub noreply alias) and 17 of the
 * tracked repos contain more than one of them, so a naive email count would
 * report two humans on a repo he wrote alone and defeat the "one human means
 * solo" rule this field exists to support. Every address matching
 * AUTHOR_PATTERN therefore collapses to a single identity. Other authors are
 * still counted per address: over-counting a genuine collaborator who changed
 * email is a far smaller error than mislabelling solo work as a team project.
 *
 * Emails are lowercased before deduplication so the same address committing
 * under differing case counts once. Returns null on git failure.
 *
 * @param {string} repoPath
 * @param {{ humans?: boolean; ref?: string }} opts
 * @returns {Promise<number | null>}
 */
async function countDistinctAuthors(repoPath, { humans = false, ref = 'HEAD' } = {}) {
	const flags = ['log', '--format=%an <%ae>'];
	if (humans) {
		flags.push('--perl-regexp', `--author=^(?!.*(${BOT_PATTERN})).*$`);
	}
	flags.push(ref);
	const r = await git(flags, repoPath);
	if (!r.ok) return null;
	if (!r.out) return 0;

	// Matched against "Name <email>", the same subject git --author matches, so
	// an identity is collapsed on either its name or its address.
	const mine = new RegExp(AUTHOR_PATTERN);
	const identities = new Set();
	for (const line of r.out.split('\n')) {
		const author = line.trim();
		if (!author) continue;
		identities.add(mine.test(author) ? '__me__' : author.toLowerCase());
	}
	return identities.size;
}

/**
 * ISO date of Jason's earliest commit, the project's inception from his side.
 *
 * Author-scoped via AUTHOR_PATTERN, same as every other "mine" metric
 * (countCommits, countChurn). A repo Jason contributed to but did not
 * originate still gets a meaningful "when I joined" date rather than the
 * root commit's date, which may belong to another author entirely.
 *
 * Falls back to the unfiltered root/earliest commit only when Jason has no
 * authored commits on the ref at all (e.g. an empty clone mid-scan), so a
 * project never loses its date entirely.
 */
async function getFirstCommit(repoPath, ref = 'HEAD') {
	const mineRoots = await git(
		[
			'log',
			'--max-parents=0',
			'--extended-regexp',
			`--author=${AUTHOR_PATTERN}`,
			'--format=%cs',
			ref
		],
		repoPath
	);
	if (mineRoots.ok && mineRoots.out) {
		return mineRoots.out.split('\n').sort()[0];
	}
	const mineReversed = await git(
		['log', '--reverse', '--extended-regexp', `--author=${AUTHOR_PATTERN}`, '--format=%cs', ref],
		repoPath
	);
	if (mineReversed.ok && mineReversed.out) {
		return mineReversed.out.split('\n')[0];
	}
	// No Jason-authored commits found — fall back to the repo's own root commit.
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
 * @returns {{ runtime: string[], framework: string[], database: string[], detections: Array<{identity: string, file: string, kind: 'add'|'pickaxe'|'regex', needle?: string}> }}
 */
function detectDependencies(repoPath) {
	const runtime = [];
	const framework = [];
	const database = [];
	// Dating breadcrumbs for dateDetectedTech: one entry per identity actually
	// found above, describing which file and git-history query recovers its
	// real introduction date. Only manifest/lockfile/config-file paths are
	// tracked here — the broader source-grep signals in detectSourceSignals
	// are deliberately excluded (see that function's own comment) and those
	// identities fall back to the repo's firstCommit downstream.
	const detections = [];

	const bunLockPath = ['bun.lock', 'bun.lockb', 'bunfig.toml']
		.map((file) => join(repoPath, file))
		.find((file) => existsSync(file));
	const denoLockPath = ['deno.json', 'deno.lock']
		.map((file) => join(repoPath, file))
		.find((file) => existsSync(file));

	if (bunLockPath) {
		runtime.push('bun');
		detections.push({ identity: 'bun', file: bunLockPath, kind: 'add' });
	} else if (denoLockPath) {
		runtime.push('deno');
		detections.push({ identity: 'deno', file: denoLockPath, kind: 'add' });
	}

	// -----------------------------------------------------------------------
	// package.json: JS/TS ecosystem, including monorepo workspaces
	// -----------------------------------------------------------------------
	const packageManifests = findManifests(repoPath, new Set(['package.json']));
	if (packageManifests.length > 0 && runtime.length === 0) runtime.push('node');

	for (const packagePath of packageManifests) {
		try {
			const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
			const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

			if ('@sveltejs/kit' in allDeps) {
				framework.push('@sveltejs/kit');
				detections.push({
					identity: '@sveltejs/kit',
					file: packagePath,
					kind: 'pickaxe',
					needle: '@sveltejs/kit'
				});
			} else if ('svelte' in allDeps) {
				framework.push('svelte');
				detections.push({
					identity: 'svelte',
					file: packagePath,
					kind: 'pickaxe',
					needle: 'svelte'
				});
			}
			const svelteVersion = allDeps.svelte;
			const svelteMajor =
				typeof svelteVersion === 'string' ? svelteVersion.match(/\d+/)?.[0] : undefined;
			if (svelteMajor !== undefined) {
				framework.push(`svelte-${svelteMajor}`);
				// Regex pickaxe on the version string, not a plain -S on the package
				// name, so a 4→5 migration dates to the migration commit, not the
				// repo's first-ever svelte dependency (which may be an older major).
				// [[:space:]]* not \s*: git's -G uses POSIX ERE by default, which has
				// no \s shorthand (silently matches nothing rather than erroring).
				// The POSIX class also tolerates both prettier-formatted ("key": "value")
				// and compact (no space) JSON, unlike assuming a literal single space.
				detections.push({
					identity: `svelte-${svelteMajor}`,
					file: packagePath,
					kind: 'regex',
					needle: `"svelte":[[:space:]]*"[\\^~]?${svelteMajor}`
				});
			}
			if ('next' in allDeps) {
				framework.push('next');
				detections.push({ identity: 'next', file: packagePath, kind: 'pickaxe', needle: 'next' });
			}
			if ('react' in allDeps) {
				framework.push('react');
				detections.push({ identity: 'react', file: packagePath, kind: 'pickaxe', needle: 'react' });
			}
			if ('vite' in allDeps) {
				framework.push('vite');
				detections.push({ identity: 'vite', file: packagePath, kind: 'pickaxe', needle: 'vite' });
			}
			if ('express' in allDeps) {
				framework.push('express');
				detections.push({
					identity: 'express',
					file: packagePath,
					kind: 'pickaxe',
					needle: 'express'
				});
			}
			// inkjs is the Ink runtime, not a framework — kept separate from the Ink
			// language tag itself (detected via the .ink extension, see EXTENSION_LANGUAGE).
			if ('inkjs' in allDeps) {
				runtime.push('inkjs');
				detections.push({ identity: 'inkjs', file: packagePath, kind: 'pickaxe', needle: 'inkjs' });
			}
			if ('@deno/svelte-adapter' in allDeps && !runtime.includes('deno')) {
				runtime.push('deno');
				detections.push({
					identity: 'deno',
					file: packagePath,
					kind: 'pickaxe',
					needle: '@deno/svelte-adapter'
				});
			}
			if ('@opentui/core' in allDeps) {
				framework.push('@opentui/core');
				detections.push({
					identity: '@opentui/core',
					file: packagePath,
					kind: 'pickaxe',
					needle: '@opentui/core'
				});
			}
			if ('@tauri-apps/api' in allDeps || 'tauri' in allDeps) {
				framework.push('tauri');
				const needle = '@tauri-apps/api' in allDeps ? '@tauri-apps/api' : 'tauri';
				detections.push({ identity: 'tauri', file: packagePath, kind: 'pickaxe', needle });
			}
			// Per-major identity, mirroring the .csproj-driven dotnet-N scheme:
			// each Tailwind major carries its own adoption date, so a mid-project
			// migration shows on the timeline. The versionless identity survives
			// only as a fallback for unparseable ranges; majors without a
			// taxonomy entry drop silently, per the taxonomy's own contract.
			const tailwindVersion = allDeps.tailwindcss ?? allDeps['@tailwindcss/vite'];
			if (typeof tailwindVersion === 'string') {
				const tailwindMajor = tailwindVersion.match(/\d+/)?.[0];
				framework.push(
					tailwindMajor === undefined ? 'tailwindcss' : `tailwindcss-${tailwindMajor}`
				);
				detections.push(
					tailwindMajor === undefined
						? {
								identity: 'tailwindcss',
								file: packagePath,
								kind: 'pickaxe',
								needle: 'tailwindcss'
							}
						: {
								identity: `tailwindcss-${tailwindMajor}`,
								file: packagePath,
								kind: 'regex',
								// [[:space:]]* not \s* — see the svelte needle above.
								needle: `"(tailwindcss|@tailwindcss/vite)":[[:space:]]*"[\\^~]?${tailwindMajor}`
							}
				);
			}

			if ('pg' in allDeps) database.push('pg');
			else if ('postgres' in allDeps) database.push('postgres');
			if ('@supabase/supabase-js' in allDeps) {
				database.push('@supabase/supabase-js', 'supabase-postgres');
			}
			if ('neo4j-driver' in allDeps) database.push('neo4j-driver');
			if ('mongodb' in allDeps) database.push('mongodb');
			if ('rxdb' in allDeps) database.push('rxdb');
			if ('graphql' in allDeps) database.push('graphql');
			if ('@sqlite.org/sqlite-wasm' in allDeps) database.push('@sqlite.org/sqlite-wasm');
		} catch {
			// Ignore malformed package manifests and continue scanning siblings.
		}
	}

	// -----------------------------------------------------------------------
	// Deno import maps and JSONC configuration
	// -----------------------------------------------------------------------
	try {
		const denoConfigPath = ['deno.json', 'deno.jsonc']
			.map((file) => join(repoPath, file))
			.find((file) => existsSync(file));
		if (denoConfigPath) {
			const denoConfig = readFileSync(denoConfigPath, 'utf8');
			if (/@oak\/oak|deno\.land\/x\/oak/i.test(denoConfig)) {
				framework.push('oak');
				detections.push({
					identity: 'oak',
					file: denoConfigPath,
					kind: 'regex',
					needle: '@oak/oak|deno\\.land/x/oak'
				});
			}
			if (/npm:@sveltejs\/kit/i.test(denoConfig)) {
				framework.push('@sveltejs/kit');
				detections.push({
					identity: '@sveltejs/kit',
					file: denoConfigPath,
					kind: 'regex',
					needle: 'npm:@sveltejs/kit'
				});
			}
			const denoSvelte = denoConfig.match(/npm:svelte@(?:\^|~)?(\d+)/i);
			if (denoSvelte) {
				framework.push(`svelte-${denoSvelte[1]}`);
				detections.push({
					identity: `svelte-${denoSvelte[1]}`,
					file: denoConfigPath,
					kind: 'regex',
					needle: `npm:svelte@[\\^~]?${denoSvelte[1]}`
				});
			}
			if (/npm:vite@/i.test(denoConfig)) {
				framework.push('vite');
				detections.push({
					identity: 'vite',
					file: denoConfigPath,
					kind: 'regex',
					needle: 'npm:vite@'
				});
			}
			const denoTailwind = denoConfig.match(
				/npm:(?:@tailwindcss\/vite|tailwindcss)@(?:\^|~)?(\d+)/i
			);
			if (denoTailwind) {
				framework.push(`tailwindcss-${denoTailwind[1]}`);
				detections.push({
					identity: `tailwindcss-${denoTailwind[1]}`,
					file: denoConfigPath,
					kind: 'regex',
					needle: `npm:(@tailwindcss/vite|tailwindcss)@[\\^~]?${denoTailwind[1]}`
				});
			}
			if (/neo4j-driver/i.test(denoConfig)) database.push('neo4j-driver');
			if (/@supabase\/supabase-js/i.test(denoConfig)) {
				database.push('@supabase/supabase-js', 'supabase-postgres');
			}
		}
	} catch {
		// Ignore unreadable Deno configuration.
	}

	// -----------------------------------------------------------------------
	// Go: go.mod
	// -----------------------------------------------------------------------
	try {
		const goModPath = join(repoPath, 'go.mod');
		if (existsSync(goModPath)) {
			if (!runtime.includes('go')) {
				runtime.push('go');
				detections.push({ identity: 'go', file: goModPath, kind: 'add' });
			}
			const goModule = readFileSync(goModPath, 'utf8');
			if (/charm\.land\/bubbletea/i.test(goModule)) {
				framework.push('bubble-tea');
				detections.push({
					identity: 'bubble-tea',
					file: goModPath,
					kind: 'regex',
					needle: 'charm\\.land/bubbletea'
				});
			}
		}
	} catch {
		// Ignore
	}

	// -----------------------------------------------------------------------
	// Python: pyproject.toml or requirements.txt, including nested services
	// -----------------------------------------------------------------------
	try {
		const pythonManifests = findManifests(
			repoPath,
			new Set(['pyproject.toml', 'requirements.txt'])
		);
		if (pythonManifests.length > 0) {
			if (!runtime.includes('python')) {
				runtime.push('python');
				detections.push({ identity: 'python', file: pythonManifests[0], kind: 'add' });
			}
			for (const manifestPath of pythonManifests) {
				const manifestText = readFileSync(manifestPath, 'utf8');
				if (/fastapi/i.test(manifestText)) {
					framework.push('fastapi');
					detections.push({
						identity: 'fastapi',
						file: manifestPath,
						kind: 'regex',
						needle: 'fastapi'
					});
				} else if (/flask/i.test(manifestText)) {
					framework.push('flask');
					detections.push({
						identity: 'flask',
						file: manifestPath,
						kind: 'regex',
						needle: 'flask'
					});
				} else if (/django/i.test(manifestText)) {
					framework.push('django');
					detections.push({
						identity: 'django',
						file: manifestPath,
						kind: 'regex',
						needle: 'django'
					});
				}
				if (/psycopg2|psycopg/i.test(manifestText)) database.push('psycopg');
				if (/sqlalchemy/i.test(manifestText)) database.push('sqlalchemy');
				if (/\bsupabase\b/i.test(manifestText)) {
					database.push('supabase-py', 'supabase-postgres');
				}
			}
		}
	} catch {
		// Ignore
	}

	// -----------------------------------------------------------------------
	// Rust: Cargo.toml
	// -----------------------------------------------------------------------
	try {
		const cargoPath = join(repoPath, 'Cargo.toml');
		if (existsSync(cargoPath)) {
			// Rust projects may also be detected as having Tauri via Cargo.toml
			const cargo = readFileSync(cargoPath, 'utf8');
			if (/tauri/i.test(cargo) && !framework.includes('tauri')) {
				framework.push('tauri');
				detections.push({ identity: 'tauri', file: cargoPath, kind: 'regex', needle: 'tauri' });
			}
		}
	} catch {
		// Ignore
	}

	// -----------------------------------------------------------------------
	// .NET: root project file
	// -----------------------------------------------------------------------
	try {
		const projectFile = readdirSync(repoPath).find((file) => file.endsWith('.csproj'));
		if (projectFile) {
			const projectPath = join(repoPath, projectFile);
			const project = readFileSync(projectPath, 'utf8');
			const target = project.match(/<TargetFramework>net(\d+)(?:\.\d+)?<\/TargetFramework>/i);

			if (target) {
				runtime.push(`dotnet-${target[1]}`);
				detections.push({
					identity: `dotnet-${target[1]}`,
					file: projectPath,
					kind: 'regex',
					needle: `<TargetFramework>net${target[1]}`
				});
			} else {
				runtime.push('dotnet');
				detections.push({ identity: 'dotnet', file: projectPath, kind: 'add' });
			}

			if (/Microsoft\.NET\.Sdk\.Web/i.test(project)) {
				framework.push('aspnet-core');
				detections.push({
					identity: 'aspnet-core',
					file: projectPath,
					kind: 'regex',
					needle: 'Microsoft\\.NET\\.Sdk\\.Web'
				});
			}
			if (/Microsoft\.EntityFrameworkCore/i.test(project)) {
				database.push('entity-framework-core');
			}
			if (/Npgsql/i.test(project)) database.push('npgsql');
		}
	} catch {
		// No readable root .NET project.
	}

	return { runtime, framework, database, detections };
}

/**
 * For each detected tech identity, finds the git date it was actually
 * introduced — as opposed to the repo's own inception date (firstCommit).
 * A tag on a long-lived repo can enter years after the repo started (e.g.
 * migrating to Svelte 5 partway through a project's life); dating every tag
 * to the repo's birth silently back-dates it. This is the fix.
 *
 * Runs one bounded git-history query per detection (typically 3-8 per repo,
 * never all ~15+ taxonomy identities speculatively — only ones the
 * working-tree scan actually found), folded into getFingerprint's existing
 * concurrent-subprocess fan-out via Promise.all.
 *
 * When the same identity is detected via more than one file (a monorepo with
 * several package.json workspaces), the EARLIEST date across all of them
 * wins — the honest "when did I first use X anywhere in this repo" answer,
 * matching the adoption timeline's own earliest-across-projects semantics.
 *
 * A failed or empty query (e.g. `--follow` losing a renamed/relocated file,
 * or a query racing a shallow clone) OMITS that identity from the result
 * entirely, rather than guessing — the caller's downstream read already
 * falls back to firstCommit for any identity absent here.
 *
 * @param {string} repoPath
 * @param {string} ref
 * @param {Array<{identity: string, file: string, kind: 'add'|'pickaxe'|'regex', needle?: string}>} detections
 * @returns {Promise<Record<string, string>>}
 */
async function dateDetectedTech(repoPath, ref, detections) {
	const dated = {};
	if (detections.length === 0) return dated;

	const results = await Promise.all(
		detections.map(async (d) => {
			const relPath = relative(repoPath, d.file);
			let flags;
			if (d.kind === 'add') {
				// --diff-filter=A is correct here: it filters on the FILE's own
				// add/delete/modify status, and this query wants the commit that
				// added the file itself.
				flags = [
					'log',
					'--diff-filter=A',
					'--follow',
					'--format=%cs',
					'--reverse',
					ref,
					'--',
					relPath
				];
			} else if (d.kind === 'pickaxe') {
				// No --diff-filter here: the pickaxe (-S) already finds the commit
				// that changed the STRING's occurrence count in the file, which is
				// exactly "when this dependency entered" regardless of whether the
				// file itself was added or merely modified in that commit. Adding
				// --diff-filter=A would additionally require the FILE to have been
				// added in that same commit, which silently drops every dependency
				// added to an already-existing package.json (i.e. almost always).
				//
				// The needle is quoted as a JSON key literal ("vite" not vite): -S
				// is a plain substring match, so an unquoted bare package name like
				// "vite" or "react" would also match inside an unrelated key that
				// merely contains it as a substring (e.g. "@tailwindcss/vite").
				flags = ['log', `-S"${d.needle}"`, '--format=%cs', '--reverse', ref, '--', relPath];
			} else {
				flags = ['log', `-G${d.needle}`, '--format=%cs', '--reverse', ref, '--', relPath];
			}
			const r = await git(flags, repoPath);
			if (!r.ok || !r.out) return null;
			const date = r.out.split('\n')[0];
			return { identity: d.identity, date };
		})
	);

	for (const result of results) {
		if (!result) continue;
		const existing = dated[result.identity];
		if (existing === undefined || result.date < existing) {
			dated[result.identity] = result.date;
		}
	}

	return dated;
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

async function detectSourceSignals(repoPath, ref, listing) {
	const runtime = [];
	const framework = [];

	if (listing?.split('\n').some((file) => file.endsWith('.svelte.ts'))) {
		framework.push('svelte-5');
	}

	const sourceSearch = await git(
		[
			'grep',
			'-E',
			'Bun\\.|from ["\x27]inkjs["\x27]|from ["\x27]@sveltejs/kit',
			ref,
			'--',
			'*.ts',
			'*.js',
			'*.svelte'
		],
		repoPath
	);
	const source = sourceSearch.ok ? sourceSearch.out : '';

	if (/Bun\./.test(source)) runtime.push('bun');
	// inkjs is the Ink runtime, not a framework — see the matching note in
	// detectDependencies's package.json scan.
	if (/from ["']inkjs["']/.test(source)) runtime.push('inkjs');
	if (/from ["']@sveltejs\/kit/.test(source)) framework.push('@sveltejs/kit');

	return { runtime, framework };
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
 * @param {string} [slug]  Project slug, forwarded to detectLanguages for
 *   attributing unmapped extensions to the repo(s) they were seen in.
 */
async function getFingerprint(repoPath, resolvedRef, slug) {
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
		listing,
		commitsHuman,
		distinctAuthors,
		distinctAuthorsHuman,
		rootCommitMine,
		activity,
		lastCommitMineR
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
		listFiles(repoPath, ref), // ref-aware file listing (git ls-tree)
		// 5DR.21 role signals: a human-only denominator, the author headcount, and
		// whether Jason originated the repo.
		countCommits(repoPath, { humans: true, ref }), // humans only, lifetime
		countDistinctAuthors(repoPath, { ref }), // every author, bots included
		countDistinctAuthors(repoPath, { humans: true, ref }), // human authors only
		rootCommitIsMine(repoPath, ref),
		// 5DR.20 dormancy signal: intra-span activity shape, author-scoped.
		sampleActivity(repoPath, ref),
		// Mine-scoped last commit, so a span can be measured in one consistent
		// scope. firstCommit is already mine-scoped; pairing it with the
		// all-authors lastCommit measured a span that belonged to neither.
		git(
			['log', '-1', '--extended-regexp', `--author=${AUTHOR_PATTERN}`, '--format=%cs', ref],
			repoPath
		)
	]);

	const lastCommit = lcR.ok ? lcR.out : null;
	const remote = normaliseRemote(remoteR.ok ? remoteR.out : null);
	const dependencies = detectDependencies(repoPath);

	// detectLanguages uses the ref-aware listing; countLinesOfCode reads blobs
	// from the ref via git cat-file --batch (no working-tree readFileSync).
	const languages = detectLanguages(listing, slug);
	// Source signals (current-state grep) and per-tech dating (history pickaxe,
	// only for the manifest/lockfile detections above) are independent history
	// walks — run concurrently rather than sequentially.
	const [sourceSignals, techFirstSeen] = await Promise.all([
		detectSourceSignals(repoPath, ref, listing),
		dateDetectedTech(repoPath, ref, dependencies.detections)
	]);
	const runtime = [...new Set([...dependencies.runtime, ...sourceSignals.runtime])];
	const mergedFramework = [...new Set([...dependencies.framework, ...sourceSignals.framework])];
	// A project carrying both a bare identity and its version-derived sibling
	// (bare `svelte` + `svelte-5`, bare `tailwindcss` + `tailwindcss-4` from a
	// hybrid npm/Deno setup) otherwise renders as two adoption-timeline nodes
	// for the same thing. Once any version signal has fired, the bare identity
	// is redundant — drop it.
	const hasVersioned = (base) => mergedFramework.some((f) => f.startsWith(`${base}-`));
	const framework = mergedFramework.filter(
		(f) =>
			!(f === 'svelte' && hasVersioned('svelte')) &&
			!(f === 'tailwindcss' && hasVersioned('tailwindcss'))
	);
	const { database } = dependencies;
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
		// All-authors count with non-human authors removed (5DR.21). The
		// denominator role inference divides by: `commits` counts bot and agent
		// commits as co-authorship, which reads solo work as a team project.
		...(commitsHuman !== null && { commitsHuman }),
		// Author headcount (5DR.21). distinctAuthorsHuman === 1 proves solo work
		// outright, whatever the commit share says.
		...(distinctAuthors !== null && { distinctAuthors }),
		...(distinctAuthorsHuman !== null && { distinctAuthorsHuman }),
		// Whether Jason authored the root commit (5DR.21): originated vs joined.
		// Null-guarded rather than passed through: these fields are new, so on a
		// repo where the probe fails there is no saved value for
		// mergeFingerprint's null-preservation to fall back to, and a written
		// null fails schema validation (fail-closed, blocking the whole sync).
		// Omitting the key instead leaves the field simply absent, which the
		// schema permits and the consumers already treat as "unknown".
		...(rootCommitMine !== null && { rootCommitMine }),
		lastCommit,
		// Jason's most recent commit. Pairs with firstCommit (also mine-scoped)
		// for a single-scope span; `lastCommit` stays all-authors so the report
		// can still show when the repo itself last moved.
		...(lastCommitMineR.ok && lastCommitMineR.out && { lastCommitMine: lastCommitMineR.out }),
		firstCommit,
		// Intra-span activity shape (5DR.20), author-scoped like firstCommit.
		// Guarded together: they are one measurement, so a repo Jason has never
		// committed to reports no activity shape at all rather than a
		// fabricated zero.
		...(activity.activeMonths !== null && {
			activeMonths: activity.activeMonths,
			spanMonths: activity.spanMonths,
			maxGapDays: activity.maxGapDays
		}),
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
		...(database.length > 0 && { database }),
		// Per-tech introduction dates (see dateDetectedTech). Guarded the same
		// way as the arrays above: an empty result never clobbers a good saved
		// value on a partial/failed history walk.
		...(Object.keys(techFirstSeen).length > 0 && { techFirstSeen })
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

/**
 * Pure preview of the sync field-merge. Mirrors the real write loop exactly so
 * the dry-run preview and the actual write cannot produce different results.
 *
 * Unlike diffFingerprint (which skips DRIFT_SKIP_FIELDS and only shows
 * differing fields for the *report* view), mergeFingerprint iterates every
 * key of `current` — the same set the write loop touches — so measuredRef
 * and other metadata fields are included when they change.
 *
 * @param {Record<string, unknown>} saved   stored fingerprint (may be {})
 * @param {Record<string, unknown>} current live fingerprint from getFingerprint
 * @returns {{
 *   merged: Record<string, unknown>,
 *   changedFields: {field: string, was: unknown, now: unknown}[],
 *   preservedFields: string[]
 * }}
 */
function mergeFingerprint(saved, current) {
	const merged = { ...saved };
	const preservedFields = [];

	for (const [field, value] of Object.entries(current)) {
		if (value === null && saved[field] != null) {
			// Null-preservation: keep the previously good value rather than
			// clobbering it with a null from a transient git failure.
			preservedFields.push(field);
		} else {
			merged[field] = value;
		}
	}

	// Compute which fields actually changed after applying null-preservation,
	// using the same array-aware equality as diffFingerprint.
	const changedFields = [];
	for (const field of Object.keys(current)) {
		const was = saved[field];
		const now = merged[field];
		if (ARRAY_FINGERPRINT_FIELDS.has(field)) {
			const sortFn = field === 'languages' ? (a) => a : (a) => [...a].sort();
			const a = Array.isArray(was) ? sortFn(was).join(',') : '';
			const b = Array.isArray(now) ? sortFn(now).join(',') : '';
			if (a !== b) changedFields.push({ field, was: was ?? null, now: now ?? null });
		} else {
			if (was !== now) changedFields.push({ field, was: was ?? null, now: now ?? null });
		}
	}

	return { merged, changedFields, preservedFields };
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
			'No sources.local.json found. Run `bun run drift init` to scaffold it (or copy src/lib/data/sources.local.json.example), then fill in paths for this machine.\n'
		);
	}

	let sourceTopology = {};
	if (existsSync(topologyPath)) {
		try {
			sourceTopology = JSON.parse(readFileSync(topologyPath, 'utf8')).projects ?? {};
		} catch {
			process.stderr.write(`Cannot parse ${topologyPath}: continuing without source topology\n`);
		}
	}
	warnOnSharedCompanions(sourceTopology);

	// Load per-machine HEAD-SHA cache (best-effort: missing/unreadable is silent).
	const cache = loadCache();

	return { manifest, overrideEntries, localPaths, sourceTopology, cache, inProgress };
}

/**
 * Warn (do not fail) when two different projects' topology entries claim the
 * same companion source ID: the second project's cache would be silently
 * invalidated by commits belonging to the first.
 */
function warnOnSharedCompanions(sourceTopology) {
	const claimedBy = new Map();
	for (const [slug, topology] of Object.entries(sourceTopology)) {
		for (const companionId of topology.companions ?? []) {
			const owner = claimedBy.get(companionId);
			if (owner && owner !== slug) {
				process.stderr.write(
					`Warning: companion source "${companionId}" is claimed by both "${owner}" and "${slug}" in source-topology.json\n`
				);
			} else {
				claimedBy.set(companionId, slug);
			}
		}
	}
}

/** Resolve a portfolio slug to its primary and ordered companion source paths. */
function resolveProjectSources(slug, sourceTopology, localPaths) {
	const topology = sourceTopology[slug] ?? { primary: slug, companions: [] };
	const companions = topology.companions.filter((sourceId) => sourceId !== topology.primary);
	const sourceIds = [topology.primary, ...companions];
	const missing = sourceIds.filter((sourceId) => !localPaths[sourceId]);

	if (missing.length > 0) {
		return { missing, primary: null, companions: [] };
	}

	return {
		missing: [],
		primary: { sourceId: topology.primary, path: localPaths[topology.primary] },
		companions: companions.map((sourceId) => ({
			sourceId,
			path: localPaths[sourceId]
		}))
	};
}

function orderedUnion(...values) {
	return [...new Set(values.flatMap((value) => value ?? []))];
}

/** Merge repository-derived stack metadata while retaining primary metrics. */
function mergeCompanionFingerprints(primary, companions) {
	const companionRemotes = companions
		.map((fingerprint) => fingerprint.remote)
		.filter((remote) => remote != null);
	const languages = orderedUnion(primary.languages, ...companions.map((item) => item.languages));
	const runtime = orderedUnion(primary.runtime, ...companions.map((item) => item.runtime));
	const framework = orderedUnion(primary.framework, ...companions.map((item) => item.framework));
	const database = orderedUnion(primary.database, ...companions.map((item) => item.database));

	return {
		...primary,
		...(companionRemotes.length > 0 && { companionRemotes }),
		...(languages.length > 0 && { languages }),
		...(runtime.length > 0 && { runtime }),
		...(framework.length > 0 && { framework }),
		...(database.length > 0 && { database })
	};
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
	{ manifest, overrideEntries, localPaths, sourceTopology = {}, cache, inProgress = {} },
	{ full = false, onProgress = null, useCache = false } = {}
) {
	// Start each scan with a clean unmapped-extensions slate. Cached repos never
	// call detectLanguages this run, so their prior-run extensions are correctly
	// absent — the advisory reflects only what was actually scanned just now.
	resetUnmappedExtensions();

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

			const projectSources = resolveProjectSources(slug, sourceTopology, localPaths);
			if (projectSources.missing.length > 0) {
				results[i] = {
					slug,
					missing: {
						slug,
						reason: `no local path for source ID(s): ${projectSources.missing.join(', ')}`
					}
				};
				completed++;
				onProgress?.({ index: completed, total, slug });
				continue;
			}

			const sourceEntries = [projectSources.primary, ...projectSources.companions];
			const resolvedSources = await Promise.all(
				sourceEntries.map(async (source) => ({
					...source,
					resolvedRef: await defaultBranch(source.path)
				}))
			);
			const liveHeadResults = await Promise.all(
				resolvedSources.map((source) =>
					git(['rev-parse', '--short', source.resolvedRef.ref], source.path)
				)
			);
			const unresolvedIndex = liveHeadResults.findIndex((result) => !result.ok || !result.out);
			if (unresolvedIndex !== -1) {
				const unresolved = resolvedSources[unresolvedIndex];
				results[i] = {
					slug,
					missing: {
						slug,
						reason: `path not found or not a git repo: ${unresolved.path}`
					}
				};
				completed++;
				onProgress?.({ index: completed, total, slug });
				continue;
			}
			const liveHeads = liveHeadResults.map((result) => result.out);
			const repoPath = projectSources.primary.path;
			const fellBack = resolvedSources[0].resolvedRef.fellBack;

			// Ref+TTL cache check: skip full fingerprint when the measured ref's
			// tip SHA is unchanged and the cached entry is fresh enough.
			// Never cache null results.
			let current = null;
			let servedFromCache = false;
			if (useCache) {
				const entry = updatedCache[slug];
				if (entry && entry.fingerprint) {
					const cachedHeads = entry.heads ?? (entry.head ? [entry.head] : []);
					if (
						cachedHeads.length === liveHeads.length &&
						cachedHeads.every((head, index) => head === liveHeads[index])
					) {
						const age = nowMs - Date.parse(entry.syncedAt);
						if (age < CACHE_TTL_MS) {
							current = entry.fingerprint;
							servedFromCache = true;
						}
					}
				}
			}

			if (!current) {
				const fingerprints = await Promise.all(
					resolvedSources.map((source) => getFingerprint(source.path, source.resolvedRef, slug))
				);
				if (fingerprints.every((fingerprint) => fingerprint !== null)) {
					const [primaryFingerprint, ...companionFingerprints] = fingerprints;
					current = mergeCompanionFingerprints(primaryFingerprint, companionFingerprints);
				}
				// Update cache for next run — only for valid fingerprints.
				if (current) {
					updatedCache[slug] = { heads: liveHeads, fingerprint: current, syncedAt: nowISO };
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
function renderCardMarkdown({ slug, current, fields, firstCard = false, preservedFields = [] }) {
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

	if (preservedFields.length > 0) {
		lines.push(`_preserved (git returned no value): ${preservedFields.join(', ')}_`);
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
function renderCardPlain({
	slug,
	current,
	fields,
	firstCard = false,
	palette,
	preservedFields = []
}) {
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

	if (preservedFields.length > 0) {
		console.log(
			`  ${YELLOW}preserved (git returned no value): ${preservedFields.join(', ')}${RESET}`
		);
	}

	console.log('');
}

/**
 * Renders one dry-run preview card. Uses the gum markdown path when available
 * (mirroring the report path), falling back to renderCardPlain.
 */
function renderDryRunCard({ slug, current, fields, preservedFields, firstCard, palette, useGum }) {
	if (useGum && process.stdout.isTTY) {
		const md = renderCardMarkdown({ slug, current, fields, preservedFields, firstCard }).join('\n');
		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], {
			input: md,
			encoding: 'utf8'
		});
		if (out.status === 0 && out.stdout) {
			process.stdout.write(out.stdout + '\n');
			return;
		}
	}
	renderCardPlain({ slug, current, fields, preservedFields, firstCard, palette });
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
		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], {
			input: md,
			encoding: 'utf8'
		});
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
	const { fresh, missing } = result;
	const { GREEN, YELLOW, RED, RESET, DIM } = palette;

	// Per-repo scoping: if slug args were provided, restrict to those slugs only.
	// Unknown slugs get a soft warning (not an abort) so a typo doesn't block a batch.
	let scopedFresh = fresh;
	const isScoped = args.length > 0;
	if (isScoped) {
		for (const slug of args) {
			if (!fresh[slug]) {
				const missingEntry = missing.find((entry) => entry.slug === slug);
				const reason = missingEntry ? `: ${missingEntry.reason}` : '';
				process.stdout.write(
					`${YELLOW}Warning: '${slug}' is not resolvable on this machine — skipped${reason}.${RESET}\n`
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

	if (Object.keys(fresh).length === 0) return;

	// Dry-run: show a faithful field-level preview for each scoped repo using the
	// same merge logic as the real write, then return without writing.
	if (dryRun) {
		const slugs = Object.keys(scopedFresh);
		console.log(
			`${DIM}Dry run — showing what ${slugs.length} repo${slugs.length === 1 ? '' : 's'} would change. Nothing will be written.${RESET}\n`
		);
		let firstCard = true;
		for (const [slug, current] of Object.entries(scopedFresh)) {
			const saved = manifest.sources[slug] ?? {};
			const { changedFields, preservedFields } = mergeFingerprint(saved, current);
			renderDryRunCard({
				slug,
				current,
				fields: changedFields,
				preservedFields,
				firstCard,
				palette,
				useGum
			});
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
	// mergeFingerprint applies the same null-preservation logic as before: a transient
	// git failure returning null cannot clobber previously-good data.
	console.log('Updating sources.json with current fingerprints...');
	for (const [slug, current] of Object.entries(scopedFresh)) {
		const saved = manifest.sources[slug] ?? {};
		const { merged, preservedFields } = mergeFingerprint(saved, current);
		manifest.sources[slug] = merged;
		if (preservedFields.length > 0) {
			console.log(
				`${YELLOW}${slug}: preserved ${preservedFields.join(', ')} from saved entry (git returned no value)${RESET}`
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
		['input', `--prompt=${prompt}: `, `--prompt.foreground=${BRAND_PRIMARY}`, `--value=${def}`],
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
	// Manual tab fix-up aligns the multi-line JSON array under the `excludedRepoNames:` key.
	// The indentation is cosmetic: `prettier --write` (called in runInit) is the authoritative
	// formatter. A prettier failure degrades to valid-but-ugly TS, not broken output.
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
		process.stdout.write(
			`${DIM}Press Enter to accept the default for each prompt. Ctrl-C to cancel a prompt and keep its default.${RESET}\n\n`
		);

		scanRoot = gumInput('Scan root (directory to scan for repos)', defScanRoot);
		scanDepth =
			parseInt(gumInput('Scan depth (max directory depth)', String(defScanDepth)), 10) ||
			defScanDepth;
		authorPattern = gumInput(
			'Author pattern (git --author alternation, pipe-separated)',
			defAuthorPattern
		);
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
			_note:
				'Per-machine local paths for each source repo. Gitignored. Run `drift sync` after filling in paths.',
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

	// Stage fields (track, released, retired) and contribution are authored ONLY
	// where they DISAGREE with what the manifest infers. A value restating the
	// inference pins no judgement, and it silently upgrades a heuristic guess
	// into a confident claim: trackAuthored drives the dotted-provisional
	// convention, so authoring a matching track retires that signal for the
	// project. Two tests in data.test.ts fail on a redundant track or a bare
	// role. Add them deliberately, not by default.
	//
	//   track: 'product' | 'exploration'
	//   released: true    the work reached someone else (authored only)
	//   retired: true     present it as ended (presentation only)
	//   contribution: { role: 'lead', collaboration: { team: '...' },
	//                   contributionNote: '...' }  a note reaches Full tier

	liveUrl: '',

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
// Scalar string fields drift author can set without an editor. pin/hide are
// deliberately absent (drift flag owns them); arrays and objects need
// $EDITOR, relate or tag.
// `status` is deliberately absent: the single-axis ProjectStatus field
// ('live' | 'wip' | 'finished' | 'prototype' | 'archived' | 'uncategorised')
// was decomposed into track × progress plus released/retired/deployed, and
// dropped from AuthoredProject. Offering it here wrote a key the type layer
// rejects, so a scaffolded overlay failed `bun run check` on creation.
const AUTHOR_EDITABLE_FIELDS = ['name', 'tagline', 'blurb', 'description', 'kind', 'liveUrl'];
const AUTHOR_FIELD_ENUMS = {
	kind: ['app', 'game', 'website', 'toy', 'library', 'tool', 'tui', 'repo']
};

async function runAuthor({ args, palette }) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;
	const slug = args[0]?.trim();
	const field = args[1]?.trim();
	// Everything after the field is the value — quoting multi-word prose is
	// natural, but an unquoted trailing sentence also works.
	const inlineValue = args.length > 2 ? args.slice(2).join(' ') : undefined;

	if (!slug) {
		process.stderr.write(`${RED}Usage: drift author <slug> [<field> [<value>]]${RESET}\n`);
		process.exit(1);
	}

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
		process.stderr.write(
			`${RED}Error: invalid slug '${slug}'. Use lowercase kebab-case (e.g. my-project).${RESET}\n`
		);
		process.exit(1);
	}

	if (field !== undefined) {
		if (field === 'pin' || field === 'hide') {
			process.stderr.write(
				`${RED}Error: '${field}' is a curation flag — use: drift flag ${slug} --${field}${RESET}\n`
			);
			process.exit(1);
		}
		if (!AUTHOR_EDITABLE_FIELDS.includes(field)) {
			process.stderr.write(
				`${RED}Error: unknown or non-scalar field '${field}'. Editable fields: ${AUTHOR_EDITABLE_FIELDS.join(', ')}.\n` +
					`Arrays and objects want $EDITOR (drift author ${slug}), relate, or tag.${RESET}\n`
			);
			process.exit(1);
		}

		let value = inlineValue;
		if (value === undefined) {
			// No inline value: prompt interactively when we can, error when we
			// cannot (CI, pipes).
			if (process.stdin.isTTY && gumPath()) {
				const prompt = spawnSync('gum', ['input', '--placeholder', `${field} value`], {
					stdio: ['inherit', 'pipe', 'inherit'],
					encoding: 'utf8'
				});
				if (prompt.status !== 0) return;
				value = prompt.stdout.trim();
			} else {
				process.stderr.write(
					`${RED}Error: no value given for '${field}' and no interactive TTY to prompt in.${RESET}\n`
				);
				process.exit(1);
			}
		}

		const allowed = AUTHOR_FIELD_ENUMS[field];
		if (allowed && !allowed.includes(value)) {
			process.stderr.write(
				`${RED}Error: invalid ${field} '${value}'. Use one of: ${allowed.join(', ')}.${RESET}\n`
			);
			process.exit(1);
		}

		const { ts, path, text, sf, objLit } = await loadOverlayForEdit(slug, palette);
		const { text: splicedText, changed } = spliceObjectProperty(
			text,
			sf,
			ts,
			objLit,
			field,
			JSON.stringify(value)
		);
		if (!changed) {
			process.stdout.write(
				`${YELLOW}'${slug}' ${field} already holds that value — nothing to do.${RESET}\n`
			);
			return;
		}
		writeFileSync(path, splicedText, 'utf8');
		spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });
		process.stdout.write(
			`${GREEN}${BOLD}Set:${RESET} ${field} on '${slug}'.\n${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
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
// flag verb (5DR.17)
//
// Shared engine: setOverlayFlag(slug, flagName, palette)
// Sets <flagName>: true in the slug's .ts overlay, creating it from the
// template if absent. Uses the TypeScript compiler API for a targeted
// text-splice so no existing field or comment is disturbed. Overlay flags
// live only in overlays — never in any of the four JSON data files.
//
// Supported flagName values:
//   'pin'  — float the project to the top of the home-page hero pool
//   'hide' — exclude the project from the hero pool entirely
//
// Write-isolation: writes ONLY projects/<slug>.ts.
//
// runFlag is the thin verb entry point. It validates the slug and the
// --pin / --hide option, then delegates to setOverlayFlag.
// ---------------------------------------------------------------------------

/**
 * Sets <flagName>: true in the slug's .ts overlay. Creates the overlay from
 * the template first when absent. Idempotent: no-op when already set.
 * Writes ONLY projects/<slug>.ts (write-isolation contract).
 *
 * @param {string} slug
 * @param {'pin' | 'hide'} flagName
 * @param {object} palette
 */
async function setOverlayFlag(slug, flagName, palette) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;

	const { path, created } = createOverlayIfAbsent(slug);
	const relPath = path.replace(config.repoRoot + '/', '');

	if (created) {
		process.stdout.write(`${GREEN}${BOLD}created${RESET} ${relPath}\n`);
	}

	// Lazy-import the TypeScript compiler API. This avoids loading it on every
	// verb invocation; only the flag verb (pin and hide) pays the cost.
	const ts = (await import('typescript')).default;

	const text = readFileSync(path, 'utf8');
	const sf = ts.createSourceFile(
		path,
		text,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
		ts.ScriptKind.TS
	);

	// Every well-formed overlay has exactly one exported object literal.
	const objLit = findExportedLiteral(ts, sf, ts.isObjectLiteralExpression);
	if (!objLit) {
		process.stderr.write(
			`${RED}Error: could not locate the exported object literal in ${relPath}.\n` +
				`Expected one named export with an object literal initializer.${RESET}\n`
		);
		process.exit(1);
	}

	const alreadyMsg =
		flagName === 'pin'
			? `${YELLOW}'${slug}' is already pinned — nothing to do.${RESET}\n`
			: `${YELLOW}'${slug}' is already hidden — nothing to do.${RESET}\n`;

	const successMsg =
		flagName === 'pin'
			? `${GREEN}${BOLD}Pinned:${RESET} '${slug}' now floats to the top of the hero pool.\n` +
				`${DIM}Rebuild the site to apply.${RESET}\n`
			: `${GREEN}${BOLD}Hidden:${RESET} '${slug}' is now excluded from the hero pool.\n` +
				`${DIM}Rebuild the site to apply.${RESET}\n`;

	const { text: splicedText, changed } = spliceObjectProperty(
		text,
		sf,
		ts,
		objLit,
		flagName,
		'true'
	);
	if (!changed) {
		// Already set — idempotent no-op.
		process.stdout.write(alreadyMsg);
		return;
	}

	writeFileSync(path, splicedText, 'utf8');
	spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });

	process.stdout.write(successMsg);
}

/**
 * Validates the slug and the --pin / --hide option, then delegates to
 * setOverlayFlag. Requires exactly one of --pin or --hide.
 *
 * @param {{ args: string[], values: object, palette: object }} options
 */
async function runFlag({ args, values, palette }) {
	const { RED, RESET } = palette;
	const slug = args[0]?.trim();

	if (!slug) {
		process.stderr.write(`${RED}Usage: drift flag <slug> --pin | --hide${RESET}\n`);
		process.exit(1);
	}

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
		process.stderr.write(
			`${RED}Error: invalid slug '${slug}'. Use lowercase kebab-case (e.g. my-project).${RESET}\n`
		);
		process.exit(1);
	}

	if (values.pin && values.hide) {
		process.stderr.write(
			`${RED}Error: --pin and --hide are mutually exclusive. Specify one.${RESET}\n`
		);
		process.exit(1);
	}

	if (!values.pin && !values.hide) {
		process.stderr.write(`${RED}Usage: drift flag <slug> --pin | --hide${RESET}\n`);
		process.exit(1);
	}

	await setOverlayFlag(slug, values.hide ? 'hide' : 'pin', palette);
}

// ---------------------------------------------------------------------------
// relate verb (5DR.18)
//
// Authors a relationship edge by splicing into a .ts file, the same technique
// as setOverlayFlag: locate the exported literal via the TypeScript compiler
// API, then a targeted text-splice so no existing field/comment is disturbed.
//
// Two modes:
//   drift relate project <source-slug> <kind> <target-slug> [--note "..."]
//     Appends a ProjectRelationship to `relationships: [...]` on the exported
//     AuthoredProject object literal in projects/<source-slug>.ts. Creates
//     the overlay first if it does not exist yet.
//   drift relate tech <source-label> <kind> <target-label> [--note "..."]
//     Appends a TechRelationship to the exported array literal in
//     tech-relationships.ts.
//
// Idempotent: re-relating an identical edge is a no-op. Validation is
// structural only (kind union, non-self-edge, slug shape) — target existence
// and tag-label correctness are left to data.test.ts / tech-relationships.test.ts,
// which already gate on real slugs/labels; duplicating that here would couple
// the CLI to the registry it is meant to stay lightweight against.
//
// Write-isolation: writes exactly one of projects/<slug>.ts or
// tech-relationships.ts per invocation — never both, never any JSON file.
// ---------------------------------------------------------------------------

const PROJECT_RELATIONSHIP_KINDS = new Set(['extracted-from', 'powers', 'related']);
const TECH_RELATIONSHIP_KINDS = new Set(['leads-to', 'replaced-by']);

/**
 * Validates a project slug's shape: lowercase kebab-case, matching the exact
 * regex runRelate enforces before dispatching to relateProject
 * (`/^[a-z0-9]+(-[a-z0-9]+)*$/`). Kept as a standalone pure function — not a
 * closure over any TUI state — so the TUI's "create a new project" wizard
 * step and the CLI's own validation can never quietly drift apart, and so
 * it's directly unit-testable without spawning gum.
 *
 * @param {string} value
 * @returns {string | null} an error message, or null when the value is valid.
 */
function validateProjectSlug(value) {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) {
		return 'Slugs must be lowercase kebab-case (e.g. my-project).';
	}
	return null;
}

/**
 * Splices a new element into an array literal, either after its opening
 * bracket (empty array) or after its last element (populated array — the
 * last element's getEnd() excludes any trailing comma, so exactly one comma
 * is introduced). Prettier reflows whitespace afterward.
 *
 * @param {string} text  Full source text.
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ArrayLiteralExpression} arrayLit
 * @param {string} elementSrc  Source text of the element to insert, e.g. "{ kind: 'powers', target: 'nib' }".
 * @returns {string} the spliced text
 */
function spliceElementIntoArray(text, sf, arrayLit, elementSrc) {
	if (arrayLit.elements.length === 0) {
		const insertPos = arrayLit.getStart(sf) + 1; // position just past '['
		return text.slice(0, insertPos) + `\n\t${elementSrc},\n` + text.slice(insertPos);
	}
	const lastElement = arrayLit.elements[arrayLit.elements.length - 1];
	const insertPos = lastElement.getEnd();
	return text.slice(0, insertPos) + `,\n\t${elementSrc}` + text.slice(insertPos);
}

/**
 * Builds the source text for a flat object literal. Only defined fields are
 * included. Each value goes through JSON.stringify for safe quoting (notes
 * may contain apostrophes; arrays render as string-literal lists) — prettier
 * normalises quote style afterward. Named for its first caller; also builds
 * tech-overlay records and theme elements.
 *
 * @param {Record<string, string | string[] | undefined>} fields
 * @returns {string}
 */
function buildRelationshipLiteral(fields) {
	const parts = Object.entries(fields)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
	return `{ ${parts.join(', ')} }`;
}

/**
 * Removes the element at `idx` from an array literal, consuming exactly one
 * adjacent comma so the result stays syntactically valid even before
 * prettier reflows it. The rule branches on position because a single
 * "always trim the leading comma" rule breaks on the first element of a
 * multi-element array (there is no leading comma to trim, so naively
 * removing only the element's own span leaves a dangling leading comma on
 * the new-first element: `[, {b}, {c}]`).
 *
 * - First element with siblings: trim forward through the NEXT element's
 *   start (consumes this element and its trailing comma/whitespace).
 * - Any other element (middle, last, or the sole element): trim backward
 *   from the PREVIOUS element's end through this element's end (consumes
 *   this element's leading comma/whitespace). For the sole element this
 *   degrades to the array's own opening bracket, yielding `[]`.
 *
 * Verified directly against ts.createSourceFile output for first/middle/
 * last/sole cases, both compact and prettier-formatted multiline arrays.
 *
 * @param {string} text
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ArrayLiteralExpression} arrayLit
 * @param {number} idx
 * @returns {string} the spliced text
 */
function spliceRemoveElement(text, sf, arrayLit, idx) {
	const el = arrayLit.elements[idx];
	if (idx === 0) {
		if (arrayLit.elements.length > 1) {
			const nextStart = arrayLit.elements[1].getStart(sf);
			return text.slice(0, arrayLit.getStart(sf) + 1) + text.slice(nextStart);
		}
		// Sole element: trim through the array's own closing bracket, not just
		// the element's end — el.getEnd() excludes a trailing comma before ']'
		// (the prettier/multiline-array default), so stopping there would
		// leave a dangling comma (`[,]`). arrayLit.getEnd() - 1 is the ']'
		// itself, which the outer slice below re-adds.
		return text.slice(0, arrayLit.getStart(sf) + 1) + text.slice(arrayLit.getEnd() - 1);
	}
	const prevEnd = arrayLit.elements[idx - 1].getEnd();
	return text.slice(0, prevEnd) + text.slice(el.getEnd());
}

/**
 * Replaces one array element's source text in place with a freshly built
 * literal, preserving all surrounding formatting/commas untouched (only the
 * element's own [getStart, getEnd) span is replaced).
 *
 * @param {string} text
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').Node} element
 * @param {string} newElementSrc
 * @returns {string} the spliced text
 */
function spliceReplaceElement(text, sf, element, newElementSrc) {
	return text.slice(0, element.getStart(sf)) + newElementSrc + text.slice(element.getEnd());
}

/**
 * Locates an element within an array literal whose property values match
 * `matchFn`. Generalises the duplicated idempotence-matcher shape that used
 * to live inline in relateProject/relateTech into a single reusable finder,
 * used by: the add-flow's idempotence check, the remove/edit locators, and
 * the TUI's "pick an existing edge" step.
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ArrayLiteralExpression} arrayLit
 * @param {(ts: import('typescript'), sf: import('typescript').SourceFile, element: import('typescript').ObjectLiteralExpression) => boolean} matchFn
 * @returns {{ element: import('typescript').ObjectLiteralExpression, index: number } | null}
 */
function findRelationshipElement(ts, sf, arrayLit, matchFn) {
	for (let index = 0; index < arrayLit.elements.length; index++) {
		const element = arrayLit.elements[index];
		if (!ts.isObjectLiteralExpression(element)) continue;
		if (matchFn(ts, sf, element)) return { element, index };
	}
	return null;
}

/**
 * Reads a property's string value off a relationship object literal (e.g.
 * `kind`, `target`, `source`, `note`), parsing the JSON.stringify'd literal
 * text back into a real string. Returns undefined when the property is
 * absent — used both by the field-value matchers and by remove/edit to
 * recover an existing element's current fields before rebuilding it.
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ObjectLiteralExpression} element
 * @param {string} name
 * @returns {string | undefined}
 */
function readRelationshipField(ts, sf, element, name) {
	const prop = element.properties.find(
		(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === name
	);
	if (!prop) return undefined;
	// Use the compiler's own decoded string value (node.text), not
	// JSON.parse on the raw source text — hand-authored .ts source (and
	// prettier's own default) commonly uses single-quoted string literals,
	// which JSON.parse rejects outright.
	return ts.isStringLiteral(prop.initializer) ? prop.initializer.text : undefined;
}

/**
 * Sibling of readRelationshipField for string-array properties (hiddenFrom,
 * slugs, suppressTags). Returns undefined when the property is absent or not
 * an array literal; non-string elements are skipped.
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ObjectLiteralExpression} element
 * @param {string} name
 * @returns {string[] | undefined}
 */
function readArrayField(ts, sf, element, name) {
	const prop = element.properties.find(
		(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === name
	);
	if (!prop || !ts.isArrayLiteralExpression(prop.initializer)) return undefined;
	const values = [];
	for (const el of prop.initializer.elements) {
		if (ts.isStringLiteral(el)) values.push(el.text);
	}
	return values;
}

/**
 * Sets or replaces one property on an object literal, leaving every other
 * span untouched — the insert-or-replace core extracted from setOverlayFlag
 * so any verb can set a field. `valueSrc` is the property's VALUE SOURCE
 * TEXT (e.g. `'true'`, `JSON.stringify(value)`). Returns the new text plus
 * `changed: false` when the property already holds byte-identical source,
 * so call sites get idempotence for free.
 *
 * @param {string} text
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript')} ts
 * @param {import('typescript').ObjectLiteralExpression} objLit
 * @param {string} propName
 * @param {string} valueSrc
 * @returns {{ text: string, changed: boolean }}
 */
function spliceObjectProperty(text, sf, ts, objLit, propName, valueSrc) {
	const prop = objLit.properties.find(
		(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === propName
	);
	if (prop) {
		const start = prop.initializer.getStart(sf);
		const end = prop.initializer.getEnd();
		if (text.slice(start, end) === valueSrc) return { text, changed: false };
		return { text: text.slice(0, start) + valueSrc + text.slice(end), changed: true };
	}
	const insertPos = objLit.getStart(sf) + 1; // position just past '{'
	return {
		text: text.slice(0, insertPos) + `\n\t${propName}: ${valueSrc},` + text.slice(insertPos),
		changed: true
	};
}

/**
 * Removes one property (and exactly one adjacent comma) from an object
 * literal, mirroring spliceRemoveElement's position rules. Returns the text
 * unchanged when the property is absent.
 *
 * @param {string} text
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript')} ts
 * @param {import('typescript').ObjectLiteralExpression} objLit
 * @param {string} propName
 * @returns {string}
 */
function spliceRemoveObjectProperty(text, sf, ts, objLit, propName) {
	const props = objLit.properties;
	const idx = props.findIndex((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === propName);
	if (idx === -1) return text;
	if (idx === 0) {
		if (props.length > 1) {
			return text.slice(0, objLit.getStart(sf) + 1) + '\n\t' + text.slice(props[1].getStart(sf));
		}
		return text.slice(0, objLit.getStart(sf) + 1) + text.slice(objLit.getEnd() - 1);
	}
	return text.slice(0, props[idx - 1].getEnd()) + text.slice(props[idx].getEnd());
}

/**
 * Locates an array element by one decoded string property — a TechOverlay by
 * `label`, a Theme by `id`. Case-insensitive matching serves labels (canonical
 * casing is resolved before writes, but stale records must stay findable).
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ArrayLiteralExpression} arrayLit
 * @param {string} field
 * @param {string} value
 * @param {{ caseInsensitive?: boolean }} [options]
 * @returns {{ element: import('typescript').ObjectLiteralExpression, index: number } | null}
 */
function findElementByStringField(ts, sf, arrayLit, field, value, options = {}) {
	const wanted = options.caseInsensitive ? value.toLowerCase() : value;
	return findRelationshipElement(ts, sf, arrayLit, (_ts, _sf, el) => {
		const actual = readRelationshipField(ts, sf, el, field);
		if (actual === undefined) return false;
		return (options.caseInsensitive ? actual.toLowerCase() : actual) === wanted;
	});
}

/**
 * Index of a plain string literal inside an array literal (slugs,
 * suppressTags members), or -1. spliceRemoveElement handles string elements
 * unchanged — it only slices spans.
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ArrayLiteralExpression} arrayLit
 * @param {string} value
 * @returns {number}
 */
function findStringElementIndex(ts, sf, arrayLit, value) {
	for (let i = 0; i < arrayLit.elements.length; i++) {
		const el = arrayLit.elements[i];
		if (ts.isStringLiteral(el) && el.text === value) return i;
	}
	return -1;
}

/**
 * AST read of tech-overlays.ts — deliberately not a dynamic import: a read
 * straight after a write must never hit Bun's module cache, and sandbox
 * copies need no resolvable './types.js'. Returns [] when the file is
 * missing (callers that require it error separately).
 *
 * @returns {Promise<Array<{ label: string, firstUsed?: string, note?: string, kind?: string, hiddenFrom?: string[] }>>}
 */
async function readTechOverlaysFile() {
	if (!existsSync(techOverlaysPath)) return [];
	const ts = (await import('typescript')).default;
	const text = readFileSync(techOverlaysPath, 'utf8');
	const sf = ts.createSourceFile(
		techOverlaysPath,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	);
	const arrayLit = findExportedLiteral(ts, sf, ts.isArrayLiteralExpression);
	if (!arrayLit) return [];
	const overlays = [];
	for (const element of arrayLit.elements) {
		if (!ts.isObjectLiteralExpression(element)) continue;
		const label = readRelationshipField(ts, sf, element, 'label');
		if (label === undefined) continue;
		overlays.push({
			label,
			firstUsed: readRelationshipField(ts, sf, element, 'firstUsed'),
			note: readRelationshipField(ts, sf, element, 'note'),
			kind: readRelationshipField(ts, sf, element, 'kind'),
			hiddenFrom: readArrayField(ts, sf, element, 'hiddenFrom')
		});
	}
	return overlays;
}

/**
 * Locates the single exported top-level literal in a source file — either an
 * ObjectLiteralExpression (project overlays) or an ArrayLiteralExpression
 * (tech-relationships.ts) — matching the same walk setOverlayFlag uses.
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {(node: import('typescript').Node) => boolean} isMatch
 */
function findExportedLiteral(ts, sf, isMatch) {
	for (const stmt of sf.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
		for (const decl of stmt.declarationList.declarations) {
			if (decl.initializer && isMatch(decl.initializer)) return decl.initializer;
		}
	}
	return null;
}

/**
 * Prints the reciprocal-edge reminder for a project relationship kind, iff
 * that kind is one half of the powers/extracted-from pair data.test.ts
 * enforces both sides of. Shared by add/remove/edit so all three nudge
 * consistently. `related` and tech mode never warrant this (tech lineage is
 * single-sided; `related` has no pairing contract).
 *
 * @param {object} palette
 * @param {string} verbSuffix  e.g. '' for add, ' --remove' for remove.
 * @param {string} kind
 * @param {string} sourceSlug
 * @param {string} targetSlug
 */
function printProjectReciprocalReminder(palette, verbSuffix, kind, sourceSlug, targetSlug) {
	const { DIM, RESET } = palette;
	if (kind === 'powers') {
		process.stdout.write(
			`${DIM}Reciprocal: drift relate project ${targetSlug} extracted-from ${sourceSlug}${verbSuffix}${RESET}\n`
		);
	} else if (kind === 'extracted-from') {
		process.stdout.write(
			`${DIM}Reciprocal: drift relate project ${targetSlug} powers ${sourceSlug}${verbSuffix}${RESET}\n`
		);
	}
}

/**
 * Locates the (kind, target) element within a project overlay's
 * relationships array. Shared by the add-flow's idempotence check and the
 * remove/edit paths — all three need the exact same locator.
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ArrayLiteralExpression} arrayLit
 * @param {string} kind
 * @param {string} targetSlug
 */
function findProjectRelationship(ts, sf, arrayLit, kind, targetSlug) {
	return findRelationshipElement(
		ts,
		sf,
		arrayLit,
		(_ts, _sf, el) =>
			readRelationshipField(ts, sf, el, 'kind') === kind &&
			readRelationshipField(ts, sf, el, 'target') === targetSlug
	);
}

/**
 * Mode A: adds, removes, or edits a ProjectRelationship in
 * projects/<sourceSlug>.ts's `relationships` array.
 *
 * add (default): creates the overlay from the template first if absent.
 * Idempotent on an identical (kind, target) pair.
 *
 * remove: locates by (kind, target). A missing overlay or missing edge is a
 * soft no-op (nothing to remove is not an error) — never scaffolds an
 * overlay just to remove from it.
 *
 * edit: locates by (kind, target) — the CURRENT kind, i.e. the locator, not
 * the new one. Rebuilds the element with `newKind`/`newNote` overlaid onto
 * the existing fields (whichever were not passed are kept as-is). A missing
 * overlay or missing edge IS an error (nothing sensible to edit into).
 *
 * @param {{ sourceSlug: string, kind: string, targetSlug: string, note?: string, palette: object, opMode?: 'add'|'remove'|'edit', newKind?: string, newNote?: string }} options
 */
async function relateProject({
	sourceSlug,
	kind,
	targetSlug,
	note,
	palette,
	opMode = 'add',
	newKind,
	newNote
}) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;

	let path, created;
	if (opMode === 'add') {
		({ path, created } = createOverlayIfAbsent(sourceSlug));
	} else {
		path = join(projectsDir, `${sourceSlug}.ts`);
		created = false;
		if (!existsSync(path)) {
			if (opMode === 'remove') {
				process.stdout.write(
					`${YELLOW}'${sourceSlug}' has no overlay — nothing to remove.${RESET}\n`
				);
				return;
			}
			process.stderr.write(`${RED}Error: no overlay found for '${sourceSlug}'.${RESET}\n`);
			process.exit(1);
		}
	}
	const relPath = path.replace(config.repoRoot + '/', '');

	if (created) {
		process.stdout.write(`${GREEN}${BOLD}created${RESET} ${relPath}\n`);
	}

	const ts = (await import('typescript')).default;
	const text = readFileSync(path, 'utf8');
	const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

	const objLit = findExportedLiteral(ts, sf, ts.isObjectLiteralExpression);
	if (!objLit) {
		process.stderr.write(
			`${RED}Error: could not locate the exported object literal in ${relPath}.\n` +
				`Expected one named export with an object literal initializer.${RESET}\n`
		);
		process.exit(1);
	}

	const relationshipsProp = objLit.properties.find(
		(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'relationships'
	);

	if (relationshipsProp && !ts.isArrayLiteralExpression(relationshipsProp.initializer)) {
		process.stderr.write(
			`${RED}Error: '${sourceSlug}'s relationships field is not an array literal — edit ${relPath} by hand.${RESET}\n`
		);
		process.exit(1);
	}

	if (opMode === 'remove' || opMode === 'edit') {
		if (!relationshipsProp) {
			if (opMode === 'remove') {
				process.stdout.write(
					`${YELLOW}'${sourceSlug}' ${kind} '${targetSlug}' not found — nothing to remove.${RESET}\n`
				);
				return;
			}
			process.stderr.write(`${RED}Error: '${sourceSlug}' has no relationships to edit.${RESET}\n`);
			process.exit(1);
		}
		const arrayLit = relationshipsProp.initializer;
		const found = findProjectRelationship(ts, sf, arrayLit, kind, targetSlug);
		if (!found) {
			if (opMode === 'remove') {
				process.stdout.write(
					`${YELLOW}'${sourceSlug}' ${kind} '${targetSlug}' not found — nothing to remove.${RESET}\n`
				);
				return;
			}
			process.stderr.write(
				`${RED}Error: '${sourceSlug}' ${kind} '${targetSlug}' not found — nothing to edit.${RESET}\n`
			);
			process.exit(1);
		}

		let splicedText;
		if (opMode === 'remove') {
			splicedText = spliceRemoveElement(text, sf, arrayLit, found.index);
		} else {
			const existingNote = readRelationshipField(ts, sf, found.element, 'note');
			const finalKind = newKind ?? kind;
			const finalNote = newNote !== undefined ? newNote : existingNote;
			const elementSrc = buildRelationshipLiteral({
				kind: finalKind,
				target: targetSlug,
				note: finalNote
			});
			splicedText = spliceReplaceElement(text, sf, found.element, elementSrc);
		}

		writeFileSync(path, splicedText, 'utf8');
		spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });

		if (opMode === 'remove') {
			process.stdout.write(
				`${GREEN}${BOLD}Removed:${RESET} '${sourceSlug}' ${kind} '${targetSlug}'.\n` +
					`${DIM}Rebuild the site to apply.${RESET}\n`
			);
			printProjectReciprocalReminder(palette, ' --remove', kind, sourceSlug, targetSlug);
		} else {
			const finalKind = newKind ?? kind;
			process.stdout.write(
				`${GREEN}${BOLD}Edited:${RESET} '${sourceSlug}' ${finalKind} '${targetSlug}'.\n` +
					`${DIM}Rebuild the site to apply.${RESET}\n`
			);
			// Nudge if the kind changed and either the old or new kind is part of
			// the powers/extracted-from pairing contract — a pure note edit never
			// warrants this, since notes aren't part of that contract.
			if (newKind !== undefined && newKind !== kind) {
				printProjectReciprocalReminder(palette, ' --edit --kind ...', kind, sourceSlug, targetSlug);
				printProjectReciprocalReminder(
					palette,
					' --edit --kind ...',
					finalKind,
					sourceSlug,
					targetSlug
				);
			}
		}
		return;
	}

	// opMode === 'add'
	// Idempotence: an identical (kind, target) pair already present is a no-op.
	if (relationshipsProp) {
		const arrayLit = relationshipsProp.initializer;
		const alreadyPresent = findProjectRelationship(ts, sf, arrayLit, kind, targetSlug) !== null;
		if (alreadyPresent) {
			process.stdout.write(
				`${YELLOW}'${sourceSlug}' ${kind} '${targetSlug}' already recorded — nothing to do.${RESET}\n`
			);
			return;
		}
	}

	const elementSrc = buildRelationshipLiteral({ kind, target: targetSlug, note });

	let splicedText;
	if (relationshipsProp) {
		splicedText = spliceElementIntoArray(text, sf, relationshipsProp.initializer, elementSrc);
	} else {
		// No relationships property yet — insert one after the opening brace,
		// flag-style, rather than requiring every overlay to pre-declare it.
		const insertPos = objLit.getStart(sf) + 1;
		splicedText =
			text.slice(0, insertPos) + `\n\trelationships: [${elementSrc}],` + text.slice(insertPos);
	}

	writeFileSync(path, splicedText, 'utf8');
	spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });

	process.stdout.write(
		`${GREEN}${BOLD}Related:${RESET} '${sourceSlug}' ${kind} '${targetSlug}'.\n` +
			`${DIM}Rebuild the site to apply.${RESET}\n`
	);

	// data.test.ts enforces that 'powers' and 'extracted-from' are always
	// authored in matching pairs on both sides. Nudge rather than block: the
	// verb writes one file per call, so the reciprocal edge is a follow-up.
	printProjectReciprocalReminder(palette, '', kind, sourceSlug, targetSlug);
}

/**
 * Locates the (kind, source, target) element within the tech-relationships
 * array. Shared by the add-flow's idempotence check and the remove/edit paths.
 * Labels match case-insensitively (kind stays exact): input is resolved to
 * canonical casing before writes, but an already-authored edge with stray
 * casing must still be locatable so remove/edit can clean it up.
 *
 * @param {import('typescript')} ts
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').ArrayLiteralExpression} arrayLit
 * @param {string} kind
 * @param {string} sourceLabel
 * @param {string} targetLabel
 */
function findTechRelationship(ts, sf, arrayLit, kind, sourceLabel, targetLabel) {
	const sourceKey = sourceLabel.toLowerCase();
	const targetKey = targetLabel.toLowerCase();
	return findRelationshipElement(
		ts,
		sf,
		arrayLit,
		(_ts, _sf, el) =>
			readRelationshipField(ts, sf, el, 'kind') === kind &&
			readRelationshipField(ts, sf, el, 'source')?.toLowerCase() === sourceKey &&
			readRelationshipField(ts, sf, el, 'target')?.toLowerCase() === targetKey
	);
}

/**
 * Builds the canonical tech-label universe for `drift relate tech`: every
 * label the tag taxonomy can infer plus every overlay-authored tag label,
 * the same universe tech-relationships.test.ts validates edges against.
 * Returned as a Map from lowercased label to canonical casing (taxonomy
 * entries first on collision) so case-insensitive input always resolves to
 * the label the site actually renders.
 *
 * @returns {Promise<Map<string, string>>}
 */
async function buildTechLabelIndex(options = {}) {
	const byLower = new Map();
	const add = (label) => {
		const key = label.toLowerCase();
		if (!byLower.has(key)) byLower.set(key, label);
	};
	for (const tags of [LANGUAGE_TAGS, RUNTIME_TAGS, FRAMEWORK_TAGS, DATABASE_TAGS]) {
		for (const tag of Object.values(tags)) add(tag.label);
	}
	for (const overlay of await loadOverlays()) {
		if (!Array.isArray(overlay.tags)) continue;
		for (const tag of overlay.tags) {
			if (tag && typeof tag.label === 'string') add(tag.label);
		}
	}
	// Labels authored as hidden from the relate surface stay out of pickers
	// and strict resolution; `drift tech` passes includeRelateHidden so its
	// own list/set/unhide keep seeing them.
	if (!options.includeRelateHidden) {
		for (const overlay of await readTechOverlaysFile()) {
			if (overlay.hiddenFrom?.includes('relate')) byLower.delete(overlay.label.toLowerCase());
		}
	}
	return byLower;
}

/**
 * Resolves a user-typed tech label against the canonical label index,
 * case-insensitively. A hit returns the canonical casing, noting the
 * correction when the input differed. A miss is a hard error when `strict`
 * (the add path must never write a label no surface can resolve); remove and
 * edit pass the input through verbatim instead, so a stale edge whose label
 * is no longer a real tag can still be located and cleaned up.
 *
 * @param {string} input
 * @param {Map<string, string>} byLower
 * @param {object} palette
 * @param {boolean} strict
 * @returns {string}
 */
function resolveTechLabel(input, byLower, palette, strict) {
	const { RED, DIM, RESET } = palette;
	const canonical = byLower.get(input.toLowerCase());
	if (canonical !== undefined) {
		if (canonical !== input) {
			process.stdout.write(`${DIM}Using '${canonical}' for '${input}'.${RESET}\n`);
		}
		return canonical;
	}
	if (!strict) return input;
	const needle = input.toLowerCase();
	const near = [...byLower.values()].filter((l) => l.toLowerCase().includes(needle)).slice(0, 5);
	process.stderr.write(
		`${RED}Error: unknown tech label '${input}'. Labels must match a project tag (case-insensitive).` +
			(near.length > 0 ? ` Did you mean: ${near.join(', ')}?` : '') +
			`${RESET}\n`
	);
	process.exit(1);
}

/**
 * Enumerates EVERY relationship across all sources for a mode — used by the
 * TUI's remove/edit wizard, which lists the whole set up front rather than
 * asking the user to pick a source before it can show anything. Project mode
 * scans every overlay .ts file in projectsDir (relationships are per-file);
 * tech mode is already one flat file, so this is listRelationshipsFor's tech
 * branch with no source filter. Each returned row carries its own `source`
 * (the project slug or tech label its edge belongs to) so the caller can
 * still dispatch a located edge back through the per-source CLI grammar.
 *
 * @param {'project' | 'tech'} mode
 * @returns {Promise<{ source: string, kind: string, target: string, note?: string }[]>}
 */
async function listAllRelationships(mode) {
	const ts = (await import('typescript')).default;

	if (mode === 'project') {
		const files = readdirSync(projectsDir).filter((f) => f.endsWith('.ts'));
		const rows = [];
		for (const file of files) {
			const path = join(projectsDir, file);
			const source = file.slice(0, -3); // strip '.ts' — overlay files are named <slug>.ts
			let text;
			try {
				text = readFileSync(path, 'utf8');
			} catch {
				continue;
			}
			const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
			const objLit = findExportedLiteral(ts, sf, ts.isObjectLiteralExpression);
			if (!objLit) continue;
			const relationshipsProp = objLit.properties.find(
				(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'relationships'
			);
			if (!relationshipsProp || !ts.isArrayLiteralExpression(relationshipsProp.initializer))
				continue;
			for (const el of relationshipsProp.initializer.elements) {
				if (!ts.isObjectLiteralExpression(el)) continue;
				rows.push({
					source,
					kind: readRelationshipField(ts, sf, el, 'kind'),
					target: readRelationshipField(ts, sf, el, 'target'),
					note: readRelationshipField(ts, sf, el, 'note')
				});
			}
		}
		return rows;
	}

	// mode === 'tech' — one flat file, no per-source filter.
	if (!existsSync(techRelationshipsPath)) return [];
	const text = readFileSync(techRelationshipsPath, 'utf8');
	const sf = ts.createSourceFile(
		techRelationshipsPath,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	);
	const arrayLit = findExportedLiteral(ts, sf, ts.isArrayLiteralExpression);
	if (!arrayLit) return [];
	return arrayLit.elements
		.filter((el) => ts.isObjectLiteralExpression(el))
		.map((el) => ({
			source: readRelationshipField(ts, sf, el, 'source'),
			kind: readRelationshipField(ts, sf, el, 'kind'),
			target: readRelationshipField(ts, sf, el, 'target'),
			note: readRelationshipField(ts, sf, el, 'note')
		}));
}

/**
 * Mode B: adds, removes, or edits a TechRelationship in the exported array
 * in tech-relationships.ts. The file always exists (it ships with the
 * repo) — no create-if-absent step for any mode.
 *
 * add (default): idempotent on an identical (kind, source, target) triple.
 * remove: locates by the (kind, source, target) triple; a missing edge is a
 * soft no-op. edit: locates by the same triple (the CURRENT kind), rebuilds
 * with `newKind`/`newNote` overlaid on the existing fields; a missing edge
 * is an error. No reciprocal reminder in either case — tech lineage is
 * single-sided, unlike project powers/extracted-from pairs.
 *
 * @param {{ sourceLabel: string, kind: string, targetLabel: string, note?: string, palette: object, opMode?: 'add'|'remove'|'edit', newKind?: string, newNote?: string }} options
 */
async function relateTech({
	sourceLabel,
	kind,
	targetLabel,
	note,
	palette,
	opMode = 'add',
	newKind,
	newNote
}) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;
	const relPath = techRelationshipsPath.replace(config.repoRoot + '/', '');

	if (!existsSync(techRelationshipsPath)) {
		process.stderr.write(`${RED}Error: ${relPath} not found.${RESET}\n`);
		process.exit(1);
	}

	const ts = (await import('typescript')).default;
	const text = readFileSync(techRelationshipsPath, 'utf8');
	const sf = ts.createSourceFile(
		techRelationshipsPath,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	);

	const arrayLit = findExportedLiteral(ts, sf, ts.isArrayLiteralExpression);
	if (!arrayLit) {
		process.stderr.write(
			`${RED}Error: could not locate the exported array literal in ${relPath}.\n` +
				`Expected one named export with an array literal initializer.${RESET}\n`
		);
		process.exit(1);
	}

	if (opMode === 'remove' || opMode === 'edit') {
		const found = findTechRelationship(ts, sf, arrayLit, kind, sourceLabel, targetLabel);
		if (!found) {
			if (opMode === 'remove') {
				process.stdout.write(
					`${YELLOW}'${sourceLabel}' ${kind} '${targetLabel}' not found — nothing to remove.${RESET}\n`
				);
				return;
			}
			process.stderr.write(
				`${RED}Error: '${sourceLabel}' ${kind} '${targetLabel}' not found — nothing to edit.${RESET}\n`
			);
			process.exit(1);
		}

		let splicedText;
		if (opMode === 'remove') {
			splicedText = spliceRemoveElement(text, sf, arrayLit, found.index);
		} else {
			const existingNote = readRelationshipField(ts, sf, found.element, 'note');
			const finalKind = newKind ?? kind;
			const finalNote = newNote !== undefined ? newNote : existingNote;
			const elementSrc = buildRelationshipLiteral({
				kind: finalKind,
				source: sourceLabel,
				target: targetLabel,
				note: finalNote
			});
			splicedText = spliceReplaceElement(text, sf, found.element, elementSrc);
		}

		writeFileSync(techRelationshipsPath, splicedText, 'utf8');
		spawnSync('npx', ['prettier', '--write', techRelationshipsPath], { stdio: 'ignore' });

		if (opMode === 'remove') {
			process.stdout.write(
				`${GREEN}${BOLD}Removed:${RESET} '${sourceLabel}' ${kind} '${targetLabel}'.\n` +
					`${DIM}Rebuild the site to apply.${RESET}\n`
			);
		} else {
			const finalKind = newKind ?? kind;
			process.stdout.write(
				`${GREEN}${BOLD}Edited:${RESET} '${sourceLabel}' ${finalKind} '${targetLabel}'.\n` +
					`${DIM}Rebuild the site to apply.${RESET}\n`
			);
		}
		return;
	}

	// opMode === 'add'
	// Idempotence: an identical (kind, source, target) triple already present is a no-op.
	const alreadyPresent =
		findTechRelationship(ts, sf, arrayLit, kind, sourceLabel, targetLabel) !== null;
	if (alreadyPresent) {
		process.stdout.write(
			`${YELLOW}'${sourceLabel}' ${kind} '${targetLabel}' already recorded — nothing to do.${RESET}\n`
		);
		return;
	}

	const elementSrc = buildRelationshipLiteral({
		kind,
		source: sourceLabel,
		target: targetLabel,
		note
	});
	const splicedText = spliceElementIntoArray(text, sf, arrayLit, elementSrc);

	writeFileSync(techRelationshipsPath, splicedText, 'utf8');
	spawnSync('npx', ['prettier', '--write', techRelationshipsPath], { stdio: 'ignore' });

	process.stdout.write(
		`${GREEN}${BOLD}Related:${RESET} '${sourceLabel}' ${kind} '${targetLabel}'.\n` +
			`${DIM}Rebuild the site to apply.${RESET}\n`
	);
}

/**
 * Parses mode + positionals, validates, and dispatches to relateProject or
 * relateTech. Requires no drift scan — runs before loadManifests() in main().
 *
 * @param {{ args: string[], values: object, palette: object }} options
 */
async function runRelate({ args, values, palette }) {
	const { RED, RESET } = palette;
	const usage =
		'Usage:\n' +
		'  drift relate project <source-slug> <kind> <target-slug> [--note "..."]\n' +
		'    kind: extracted-from | powers | related\n' +
		'  drift relate tech <source-label> <kind> <target-label> [--note "..."]\n' +
		'    kind: leads-to | replaced-by\n' +
		'    labels are case-insensitive and written in canonical tag casing\n' +
		'  Add --remove to delete the located edge instead of adding it.\n' +
		'  Add --edit with --kind and/or --note to change an existing edge in place\n' +
		'    (the positional <kind>/<source>/<target> locate WHICH edge; --kind is the new value).';

	const [mode, source, kind, target] = args;

	if (mode !== 'project' && mode !== 'tech') {
		process.stderr.write(
			`${RED}Error: first argument must be 'project' or 'tech'.\n${usage}${RESET}\n`
		);
		process.exit(1);
	}
	if (!source || !kind || !target) {
		process.stderr.write(`${RED}Error: missing arguments.\n${usage}${RESET}\n`);
		process.exit(1);
	}

	if (values.remove && values.edit) {
		process.stderr.write(`${RED}Error: --remove and --edit are mutually exclusive.${RESET}\n`);
		process.exit(1);
	}
	const opMode = values.remove ? 'remove' : values.edit ? 'edit' : 'add';

	const note = values.note?.trim() || undefined;
	const newKind = values.kind?.trim() || undefined;

	if (opMode === 'edit' && newKind === undefined && note === undefined) {
		process.stderr.write(
			`${RED}Error: --edit needs --kind and/or --note — nothing to change.${RESET}\n`
		);
		process.exit(1);
	}

	if (mode === 'project') {
		if (!PROJECT_RELATIONSHIP_KINDS.has(kind)) {
			process.stderr.write(
				`${RED}Error: invalid kind '${kind}'. Use one of: extracted-from, powers, related.${RESET}\n`
			);
			process.exit(1);
		}
		if (opMode === 'edit' && newKind !== undefined && !PROJECT_RELATIONSHIP_KINDS.has(newKind)) {
			process.stderr.write(
				`${RED}Error: invalid --kind '${newKind}'. Use one of: extracted-from, powers, related.${RESET}\n`
			);
			process.exit(1);
		}
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(source) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(target)) {
			process.stderr.write(
				`${RED}Error: slugs must be lowercase kebab-case (e.g. my-project).${RESET}\n`
			);
			process.exit(1);
		}
		if (source === target) {
			process.stderr.write(`${RED}Error: a project cannot relate to itself.${RESET}\n`);
			process.exit(1);
		}
		await relateProject({
			sourceSlug: source,
			kind,
			targetSlug: target,
			note,
			palette,
			opMode,
			newKind,
			newNote: opMode === 'edit' ? note : undefined
		});
		return;
	}

	// mode === 'tech'
	if (!TECH_RELATIONSHIP_KINDS.has(kind)) {
		process.stderr.write(
			`${RED}Error: invalid kind '${kind}'. Use one of: leads-to, replaced-by.${RESET}\n`
		);
		process.exit(1);
	}
	if (opMode === 'edit' && newKind !== undefined && !TECH_RELATIONSHIP_KINDS.has(newKind)) {
		process.stderr.write(
			`${RED}Error: invalid --kind '${newKind}'. Use one of: leads-to, replaced-by.${RESET}\n`
		);
		process.exit(1);
	}
	// Labels resolve case-insensitively against the canonical tag universe;
	// only the add path insists on a known label (see resolveTechLabel).
	const labelIndex = await buildTechLabelIndex();
	const sourceLabel = resolveTechLabel(source, labelIndex, palette, opMode === 'add');
	const targetLabel = resolveTechLabel(target, labelIndex, palette, opMode === 'add');
	if (sourceLabel.toLowerCase() === targetLabel.toLowerCase()) {
		process.stderr.write(`${RED}Error: a technology cannot relate to itself.${RESET}\n`);
		process.exit(1);
	}
	await relateTech({
		sourceLabel,
		kind,
		targetLabel,
		note,
		palette,
		opMode,
		newKind,
		newNote: opMode === 'edit' ? note : undefined
	});
}

// ---------------------------------------------------------------------------
// tech verb (5DR.19)
//
// Authored per-tech overlays (tech-overlays.ts): first-used floor date,
// modal note, kind override and per-surface visibility.
//
//   drift tech list [<label>]
//   drift tech set <label> [--first-used YYYY-MM-DD] [--note "..."] [--kind <tag-kind>]
//   drift tech hide <label> [--from toolkit,map,stack,relate]
//   drift tech unhide <label> [--from ... | --all]
//
// Write-isolation: writes ONLY tech-overlays.ts. `list` writes nothing.
// ---------------------------------------------------------------------------

const TECH_TAG_KINDS = new Set([
	'language',
	'framework',
	'data',
	'ai',
	'concept',
	'tool',
	'runtime'
]);
const TECH_SURFACES = ['toolkit', 'map', 'stack', 'relate'];

/**
 * Parses a --from value ("toolkit,map") into a validated surface list, in
 * canonical TECH_SURFACES order. undefined input means "all surfaces".
 * Exits 1 on an unknown surface token.
 *
 * @param {string | undefined} fromValue
 * @param {object} palette
 * @returns {string[]}
 */
function parseSurfaces(fromValue, palette) {
	const { RED, RESET } = palette;
	if (fromValue === undefined) return [...TECH_SURFACES];
	const tokens = fromValue
		.split(',')
		.map((t) => t.trim())
		.filter((t) => t.length > 0);
	for (const token of tokens) {
		if (!TECH_SURFACES.includes(token)) {
			process.stderr.write(
				`${RED}Error: unknown surface '${token}'. Use any of: ${TECH_SURFACES.join(', ')}.${RESET}\n`
			);
			process.exit(1);
		}
	}
	return TECH_SURFACES.filter((s) => tokens.includes(s));
}

/**
 * Parses tech-overlays.ts for mutation, exiting 1 when the file or its
 * exported array cannot be found (the file ships with the repo; a missing
 * one is a broken checkout, mirroring relateTech's stance).
 */
async function loadTechOverlaysForEdit(palette) {
	const { RED, RESET } = palette;
	const relPath = techOverlaysPath.replace(config.repoRoot + '/', '');
	if (!existsSync(techOverlaysPath)) {
		process.stderr.write(`${RED}Error: ${relPath} not found.${RESET}\n`);
		process.exit(1);
	}
	const ts = (await import('typescript')).default;
	const text = readFileSync(techOverlaysPath, 'utf8');
	const sf = ts.createSourceFile(
		techOverlaysPath,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	);
	const arrayLit = findExportedLiteral(ts, sf, ts.isArrayLiteralExpression);
	if (!arrayLit) {
		process.stderr.write(
			`${RED}Error: could not locate the exported array literal in ${relPath}.${RESET}\n`
		);
		process.exit(1);
	}
	return { ts, text, sf, arrayLit, relPath };
}

/** Writes spliced tech-overlays.ts source and prettier-formats it. */
function writeTechOverlays(splicedText) {
	writeFileSync(techOverlaysPath, splicedText, 'utf8');
	spawnSync('npx', ['prettier', '--write', techOverlaysPath], { stdio: 'ignore' });
}

/**
 * Sets one property on the overlay record for `label`, re-parsing afterwards
 * so consecutive field updates never splice against stale positions. Creates
 * the record when absent.
 *
 * @param {string} label  Canonical label (already resolved).
 * @param {string} propName
 * @param {string} valueSrc  Value SOURCE text, e.g. JSON.stringify(value).
 * @param {object} palette
 * @returns {Promise<boolean>} true when the file changed.
 */
async function setTechOverlayProperty(label, propName, valueSrc, palette) {
	const { ts, text, sf, arrayLit } = await loadTechOverlaysForEdit(palette);
	const found = findElementByStringField(ts, sf, arrayLit, 'label', label, {
		caseInsensitive: true
	});
	if (found === null) {
		const elementSrc = `{ label: ${JSON.stringify(label)}, ${propName}: ${valueSrc} }`;
		writeTechOverlays(spliceElementIntoArray(text, sf, arrayLit, elementSrc));
		return true;
	}
	const { text: splicedText, changed } = spliceObjectProperty(
		text,
		sf,
		ts,
		found.element,
		propName,
		valueSrc
	);
	if (changed) writeTechOverlays(splicedText);
	return changed;
}

/**
 * Mode dispatcher for `drift tech`. See the section banner for the grammar.
 *
 * @param {{ args: string[], values: object, palette: object }} options
 */
async function runTech({ args, values, palette }) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;
	const usage =
		'Usage:\n' +
		'  drift tech list [<label>]\n' +
		'  drift tech set <label> [--first-used YYYY-MM-DD] [--note "..."] [--kind <tag-kind>]\n' +
		'  drift tech hide <label> [--from toolkit,map,stack,relate]\n' +
		'  drift tech unhide <label> [--from ... | --all]\n' +
		'  Labels are case-insensitive and resolve to canonical tag casing.';

	const [action, labelInput] = args;

	if (action === 'list' || action === undefined) {
		const labelIndex = await buildTechLabelIndex({ includeRelateHidden: true });
		const overlays = await readTechOverlaysFile();
		const overlayByLower = new Map(overlays.map((o) => [o.label.toLowerCase(), o]));

		const describeOverlay = (overlay) => {
			const parts = [];
			if (overlay.firstUsed !== undefined) parts.push(`first used ${overlay.firstUsed}`);
			if (overlay.kind !== undefined) parts.push(`kind → ${overlay.kind}`);
			if (overlay.note !== undefined) parts.push('note ✓');
			if (overlay.hiddenFrom !== undefined && overlay.hiddenFrom.length > 0) {
				parts.push(`hidden: ${overlay.hiddenFrom.join(', ')}`);
			}
			return parts;
		};

		if (labelInput !== undefined) {
			const canonical = labelIndex.get(labelInput.toLowerCase());
			if (canonical === undefined) {
				process.stderr.write(`${RED}Error: unknown tech label '${labelInput}'.${RESET}\n`);
				process.exit(1);
			}
			const overlay = overlayByLower.get(canonical.toLowerCase());
			process.stdout.write(`${BOLD}${canonical}${RESET}\n`);
			if (overlay === undefined) {
				process.stdout.write(`${DIM}No authored overlay.${RESET}\n`);
			} else {
				if (overlay.firstUsed !== undefined) {
					process.stdout.write(`first used  ${overlay.firstUsed}\n`);
				}
				if (overlay.kind !== undefined) process.stdout.write(`kind        ${overlay.kind}\n`);
				if (overlay.note !== undefined) process.stdout.write(`note        ${overlay.note}\n`);
				if (overlay.hiddenFrom !== undefined && overlay.hiddenFrom.length > 0) {
					process.stdout.write(`hidden from ${overlay.hiddenFrom.join(', ')}\n`);
				}
			}
			return;
		}

		const canonicalLabels = [...labelIndex.values()].sort((a, b) => a.localeCompare(b));
		for (const label of canonicalLabels) {
			const overlay = overlayByLower.get(label.toLowerCase());
			const annotation =
				overlay === undefined ? '' : `  ${DIM}${describeOverlay(overlay).join(' · ')}${RESET}`;
			process.stdout.write(`${label}${annotation}\n`);
		}
		process.stdout.write(`${DIM}${canonicalLabels.length} labels.${RESET}\n`);
		return;
	}

	if (action !== 'set' && action !== 'hide' && action !== 'unhide') {
		process.stderr.write(`${RED}Error: unknown tech action '${action}'.\n${usage}${RESET}\n`);
		process.exit(1);
	}
	if (labelInput === undefined) {
		process.stderr.write(`${RED}Error: missing label.\n${usage}${RESET}\n`);
		process.exit(1);
	}

	// hide/unhide/set all resolve case-insensitively; only unhide tolerates an
	// unknown label (stale records must stay cleanable).
	const labelIndex = await buildTechLabelIndex({ includeRelateHidden: true });
	const label = resolveTechLabel(labelInput, labelIndex, palette, action !== 'unhide');

	if (action === 'set') {
		const firstUsed = values['first-used'];
		const note = values.note?.trim() || undefined;
		const kind = values.kind?.trim() || undefined;
		if (firstUsed === undefined && note === undefined && kind === undefined) {
			process.stderr.write(
				`${RED}Error: tech set needs --first-used, --note and/or --kind — nothing to change.${RESET}\n`
			);
			process.exit(1);
		}
		if (firstUsed !== undefined) {
			const month = Number(firstUsed.slice(5, 7));
			if (!/^\d{4}-\d{2}-\d{2}$/.test(firstUsed) || month < 1 || month > 12) {
				process.stderr.write(
					`${RED}Error: --first-used must be an ISO date (YYYY-MM-DD), got '${firstUsed}'.${RESET}\n`
				);
				process.exit(1);
			}
		}
		if (kind !== undefined && !TECH_TAG_KINDS.has(kind)) {
			process.stderr.write(
				`${RED}Error: invalid --kind '${kind}'. Use one of: ${[...TECH_TAG_KINDS].join(', ')}.${RESET}\n`
			);
			process.exit(1);
		}

		let changed = false;
		if (firstUsed !== undefined) {
			changed =
				(await setTechOverlayProperty(label, 'firstUsed', JSON.stringify(firstUsed), palette)) ||
				changed;
		}
		if (note !== undefined) {
			changed =
				(await setTechOverlayProperty(label, 'note', JSON.stringify(note), palette)) || changed;
		}
		if (kind !== undefined) {
			changed =
				(await setTechOverlayProperty(label, 'kind', JSON.stringify(kind), palette)) || changed;
		}
		if (changed) {
			process.stdout.write(
				`${GREEN}${BOLD}Set:${RESET} overlay for '${label}'.\n${DIM}Rebuild the site to apply.${RESET}\n`
			);
		} else {
			process.stdout.write(
				`${YELLOW}Overlay for '${label}' already holds those values — nothing to do.${RESET}\n`
			);
		}
		return;
	}

	// hide / unhide
	const requested = parseSurfaces(values.all ? undefined : values.from, palette);
	const { ts, text, sf, arrayLit } = await loadTechOverlaysForEdit(palette);
	const found = findElementByStringField(ts, sf, arrayLit, 'label', label, {
		caseInsensitive: true
	});
	const current = found === null ? [] : (readArrayField(ts, sf, found.element, 'hiddenFrom') ?? []);

	if (action === 'hide') {
		const next = TECH_SURFACES.filter((s) => current.includes(s) || requested.includes(s));
		if (next.length === current.length) {
			process.stdout.write(
				`${YELLOW}'${label}' is already hidden from ${requested.join(', ')} — nothing to do.${RESET}\n`
			);
			return;
		}
		const valueSrc = JSON.stringify(next);
		if (found === null) {
			const elementSrc = `{ label: ${JSON.stringify(label)}, hiddenFrom: ${valueSrc} }`;
			writeTechOverlays(spliceElementIntoArray(text, sf, arrayLit, elementSrc));
		} else {
			const { text: splicedText } = spliceObjectProperty(
				text,
				sf,
				ts,
				found.element,
				'hiddenFrom',
				valueSrc
			);
			writeTechOverlays(splicedText);
		}
		process.stdout.write(
			`${GREEN}${BOLD}Hidden:${RESET} '${label}' from ${next.join(', ')}.\n${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
	}

	// unhide
	if (found === null || current.length === 0) {
		process.stdout.write(`${YELLOW}'${label}' is not hidden anywhere — nothing to do.${RESET}\n`);
		return;
	}
	const next = current.filter((s) => !requested.includes(s));
	if (next.length === current.length) {
		process.stdout.write(
			`${YELLOW}'${label}' is not hidden from ${requested.join(', ')} — nothing to do.${RESET}\n`
		);
		return;
	}
	// An emptied hiddenFrom drops the property; a record reduced to a bare
	// label drops entirely (it authors nothing).
	const hasOtherFields = ['firstUsed', 'note', 'kind'].some(
		(field) => readRelationshipField(ts, sf, found.element, field) !== undefined
	);
	let splicedText;
	if (next.length > 0) {
		({ text: splicedText } = spliceObjectProperty(
			text,
			sf,
			ts,
			found.element,
			'hiddenFrom',
			JSON.stringify(next)
		));
	} else if (hasOtherFields) {
		splicedText = spliceRemoveObjectProperty(text, sf, ts, found.element, 'hiddenFrom');
	} else {
		splicedText = spliceRemoveElement(text, sf, arrayLit, found.index);
	}
	writeTechOverlays(splicedText);
	const remaining = next.length > 0 ? ` (still hidden from ${next.join(', ')})` : '';
	process.stdout.write(
		`${GREEN}${BOLD}Unhidden:${RESET} '${label}' from ${current.filter((s) => requested.includes(s)).join(', ')}${remaining}.\n` +
			`${DIM}Rebuild the site to apply.${RESET}\n`
	);
}

// ---------------------------------------------------------------------------
// tag verb (5DR.20)
//
// Per-project tech tags: authored additions (AuthoredProject.tags) and
// suppression of inferred tags (AuthoredProject.suppressTags).
//
//   drift tag list <slug>
//   drift tag add <slug> <label> [--kind <tag-kind>]
//   drift tag hide <slug> <label>
//   drift tag unhide <slug> <label>
//
// Write-isolation: writes ONLY projects/<slug>.ts. `list` writes nothing.
// ---------------------------------------------------------------------------

/**
 * Best-known kind for a canonical label: taxonomy first, then any
 * overlay-authored tag already using it. undefined when nobody knows —
 * `tag add` then demands an explicit --kind.
 *
 * @param {string} label
 * @returns {Promise<string | undefined>}
 */
async function inferKindForLabel(label) {
	for (const tags of [LANGUAGE_TAGS, RUNTIME_TAGS, FRAMEWORK_TAGS, DATABASE_TAGS]) {
		for (const tag of Object.values(tags)) {
			if (tag.label === label) return tag.kind;
		}
	}
	for (const overlay of await loadOverlays()) {
		if (!Array.isArray(overlay.tags)) continue;
		for (const tag of overlay.tags) {
			if (tag && tag.label === label && typeof tag.kind === 'string') return tag.kind;
		}
	}
	return undefined;
}

/**
 * Labels the manifest would infer for one slug — an approximation of
 * inferTags for display and the "not carried" advisory (identity → taxonomy
 * label, without inferTags's special cases). Empty when sources.json is
 * absent (bare checkouts, sandboxes).
 *
 * @param {string} slug
 * @returns {string[]}
 */
function inferredLabelsForSlug(slug) {
	if (!existsSync(sourcesPath)) return [];
	let entry;
	try {
		entry = JSON.parse(readFileSync(sourcesPath, 'utf8')).sources?.[slug];
	} catch {
		return [];
	}
	if (!entry) return [];
	const labels = new Set();
	for (const name of entry.languages ?? []) {
		const tag = LANGUAGE_TAGS[name];
		if (tag) labels.add(tag.label);
	}
	for (const [identities, table] of [
		[entry.runtime ?? [], RUNTIME_TAGS],
		[entry.framework ?? [], FRAMEWORK_TAGS],
		[entry.database ?? [], DATABASE_TAGS]
	]) {
		for (const identity of identities) {
			const tag = table[identity];
			if (tag) labels.add(tag.label);
		}
	}
	return [...labels];
}

/** Parses projects/<slug>.ts for mutation, creating it from the template when allowed. */
async function loadOverlayForEdit(slug, palette) {
	const { GREEN, RED, BOLD, RESET } = palette;
	const { path, created } = createOverlayIfAbsent(slug);
	const relPath = path.replace(config.repoRoot + '/', '');
	if (created) process.stdout.write(`${GREEN}${BOLD}created${RESET} ${relPath}\n`);
	const ts = (await import('typescript')).default;
	const text = readFileSync(path, 'utf8');
	const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const objLit = findExportedLiteral(ts, sf, ts.isObjectLiteralExpression);
	if (!objLit) {
		process.stderr.write(
			`${RED}Error: could not locate the exported object literal in ${relPath}.${RESET}\n`
		);
		process.exit(1);
	}
	return { ts, path, text, sf, objLit, relPath };
}

/** Finds an array-typed property on the overlay, exiting 1 on a non-array initializer. */
function overlayArrayProp(ts, sf, objLit, propName, relPath, palette) {
	const { RED, RESET } = palette;
	const prop = objLit.properties.find(
		(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === propName
	);
	if (prop && !ts.isArrayLiteralExpression(prop.initializer)) {
		process.stderr.write(
			`${RED}Error: ${propName} in ${relPath} is not an array literal — edit it by hand.${RESET}\n`
		);
		process.exit(1);
	}
	return prop ?? null;
}

/**
 * Mode dispatcher for `drift tag`. See the section banner for the grammar.
 *
 * @param {{ args: string[], values: object, palette: object }} options
 */
async function runTag({ args, values, palette }) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;
	const usage =
		'Usage:\n' +
		'  drift tag list <slug>\n' +
		'  drift tag add <slug> <label> [--kind <tag-kind>]\n' +
		'  drift tag hide <slug> <label>\n' +
		'  drift tag unhide <slug> <label>\n' +
		'  An unknown label on add REQUIRES --kind (the entry point for new labels).';

	const [action, slug, labelInput] = args;
	if (!['list', 'add', 'hide', 'unhide'].includes(action ?? '')) {
		process.stderr.write(`${RED}Error: unknown tag action '${action ?? ''}'.\n${usage}${RESET}\n`);
		process.exit(1);
	}
	if (slug === undefined || (action !== 'list' && labelInput === undefined)) {
		process.stderr.write(`${RED}Error: missing arguments.\n${usage}${RESET}\n`);
		process.exit(1);
	}
	const slugError = validateProjectSlug(slug);
	if (slugError !== null) {
		process.stderr.write(`${RED}Error: ${slugError}${RESET}\n`);
		process.exit(1);
	}

	if (action === 'list') {
		const overlayPath = join(projectsDir, `${slug}.ts`);
		let authored = [];
		let suppressed = [];
		if (existsSync(overlayPath)) {
			const ts = (await import('typescript')).default;
			const text = readFileSync(overlayPath, 'utf8');
			const sf = ts.createSourceFile(
				overlayPath,
				text,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TS
			);
			const objLit = findExportedLiteral(ts, sf, ts.isObjectLiteralExpression);
			if (objLit) {
				const tagsProp = objLit.properties.find(
					(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'tags'
				);
				if (tagsProp && ts.isArrayLiteralExpression(tagsProp.initializer)) {
					for (const el of tagsProp.initializer.elements) {
						if (!ts.isObjectLiteralExpression(el)) continue;
						const label = readRelationshipField(ts, sf, el, 'label');
						const kind = readRelationshipField(ts, sf, el, 'kind');
						if (label !== undefined) authored.push(kind ? `${label} (${kind})` : label);
					}
				}
				suppressed = readArrayField(ts, sf, objLit, 'suppressTags') ?? [];
			}
		}
		const inferred = inferredLabelsForSlug(slug);
		const suppressedSet = new Set(suppressed);
		const effective = [
			...new Set([...inferred, ...authored.map((a) => a.replace(/ \(.*\)$/, ''))])
		].filter((label) => !suppressedSet.has(label));

		process.stdout.write(`${BOLD}${slug}${RESET}\n`);
		process.stdout.write(`inferred    ${inferred.join(', ') || DIM + 'none' + RESET}\n`);
		process.stdout.write(`authored    ${authored.join(', ') || DIM + 'none' + RESET}\n`);
		process.stdout.write(`suppressed  ${suppressed.join(', ') || DIM + 'none' + RESET}\n`);
		process.stdout.write(`effective   ${effective.join(', ') || DIM + 'none' + RESET}\n`);
		return;
	}

	// Label resolution: canonical casing when known; `add` without --kind is
	// strict, `add --kind` sanctions a brand-new label, hide/unhide pass
	// unknown labels through (suppressing a future inferred tag is legitimate).
	const labelIndex = await buildTechLabelIndex({ includeRelateHidden: true });
	const canonical = labelIndex.get(labelInput.toLowerCase());
	const explicitKind = values.kind?.trim() || undefined;
	if (explicitKind !== undefined && !TECH_TAG_KINDS.has(explicitKind)) {
		process.stderr.write(
			`${RED}Error: invalid --kind '${explicitKind}'. Use one of: ${[...TECH_TAG_KINDS].join(', ')}.${RESET}\n`
		);
		process.exit(1);
	}

	if (action === 'add') {
		let label;
		let kind;
		if (canonical !== undefined) {
			label = resolveTechLabel(labelInput, labelIndex, palette, true);
			kind = explicitKind ?? (await inferKindForLabel(label));
			if (kind === undefined) {
				process.stderr.write(`${RED}Error: no known kind for '${label}' — pass --kind.${RESET}\n`);
				process.exit(1);
			}
		} else if (explicitKind !== undefined) {
			label = labelInput;
			kind = explicitKind;
		} else {
			// Unknown label without --kind: reuse the strict error (near-miss list).
			resolveTechLabel(labelInput, labelIndex, palette, true);
			return; // unreachable — resolveTechLabel exits
		}

		const { ts, path, text, sf, objLit, relPath } = await loadOverlayForEdit(slug, palette);
		const tagsProp = overlayArrayProp(ts, sf, objLit, 'tags', relPath, palette);
		if (tagsProp !== null) {
			const existing = findElementByStringField(ts, sf, tagsProp.initializer, 'label', label, {
				caseInsensitive: true
			});
			if (existing !== null) {
				process.stdout.write(
					`${YELLOW}'${slug}' already carries '${label}' — nothing to do.${RESET}\n`
				);
				return;
			}
		}
		const elementSrc = buildRelationshipLiteral({ label, kind });
		let splicedText;
		if (tagsProp !== null) {
			splicedText = spliceElementIntoArray(text, sf, tagsProp.initializer, elementSrc);
		} else {
			const insertPos = objLit.getStart(sf) + 1;
			splicedText = text.slice(0, insertPos) + `\n\ttags: [${elementSrc}],` + text.slice(insertPos);
		}
		writeFileSync(path, splicedText, 'utf8');
		spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });

		// Adding and suppressing must not coexist: lift any suppression of
		// this label in a second pass (positions went stale on the write).
		{
			const fresh = await loadOverlayForEdit(slug, palette);
			const suppressProp = overlayArrayProp(
				fresh.ts,
				fresh.sf,
				fresh.objLit,
				'suppressTags',
				relPath,
				palette
			);
			if (suppressProp !== null) {
				const idx = findStringElementIndex(fresh.ts, fresh.sf, suppressProp.initializer, label);
				if (idx !== -1) {
					// Dropping the last entry drops the whole property — an empty
					// suppressTags authors nothing.
					const cleaned =
						suppressProp.initializer.elements.length === 1
							? spliceRemoveObjectProperty(
									fresh.text,
									fresh.sf,
									fresh.ts,
									fresh.objLit,
									'suppressTags'
								)
							: spliceRemoveElement(fresh.text, fresh.sf, suppressProp.initializer, idx);
					writeFileSync(path, cleaned, 'utf8');
					spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });
					process.stdout.write(`${DIM}Also lifted suppression of '${label}'.${RESET}\n`);
				}
			}
		}
		process.stdout.write(
			`${GREEN}${BOLD}Tagged:${RESET} '${slug}' with '${label}' (${kind}).\n${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
	}

	const label = canonical ?? labelInput;

	if (action === 'hide') {
		const carried = new Set([...inferredLabelsForSlug(slug)]);
		const { ts, path, text, sf, objLit, relPath } = await loadOverlayForEdit(slug, palette);
		const suppressProp = overlayArrayProp(ts, sf, objLit, 'suppressTags', relPath, palette);
		if (suppressProp !== null) {
			if (findStringElementIndex(ts, sf, suppressProp.initializer, label) !== -1) {
				process.stdout.write(
					`${YELLOW}'${label}' is already suppressed on '${slug}' — nothing to do.${RESET}\n`
				);
				return;
			}
		}
		let splicedText;
		if (suppressProp !== null) {
			splicedText = spliceElementIntoArray(
				text,
				sf,
				suppressProp.initializer,
				JSON.stringify(label)
			);
		} else {
			const insertPos = objLit.getStart(sf) + 1;
			splicedText =
				text.slice(0, insertPos) +
				`\n\tsuppressTags: [${JSON.stringify(label)}],` +
				text.slice(insertPos);
		}
		writeFileSync(path, splicedText, 'utf8');
		spawnSync('npx', ['prettier', '--write', path], { stdio: 'ignore' });
		if (!carried.has(label)) {
			process.stdout.write(
				`${YELLOW}Note: '${slug}' does not currently infer '${label}'; the suppression waits for it.${RESET}\n`
			);
		}
		process.stdout.write(
			`${GREEN}${BOLD}Suppressed:${RESET} '${label}' on '${slug}' (inferred or authored).\n${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
	}

	// unhide: soft no-ops throughout — never scaffolds an overlay to remove from it.
	const overlayPath = join(projectsDir, `${slug}.ts`);
	if (!existsSync(overlayPath)) {
		process.stdout.write(`${YELLOW}'${slug}' has no overlay — nothing to unhide.${RESET}\n`);
		return;
	}
	const ts = (await import('typescript')).default;
	const text = readFileSync(overlayPath, 'utf8');
	const sf = ts.createSourceFile(overlayPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const objLit = findExportedLiteral(ts, sf, ts.isObjectLiteralExpression);
	const suppressProp =
		objLit === null ? null : overlayArrayProp(ts, sf, objLit, 'suppressTags', overlayPath, palette);
	const idx =
		suppressProp === null ? -1 : findStringElementIndex(ts, sf, suppressProp.initializer, label);
	if (idx === -1) {
		process.stdout.write(
			`${YELLOW}'${label}' is not suppressed on '${slug}' — nothing to do.${RESET}\n`
		);
		return;
	}
	const splicedText =
		suppressProp.initializer.elements.length === 1
			? spliceRemoveObjectProperty(text, sf, ts, objLit, 'suppressTags')
			: spliceRemoveElement(text, sf, suppressProp.initializer, idx);
	writeFileSync(overlayPath, splicedText, 'utf8');
	spawnSync('npx', ['prettier', '--write', overlayPath], { stdio: 'ignore' });
	process.stdout.write(
		`${GREEN}${BOLD}Unsuppressed:${RESET} '${label}' on '${slug}'.\n${DIM}Rebuild the site to apply.${RESET}\n`
	);
}

// ---------------------------------------------------------------------------
// theme verb (5DR.21) — alias: collection
//
// Manages the theme territories in themes.ts (id, name, blurb, slugs).
//
//   drift theme list [<id>]
//   drift theme create <id> --name "..." [--blurb "..."] [--slug <s> ...]
//   drift theme edit <id> [--name "..."] [--blurb "..."]
//   drift theme add <id> <slug>
//   drift theme remove <id> <slug>
//   drift theme delete <id>
//
// Write-isolation: writes ONLY themes.ts. `list` writes nothing. Slug
// existence is themes.test.ts's job (same stance as relate targets); the
// CLI validates shape only.
// ---------------------------------------------------------------------------

/** Parses themes.ts for reading or mutation, exiting 1 when missing/malformed. */
async function loadThemesForEdit(palette) {
	const { RED, RESET } = palette;
	const relPath = themesPath.replace(config.repoRoot + '/', '');
	if (!existsSync(themesPath)) {
		process.stderr.write(`${RED}Error: ${relPath} not found.${RESET}\n`);
		process.exit(1);
	}
	const ts = (await import('typescript')).default;
	const text = readFileSync(themesPath, 'utf8');
	const sf = ts.createSourceFile(themesPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const arrayLit = findExportedLiteral(ts, sf, ts.isArrayLiteralExpression);
	if (!arrayLit) {
		process.stderr.write(
			`${RED}Error: could not locate the exported array literal in ${relPath}.${RESET}\n`
		);
		process.exit(1);
	}
	return { ts, text, sf, arrayLit, relPath };
}

/** Writes spliced themes.ts source and prettier-formats it. */
function writeThemes(splicedText) {
	writeFileSync(themesPath, splicedText, 'utf8');
	spawnSync('npx', ['prettier', '--write', themesPath], { stdio: 'ignore' });
}

/**
 * Mode dispatcher for `drift theme` (and its `collection` alias). See the
 * section banner for the grammar.
 *
 * @param {{ args: string[], values: object, palette: object }} options
 */
async function runTheme({ args, values, palette }) {
	const { GREEN, RED, YELLOW, BOLD, DIM, RESET } = palette;
	const usage =
		'Usage:\n' +
		'  drift theme list [<id>]\n' +
		'  drift theme create <id> --name "..." [--blurb "..."] [--slug <s> --slug <s> ...]\n' +
		'  drift theme edit <id> [--name "..."] [--blurb "..."]\n' +
		'  drift theme add <id> <slug>\n' +
		'  drift theme remove <id> <slug>\n' +
		'  drift theme delete <id>\n' +
		"  ('drift collection …' is an alias for every form.)";

	const [action, id, slug] = args;
	const ACTIONS = ['list', 'create', 'edit', 'add', 'remove', 'delete'];
	if (!ACTIONS.includes(action ?? '')) {
		process.stderr.write(
			`${RED}Error: unknown theme action '${action ?? ''}'.\n${usage}${RESET}\n`
		);
		process.exit(1);
	}
	if (action !== 'list' && id === undefined) {
		process.stderr.write(`${RED}Error: missing theme id.\n${usage}${RESET}\n`);
		process.exit(1);
	}
	if (id !== undefined) {
		const idError = validateProjectSlug(id);
		if (idError !== null) {
			process.stderr.write(`${RED}Error: theme ids follow slug rules — ${idError}${RESET}\n`);
			process.exit(1);
		}
	}
	if ((action === 'add' || action === 'remove') && slug === undefined) {
		process.stderr.write(`${RED}Error: missing project slug.\n${usage}${RESET}\n`);
		process.exit(1);
	}
	if (slug !== undefined) {
		const slugError = validateProjectSlug(slug);
		if (slugError !== null) {
			process.stderr.write(`${RED}Error: ${slugError}${RESET}\n`);
			process.exit(1);
		}
	}

	const { ts, text, sf, arrayLit } = await loadThemesForEdit(palette);
	const readTheme = (element) => ({
		id: readRelationshipField(ts, sf, element, 'id'),
		name: readRelationshipField(ts, sf, element, 'name'),
		blurb: readRelationshipField(ts, sf, element, 'blurb'),
		slugs: readArrayField(ts, sf, element, 'slugs') ?? []
	});

	if (action === 'list') {
		const themes = arrayLit.elements
			.filter((el) => ts.isObjectLiteralExpression(el))
			.map((el) => readTheme(el));
		const wanted = id === undefined ? themes : themes.filter((t) => t.id === id);
		if (id !== undefined && wanted.length === 0) {
			process.stderr.write(`${RED}Error: no theme with id '${id}'.${RESET}\n`);
			process.exit(1);
		}
		for (const theme of wanted) {
			process.stdout.write(`${BOLD}${theme.id}${RESET} · ${theme.name}\n`);
			if (theme.blurb) process.stdout.write(`  ${theme.blurb}\n`);
			process.stdout.write(
				`  ${DIM}${theme.slugs.length} project${theme.slugs.length === 1 ? '' : 's'}:${RESET} ${theme.slugs.join(', ')}\n`
			);
		}
		if (id === undefined) process.stdout.write(`${DIM}${themes.length} themes.${RESET}\n`);
		return;
	}

	const found = findElementByStringField(ts, sf, arrayLit, 'id', id);

	if (action === 'create') {
		if (found !== null) {
			process.stderr.write(`${RED}Error: a theme with id '${id}' already exists.${RESET}\n`);
			process.exit(1);
		}
		const name = values.name?.trim();
		if (!name) {
			process.stderr.write(`${RED}Error: theme create requires --name.${RESET}\n`);
			process.exit(1);
		}
		const slugs = values.slug ?? [];
		for (const member of slugs) {
			const memberError = validateProjectSlug(member);
			if (memberError !== null) {
				process.stderr.write(`${RED}Error: --slug '${member}': ${memberError}${RESET}\n`);
				process.exit(1);
			}
		}
		const elementSrc = buildRelationshipLiteral({
			id,
			name,
			blurb: values.blurb?.trim() || '',
			slugs
		});
		writeThemes(spliceElementIntoArray(text, sf, arrayLit, elementSrc));
		if (slugs.length < 2) {
			process.stdout.write(
				`${YELLOW}Note: themes.test.ts expects at least 2 projects per theme; add more with drift theme add.${RESET}\n`
			);
		}
		process.stdout.write(
			`${GREEN}${BOLD}Created:${RESET} theme '${id}' (${slugs.length} project${slugs.length === 1 ? '' : 's'}).\n` +
				`${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
	}

	if (found === null) {
		if (action === 'delete') {
			process.stdout.write(`${YELLOW}No theme with id '${id}' — nothing to delete.${RESET}\n`);
			return;
		}
		process.stderr.write(`${RED}Error: no theme with id '${id}'.${RESET}\n`);
		process.exit(1);
	}

	if (action === 'edit') {
		const newName = values.name?.trim() || undefined;
		const newBlurb = values.blurb?.trim() || undefined;
		if (newName === undefined && newBlurb === undefined) {
			process.stderr.write(
				`${RED}Error: theme edit needs --name and/or --blurb — nothing to change.${RESET}\n`
			);
			process.exit(1);
		}
		// Two sequential single-property splices would go stale; apply the
		// first, then re-locate for the second.
		let workingText = text;
		if (newName !== undefined) {
			({ text: workingText } = spliceObjectProperty(
				workingText,
				sf,
				ts,
				found.element,
				'name',
				JSON.stringify(newName)
			));
			writeThemes(workingText);
		}
		if (newBlurb !== undefined) {
			const fresh = await loadThemesForEdit(palette);
			const relocated = findElementByStringField(fresh.ts, fresh.sf, fresh.arrayLit, 'id', id);
			const { text: blurbed } = spliceObjectProperty(
				fresh.text,
				fresh.sf,
				fresh.ts,
				relocated.element,
				'blurb',
				JSON.stringify(newBlurb)
			);
			writeThemes(blurbed);
		}
		process.stdout.write(
			`${GREEN}${BOLD}Edited:${RESET} theme '${id}'.\n${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
	}

	if (action === 'delete') {
		writeThemes(spliceRemoveElement(text, sf, arrayLit, found.index));
		process.stdout.write(
			`${GREEN}${BOLD}Deleted:${RESET} theme '${id}'.\n${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
	}

	// add / remove a member slug
	const slugsProp = found.element.properties.find(
		(p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'slugs'
	);
	if (!slugsProp || !ts.isArrayLiteralExpression(slugsProp.initializer)) {
		process.stderr.write(
			`${RED}Error: theme '${id}' has no slugs array literal — edit themes.ts by hand.${RESET}\n`
		);
		process.exit(1);
	}
	const memberIndex = findStringElementIndex(ts, sf, slugsProp.initializer, slug);

	if (action === 'add') {
		if (memberIndex !== -1) {
			process.stdout.write(
				`${YELLOW}'${slug}' is already in theme '${id}' — nothing to do.${RESET}\n`
			);
			return;
		}
		writeThemes(spliceElementIntoArray(text, sf, slugsProp.initializer, JSON.stringify(slug)));
		process.stdout.write(
			`${GREEN}${BOLD}Added:${RESET} '${slug}' to theme '${id}'.\n${DIM}Rebuild the site to apply.${RESET}\n`
		);
		return;
	}

	// remove
	if (memberIndex === -1) {
		process.stdout.write(
			`${YELLOW}'${slug}' is not in theme '${id}' — nothing to remove.${RESET}\n`
		);
		return;
	}
	const remaining = slugsProp.initializer.elements.length - 1;
	writeThemes(spliceRemoveElement(text, sf, slugsProp.initializer, memberIndex));
	if (remaining < 2) {
		process.stdout.write(
			`${YELLOW}Note: theme '${id}' now has ${remaining} project${remaining === 1 ? '' : 's'}; themes.test.ts expects at least 2.${RESET}\n`
		);
	}
	process.stdout.write(
		`${GREEN}${BOLD}Removed:${RESET} '${slug}' from theme '${id}'.\n${DIM}Rebuild the site to apply.${RESET}\n`
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
// Alongside the depth tier, every entry also carries a `volatile` array: an
// advisory scan for prose that will drift as the repo moves on (commit
// counts, "in progress", hardcoded dates, model names). Volatile findings
// never affect the tier — they are surfaced for editorial review only.
//
// Write-isolation: writes nothing.
// ---------------------------------------------------------------------------

/** Splits a string on whitespace and counts the non-empty tokens. */
function wordCount(s) {
	return (s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

const TIER_RANK = { Thin: 0, Partial: 1, Full: 2 };
const RANK_TIER = ['Thin', 'Partial', 'Full'];

// ---------------------------------------------------------------------------
// Volatile-prose detection
//
// Advisory only: findings never affect the depth tier. Overlay prose that
// bakes in a number, tense, or date the codebase will outgrow (commit counts,
// "in progress", a hardcoded model name) reads as stale the moment the repo
// moves on. The rubric above scores depth; this scores durability.
// ---------------------------------------------------------------------------

const VOLATILE_PATTERNS = [
	{
		id: 'metric-number',
		// A number that is a percentage, or sits within one word of a
		// churn/metric noun. Proximity keeps unrelated numbers (dimensions,
		// version numbers without the word "version", axis counts) clean.
		re: /\b\d[\d,.]*%|\b\d[\d,.]*\+?\s+(?:\w+\s+)?(?:commits?|lines?|LOC\b|PRs?|packages?|files?|contributors?)\b/i
	},
	{
		id: 'status-tense',
		re: /\b(?:in progress|work in progress|current phase|currently|active development|actively developed|version \d[\d.]*|v\d+\.\d+[\d.]*)\b/i
	},
	{
		id: 'hardcoded-date',
		re: /\b\d{4}-\d{2}(?:-\d{2})?\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/
	},
	{
		id: 'model-name',
		re: /\bgpt-[\w.-]+|\bclaude-[\w.-]+|\bgemini-[\w.-]+/i
	}
];

/** Characters of context kept on each side of a volatile-prose match. */
const VOLATILE_EXCERPT_PAD = 20;

/**
 * Scans one prose string for volatile patterns.
 *
 * @param {string} field  Field name, for the finding's location.
 * @param {string} text
 * @returns {Array<{ field: string, pattern: string, excerpt: string }>}
 */
function findVolatileInText(field, text) {
	if (!text) return [];
	const findings = [];
	for (const { id, re } of VOLATILE_PATTERNS) {
		const match = re.exec(text);
		if (!match) continue;
		const start = Math.max(0, match.index - VOLATILE_EXCERPT_PAD);
		const end = Math.min(text.length, match.index + match[0].length + VOLATILE_EXCERPT_PAD);
		const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
		findings.push({ field, pattern: id, excerpt });
	}
	return findings;
}

/**
 * Scans an overlay's prose fields (description, blurb, tagline, highlights,
 * contribution.contributionNote) for volatile content: numbers or tenses that
 * will drift as the underlying repo moves on. Advisory — never affects the
 * depth tier computed by scoreOverlay.
 *
 * @param {object} o  A loaded overlay object.
 * @returns {Array<{ field: string, pattern: string, excerpt: string }>}
 */
function findVolatileProse(o) {
	const findings = [];
	findings.push(...findVolatileInText('description', o.description));
	findings.push(...findVolatileInText('blurb', o.blurb));
	findings.push(...findVolatileInText('tagline', o.tagline));
	if (Array.isArray(o.highlights)) {
		o.highlights.forEach((h, i) => {
			findings.push(...findVolatileInText(`highlights[${i}]`, h));
		});
	}
	findings.push(...findVolatileInText('contributionNote', o.contribution?.contributionNote));
	return findings;
}

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
			// A well-formed overlay has exactly one slug-bearing export. Taking the first match is
			// safe; a file with no slug-bearing export falls through to the _loadError path below.
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
			volatile: [],
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
		metrics: { words, highlights: hl, isTeam: !!isTeam, hasNote },
		volatile: findVolatileProse(o)
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
	const volatileCount = scored.filter((s) => s.volatile.length > 0).length;
	const authored = scored.length;

	process.stdout.write(
		`${BOLD}drift audit${RESET} · content-depth proxy\n` +
			`${summary.Thin} Thin · ${summary.Partial} Partial · ${summary.Full} Full · ${authored} authored\n`
	);
	if (borderlineCount > 0) {
		process.stdout.write(
			`${DIM}${borderlineCount} entr${borderlineCount === 1 ? 'y' : 'ies'} flagged for manual review.${RESET}\n`
		);
	}
	if (volatileCount > 0) {
		process.stdout.write(
			`${DIM}${volatileCount} entr${volatileCount === 1 ? 'y' : 'ies'} with volatile prose (advisory).${RESET}\n`
		);
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
					: null,
				s.volatile.length > 0 ? `${s.volatile.length} volatile` : null
			]
				.filter(Boolean)
				.join(' · ');
			process.stdout.write(`  ${BOLD}${s.slug}${RESET}${marker}  ${DIM}${axisDetail}${RESET}\n`);
			for (const v of s.volatile) {
				process.stdout.write(`      ${DIM}${v.field}: "${v.excerpt}" (${v.pattern})${RESET}\n`);
			}
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
	const volatileCount = scored.filter((s) => s.volatile.length > 0).length;

	// Machine-readable mode: emit structured JSON and return.
	if (json) {
		process.stdout.write(
			JSON.stringify(
				{ summary: { ...summary, volatile: volatileCount }, entries: scored },
				null,
				2
			) + '\n'
		);
		return;
	}

	// gum markdown rendering path.
	if (useGum && process.stdout.isTTY) {
		const authored = scored.length;
		const borderlineNote =
			borderlineCount > 0
				? `\n_${borderlineCount} entr${borderlineCount === 1 ? 'y' : 'ies'} flagged for manual review (⚠)._`
				: '';
		const volatileNote =
			volatileCount > 0
				? `\n_${volatileCount} entr${volatileCount === 1 ? 'y' : 'ies'} with volatile prose (advisory)._`
				: '';

		let md = `# drift audit · content-depth proxy\n\n`;
		md += `${summary.Thin} Thin · ${summary.Partial} Partial · ${summary.Full} Full · ${authored} authored${borderlineNote}${volatileNote}\n`;

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
						: null,
					s.volatile.length > 0 ? `${s.volatile.length} volatile` : null
				]
					.filter(Boolean)
					.join(' · ');
				md += `- \`${s.slug}\`${marker} — ${axisDetail}\n`;
				for (const v of s.volatile) {
					md += `  - ${v.field}: "${v.excerpt}" (${v.pattern})\n`;
				}
			}
		}

		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], {
			input: md,
			encoding: 'utf8'
		});
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
		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], {
			input: md,
			encoding: 'utf8'
		});
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
- \`drift sync [<slug>...] [--dry-run]\`
- \`drift keep <slug> <field>\`
- \`drift keep --all-projects <field>\`
- \`drift keep-all\`
- \`drift hide <slug>\`
- \`drift promote <slug> [field]\`
- \`drift author <slug> [<field> [<value>]]\`
- \`drift flag <slug> --pin | --hide\`
- \`drift relate project <source-slug> <kind> <target-slug> [--note "..."]\`
- \`drift relate tech <source-label> <kind> <target-label> [--note "..."]\`
- \`drift tech list|set|hide|unhide <label> [...]\`
- \`drift tag list|add|hide|unhide <slug> [<label>] [--kind <tag-kind>]\`
- \`drift theme list|create|edit|add|remove|delete <id> [...]\` (alias: \`collection\`)
- \`drift audit [--json]\`
- \`drift init\`

## Verbs

- \`report\` · compare synced fingerprints to current git state (default); shows only deltas
- \`snapshot\` · show ALL current metrics for every project, colourised changed vs unchanged
- \`sync\` · rewrite sources.json with current fingerprints
- \`keep\` · keep your manual override value, refreshing its synced baseline to dismiss the flag
- \`keep-all\` · refresh every flagged override baseline at once
- \`hide\` · append a slug to excluded.json, removing it from the public site
- \`promote\` · graduate a landed in-progress entry out of in-progress.json (syncs into sources.json on the next \`drift sync\`)
- \`author\` · scaffold src/lib/data/projects/\<slug\>.ts and open in \$EDITOR; with a field name, set one scalar field in place (name, tagline, blurb, description, kind, status, liveUrl)
- \`flag\` · set pin: true or hide: true in the slug's overlay (creating it if absent)
- \`relate\` · author a project↔project or tech↔tech relationship edge
- \`tech\` · author per-tech overlays: first-used date, modal note, kind override, surface visibility
- \`tag\` · add a tech to, or suppress one from, a single project's tags
- \`theme\` · manage the theme territories (collections) on /toolkit
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

Pass one or more slugs to restrict the update to those repos only.

\`--dry-run\` previews the exact field-level changes for each resolvable repo
(including which fields would be preserved because git returned no value)
and writes nothing. Use it to check what a sync would do before committing.

\`--full\` is accepted for symmetry but is a no-op: sync already covers all
resolvable repos regardless of HEAD movement.

In an interactive terminal with gum installed, drift will ask for confirmation
before writing.

## Usage

\`\`\`
drift sync
drift sync <slug>              # scope to one repo
drift sync <slug> <slug2>      # scope to several repos
drift sync --dry-run           # preview only, writes nothing
drift sync --full              # accepted; no-op
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

	promote: `# drift promote · graduate a landed in-progress entry

Removes an entry (or a single tracked field) from \`in-progress.json\` once its
branch has merged into the default branch. Writes ONLY in-progress.json.

The tracked value then graduates into \`sources.json\` automatically on the next
\`drift sync\`: with the branch merged, \`getFingerprint\` (which measures the
default branch) picks up the higher counts with no manual edit to sources.json.

Pass a \`field\` to promote just that one tracked field; omit it to promote the
whole entry. Warns (and no-ops) when the slug is not in in-progress.json.

## Usage

\`\`\`
drift promote <slug>
drift promote <slug> <field>
\`\`\`

## Examples

\`\`\`
drift promote lyra-rose
drift promote lyra-rose commitsMine
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

	flag: `# drift flag · set a curation flag on a project overlay

Sets \`pin: true\` or \`hide: true\` in \`src/lib/data/projects/<slug>.ts\`.
If the overlay does not exist, creates it from the standard template first.
Idempotent: no-op when the flag is already set to true.

Both flags live only in the authored overlay, never in any of the four JSON
data files.

- \`--pin\` · float the project to the top of the home-page hero pool above
  all score-ranked entries
- \`--hide\` · exclude the project from the hero pool entirely (it remains
  visible everywhere else on the site)

Exactly one of \`--pin\` or \`--hide\` must be given. Passing both is an error.

## Usage

\`\`\`
drift flag <slug> --pin
drift flag <slug> --hide
\`\`\`

## Examples

\`\`\`
drift flag iris --pin
drift flag lyra-rose --pin
drift flag kitchen-gremlin --hide
\`\`\``,

	tech: `# drift tech · author per-tech overlays and visibility

Manages \`src/lib/data/tech-overlays.ts\`, the single authoring surface for
per-tech data, via the same TypeScript-compiler splices \`relate\` uses.
Labels are case-insensitive and resolve to canonical tag casing.

- \`drift tech list [<label>]\` · every canonical tag label with its overlay
  state (first-used date, note, kind override, hidden surfaces); with a
  label, full detail for one tech. Writes nothing.
- \`drift tech set <label> [--first-used YYYY-MM-DD] [--note "..."] [--kind <tag-kind>]\`
  · upserts overlay fields. \`--first-used\` is a FLOOR date (a derived date
  at or before it wins on the timeline); \`--note\` shows in the toolkit
  modal; \`--kind\` overrides the tag's kind everywhere. At least one flag
  is required.
- \`drift tech hide <label> [--from toolkit,map,stack,relate]\` · hides the
  label from the given aggregate surfaces (all four when \`--from\` is
  omitted). Project detail chips are never hidden — that would misrepresent
  individual projects.
- \`drift tech unhide <label> [--from ... | --all]\` · reverses hide; a
  record reduced to a bare label is removed entirely. Tolerates unknown
  labels so stale records stay cleanable.

Write-isolation: writes ONLY tech-overlays.ts.
`,

	tag: `# drift tag · per-project tech tags

Adds a tech to, or suppresses one from, ONE project's tags, writing only
\`src/lib/data/projects/<slug>.ts\` (created from the template when absent).

- \`drift tag list <slug>\` · inferred, authored, suppressed and effective
  labels for one project. Writes nothing.
- \`drift tag add <slug> <label> [--kind <tag-kind>]\` · appends an authored
  tag. A known label resolves case-insensitively and infers its kind; an
  UNKNOWN label requires \`--kind\` — this is the one sanctioned entry point
  for a brand-new label. Also lifts any suppression of the same label.
- \`drift tag hide <slug> <label>\` · appends to \`suppressTags\`, dropping
  the label from the merged list whether inferred or authored. Suppressing
  a label the project does not yet infer is allowed (it waits).
- \`drift tag unhide <slug> <label>\` · removes the suppression; missing
  overlay or entry is a soft no-op.
`,

	theme: `# drift theme · manage the theme territories (collections)

Manages \`src/lib/data/themes.ts\` — the authored project groupings rendered
on /toolkit as "Themes the work returns to". \`drift collection …\` is an
alias for every form.

- \`drift theme list [<id>]\` · every theme with blurb and members. Writes nothing.
- \`drift theme create <id> --name "..." [--blurb "..."] [--slug <s> --slug <s> ...]\`
  · appends a new theme. Ids follow slug rules and must be unique; fewer
  than two members triggers an advisory (themes.test.ts enforces ≥2).
- \`drift theme edit <id> [--name "..."] [--blurb "..."]\` · in-place field edit.
- \`drift theme add <id> <slug>\` / \`drift theme remove <id> <slug>\` ·
  membership changes; slug EXISTENCE is themes.test.ts's job, shape only here.
- \`drift theme delete <id>\` · removes the theme; a missing id is a soft no-op.

Write-isolation: writes ONLY themes.ts.
`,

	relate: `# drift relate · author a relationship edge

Appends a relationship to a .ts file by splicing into it with the TypeScript
compiler API — the same technique \`flag\` uses to set overlay flags — so no
existing field or comment is disturbed. Idempotent: re-relating an identical
edge is a no-op.

Two modes:

- \`drift relate project <source-slug> <kind> <target-slug>\` appends a
  \`ProjectRelationship\` to \`relationships: [...]\` in
  \`src/lib/data/projects/<source-slug>.ts\`, creating the overlay from the
  standard template first if it does not exist. Kind is one of:
  \`extracted-from\`, \`powers\`, \`related\`.
- \`drift relate tech <source-label> <kind> <target-label>\` appends a
  \`TechRelationship\` to the exported array in \`src/lib/data/tech-relationships.ts\`.
  Kind is one of: \`leads-to\`, \`replaced-by\`.

\`--note "..."\` attaches a free-text note to the edge; omit it to leave the
edge unannotated.

The positional \`<source> <kind> <target>\` always LOCATES which edge you
mean — for add that's the edge to create; for \`--remove\`/\`--edit\` that's
the edge to find, not something you're setting.

- \`--remove\` deletes the located edge. A missing overlay or missing edge is
  a soft no-op (nothing to remove is not an error), never scaffolds an
  overlay just to remove from it.
- \`--edit\` changes an existing edge's \`kind\` and/or \`note\` in place.
  \`--kind <new-kind>\` supplies the new kind (validated against the same
  kind union as the locator); \`--note "..."\` supplies the new note.
  At least one of \`--kind\`/\`--note\` is required — editing nothing is a
  usage error. Unlike remove, editing an edge that does not exist IS an
  error (there is nothing sensible to edit into). \`--remove\` and \`--edit\`
  are mutually exclusive.

Validation is structural only — kind union, non-self-edge, slug shape for
project mode. Target existence and tag-label correctness are NOT checked
here: \`data.test.ts\` already fails the build on a dangling relationship
target, and \`tech-relationships.test.ts\` already fails on an unknown tag
label, exactly as those tests already gate hand-edited files.

\`powers\` and \`extracted-from\` are meant to be authored as a matching pair
(one side on each project). After adding, removing, or kind-editing one
side, \`relate\` prints the reciprocal command as a reminder — it never
writes both files itself. A note-only edit never triggers this, since notes
are not part of the pairing contract.

Write-isolation: writes exactly one of \`projects/<slug>.ts\` or
\`tech-relationships.ts\` per invocation. Never touches any JSON data file.

## Usage

\`\`\`
drift relate project <source-slug> <kind> <target-slug> [--note "..."]
drift relate project <source-slug> <kind> <target-slug> --remove
drift relate project <source-slug> <kind> <target-slug> --edit [--kind <new-kind>] [--note "..."]
drift relate tech "<source-label>" <kind> "<target-label>" [--note "..."]
drift relate tech "<source-label>" <kind> "<target-label>" --remove
drift relate tech "<source-label>" <kind> "<target-label>" --edit [--kind <new-kind>] [--note "..."]
\`\`\`

## Examples

\`\`\`
drift relate project nib powers the-work --note "Extracted runtime."
drift relate project the-work extracted-from nib
drift relate project nib powers the-work --remove
drift relate project nib powers the-work --edit --kind related
drift relate tech "Node.js" replaced-by Bun --note "Speed and built-in tooling."
drift relate tech Deno leads-to Oak
drift relate tech Deno leads-to Oak --edit --note "Updated rationale."
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

Each entry also carries an **advisory** volatile-prose scan: description,
blurb, tagline, highlights, and the team contribution note are checked for
content that will drift as the repo moves on — commit/line/PR counts,
percentages, status-tense phrases ("in progress", "current phase"),
hardcoded dates, and model names. Volatile findings never affect the tier;
they are a prompt to rewrite, not a verdict.

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
		const out = spawnSync('gum', ['format', '--theme', config.theme.markdownTheme], {
			input: md,
			encoding: 'utf8'
		});
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
  drift sync [<slug>...] [--dry-run]
  drift keep <slug> <field>
  drift keep --all-projects <field>
  drift keep-all
  drift hide <slug>
  drift promote <slug> [field]
  drift author <slug> [<field> [<value>]]
  drift flag <slug> --pin | --hide
  drift relate project <source-slug> <kind> <target-slug> [--note "..."]
  drift relate tech <source-label> <kind> <target-label> [--note "..."]
  drift tech list|set|hide|unhide <label> [...]
  drift tag list|add|hide|unhide <slug> [<label>] [--kind <tag-kind>]
  drift theme list|create|edit|add|remove|delete <id> [...]
  drift audit [--json]
  drift init

${BOLD}Verbs:${RESET}
  report      Compare synced fingerprints to current git state (default). Shows only deltas.
  snapshot    Show ALL current metrics for every project, colourised changed vs unchanged.
  sync        Rewrite sources.json with current fingerprints.
  keep        Keep your manual override value, refreshing its baseline to dismiss the flag.
  keep-all    Refresh every flagged override baseline at once.
  hide        Append a slug to excluded.json, removing it from the public site.
  promote     Graduate a landed in-progress entry out of in-progress.json.
  author      Scaffold projects/<slug>.ts from a template, then open in $EDITOR.
  flag        Set pin: true or hide: true in the slug's overlay (creating it if absent).
  relate      Author a project↔project or tech↔tech relationship edge.
  tech        Author per-tech overlays: date, note, kind override, visibility.
  tag         Add a tech to, or suppress one from, a single project's tags.
  theme       Manage the theme territories (collections). Alias: collection.
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

${DIM}Pass one or more slugs to restrict the update to those repos only.
Pass --dry-run to preview field changes without writing.
--full is accepted for symmetry but is a no-op: sync already covers all
resolvable repos. In an interactive terminal with gum, drift asks for
confirmation before writing.${RESET}

  Usage: drift sync [<slug>...] [--dry-run]`,

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

		promote: `${BOLD}drift promote <slug> [field]${RESET} - graduate a landed in-progress entry

Removes an entry (or one tracked field) from in-progress.json once its branch
has merged. Writes in-progress.json only.

${DIM}The value graduates into sources.json automatically on the next drift sync.
Warns and no-ops when the slug is not in in-progress.json.${RESET}

  Usage:   drift promote <slug>
           drift promote <slug> <field>
  Example: drift promote lyra-rose
           drift promote lyra-rose commitsMine`,

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

		flag: `${BOLD}drift flag <slug> --pin | --hide${RESET} - set a curation flag on a project overlay

Sets pin: true or hide: true in projects/<slug>.ts. Creates the overlay from
the standard template if it does not exist. Idempotent when the flag is
already set to true. Exactly one of --pin or --hide is required.

  --pin   Float the project to the top of the home-page hero pool.
  --hide  Exclude the project from the hero pool (still visible elsewhere).

${DIM}Both flags live only in the authored overlay, never in any JSON data file.
Rebuild the site to apply.${RESET}

  Usage:   drift flag <slug> --pin
           drift flag <slug> --hide
  Example: drift flag iris --pin
           drift flag kitchen-gremlin --hide`,

		tech: `${BOLD}drift tech${RESET} - author per-tech overlays and visibility

${BOLD}Usage:${RESET}
  drift tech list [<label>]
  drift tech set <label> [--first-used YYYY-MM-DD] [--note "..."] [--kind <tag-kind>]
  drift tech hide <label> [--from toolkit,map,stack,relate]
  drift tech unhide <label> [--from ... | --all]

Manages src/lib/data/tech-overlays.ts: first-used floor dates, the note
shown in the toolkit modal, kind overrides and per-surface visibility.
Labels are case-insensitive and resolve to canonical tag casing. hide
without --from hides from all four surfaces; project detail chips are
never hidden. Writes ONLY tech-overlays.ts.
`,

		tag: `${BOLD}drift tag${RESET} - per-project tech tags

${BOLD}Usage:${RESET}
  drift tag list <slug>
  drift tag add <slug> <label> [--kind <tag-kind>]
  drift tag hide <slug> <label>
  drift tag unhide <slug> <label>

add appends an authored tag (unknown labels require --kind and become the
entry point for new labels; adding lifts any suppression). hide appends to
suppressTags, dropping the label from the merged list whether inferred or
authored. Writes ONLY projects/<slug>.ts.
`,

		theme: `${BOLD}drift theme${RESET} - manage the theme territories (collections)

${BOLD}Usage:${RESET}
  drift theme list [<id>]
  drift theme create <id> --name "..." [--blurb "..."] [--slug <s> --slug <s> ...]
  drift theme edit <id> [--name "..."] [--blurb "..."]
  drift theme add <id> <slug>
  drift theme remove <id> <slug>
  drift theme delete <id>

Manages src/lib/data/themes.ts, the groupings on /toolkit. 'drift
collection' is an alias for every form. Ids follow slug rules; slug
existence stays themes.test.ts's job. Writes ONLY themes.ts.
`,

		relate: `${BOLD}drift relate${RESET} - author a relationship edge

Appends a relationship by splicing into a .ts file with the TypeScript
compiler API, the same technique flag uses. Idempotent: an identical edge
is a no-op.

  project mode  Appends a ProjectRelationship to relationships: [...] in
                projects/<source-slug>.ts, creating the overlay first if
                absent. kind: extracted-from | powers | related
  tech mode     Appends a TechRelationship to the exported array in
                tech-relationships.ts. kind: leads-to | replaced-by

  --remove      Deletes the edge located by <source> <kind> <target>. A
                missing overlay/edge is a soft no-op, never an error.
  --edit        Changes an existing edge's kind and/or note in place, via
                --kind <new-kind> and/or --note "...". Needs at least one;
                editing a nonexistent edge IS an error. Mutually exclusive
                with --remove.

${DIM}Validation is structural only (kind, non-self-edge, slug shape) — target
existence and tag-label correctness are already gated by data.test.ts and
tech-relationships.test.ts. After add/remove/kind-edit of a powers or
extracted-from edge, relate prints the reciprocal command as a reminder; a
note-only edit never does. Writes one file per call, never a JSON file.${RESET}

  Usage:   drift relate project <source-slug> <kind> <target-slug> [--note "..."]
           drift relate project <source-slug> <kind> <target-slug> --remove
           drift relate project <source-slug> <kind> <target-slug> --edit [--kind <new-kind>] [--note "..."]
           drift relate tech "<source-label>" <kind> "<target-label>" [--note "..."]
  Example: drift relate project nib powers the-work --note "Extracted runtime."
           drift relate project nib powers the-work --remove
           drift relate tech "Node.js" replaced-by Bun --edit --note "Updated."`,

		audit: `${BOLD}drift audit${RESET} - score every authored overlay against the depth rubric

Reads every projects/*.ts overlay and reports a mechanical-proxy tier:
  Full    description >= 80w, >= 4 highlights, team note present
  Partial description 40-79w or 3 highlights (or team note present but generic)
  Thin    description < 40w or <= 2 highlights or team note missing

Final tier is the worst axis. Full requires all axes Full.
Entries near a threshold are flagged for manual review.

Each entry also carries an advisory volatile-prose scan (commit/line/PR
counts, percentages, "in progress"-style tense, hardcoded dates, model
names). Volatile findings never affect the tier.

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

	// Shared "pick a slug from the manifest, or free-text fallback when there
	// are no candidates" prompt — collapses what used to be five near-identical
	// copies (hide/author/flag, plus relate's two project-mode slug steps).
	// Returns the chosen slug, or null if the user escaped (Esc/Ctrl-C).
	const pickSlug = (headerText, placeholder, filter) => {
		const all = Object.keys(manifests.manifest.sources).sort();
		const candidates = filter ? all.filter(filter) : all;
		if (candidates.length > 0) {
			const slugItems = candidates.map((s) => `${s}:${s}`);
			const pick = spawnSync(
				'gum',
				[
					'choose',
					'--label-delimiter=:',
					`--header=${headerText}`,
					'--cursor=> ',
					`--cursor.foreground=${BRAND_PRIMARY}`,
					`--selected.foreground=${BRAND_PRIMARY}`,
					`--item.foreground=${BRAND_ACCENT}`,
					...slugItems
				],
				{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
			);
			if (pick.status !== 0 || !pick.stdout.trim()) return null;
			return pick.stdout.trim();
		}
		// Fallback: free-text input when there are no candidates to pick from.
		const input = spawnSync('gum', ['input', '--placeholder', placeholder], {
			stdio: ['inherit', 'pipe', 'inherit'],
			encoding: 'utf8'
		});
		if (input.status !== 0 || !input.stdout.trim()) return null;
		return input.stdout.trim();
	};

	// Always-list-and-offer-to-create prompt for relate's add flow. Unlike
	// pickSlug (which only falls back to free-text when there are zero
	// candidates), this always shows the full alphabetised candidate list
	// with a pinned "Create a new <kind>" option first — the picker itself
	// never validates (an existing candidate is valid by definition), but
	// the create-new free-text path loops on invalid input rather than
	// silently proceeding or aborting the whole wizard: gum input has no
	// --validate flag, so this hand-rolls the retry in JS.
	// Returns the chosen/typed value, or null if the user escaped at any point.
	const pickOrCreate = (headerText, candidates, createLabel, createPlaceholder, validate) => {
		const sorted = [...new Set(candidates)].sort();
		const items = [`${createLabel}:__create__`, ...sorted.map((c) => `${c}:${c}`)];
		const pick = spawnSync(
			'gum',
			[
				'choose',
				'--label-delimiter=:',
				`--header=${headerText}`,
				'--cursor=> ',
				`--cursor.foreground=${BRAND_PRIMARY}`,
				`--selected.foreground=${BRAND_PRIMARY}`,
				`--item.foreground=${BRAND_ACCENT}`,
				...items
			],
			{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
		);
		if (pick.status !== 0 || !pick.stdout.trim()) return null;
		const chosen = pick.stdout.trim();
		if (chosen !== '__create__') return chosen; // an existing entry — always valid

		// Create-new path: retry the SAME free-text prompt on invalid input,
		// rather than aborting the wizard or silently accepting bad data.
		while (true) {
			const input = spawnSync('gum', ['input', '--placeholder', createPlaceholder], {
				stdio: ['inherit', 'pipe', 'inherit'],
				encoding: 'utf8'
			});
			if (input.status !== 0) return null; // Ctrl-C aborts
			const typed = input.stdout.trim();
			if (!typed) return null; // empty Enter also aborts, matching pickSlug's convention
			const error = validate(typed);
			if (error === null) return typed;
			console.log(`⚠ ${error}`);
			// loop: re-show this same create-new prompt, not the picker above it.
		}
	};

	/**
	 * Labelled single pick: rows are [visible label, description, value];
	 * returns the value, or null on Esc/empty. The flag picker's idiom,
	 * extracted for the taxonomy wizards.
	 */
	const choosePlain = (headerText, rows) => {
		const pick = spawnSync(
			'gum',
			[
				'choose',
				'--label-delimiter=:',
				`--header=${headerText}`,
				'--cursor=> ',
				`--cursor.foreground=${BRAND_PRIMARY}`,
				`--selected.foreground=${BRAND_PRIMARY}`,
				`--item.foreground=${BRAND_ACCENT}`,
				...rows.map(([label, desc, value]) =>
					desc ? `${label}  ${desc}:${value}` : `${label}:${value}`
				)
			],
			{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
		);
		if (pick.status !== 0 || !pick.stdout.trim()) return null;
		return pick.stdout.trim();
	};

	/** Plain string pick over verbatim items; null on Esc/empty. */
	const chooseString = (headerText, items) => {
		const pick = spawnSync(
			'gum',
			[
				'choose',
				`--header=${headerText}`,
				'--cursor=> ',
				`--cursor.foreground=${BRAND_PRIMARY}`,
				`--selected.foreground=${BRAND_PRIMARY}`,
				...items
			],
			{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
		);
		if (pick.status !== 0 || !pick.stdout.trim()) return null;
		return pick.stdout.trim();
	};

	/** Free-text prompt; null on Ctrl-C or empty Enter. */
	const promptText = (placeholder) => {
		const input = spawnSync('gum', ['input', '--placeholder', placeholder], {
			stdio: ['inherit', 'pipe', 'inherit'],
			encoding: 'utf8'
		});
		if (input.status !== 0) return null;
		return input.stdout.trim() || null;
	};

	// Menu rows grouped by theme so no single gum choose list is ever long
	// enough to need scrolling (max 5 items per section, 6 sections). Each
	// row is [visible name, description, return value]; descriptions must be
	// colon-free (label-delimiter splits on ':'). Sections are a presentation
	// grouping only — the dispatch switch below is still keyed on the flat
	// return value, unchanged in shape from the original single-list menu.
	const sections = [
		{
			section: 'Inspect',
			header: 'DRIFT · Inspect',
			rows: [
				['Report', 'Show repos whose metrics drifted since last sync', 'report'],
				[
					'Report (full scan)',
					'Per-field drift across every repo, not just moved HEADs',
					'report-full'
				],
				['Snapshot', 'Every current metric value, changed fields highlighted', 'snapshot'],
				['Audit', 'Score every authored overlay against the depth rubric', 'audit']
			]
		},
		{
			section: 'Reconcile',
			header: 'DRIFT · Reconcile',
			rows: [
				['Sync', 'Rewrite sources.json with current git fingerprints', 'sync'],
				['Promote', 'Graduate a landed in-progress entry out of in-progress.json', 'promote'],
				['Keep override', 'Keep your pinned value, dismiss one drift flag', 'keep'],
				[
					'Keep field everywhere',
					"Keep one field's value, dismiss its flag on every project",
					'keep-all-projects'
				],
				['Keep all', 'Keep every pinned value, dismiss all drift flags at once', 'keep-all']
			]
		},
		{
			section: 'Curate',
			header: 'DRIFT · Curate',
			rows: [
				['Author', 'Scaffold a project overlay and open it in your editor', 'author'],
				['Edit field', 'Set one overlay field without opening an editor', 'author-edit'],
				['Relate', 'Author a project or tech relationship edge', 'relate'],
				['Flag', 'Pin a project to the hero pool or hide it from there', 'flag'],
				['Hide', 'Append a slug to excluded.json, removing it from the site', 'hide']
			]
		},
		{
			section: 'Taxonomy',
			header: 'DRIFT · Taxonomy',
			rows: [
				['Tech list', 'Every tech tag with its overlay and visibility state', 'tech-list'],
				['Tech overlay', 'Author a first-used date, note, or kind override', 'tech-set'],
				['Tech visibility', 'Hide or unhide a tech per surface', 'tech-visibility'],
				['Project tags', 'Add a tech to, or hide one from, a single project', 'tag'],
				['Themes', 'Manage the theme collections on the toolkit page', 'theme']
			]
		},
		{
			section: 'Configure',
			header: 'DRIFT · Configure',
			rows: [['Init', 'Scaffold drift.config.ts and sources.local.json for this machine', 'init']]
		},
		{
			section: 'Help',
			header: 'DRIFT · Help',
			rows: [['Help', 'Show the command reference', 'help']]
		}
	];

	// Redraw the surface: clear the terminal, then reprint the wordmark at the
	// top. gum renders each picker on stderr and, when a pick is confirmed or
	// cancelled empty, leaves a "nothing selected" diagnostic stranded in
	// scrollback. Clearing before every picker layer wipes that debris so the
	// menu always reads as one clean surface rather than an accreting stack.
	const redraw = () => {
		// ANSI: cursor home + clear screen + clear scrollback.
		process.stdout.write('\x1b[H\x1b[2J\x1b[3J');
		printWordmark();
	};

	redraw();

	outer: while (true) {
		redraw();
		const sectionChoose = spawnSync(
			'gum',
			[
				'choose',
				'--header=DRIFT · choose a category',
				'--cursor=> ',
				`--cursor.foreground=${BRAND_PRIMARY}`,
				`--selected.foreground=${BRAND_PRIMARY}`,
				`--item.foreground=${BRAND_ACCENT}`,
				...sections.map((s) => s.section)
			],
			{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
		);
		// Esc/Ctrl-C at the top level exits the whole menu.
		if (sectionChoose.status !== 0 || !sectionChoose.stdout.trim()) return;

		const section = sections.find((s) => s.section === sectionChoose.stdout.trim());
		if (!section) continue outer; // defensive — should be unreachable

		// Pad names to this section's own width so descriptions align.
		const nameWidth = Math.max(...section.rows.map(([n]) => n.length));
		const items = section.rows.map(
			([name, desc, value]) => `${name.padEnd(nameWidth + 3)}${desc}:${value}`
		);

		const choose = spawnSync(
			'gum',
			[
				'choose',
				'--label-delimiter=:',
				`--header=${section.header}`,
				'--cursor=> ',
				`--cursor.foreground=${BRAND_PRIMARY}`,
				`--selected.foreground=${BRAND_PRIMARY}`,
				`--item.foreground=${BRAND_ACCENT}`,
				...items
			],
			{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
		);
		// Esc/Ctrl-C at this layer returns to the section picker (a "back"
		// gesture gum's flat choose has no native equivalent for).
		if (choose.status !== 0 || !choose.stdout.trim()) continue outer;

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
				if (pick.status !== 0 || !pick.stdout.trim()) continue outer;
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
				if (pick.status !== 0 || !pick.stdout.trim()) continue outer;
				const chosenField = pick.stdout.trim();
				runAccept({ result, args: [chosenField], acceptAll: false, allProjects: true, palette });
				break;
			}
			case 'hide': {
				// Offer the non-excluded manifest keys as candidates.
				const { excludedSlugs: currentExcluded } = loadExcluded();
				const manifest = manifests.manifest;
				const chosenSlug = pickSlug(
					'Choose a slug to hide:',
					'slug to hide',
					(s) => !currentExcluded.has(s)
				);
				if (chosenSlug === null) continue outer;
				runExclude({ args: [chosenSlug], manifest, palette });
				break;
			}
			case 'author': {
				const chosenSlug = pickSlug('Choose a slug to author:', 'project slug');
				if (chosenSlug === null) continue outer;
				await runAuthor({ args: [chosenSlug], palette, useGum });
				break;
			}
			case 'author-edit': {
				const chosenSlug = pickSlug('Choose a slug to edit:', 'project slug');
				if (chosenSlug === null) continue outer;
				const field = chooseString('Which field?', AUTHOR_EDITABLE_FIELDS);
				if (field === null) continue outer;
				const allowed = AUTHOR_FIELD_ENUMS[field];
				const value = allowed
					? chooseString(`New ${field}:`, allowed)
					: promptText(`${field} value`);
				if (value === null) continue outer;
				await runAuthor({ args: [chosenSlug, field, value], palette });
				break;
			}
			case 'tech-list':
				await runTech({ args: ['list'], values: {}, palette });
				break;
			case 'tech-set': {
				const labels = [
					...(await buildTechLabelIndex({ includeRelateHidden: true })).values()
				].sort((a, b) => a.localeCompare(b));
				const label = pickOrCreate(
					'Tech label:',
					labels,
					'Create a new tech label',
					'tech label, e.g. Bun',
					() => null // labels are free-text; canonical resolution happens in runTech
				);
				if (label === null) continue outer;
				const field = choosePlain('Which field?', [
					['First used', 'Floor adoption date, YYYY-MM-DD', 'first-used'],
					['Note', 'One sentence shown in the toolkit modal', 'note'],
					['Kind override', 'Reclassify the tag everywhere', 'kind']
				]);
				if (field === null) continue outer;
				const value =
					field === 'kind'
						? chooseString('New kind:', [...TECH_TAG_KINDS])
						: promptText(field === 'first-used' ? 'YYYY-MM-DD' : 'note text');
				if (value === null) continue outer;
				await runTech({ args: ['set', label], values: { [field]: value }, palette });
				break;
			}
			case 'tech-visibility': {
				const labels = [
					...(await buildTechLabelIndex({ includeRelateHidden: true })).values()
				].sort((a, b) => a.localeCompare(b));
				const label = chooseString('Tech label:', labels);
				if (label === null) continue outer;
				const action = choosePlain('Hide or unhide?', [
					['Hide', 'Remove from the chosen surfaces', 'hide'],
					['Unhide', 'Restore on the chosen surfaces', 'unhide']
				]);
				if (action === null) continue outer;
				// Multi-select over the four surfaces; empty selection means all.
				const surfacesPick = spawnSync(
					'gum',
					[
						'choose',
						'--no-limit',
						'--header=Surfaces (space to toggle; none selected = all):',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						...TECH_SURFACES
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (surfacesPick.status !== 0) continue outer;
				const surfaces = surfacesPick.stdout
					.split('\n')
					.map((s) => s.trim())
					.filter((s) => s.length > 0)
					.join(',');
				await runTech({
					args: [action, label],
					values: { from: surfaces || undefined },
					palette
				});
				break;
			}
			case 'tag': {
				// Dual entry: the same add/hide/unhide flow is reachable from
				// either end of the project/tech boundary.
				const route = choosePlain('Start from…', [
					['A project', 'Pick the project first', 'project'],
					['A technology', 'Pick the tech first', 'tech']
				]);
				if (route === null) continue outer;

				const pickLabel = async () => {
					const labels = [
						...(await buildTechLabelIndex({ includeRelateHidden: true })).values()
					].sort((a, b) => a.localeCompare(b));
					return pickOrCreate(
						'Tech label:',
						labels,
						'Create a new tech label',
						'tech label, e.g. Bun',
						() => null
					);
				};

				let chosenSlug = null;
				let label = null;
				if (route === 'project') {
					chosenSlug = pickSlug('Project:', 'project slug');
					if (chosenSlug === null) continue outer;
				} else {
					label = await pickLabel();
					if (label === null) continue outer;
				}
				const action = choosePlain('Tag action:', [
					['Add', 'Add an authored tech tag', 'add'],
					['Hide', 'Suppress the tag on this project', 'hide'],
					['Unhide', 'Lift a suppression', 'unhide']
				]);
				if (action === null) continue outer;
				if (chosenSlug === null) {
					chosenSlug = pickSlug('Project:', 'project slug');
					if (chosenSlug === null) continue outer;
				}
				if (label === null) {
					label = await pickLabel();
					if (label === null) continue outer;
				}
				// A brand-new label being added needs a kind up front.
				const tagValues = {};
				if (action === 'add') {
					const index = await buildTechLabelIndex({ includeRelateHidden: true });
					if (!index.has(label.toLowerCase())) {
						const kind = chooseString(`Kind for new label '${label}':`, [...TECH_TAG_KINDS]);
						if (kind === null) continue outer;
						tagValues.kind = kind;
					}
				}
				await runTag({ args: [action, chosenSlug, label], values: tagValues, palette });
				break;
			}
			case 'theme': {
				const action = choosePlain('Themes — what to do?', [
					['List', 'Show every theme with its members', 'list'],
					['Create', 'Author a new theme', 'create'],
					['Edit', 'Change a theme name or blurb', 'edit'],
					['Add project', 'Put a project into a theme', 'add'],
					['Remove project', 'Take a project out of a theme', 'remove'],
					['Delete', 'Remove a whole theme', 'delete']
				]);
				if (action === null) continue outer;

				if (action === 'list') {
					await runTheme({ args: ['list'], values: {}, palette });
					break;
				}

				const { ts, sf, arrayLit } = await loadThemesForEdit(palette);
				const themeRows = arrayLit.elements
					.filter((el) => ts.isObjectLiteralExpression(el))
					.map((el) => ({
						id: readRelationshipField(ts, sf, el, 'id'),
						slugs: readArrayField(ts, sf, el, 'slugs') ?? []
					}))
					.filter((t) => t.id !== undefined);

				if (action === 'create') {
					let id;
					while (true) {
						id = promptText('theme id (kebab-case)');
						if (id === null) break;
						const error =
							validateProjectSlug(id) ??
							(themeRows.some((t) => t.id === id)
								? `A theme with id '${id}' already exists.`
								: null);
						if (error === null) break;
						console.log(`⚠ ${error}`);
					}
					if (id === null) continue outer;
					const name = promptText('display name');
					if (name === null) continue outer;
					const blurb = promptText('blurb (optional)') ?? '';
					const slugs = [];
					// Member loop: Esc/empty ends collection.
					while (true) {
						const member = pickSlug(
							`Members so far: ${slugs.length ? slugs.join(', ') : 'none'} — add another? (Esc to finish)`,
							'project slug'
						);
						if (member === null) break;
						if (!slugs.includes(member)) slugs.push(member);
					}
					await runTheme({ args: ['create', id], values: { name, blurb, slug: slugs }, palette });
					break;
				}

				const id = chooseString(
					'Theme:',
					themeRows.map((t) => t.id)
				);
				if (id === null) continue outer;

				if (action === 'edit') {
					const name = promptText('new name (Enter keeps current)');
					const blurb = promptText('new blurb (Enter keeps current)');
					if (name === null && blurb === null) {
						console.log('Nothing to change.');
						continue outer;
					}
					await runTheme({
						args: ['edit', id],
						values: { name: name ?? undefined, blurb: blurb ?? undefined },
						palette
					});
					break;
				}
				if (action === 'delete') {
					const confirm = spawnSync('gum', ['confirm', `Delete theme '${id}'?`], {
						stdio: 'inherit'
					});
					if (confirm.status !== 0) continue outer;
					await runTheme({ args: ['delete', id], values: {}, palette });
					break;
				}
				// add / remove a member
				let member;
				if (action === 'remove') {
					const current = themeRows.find((t) => t.id === id)?.slugs ?? [];
					if (current.length === 0) {
						console.log(`Theme '${id}' has no members.`);
						continue outer;
					}
					member = chooseString('Remove which project?', current);
				} else {
					member = pickSlug('Add which project?', 'project slug');
				}
				if (member === null || member === undefined) continue outer;
				await runTheme({ args: [action, id, member], values: {}, palette });
				break;
			}
			case 'flag': {
				const chosenSlug = pickSlug('Choose a slug to flag:', 'project slug');
				if (chosenSlug === null) continue outer;
				// Second picker: choose the flag to set.
				const flagPick = spawnSync(
					'gum',
					[
						'choose',
						'--label-delimiter=:',
						'--header=Pin or hide?',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						`--item.foreground=${BRAND_ACCENT}`,
						'Pin   Float to the top of the hero pool:pin',
						'Hide  Exclude from the hero pool:hide'
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (flagPick.status !== 0 || !flagPick.stdout.trim()) continue outer;
				const chosenFlag = flagPick.stdout.trim();
				await runFlag({
					args: [chosenSlug],
					values: { pin: chosenFlag === 'pin', hide: chosenFlag === 'hide' },
					palette,
					useGum
				});
				break;
			}
			case 'audit':
				await runAudit({ palette, useGum, json: false });
				break;
			case 'init':
				runInit({ palette, useGum });
				break;
			case 'promote': {
				const chosenSlug = pickSlug('Choose a slug to promote:', 'slug to promote');
				if (chosenSlug === null) continue outer;
				runPromote({ args: [chosenSlug], palette });
				break;
			}
			case 'relate': {
				// Step 0: add a new edge, or remove/edit an existing one.
				const actionPick = spawnSync(
					'gum',
					[
						'choose',
						'--label-delimiter=:',
						'--header=Relate — add, remove, or edit?',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						`--item.foreground=${BRAND_ACCENT}`,
						'Add      Author a new relationship edge:add',
						'Remove   Delete an existing edge:remove',
						"Edit     Change an existing edge's kind or note:edit"
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (actionPick.status !== 0 || !actionPick.stdout.trim()) continue outer;
				const action = actionPick.stdout.trim();

				// Step 1: project or tech mode.
				const modePick = spawnSync(
					'gum',
					[
						'choose',
						'--label-delimiter=:',
						'--header=Relate — project or tech?',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						`--item.foreground=${BRAND_ACCENT}`,
						'Project   Link one project to another:project',
						'Tech      Link one technology to another:tech'
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (modePick.status !== 0 || !modePick.stdout.trim()) continue outer;
				const mode = modePick.stdout.trim();

				if (action === 'remove' || action === 'edit') {
					// List every existing edge for this mode up front — no
					// source step first. Reuses the same TS-compiler read the
					// CLI's idempotence/locator checks use, just across every
					// overlay (project mode) or the one flat file (tech mode).
					const existing = await listAllRelationships(mode);
					if (existing.length === 0) {
						console.log(`No ${mode} relationships exist yet to ${action}.`);
						continue outer;
					}

					// Alphabetised, with a pinned in-list toggle to flip the sort
					// key rather than a separate picker step. gum choose has no
					// live re-sort keybinding, so "toggle" means: pick the toggle
					// row, flip sortKey, redisplay the SAME list re-sorted.
					let sortKey = 'source';
					let source, kind, target;
					edgeLoop: while (true) {
						const sorted = [...existing].sort((a, b) => a[sortKey].localeCompare(b[sortKey]));
						const otherKey = sortKey === 'source' ? 'target' : 'source';
						const toggleItem = `↕ Currently sorted by ${sortKey} — switch to ${otherKey}:__toggle__`;
						const edgeItems = sorted.map(
							(r) =>
								`${r.source} → ${r.kind} → ${r.target}${r.note ? `  (${r.note})` : ''}:${r.source}|${r.kind}|${r.target}`
						);
						const edgePick = spawnSync(
							'gum',
							[
								'choose',
								'--label-delimiter=:',
								`--header=Choose an edge to ${action}:`,
								'--cursor=> ',
								`--cursor.foreground=${BRAND_PRIMARY}`,
								`--selected.foreground=${BRAND_PRIMARY}`,
								`--item.foreground=${BRAND_ACCENT}`,
								toggleItem,
								...edgeItems
							],
							{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
						);
						if (edgePick.status !== 0 || !edgePick.stdout.trim()) continue outer;
						const picked = edgePick.stdout.trim();
						if (picked === '__toggle__') {
							sortKey = otherKey;
							continue edgeLoop; // redisplay the same list, newly re-sorted
						}
						[source, kind, target] = picked.split('|');
						break edgeLoop;
					}

					if (action === 'remove') {
						await runRelate({
							args: [mode, source, kind, target],
							values: { remove: true },
							palette
						});
						break;
					}

					// Edit: prompt for a new kind (optional — Esc/empty keeps the
					// current kind) and a new note (optional — Esc/empty keeps the
					// current note). At least one of the two must actually change,
					// mirroring the CLI's "nothing to change" guard.
					const kinds = mode === 'project' ? PROJECT_RELATIONSHIP_KINDS : TECH_RELATIONSHIP_KINDS;
					const kindItems = [...kinds].map((k) => `${k}${k === kind ? '  (current)' : ''}:${k}`);
					const kindPick = spawnSync(
						'gum',
						[
							'choose',
							'--label-delimiter=:',
							'--header=New kind (Esc to keep the current kind):',
							'--cursor=> ',
							`--cursor.foreground=${BRAND_PRIMARY}`,
							`--selected.foreground=${BRAND_PRIMARY}`,
							`--item.foreground=${BRAND_ACCENT}`,
							...kindItems
						],
						{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
					);
					// Esc here means "keep the current kind," not "abort the
					// wizard" — unlike every other step, since editing only the
					// note with the kind unchanged is a legitimate outcome.
					const newKind =
						kindPick.status === 0 && kindPick.stdout.trim() ? kindPick.stdout.trim() : undefined;

					const noteInput = spawnSync(
						'gum',
						['input', '--placeholder', 'new note (leave empty to keep the current note)'],
						{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
					);
					// Ctrl-C aborts the whole wizard; empty Enter means "keep the
					// current note" (matches runRelate's own note handling, which
					// cannot distinguish "not provided" from "explicitly cleared").
					if (noteInput.status !== 0) continue outer;
					const newNote = noteInput.stdout.trim() || undefined;

					if (newKind === undefined && newNote === undefined) {
						console.log('Nothing changed — kind and note both left as-is.');
						continue outer;
					}

					await runRelate({
						args: [mode, source, kind, target],
						values: { edit: true, kind: newKind, note: newNote },
						palette
					});
					break;
				}

				// action === 'add'.
				// All known tech labels drift recognises, regardless of whether
				// they're in a relationship yet — mirrors project mode listing
				// every manifest slug, not just related ones. Labels hidden from
				// the relate surface stay out, same as CLI resolution.
				const hiddenFromRelate = new Set(
					(await readTechOverlaysFile())
						.filter((o) => o.hiddenFrom?.includes('relate'))
						.map((o) => o.label)
				);
				const allTechLabels = [
					...new Set(
						[
							...Object.values(LANGUAGE_TAGS),
							...Object.values(RUNTIME_TAGS),
							...Object.values(FRAMEWORK_TAGS),
							...Object.values(DATABASE_TAGS)
						].map((t) => t.label)
					)
				].filter((label) => !hiddenFromRelate.has(label));

				// Step 2: source — always a full alphabetised list of existing
				// entries (manifest slugs for project, taxonomy labels for tech),
				// with "Create a new ..." pinned first for anything not listed.
				// Invalid create-new input re-prompts in place rather than
				// silently proceeding — see pickOrCreate.
				let source;
				if (mode === 'project') {
					source = pickOrCreate(
						'Source project slug:',
						Object.keys(manifests.manifest.sources),
						'Create a new project',
						'source-slug',
						validateProjectSlug
					);
				} else {
					source = pickOrCreate(
						'Source tech label:',
						allTechLabels,
						'Create a new tech',
						'source tech label, e.g. Node.js',
						() => null // tech labels are free-text, no shape constraint
					);
				}
				if (source === null) continue outer;

				// Step 3: relationship kind, from the mode-appropriate kind set.
				const kinds = mode === 'project' ? PROJECT_RELATIONSHIP_KINDS : TECH_RELATIONSHIP_KINDS;
				const kindItems = [...kinds].map((k) => `${k}:${k}`);
				const kindPick = spawnSync(
					'gum',
					[
						'choose',
						'--label-delimiter=:',
						'--header=Relationship kind:',
						'--cursor=> ',
						`--cursor.foreground=${BRAND_PRIMARY}`,
						`--selected.foreground=${BRAND_PRIMARY}`,
						`--item.foreground=${BRAND_ACCENT}`,
						...kindItems
					],
					{ stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }
				);
				if (kindPick.status !== 0 || !kindPick.stdout.trim()) continue outer;
				const kind = kindPick.stdout.trim();

				// Step 4: target — same candidate-list-plus-create shape as
				// source, but validation ALSO rejects the already-chosen source
				// (a self-edge would otherwise reach runRelate, which exits the
				// whole process rather than just this wizard). This covers the
				// create-new path via `validate`; picking the SAME existing
				// entry as both source and target bypasses that callback
				// entirely (picking never calls validate), so it's re-checked
				// explicitly below regardless of which path target came from.
				const validateTarget = (value) => {
					if (value === source) return 'A relationship cannot point to itself.';
					return mode === 'project' ? validateProjectSlug(value) : null;
				};
				let target;
				while (true) {
					target =
						mode === 'project'
							? pickOrCreate(
									'Target project slug:',
									Object.keys(manifests.manifest.sources),
									'Create a new project',
									'target-slug',
									validateTarget
								)
							: pickOrCreate(
									'Target tech label:',
									allTechLabels,
									'Create a new tech',
									'target tech label, e.g. Bun',
									validateTarget
								);
					if (target === null) continue outer;
					if (target === source) {
						console.log('⚠ A relationship cannot point to itself.');
						continue; // re-prompt the whole target step
					}
					break;
				}

				// Step 5: optional free-text note. Empty is a legitimate "no
				// note" (runRelate normalises '' and undefined identically);
				// only a non-zero status (Ctrl-C) aborts the wizard.
				const noteInput = spawnSync('gum', ['input', '--placeholder', 'note (optional)'], {
					stdio: ['inherit', 'pipe', 'inherit'],
					encoding: 'utf8'
				});
				if (noteInput.status !== 0) continue outer;
				const note = noteInput.stdout.trim() || undefined;

				await runRelate({ args: [mode, source, kind, target], values: { note }, palette });
				break;
			}
		}
		return; // dispatching a verb ends the menu — one action per launch.
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
			allowPositionals: true, // verb + optional slug/mode/kind/target + optional field
			options: {
				json: { type: 'boolean', default: false },
				check: { type: 'boolean', default: false },
				full: { type: 'boolean', default: false },
				'all-projects': { type: 'boolean', default: false },
				'dry-run': { type: 'boolean', default: false },
				'no-cache': { type: 'boolean', default: false },
				'no-color': { type: 'boolean', default: false },
				help: { type: 'boolean', short: 'h', default: false },
				pin: { type: 'boolean', default: false },
				hide: { type: 'boolean', default: false },
				// Free-text note for `drift relate`. No default: undefined means
				// "no note authored", distinct from an explicit empty string.
				note: { type: 'string' },
				// `drift relate ... --remove` deletes the located edge instead of
				// adding it; `--edit` changes an existing edge's kind/note in
				// place (paired with --kind for the new kind value, reusing --note
				// for the new note). Mutually exclusive with --remove.
				remove: { type: 'boolean', default: false },
				edit: { type: 'boolean', default: false },
				kind: { type: 'string' },
				// `drift tech`: authored first-used floor date and surface scoping.
				'first-used': { type: 'string' },
				from: { type: 'string' },
				all: { type: 'boolean', default: false },
				// `drift theme`: display name, blurb and member slugs (repeatable).
				name: { type: 'string' },
				blurb: { type: 'string' },
				slug: { type: 'string', multiple: true }
			}
		}));
	} catch (err) {
		process.stderr.write(`drift: ${err.message}\nRun \`drift --help\` for usage.\n`);
		process.exit(1);
	}

	// Subcommand dispatcher. The first positional is the verb; slug/field follow.
	const KNOWN_VERBS = new Set([
		'report',
		'snapshot',
		'sync',
		'keep',
		'keep-all',
		'hide',
		'promote',
		'author',
		'flag',
		'relate',
		'tech',
		'tag',
		'theme',
		'collection',
		'audit',
		'init',
		'help'
	]);
	const rawVerb = KNOWN_VERBS.has(positionals[0]) ? positionals[0] : 'report';
	// `collection` is a straight alias for `theme` — Jason's mental model for
	// the theme territories; normalise immediately so one dispatch serves both.
	const verb = rawVerb === 'collection' ? 'theme' : rawVerb;
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
		const rawTarget = verb === 'help' ? (args[0] ?? 'report') : verb;
		printHelp(rawTarget === 'collection' ? 'theme' : rawTarget, palette, useGum);
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
		await runAuthor({ args, palette, useGum });
		return;
	}
	if (verb === 'flag') {
		await runFlag({ args, values, palette, useGum });
		return;
	}
	if (verb === 'relate') {
		await runRelate({ args, values, palette, useGum });
		return;
	}
	if (verb === 'tech') {
		await runTech({ args, values, palette });
		return;
	}
	if (verb === 'tag') {
		await runTag({ args, values, palette });
		return;
	}
	if (verb === 'theme') {
		await runTheme({ args, values, palette });
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
	if (!values.json) printUnmappedExtensionsAdvisory(palette);

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
