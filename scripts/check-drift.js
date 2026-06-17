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
 *   drift [report]                      # compare synced state to current git state (default)
 *   drift update                        # rewrite sources.json with current fingerprints
 *   drift accept <slug> <field>         # refresh one override's synced baseline
 *   drift accept --all-projects <field> # refresh one field's baseline across all projects
 *   drift accept-all                    # refresh every flagged override baseline
 *   drift --full                        # field-level diff across ALL repos (no HEAD gate)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { parseArgs } from 'node:util';
import { EXTENSION_LANGUAGE } from '../src/lib/data/tag-taxonomy.js';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const sourcesPath = join(repoRoot, 'src/lib/data/sources.json');
const localPath = join(repoRoot, 'src/lib/data/sources.local.json');
const overridesPath = join(repoRoot, 'src/lib/data/overrides.json');
const excludedPath = join(repoRoot, 'src/lib/data/excluded.json');
const projectsDir = join(repoRoot, 'src/lib/data/projects');

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args, cwd) {
	try {
		return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return null;
	}
}

// Extended-regex alternation over Jason's git identities across repos, so the
// "by me" metrics (recent commits, line churn) count his work and not a team's.
// One editable place: a miss degrades to 0, never an error.
const AUTHOR_PATTERN = 'Jason Warren|jasonwarren|jason@foundersandcoders\\.com';

// Trailing window for "recent" metrics. Appears in report output too.
const RECENT_WINDOW = '4 weeks ago';

// Ordered list of every field getFingerprint returns. Used as the single source
// of truth for diffFingerprint; explicit ordering keeps the field-drift section
// stable and survives a saved entry missing a field (undefined !== value).
const FINGERPRINT_FIELDS = [
	'head',
	'commits',
	'commitsRecentAll',
	'commitsMine',
	'commitsRecent',
	'lastCommit',
	'firstCommit',
	'languages',
	'linesOfCode',
	'linesAdded',
	'linesRemoved',
	'linesAddedAll',
	'linesRemovedAll',
	'linesAddedRecent',
	'linesRemovedRecent',
	'linesAddedRecentAll',
	'linesRemovedRecentAll'
];

// EXTENSION_LANGUAGE is imported from src/lib/data/tag-taxonomy.js above.
// That module is the single source of truth shared between the CLI and the app.

