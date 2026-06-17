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
 *   drift [report]              # compare synced state to current git state (default)
 *   drift update                # rewrite sources.json with current fingerprints
 *   drift accept <slug> <field> # refresh one override's synced baseline
 *   drift accept-all            # refresh every flagged override baseline
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const sourcesPath = join(repoRoot, 'src/lib/data/sources.json');
const localPath = join(repoRoot, 'src/lib/data/sources.local.json');
const overridesPath = join(repoRoot, 'src/lib/data/overrides.json');
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

// Map a file extension to a canonical language name. Keys match the tag-label
// spelling the site curates, so the drift report's "ungated" hint lines up with
// the data model. Config, docs, and assets are deliberately omitted: this list
// is the exhaustive truth the curated language tags filter, but noise it need
// not carry.
const EXTENSION_LANGUAGE = {
	ts: 'TypeScript',
	tsx: 'TypeScript',
	mts: 'TypeScript',
	cts: 'TypeScript',
	js: 'JavaScript',
	jsx: 'JavaScript',
	mjs: 'JavaScript',
	cjs: 'JavaScript',
	py: 'Python',
	go: 'Go',
	rs: 'Rust',
	cs: 'C#',
	sh: 'Shell',
	bash: 'Shell',
	zsh: 'Shell',
	css: 'CSS',
	scss: 'CSS',
	sass: 'CSS',
	html: 'HTML',
	htm: 'HTML',
	c: 'C',
	h: 'C',
	cpp: 'C++',
	cc: 'C++',
	cxx: 'C++',
	hpp: 'C++',
	lua: 'Lua',
	kt: 'Kotlin',
	kts: 'Kotlin',
	swift: 'Swift',
	rb: 'Ruby',
	php: 'PHP',
	ex: 'Elixir',
	exs: 'Elixir',
	hs: 'Haskell',
	scala: 'Scala',
	dart: 'Dart',
	zig: 'Zig',
	ml: 'OCaml',
	jl: 'Julia',
	sql: 'SQL',
	vue: 'Vue',
	svelte: 'Svelte',
	astro: 'Astro'
};

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
// Exclude the portfolio repo itself, non-project repos, and known noise.
// Also exclude sub-repos that belong to split-product portfolio entries
// (tracked via sources.local.json pointing at the lead sub-repo) and
// companion repos that are deliberately not tracked separately.
// ---------------------------------------------------------------------------

const EXCLUDED = new Set([
	'portfolio', // this repo
	'jason-warren', // this repo (alternate name)
	'node_modules',
	'.git',
	'JasonWarrenUK', // GitHub profile README repo
	'JasonWarrenUK.github.io', // GitHub Pages site (not a project)
	'seam', // Jaz's project, not Jason's
	'terminal-config', // dotfiles, not a portfolio project
	'yalla-gym', // not a Jason project
	// Beacons — tracked under slug 'beacons' via beacons-backend
	'beacons-backend',
	'beacons-frontend-v2',
	// Craft and Graft — tracked under slug 'craft-and-graft' via craft-and-graft-front
	'craft-and-graft-front',
	'craft-and-graft-api',
	// Sakura — tracked under slug 'sakura' via sakura-api
	'sakura-api',
	'sakura-front',
	// Mood Time — deliberate exclusion (Jason ~25%, no clear ownership)
	'mood-time-api',
	'mood-time-front',
	'mood-time'
]);

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
			process.stderr.write(`Cannot parse ${localPath} — continuing without local path overrides\n`);
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
// ---------------------------------------------------------------------------

function computeDrift({ manifest, overrideEntries, localPaths }) {
	const changed = [];
	const missing = [];
	const conflicts = [];
	// Current fingerprint for every repo that resolves, keyed by slug. Used to
	// backfill new fields (firstCommit, languages) on update even for repos whose
	// head has not moved since the last sync.
	const fresh = {};

	for (const [slug, saved] of Object.entries(manifest.sources)) {
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

	const filteredNew = newRepos.filter((r) => !EXCLUDED.has(r.name) && !EXCLUDED.has(r.normalised));

	return { changed, missing, conflicts, fresh, filteredNew };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function runReport({ result, manifest, palette, json }) {
	const { changed, missing, conflicts, filteredNew } = result;
	const { RESET, BOLD, GREEN, YELLOW, CYAN, DIM } = palette;

	// Machine-readable mode: emit JSON and suppress the human report entirely.
	// Pipe-safe — palette is already empty when stdout is not a TTY, so no
	// escape sequences escape even if --json is omitted and output is piped.
	if (json) {
		process.stdout.write(
			JSON.stringify({ changed, conflicts, filteredNew, missing }, null, 2) + '\n'
		);
		return;
	}

	console.log(
		`\n${BOLD}Portfolio source drift report${RESET} ${DIM}(${manifest.lastSyncedAt})${RESET}\n`
	);

	if (
		changed.length === 0 &&
		filteredNew.length === 0 &&
		missing.length === 0 &&
		conflicts.length === 0
	) {
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
					`  ${YELLOW}  still marked '${r.statusHint}' — consider reviewing its status in src/lib/data/projects/${r.slug}.ts${RESET}`
				);
			}
		}
		console.log();
	}
}

