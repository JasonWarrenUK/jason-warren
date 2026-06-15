#!/usr/bin/env node
/**
 * Portfolio drift checker.
 *
 * Compares the last-synced fingerprints in src/lib/data/sources.json against
 * the current state of each source repo on this machine, then scans for new
 * git repos under ~/Code that are not yet in the portfolio.
 *
 * Intended to run automatically via the SessionStart hook so I (Claude) have
 * current awareness at the start of every portfolio session.
 *
 * Usage:
 *   node scripts/check-drift.js          # report only
 *   node scripts/check-drift.js --update # update sources.json with current fingerprints
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const sourcesPath = join(repoRoot, 'src/lib/data/sources.json');
const localPath = join(repoRoot, 'src/lib/data/sources.local.json');

const UPDATE_MODE = process.argv.includes('--update');

// ---------------------------------------------------------------------------
// Load manifests
// ---------------------------------------------------------------------------

let manifest;
try {
	manifest = JSON.parse(readFileSync(sourcesPath, 'utf8'));
} catch {
	console.error(`Cannot read ${sourcesPath}`);
	process.exit(1);
}

let localPaths = {};
if (existsSync(localPath)) {
	try {
		localPaths = JSON.parse(readFileSync(localPath, 'utf8')).paths ?? {};
	} catch {
		console.error(`Cannot parse ${localPath} — continuing without local path overrides`);
	}
} else {
	console.warn(
		'No sources.local.json found. Copy sources.local.json.example and fill in paths for this machine.'
	);
}

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

function getFingerprint(repoPath) {
	if (!existsSync(join(repoPath, '.git'))) return null;
	const head = git('rev-parse --short HEAD', repoPath);
	const commits = git('rev-list --count HEAD', repoPath);
	const lastCommit = git('log -1 --format=%cs', repoPath);
	if (!head) return null;
	return { head, commits: Number(commits), lastCommit };
}

// ---------------------------------------------------------------------------
// Check each tracked repo for drift
// ---------------------------------------------------------------------------

const changed = [];
const missing = [];

for (const [slug, saved] of Object.entries(manifest.sources)) {
	const repoPath = localPaths[slug];
	if (!repoPath) {
		missing.push({ slug, reason: 'no local path in sources.local.json' });
		continue;
	}

	const current = getFingerprint(repoPath);
	if (!current) {
		missing.push({ slug, reason: `path not found or not a git repo: ${repoPath}` });
		continue;
	}

	if (current.head !== saved.head) {
		const delta = current.commits - saved.commits;
		changed.push({
			slug,
			path: repoPath,
			from: { head: saved.head, commits: saved.commits, lastCommit: saved.lastCommit },
			to: current,
			delta
		});
	}
}

// ---------------------------------------------------------------------------
// Scan ~/Code for git repos not yet in the manifest
// ---------------------------------------------------------------------------

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
			// It's a git repo
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

// Exclude the portfolio repo itself, non-project repos, and known noise.
// Also exclude sub-repos that belong to split-product portfolio entries
// (tracked via sources.local.json pointing at the lead sub-repo) and
// companion repos that are deliberately not tracked separately.
const EXCLUDED = new Set([
	'portfolio',        // this repo
	'jason-warren',     // this repo (alternate name)
	'node_modules',
	'.git',
	'JasonWarrenUK',            // GitHub profile README repo
	'JasonWarrenUK.github.io',  // GitHub Pages site (not a project)
	'seam',                     // Jaz's project, not Jason's
	'terminal-config',          // dotfiles, not a portfolio project
	'yalla-gym',                // not a Jason project
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
	'mood-time',
]);
const filteredNew = newRepos.filter((r) => !EXCLUDED.has(r.name) && !EXCLUDED.has(r.normalised));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

console.log(`\n${BOLD}Portfolio source drift report${RESET} ${DIM}(${manifest.lastSyncedAt})${RESET}\n`);

if (changed.length === 0 && filteredNew.length === 0 && missing.length === 0) {
	console.log(`${GREEN}All ${Object.keys(manifest.sources).length} tracked repos are up to date. No new repos detected.${RESET}`);
} else {
	if (changed.length > 0) {
		console.log(`${YELLOW}${BOLD}Changed repos (${changed.length}):${RESET}`);
		for (const r of changed) {
			const dir = r.delta > 0 ? '+' : '';
			console.log(`  ${CYAN}${r.slug}${RESET}`);
			console.log(`    ${r.from.head} → ${r.to.head}  (${dir}${r.delta} commits, last: ${r.to.lastCommit})`);
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
}

if (UPDATE_MODE && (changed.length > 0)) {
	console.log('Updating sources.json with current fingerprints...');
	for (const r of changed) {
		manifest.sources[r.slug] = r.to;
	}
	const today = new Date().toISOString().slice(0, 10);
	manifest.lastSyncedAt = today;
	writeFileSync(sourcesPath, JSON.stringify(manifest, null, '\t') + '\n', 'utf8');
	console.log(`${GREEN}sources.json updated.${RESET}`);
}