/** Languages present in the repo, ordered by file count (most prevalent first). */
function detectLanguages(repoPath) {
	const listing = git('ls-files', repoPath);
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
 * Reuses the same extension gate as `detectLanguages`, so config, lockfiles, and
 * assets stay out of the count.
 */
function countLinesOfCode(repoPath) {
	const listing = git('ls-files', repoPath);
	if (!listing) return null;
	let total = 0;
	for (const file of listing.split('\n')) {
		const dot = file.lastIndexOf('.');
		if (dot < 0) continue;
		if (!EXTENSION_LANGUAGE[file.slice(dot + 1).toLowerCase()]) continue;
		try {
			const content = readFileSync(join(repoPath, file), 'utf8');
			if (content.length === 0) continue;
			total += content.split('\n').length;
		} catch {
			// Unreadable or vanished between ls-files and read — skip it.
		}
	}
	return total;
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
function countCommits(repoPath, { mine = false, recent = false } = {}) {
	const flags = ['rev-list', '--count'];
	if (recent) flags.push(`--since="${RECENT_WINDOW}"`);
	if (mine) flags.push('--extended-regexp', `--author="${AUTHOR_PATTERN}"`);
	flags.push('HEAD');
	const out = git(flags.join(' '), repoPath);
	return out === null ? null : Number(out);
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
function countChurn(repoPath, { mine = false, recent = false } = {}) {
	const flags = ['log'];
	if (recent) flags.push(`--since="${RECENT_WINDOW}"`);
	if (mine) flags.push('--extended-regexp', `--author="${AUTHOR_PATTERN}"`);
	flags.push('--pretty=tformat:', '--numstat', 'HEAD');
	const out = git(flags.join(' '), repoPath);
	if (out === null) return { added: null, removed: null };
	let added = 0;
	let removed = 0;
	for (const line of out.split('\n')) {
		if (!line.trim()) continue;
		const [a, r] = line.split('\t');
		if (a === '-' || r === '-') continue; // binary file, no line counts
		added += Number(a) || 0;
		removed += Number(r) || 0;
	}
	return { added, removed };
}

/** ISO date of the earliest root commit, the project's inception. */
function getFirstCommit(repoPath) {
	const roots = git('log --max-parents=0 --format=%cs', repoPath);
	if (roots) {
		return roots.split('\n').sort()[0];
	}
	const reversed = git('log --reverse --format=%cs', repoPath);
	return reversed ? reversed.split('\n')[0] : null;
}

function getFingerprint(repoPath) {
	if (!existsSync(join(repoPath, '.git'))) return null;
	const head = git('rev-parse --short HEAD', repoPath);
	const lastCommit = git('log -1 --format=%cs', repoPath);
	if (!head) return null;

	// Commit grid: all/mine × lifetime/recent
	const commits = countCommits(repoPath); // all, lifetime
	const commitsRecentAll = countCommits(repoPath, { recent: true }); // all, recent
	const commitsMine = countCommits(repoPath, { mine: true }); // mine, lifetime
	const commitsRecent = countCommits(repoPath, { mine: true, recent: true }); // mine, recent

	// Churn grid: mine/all × lifetime/recent (×2 for added/removed = 8 numbers)
	const churnMine = countChurn(repoPath, { mine: true }); // mine, lifetime
	const churnAll = countChurn(repoPath); // all, lifetime
	const churnMineRecent = countChurn(repoPath, { mine: true, recent: true }); // mine, recent
	const churnAllRecent = countChurn(repoPath, { recent: true }); // all, recent

	return {
		head,
		commits,
		commitsRecentAll,
		commitsMine,
		commitsRecent,
		lastCommit,
		firstCommit: getFirstCommit(repoPath),
		languages: detectLanguages(repoPath),
		linesOfCode: countLinesOfCode(repoPath),
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
		linesRemovedRecentAll: churnAllRecent.removed
	};
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
		const now = current[field];
		const was = saved ? saved[field] : undefined;
		if (field === 'languages') {
			// Compare by ordered join — array ordering (by file count) is meaningful.
			const a = Array.isArray(was) ? was.join(',') : '';
			const b = Array.isArray(now) ? now.join(',') : '';
			if (a !== b) diffs.push({ field, was: was ?? null, now: now ?? null });
			continue;
		}
		if (was !== now) diffs.push({ field, was: was ?? null, now: now ?? null });
	}
	return diffs;
}

// ---------------------------------------------------------------------------
// Curated language tags (the significance gate). Read best-effort from the
// project's data file so the report can flag detected languages that are not
// yet curated. The app reads only these tags; the scan never feeds the render.
// ---------------------------------------------------------------------------

function curatedLanguages(slug) {
	const file = join(projectsDir, `${slug}.ts`);
	if (!existsSync(file)) return null;
	let source;
	try {
		source = readFileSync(file, 'utf8');
	} catch {
		return null;
	}
	const labels = [];
	const re = /label:\s*'([^']+)',\s*kind:\s*'language'/g;
	let match;
	while ((match = re.exec(source)) !== null) {
		labels.push(match[1]);
	}
	return labels;
}

/** Detected languages not yet present in the project's curated language tags. */
function ungatedLanguages(slug, detected) {
	const curated = curatedLanguages(slug);
	if (curated === null) return [];
	const gate = new Set(curated);
	return detected.filter((language) => !gate.has(language));
}

/**
 * Read the project's authored status from its data file via regex.
 * Returns 'live' | 'wip' | 'finished' | 'prototype' | 'archived' | null.
 * Mirrors the curatedLanguages text-parse pattern — the script is plain JS
 * and cannot import the TypeScript project files directly.
 */