// ---------------------------------------------------------------------------
// Update: rewrite sources.json with current fingerprints.
// The ONE sanctioned write to sources.json. Never touches overrides.json.
// ---------------------------------------------------------------------------

function runUpdate({ result, manifest, palette }) {
	const { fresh } = result;
	const { GREEN, RESET } = palette;

	if (Object.keys(fresh).length === 0) return;

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

function runAccept({ result, args, acceptAll, palette }) {
	const { conflicts, fresh } = result;
	const { GREEN, RESET } = palette;

	const fieldsToAccept = acceptAll
		? conflicts.map((c) => ({ slug: c.slug, field: c.field }))
		: [{ slug: args[0], field: args[1] }];

	if (!acceptAll && (!fieldsToAccept[0]?.slug || !fieldsToAccept[0]?.field)) {
		process.stderr.write('Usage: drift accept <slug> <field>\n');
		process.exit(1);
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
// ---------------------------------------------------------------------------

function applyCheckExit(result, palette) {
	const { changed, conflicts, filteredNew } = result;
	const { RED, RESET } = palette;
	const drift = changed.length + conflicts.length + filteredNew.length;
	if (drift > 0) {
		process.stderr.write(
			`${RED}drift detected: ${changed.length} changed, ${conflicts.length} conflicts, ${filteredNew.length} new.${RESET}\n`
		);
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(verb, palette) {
	const { BOLD, RESET, DIM } = palette;
	const banners = {
		report: `${BOLD}drift${RESET} — portfolio source drift checker

${BOLD}Usage:${RESET}
  drift [report] [--json] [--check] [--no-color]
  drift update
  drift accept <slug> <field>
  drift accept-all

${BOLD}Verbs:${RESET}
  report        Compare synced fingerprints to current git state (default).
  update        Rewrite sources.json with current fingerprints.
  accept        Refresh one override's synced baseline, keeping your value.
  accept-all    Refresh every flagged override baseline at once.

${BOLD}Flags:${RESET}
  --json        Machine-readable report to stdout (suppresses the human report).
  --check       Exit non-zero when drift, conflicts or new repos are detected.
  --no-color    Disable ANSI colour (also honoured via NO_COLOR env var and non-TTY).
  -h, --help    Show help. Combine with a verb for verb-specific help.`,

		update: `${BOLD}drift update${RESET} — rewrite sources.json with current fingerprints

Backfills every resolvable repo (not only those whose HEAD moved), so new
fields populate across the whole manifest. Writes sources.json only; never
touches overrides.json.

  Usage: drift update`,

		accept: `${BOLD}drift accept <slug> <field>${RESET} — dismiss one override-drift flag

Refreshes the override's syncedWhenSet baseline to the current synced value,
keeping your manual value intact. Writes overrides.json only.

  Usage:   drift accept <slug> <field>
  Example: drift accept lyra-rose commitsMine`,

		'accept-all': `${BOLD}drift accept-all${RESET} — dismiss every override-drift flag at once

Refreshes the baseline for all currently flagged override fields. Writes
overrides.json only.

  Usage: drift accept-all`
	};
	process.stdout.write((banners[verb] ?? banners.report) + '\n');
}

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
	const KNOWN_VERBS = new Set(['report', 'update', 'accept', 'accept-all']);
	const verb = KNOWN_VERBS.has(positionals[0]) ? positionals[0] : 'report';
	// args[0] = slug, args[1] = field (for accept). When the verb was explicit,
	// slice it off; when the default 'report' was inferred, positionals are not args.
	const args = KNOWN_VERBS.has(positionals[0]) ? positionals.slice(1) : positionals;

	const palette = makePalette(colourEnabled(values));

	if (values.help) {
		printHelp(verb, palette);
		return;
	}

	const manifests = loadManifests();
	const result = computeDrift(manifests);

	switch (verb) {
		case 'update':
			runUpdate({ result, manifest: manifests.manifest, palette });
			break;
		case 'accept':
			runAccept({ result, args, acceptAll: false, palette });
			break;
		case 'accept-all':
			runAccept({ result, args, acceptAll: true, palette });
			break;
		case 'report':
		default:
			runReport({ result, manifest: manifests.manifest, palette, json: values.json });
			if (values.check) applyCheckExit(result, palette);
	}
}

// Guard: only auto-run when executed directly, not when imported (e.g. in tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