function curatedStatus(slug) {
	const file = join(projectsDir, `${slug}.ts`);
	if (!existsSync(file)) return null;
	let source;
	try {
		source = readFileSync(file, 'utf8');
	} catch {
		return null;
	}
	const m = source.match(/\bstatus:\s*'([^']+)'/);
	return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Exclusion list — read from excluded.json (committed; editable via `drift exclude`).
// Two axes:
//   repoNames — gates the directory scan by folder name (before a slug exists)
//   slugs     — gates the public site by manifest slug (after fingerprinting)
// ---------------------------------------------------------------------------

/**
 * Load the exclusion list from excluded.json.
 * Best-effort: returns empty Sets and warns on stderr if the file is missing
 * or malformed. Never crashes the CLI.
 */
function loadExcluded() {
	try {
		const raw = JSON.parse(readFileSync(excludedPath, 'utf8'));
		return {
			excludedRepoNames: new Set(raw.repoNames ?? []),
			excludedSlugs: new Set(raw.slugs ?? [])
		};
	} catch {
		process.stderr.write(
			`[drift] Warning: could not read excluded.json at ${excludedPath}. Exclusions disabled.\n`
		);
		return { excludedRepoNames: new Set(), excludedSlugs: new Set() };
	}
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

	return { manifest, overrideEntries, localPaths };
}

// ---------------------------------------------------------------------------
// Drift computation (the full fingerprint + scan pass).
//
// Phase 1 baseline: every verb runs this full pass so report/update/accept all
// share the same computed state (report needs all arrays, update and accept
// both need `fresh`, accept-all reads `conflicts`). Phase 2 adds a HEAD-SHA
// cache here to avoid the full git subprocess cost on repeated runs.
//
// --full mode adds `fieldDrift`: a per-repo list of field-level differences
// between the saved fingerprint and the current live one. This surfaces
// windowed-metric decay (recent-window metrics shrink as the window slides)
// and fields that were seeded with placeholder values before real syncs.
// ---------------------------------------------------------------------------

function computeDrift(
	{ manifest, overrideEntries, localPaths },
	{ full = false, onProgress = null } = {}
) {
	const { excludedRepoNames } = loadExcluded();

	const changed = [];
	const missing = [];
	const conflicts = [];
	const fieldDrift = []; // populated only in --full mode
	// Current fingerprint for every repo that resolves, keyed by slug. Used to
	// backfill new fields (firstCommit, languages) on update even for repos whose
	// head has not moved since the last sync.
	const fresh = {};

	const total = Object.keys(manifest.sources).length;
	let index = 0;

	for (const [slug, saved] of Object.entries(manifest.sources)) {
		index++;
		// Progress callback fires once per repo so the counter always reaches total.
		onProgress?.({ index, total, slug });

		const repoPath = localPaths[slug];
		if (!repoPath) {
			// No path configured — check if this is a live/wip project that should be present.
			const status = curatedStatus(slug);
			const statusHint = status === 'live' || status === 'wip' ? status : null;
			missing.push({ slug, reason: 'no local path in sources.local.json', statusHint });
			continue;
		}

		const current = getFingerprint(repoPath);
		if (!current) {
			// Path configured but repo not found — could be offloaded. Check status.
			const status = curatedStatus(slug);
			const statusHint = status === 'live' || status === 'wip' ? status : null;
			missing.push({
				slug,
				reason: `path not found or not a git repo: ${repoPath}`,
				statusHint
			});
			continue;
		}

		fresh[slug] = current;

		// Check for manual overrides whose syncedWhenSet baseline has drifted.
		// Runs regardless of whether head moved (catches head-static drift too).
		const slugOverrides = overrideEntries[slug];
		if (slugOverrides) {
			for (const [fieldName, entry] of Object.entries(slugOverrides)) {
				if (fieldName.startsWith('_')) continue; // skip _note, _setNote
				if (entry.syncedWhenSet === null) continue; // pure pin, no baseline to drift
				const syncedField = entry.syncedField ?? fieldName;
				const now = current[syncedField];
				if (now !== undefined && now !== entry.syncedWhenSet) {
					conflicts.push({
						slug,
						field: fieldName,
						value: entry.value,
						was: entry.syncedWhenSet,
						now
					});
				}
			}
		}

		if (current.head !== saved.head) {
			const delta = current.commits - saved.commits;
			changed.push({
				slug,
				path: repoPath,
				from: { head: saved.head, commits: saved.commits, lastCommit: saved.lastCommit },
				to: current,
				delta,
				ungated: ungatedLanguages(slug, current.languages)
			});
		}

		// --full mode: compare every field, not just head. Surfaces windowed-metric
		// decay and placeholder values even when HEAD has not moved.
		if (full) {
			const fields = diffFingerprint(saved, current);
			if (fields.length > 0) fieldDrift.push({ slug, fields });
		}
	}

	// Scan ~/Code for git repos not yet in the manifest.
	const knownSlugs = new Set(Object.keys(manifest.sources));
	const codeRoot = join(homedir(), 'Code');
	const newRepos = [];

	function scanForGitRepos(dir, depth = 0) {
		if (depth > 3) return;
		let entries;
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.startsWith('.')) continue;
			const full = join(dir, entry);
			try {
				if (!statSync(full).isDirectory()) continue;
			} catch {
				continue;
			}
			if (existsSync(join(full, '.git'))) {
				const name = entry;
				// Normalise: lowercase, convert to kebab-case (basic)
				const normalised = name.toLowerCase().replace(/[_\s]+/g, '-');
				if (!knownSlugs.has(normalised) && !knownSlugs.has(name)) {
					newRepos.push({ name, path: full, normalised });
				}
				// Don't recurse into git repos
			} else {
				scanForGitRepos(full, depth + 1);
			}
		}
	}

	scanForGitRepos(codeRoot);

	const filteredNew = newRepos.filter(
		(r) => !excludedRepoNames.has(r.name) && !excludedRepoNames.has(r.normalised)
	);

	return { changed, missing, conflicts, fresh, filteredNew, fieldDrift };
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
	const { changed, missing, conflicts, filteredNew, fieldDrift } = result;
	const lines = [];

	lines.push(`# Portfolio source drift report`);
	lines.push(`_Last synced: ${manifest.lastSyncedAt}_`);
	lines.push('');

	const allClear =
		changed.length === 0 &&
		filteredNew.length === 0 &&
		missing.length === 0 &&
		conflicts.length === 0 &&
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
			lines.push(`### ${r.slug}`);
			lines.push('');
			lines.push(
				`\`${r.from.head}\` → \`${r.to.head}\` · ${dir}${r.delta} commits · first: ${r.to.firstCommit ?? '?'}, last: ${r.to.lastCommit}`
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
			if (r.ungated.length > 0) {
				lines.push(`**ungated** (consider adding to language tags): ${r.ungated.join(', ')}`);
				lines.push('');
			}
		}
	}

	if (full && fieldDrift.length > 0) {
		lines.push(`## Field-level drift - full scan (${fieldDrift.length})`);
		lines.push('');
		for (const r of fieldDrift) {
			lines.push(`### ${r.slug}`);
			lines.push('');
			lines.push(`| field | was | now |`);
			lines.push(`| --- | --- | --- |`);
			for (const f of r.fields) {
				const was = Array.isArray(f.was) ? f.was.join(', ') : String(f.was ?? '?');
				const now = Array.isArray(f.now) ? f.now.join(', ') : String(f.now ?? '?');
				lines.push(`| ${f.field} | ${was} | ${now} |`);
			}
			lines.push('');
		}
	}

	if (conflicts.length > 0) {
		lines.push(`## Manual overrides to review (${conflicts.length})`);
		lines.push('');
		for (const c of conflicts) {
			lines.push(
				`- **${c.slug}.${c.field}**: you set \`${c.value}\` when synced was \`${c.was}\`; synced is now \`${c.now}\`. Run \`drift accept ${c.slug} ${c.field}\` to keep your value and dismiss.`
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
			if (r.statusHint) {
				lines.push(
					`  - still marked '${r.statusHint}' · consider reviewing its status in \`src/lib/data/projects/${r.slug}.ts\``
				);
			}
		}
		lines.push('');
	}

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function runReport({ result, manifest, palette, json, full, useGum }) {
	const { changed, missing, conflicts, filteredNew, fieldDrift } = result;
	const { RESET, BOLD, GREEN, YELLOW, CYAN, DIM } = palette;

	// Machine-readable mode: emit JSON and suppress the human report entirely.
	// Pipe-safe — palette is already empty when stdout is not a TTY, so no
	// escape sequences escape even if --json is omitted and output is piped.
	// This branch is structurally first: --json can never reach the gum path.
	if (json) {
		const payload = { changed, conflicts, filteredNew, missing };
		if (full) payload.fieldDrift = fieldDrift;
		process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
		return;
	}

	// gum markdown rendering — only when interactive with colour enabled.
	// Falls back to the plain console.log path on any failure.
	if (useGum && process.stdout.isTTY) {
		const md = renderReportMarkdown(result, manifest, full);
		const out = spawnSync('gum', ['format', '--theme', 'pink'], { input: md, encoding: 'utf8' });
		if (out.status === 0 && out.stdout) {
			process.stdout.write('\n' + out.stdout + '\n');
			return;
		}
	}

	// Plain ANSI fallback — byte-identical to pre-gum output.
	console.log(
		`\n${BOLD}Portfolio source drift report${RESET} ${DIM}(${manifest.lastSyncedAt})${RESET}\n`
	);

	const allClear =
		changed.length === 0 &&
		filteredNew.length === 0 &&
		missing.length === 0 &&
		conflicts.length === 0 &&
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
			console.log(`  ${CYAN}${r.slug}${RESET}`);
			console.log(
				`    ${r.from.head} → ${r.to.head}  (${dir}${r.delta} commits, first: ${r.to.firstCommit ?? '?'}, last: ${r.to.lastCommit})`
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
			if (r.ungated.length > 0) {
				console.log(
					`    ${YELLOW}ungated (consider adding to language tags): ${r.ungated.join(', ')}${RESET}`
				);
			}
		}
		console.log();
	}

	if (full && fieldDrift.length > 0) {
		console.log(`${YELLOW}${BOLD}Field-level drift - full scan (${fieldDrift.length}):${RESET}`);
		for (const r of fieldDrift) {
			console.log(`  ${CYAN}${r.slug}${RESET}`);
			for (const f of r.fields) {
				const was = Array.isArray(f.was) ? f.was.join(', ') : (f.was ?? '?');
				const now = Array.isArray(f.now) ? f.now.join(', ') : (f.now ?? '?');
				console.log(`    ${DIM}${f.field}: ${was} → ${now}${RESET}`);
			}
		}
		console.log();
	}

	if (conflicts.length > 0) {
		console.log(`${YELLOW}${BOLD}Manual overrides to review (${conflicts.length}):${RESET}`);
		for (const c of conflicts) {
			console.log(
				`  ${YELLOW}${c.slug}.${c.field}: you set ${c.value} when synced was ${c.was}; synced is now ${c.now} (run \`drift accept ${c.slug} ${c.field}\` to keep your value and dismiss)${RESET}`
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
			if (r.statusHint) {
				console.log(
					`  ${YELLOW}  still marked '${r.statusHint}': consider reviewing its status in src/lib/data/projects/${r.slug}.ts${RESET}`
				);
			}
		}
		console.log();
	}
}

// ---------------------------------------------------------------------------
// Update: rewrite sources.json with current fingerprints.
// The ONE sanctioned write to sources.json. Never touches overrides.json.
// --full is accepted for symmetry but is a no-op: update already backfills
// every resolvable repo regardless of HEAD movement.
// ---------------------------------------------------------------------------

function runUpdate({ result, manifest, palette, useGum }) {
	const { fresh } = result;
	const { GREEN, RESET } = palette;

	if (Object.keys(fresh).length === 0) return;

	// gum confirm gate — only when interactive. Writes nothing on cancel.
	if (useGum && process.stdout.isTTY) {
		const n = Object.keys(fresh).length;
		const res = spawnSync('gum', ['confirm', `Rewrite sources.json with ${n} fingerprints?`], {
			stdio: 'inherit'
		});
		if (res.status !== 0) {
			console.log('Update cancelled.');
			return;
		}
	}

	// Backfill every resolvable repo, not just those whose head moved, so new
	// fields (firstCommit, languages) populate across the whole manifest.
	console.log('Updating sources.json with current fingerprints...');
	for (const [slug, current] of Object.entries(fresh)) {
		manifest.sources[slug] = current;
	}
	const today = new Date().toISOString().slice(0, 10);
	manifest.lastSyncedAt = today;
	writeFileSync(sourcesPath, JSON.stringify(manifest, null, '\t') + '\n', 'utf8');
	console.log(`${GREEN}sources.json updated.${RESET}`);
}

// ---------------------------------------------------------------------------
// Accept: refresh the syncedWhenSet baseline for one or all flagged override
// fields, keeping the manual value intact.
// The ONE sanctioned write to overrides.json. update never touches it.
// ---------------------------------------------------------------------------

function runAccept({ result, args, acceptAll, allProjects, palette }) {
	const { conflicts, fresh } = result;
	const { GREEN, RESET } = palette;

	let fieldsToAccept;
	if (acceptAll) {
		// accept-all: refresh every currently-flagged conflict regardless of field name.
		fieldsToAccept = conflicts.map((c) => ({ slug: c.slug, field: c.field }));
	} else if (allProjects) {
		// accept --all-projects <field>: refresh one named field across every project
		// that currently has it flagged. Distinct from accept-all (which takes all fields).
		const field = args[0];
		if (!field) {
			process.stderr.write('Usage: drift accept --all-projects <field>\n');
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
		// accept <slug> <field>: refresh one specific override.
		fieldsToAccept = [{ slug: args[0], field: args[1] }];
		if (!fieldsToAccept[0]?.slug || !fieldsToAccept[0]?.field) {
			process.stderr.write('Usage: drift accept <slug> <field>\n');
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
				`Cannot accept ${slug}.${field}: repo not resolvable on this machine (no local path or not a git repo)\n`
			);
			process.exit(1);
		}
		const now = fp[syncedField];
		if (now === undefined) {
			process.stderr.write(
				`Cannot accept ${slug}.${field}: synced field '${syncedField}' is absent from the current fingerprint\n`
			);
			process.exit(1);
		}

		entry.syncedWhenSet = now;
		console.log(
			`${GREEN}Accepted ${slug}.${field}: baseline refreshed to ${now}, your value ${entry.value} kept.${RESET}`
		);
		accepted++;
	}

	if (accepted > 0) {
		writeFileSync(overridesPath, JSON.stringify(overridesManifest, null, '\t') + '\n', 'utf8');
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

// Markdown source for gum-formatted help — rendered via `gum format --theme pink`
// when interactive. The plain `banners` object below is the fallback.
// Coverage must stay in parity: any flag or form added here must also appear in
// the plain banners, and vice versa. No em-dashes; use colons or commas.
const helpMarkdown = {
	report: `# drift · portfolio source drift checker

Compare synced fingerprints against current git state and surface new repos.

## Usage

- \`drift [report] [--json] [--full] [--check] [--no-color]\`
- \`drift update\`
- \`drift accept <slug> <field>\`
- \`drift accept --all-projects <field>\`
- \`drift accept-all\`

## Verbs

- \`report\` · compare synced fingerprints to current git state (default)
- \`update\` · rewrite sources.json with current fingerprints
- \`accept\` · refresh one override's synced baseline, keeping your value
- \`accept-all\` · refresh every flagged override baseline at once

## Flags

- \`--full\` · field-level diff across ALL resolvable repos, not just HEAD-moved ones; surfaces windowed-metric decay and placeholder dates; with \`--check\`, field drift also fails the gate
- \`--json\` · machine-readable report to stdout (suppresses the human report)
- \`--check\` · exit non-zero when drift, conflicts or new repos are detected
- \`--no-color\` · disable ANSI colour (also honoured via NO_COLOR env var and non-TTY)
- \`-h\`, \`--help\` · show help; combine with a verb for verb-specific help

Run \`drift help <verb>\` for verb-specific help. With no flags in an interactive terminal (and gum installed), drift opens a menu.`,

	update: `# drift update · rewrite sources.json with current fingerprints

Backfills every resolvable repo (not only those whose HEAD moved) so new
fields populate across the whole manifest. Writes sources.json only; never
touches overrides.json.

\`--full\` is accepted for symmetry but is a no-op: update already covers all
resolvable repos regardless of HEAD movement.

In an interactive terminal with gum installed, drift will ask for confirmation
before writing.

## Usage

\`\`\`
drift update
drift update --full  # accepted; no-op
\`\`\``,

	accept: `# drift accept · dismiss override-drift flags

Refreshes an override's \`syncedWhenSet\` baseline to the current synced value,
keeping your manual value intact. Writes overrides.json only.

\`--all-projects <field>\` accepts that one named field on every project currently
flagged for it. Distinct from \`accept-all\`, which accepts every flagged field
regardless of name.

## Usage

\`\`\`
drift accept <slug> <field>
drift accept --all-projects <field>
\`\`\`

## Examples

\`\`\`
drift accept lyra-rose commitsMine
drift accept --all-projects commitsMine
\`\`\``,

	'accept-all': `# drift accept-all · dismiss every override-drift flag at once

Refreshes the syncedWhenSet baseline for all currently flagged override fields.
Writes overrides.json only.

Differs from \`drift accept --all-projects <field>\`, which targets a single named
field across projects (rather than every field across all projects).

## Usage

\`\`\`
drift accept-all
\`\`\``
};

function printHelp(verb, palette, useGum) {
	// gum markdown rendering — falls back to plain banners on any failure.
	if (useGum && process.stdout.isTTY) {
		const md = helpMarkdown[verb] ?? helpMarkdown.report;
		const out = spawnSync('gum', ['format', '--theme', 'pink'], { input: md, encoding: 'utf8' });
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
  drift update
  drift accept <slug> <field>
  drift accept --all-projects <field>
  drift accept-all

${BOLD}Verbs:${RESET}
  report        Compare synced fingerprints to current git state (default).
  update        Rewrite sources.json with current fingerprints.
  accept        Refresh one override's synced baseline, keeping your value.
  accept-all    Refresh every flagged override baseline at once.

${BOLD}Flags:${RESET}
  --full        Field-level diff across ALL resolvable repos (surfaces windowed decay
                and placeholder dates). With --check, field drift also fails the gate.
  --json        Machine-readable report to stdout (suppresses the human report).
  --check       Exit non-zero when drift, conflicts or new repos are detected.
  --no-color    Disable ANSI colour (also honoured via NO_COLOR env var and non-TTY).
  -h, --help    Show help. Combine with a verb for verb-specific help.

${DIM}Run \`drift help <verb>\` for verb-specific help. With no flags in an interactive
terminal (and gum installed), drift opens a menu.${RESET}`,

		update: `${BOLD}drift update${RESET} - rewrite sources.json with current fingerprints

Backfills every resolvable repo (not only those whose HEAD moved), so new
fields populate across the whole manifest. Writes sources.json only; never
touches overrides.json.

${DIM}--full is accepted for symmetry but is a no-op: update already covers all
resolvable repos. In an interactive terminal with gum, drift asks for
confirmation before writing.${RESET}

  Usage: drift update`,

		accept: `${BOLD}drift accept <slug> <field>${RESET} - dismiss one override-drift flag

Refreshes the override's syncedWhenSet baseline to the current synced value,
keeping your manual value intact. Writes overrides.json only.

${DIM}--all-projects <field> accepts that one field on every project currently
flagged for it. Differs from accept-all (which accepts every flagged field).${RESET}

  Usage:   drift accept <slug> <field>
           drift accept --all-projects <field>
  Example: drift accept lyra-rose commitsMine
           drift accept --all-projects commitsMine`,

		'accept-all': `${BOLD}drift accept-all${RESET} - dismiss every override-drift flag at once

Refreshes the baseline for all currently flagged override fields. Writes
overrides.json only.

${DIM}Differs from \`accept --all-projects <field>\`, which targets a single named
field across projects rather than every field.${RESET}

  Usage: drift accept-all`
	};
	process.stdout.write((banners[verb] ?? banners.report) + '\n');
}

// ---------------------------------------------------------------------------
// Interactive gum menu (bare `drift` in a TTY with gum available).
// Single-shot: choose a verb, run it in-process, done.
// ---------------------------------------------------------------------------

function runInteractiveMenu({ manifests, palette, useGum, onProgress, clearProgress }) {
	// Lazy scan helper — runs only when a verb that needs data is selected.
	const scan = (full) => {
		const r = computeDrift(manifests, { full, onProgress });
		clearProgress();
		return r;
	};

	const items = [
		'Report:report',
		'Report - full field scan:report-full',
		'Update sources.json:update',
		'Accept an override:accept',
		'Accept-all:accept-all',
		'Help:help'
	];

	const choose = spawnSync(
		'gum',
		[
			'choose',
			'--label-delimiter=:',
			'--cursor=> ',
			'--cursor.foreground=#3E7F96',
			'--selected.foreground=#3E7F96',
			'--item.foreground=#B34480',
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
				result: scan(false),
				manifest: manifests.manifest,
				palette,
				json: false,
				full: false,
				useGum
			});
			break;
		case 'report-full':
			runReport({
				result: scan(true),
				manifest: manifests.manifest,
				palette,
				json: false,
				full: true,
				useGum
			});
			break;
		case 'update':
			runUpdate({ result: scan(false), manifest: manifests.manifest, palette, useGum });
			break;
		case 'accept-all':
			runAccept({ result: scan(false), args: [], acceptAll: true, allProjects: false, palette });
			break;
		case 'accept': {
			const result = scan(false);
			const { conflicts } = result;
			if (conflicts.length === 0) {
				console.log('No flagged overrides to accept.');
				return;
			}
			// Second picker: choose one conflict to accept.
			// Label is "slug.field" (human-readable); value is "slug field" (space-separated).
			const ovItems = conflicts.map((c) => `${c.slug}.${c.field}:${c.slug} ${c.field}`);
			const pick = spawnSync(
				'gum',
				[
					'choose',
					'--label-delimiter=:',
					'--cursor=> ',
					'--cursor.foreground=#3E7F96',
					'--selected.foreground=#3E7F96',
					'--item.foreground=#B34480',
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
	}
}

// ---------------------------------------------------------------------------
// --check exit gating — see applyCheckExit above.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
	let values, positionals;
	try {
		({ values, positionals } = parseArgs({
			allowPositionals: true, // verb + optional slug + optional field
			options: {
				json: { type: 'boolean', default: false },
				check: { type: 'boolean', default: false },
				full: { type: 'boolean', default: false },
				'all-projects': { type: 'boolean', default: false },
				'no-color': { type: 'boolean', default: false },
				help: { type: 'boolean', short: 'h', default: false }
			}
		}));
	} catch (err) {
		process.stderr.write(`drift: ${err.message}\nRun \`drift --help\` for usage.\n`);
		process.exit(1);
	}

	// Subcommand dispatcher. The first positional is the verb; slug/field follow.
	// 'promote' is reserved for Phase 6 — leave it out of KNOWN_VERBS for now.
	const KNOWN_VERBS = new Set(['report', 'update', 'accept', 'accept-all', 'help']);
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
		!KNOWN_VERBS.has(positionals[0]) &&
		positionals.length === 0 &&
		!values.json &&
		!values.check &&
		!values.full &&
		!values['all-projects'];

	if (bare && useGum) {
		runInteractiveMenu({ manifests, palette, useGum, onProgress, clearProgress });
		return;
	}

	const result = computeDrift(manifests, { full: values.full, onProgress });
	clearProgress();

	switch (verb) {
		case 'update':
			runUpdate({ result, manifest: manifests.manifest, palette, useGum });
			break;
		case 'accept':
			runAccept({ result, args, acceptAll: false, allProjects: values['all-projects'], palette });
			break;
		case 'accept-all':
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
	main();
}
