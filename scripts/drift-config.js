/**
 * Drift engine config layer.
 *
 * Owns the built-in defaults (reproducing the original hard-coded values exactly)
 * and a best-effort async loader that merges a per-machine `drift.config.ts` over
 * those defaults. Every key in the user config is optional; missing keys fall back
 * to the built-in values so an un-configured checkout behaves identically to before.
 *
 * Config resolution order:
 *   1. `DRIFT_CONFIG` env variable (absolute or repo-relative path)
 *   2. `<repoRoot>/drift.config.ts`
 *   3. Built-in defaults (the previous hard-coded values)
 *
 * Usage:
 *   import { loadConfig } from './drift-config.js';
 *   const config = await loadConfig();  // top-level await in the calling ESM module
 */

import { existsSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { homedir } from 'os';

// ---------------------------------------------------------------------------
// Repo root — derived once here so check-drift.js does not need its own copy.
// ---------------------------------------------------------------------------

const scriptDir = fileURLToPath(new URL('.', import.meta.url));

/** Absolute path to the repository root (parent of `scripts/`). */
export const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Built-in defaults
//
// These reproduce every value that was previously hard-coded in check-drift.js.
// They are the single authoritative source of truth for the default config shape.
// ---------------------------------------------------------------------------

/** @type {import('./drift-config.js').DriftUserConfig} */
const DEFAULTS = {
	/** Where the four data files live, relative to repoRoot (or absolute). */
	dataDir: 'src/lib/data',

	/**
	 * Optional per-file path overrides, keyed by logical name.
	 * Each value may be absolute or repo-relative.
	 * Logical names: sources, local, overrides, excluded, cache, projects.
	 */
	files: {},

	/** Root directory scanned for un-tracked git repos. */
	scanRoot: join(homedir(), 'Code'),

	/** Maximum directory depth for the git-repo scan. */
	scanDepth: 3,

	author: {
		/**
		 * Extended-regexp alternation over the author's git identities.
		 * Used as the `--author` flag in commit/churn queries so "by me" metrics
		 * count only the portfolio owner's work. A miss degrades to 0, never an error.
		 */
		pattern:
			'Jason Warren|jasonwarren|contact\\.jwarren@gmail\\.com|jason@yallacooperative\\.com|jason@foundersandcoders\\.com',

		/** Trailing window for "recent" metrics. Appears in report output. */
		recentWindow: '4 weeks ago'
	},

	/**
	 * Repository folder names excluded from the directory scan.
	 * Paired to `scanRoot` — both should move together when configuring a new machine.
	 * These are checked against the raw folder name and its kebab-case normalisation.
	 */
	excludedRepoNames: [
		'portfolio',
		'jason-warren',
		'node_modules',
		'.git',
		'JasonWarrenUK',
		'JasonWarrenUK.github.io',
		'seam',
		'terminal-config',
		'yalla-gym',
		'beacons-backend',
		'beacons-frontend-v2',
		'craft-and-graft-front',
		'craft-and-graft-api',
		'sakura-api',
		'sakura-front',
		'mood-time-api',
		'mood-time-front',
		'mood-time'
	],

	theme: {
		/** gum border / cursor / selection foreground colour (hex). */
		primary: '#3E7F96',
		/** gum item / wordmark foreground colour (hex). */
		accent: '#B34480',
		/** Theme name passed to `gum format --theme`. */
		markdownTheme: 'pink'
	}
};

export { DEFAULTS };

// ---------------------------------------------------------------------------
// Path resolution helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a single data-file path.
 * Checks the per-file override map first; falls back to `dataDirAbs/defaultRelative`.
 * Absolute overrides pass through unchanged; relative overrides resolve from repoRoot.
 *
 * @param {string} dataDirAbs - Absolute path to the data directory.
 * @param {Record<string,string>} files - Per-file override map from user config.
 * @param {string} logicalName - Key in the files map (e.g. 'sources', 'cache').
 * @param {string} defaultRelative - Default filename/dirname relative to dataDirAbs.
 * @returns {string}
 */
function resolveDataPath(dataDirAbs, files, logicalName, defaultRelative) {
	const override = files?.[logicalName];
	if (override) return isAbsolute(override) ? override : join(repoRoot, override);
	return join(dataDirAbs, defaultRelative);
}

// ---------------------------------------------------------------------------
// Config merging
// ---------------------------------------------------------------------------

/**
 * Merge a user-supplied config object over DEFAULTS and compute absolute paths.
 * Performs a shallow merge with one explicit nested level for `author`, `theme`,
 * and `files`, so individual nested keys can be overridden without clobbering siblings.
 *
 * @param {import('./drift-config.js').DriftUserConfig | null | undefined} user
 * @returns {import('./drift-config.js').DriftResolvedConfig}
 */
function buildConfig(user) {
	const merged = {
		...DEFAULTS,
		...user,
		author: { ...DEFAULTS.author, ...(user?.author ?? {}) },
		theme: { ...DEFAULTS.theme, ...(user?.theme ?? {}) },
		files: { ...DEFAULTS.files, ...(user?.files ?? {}) }
	};

	const dataDirAbs = isAbsolute(merged.dataDir)
		? merged.dataDir
		: join(repoRoot, merged.dataDir);

	const paths = {
		sources: resolveDataPath(dataDirAbs, merged.files, 'sources', 'sources.json'),
		local: resolveDataPath(dataDirAbs, merged.files, 'local', 'sources.local.json'),
		overrides: resolveDataPath(dataDirAbs, merged.files, 'overrides', 'overrides.json'),
		excluded: resolveDataPath(dataDirAbs, merged.files, 'excluded', 'excluded.json'),
		cache: resolveDataPath(dataDirAbs, merged.files, 'cache', '.drift-cache.json'),
		projects: resolveDataPath(dataDirAbs, merged.files, 'projects', 'projects')
	};

	return {
		repoRoot,
		paths,
		scanRoot: merged.scanRoot,
		scanDepth: merged.scanDepth,
		author: merged.author,
		excludedRepoNames: merged.excludedRepoNames,
		theme: merged.theme
	};
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and merge the per-machine Drift config. Best-effort: any load or parse
 * failure emits a single stderr warning and returns built-in defaults. Never throws.
 *
 * Resolution order:
 *   1. `DRIFT_CONFIG` env variable (absolute or repo-relative path)
 *   2. `<repoRoot>/drift.config.ts`
 *   3. Built-in defaults
 *
 * @returns {Promise<import('./drift-config.js').DriftResolvedConfig>}
 */
export async function loadConfig() {
	let candidate;

	if (process.env.DRIFT_CONFIG) {
		candidate = isAbsolute(process.env.DRIFT_CONFIG)
			? process.env.DRIFT_CONFIG
			: join(repoRoot, process.env.DRIFT_CONFIG);
	} else {
		candidate = join(repoRoot, 'drift.config.ts');
	}

	if (!existsSync(candidate)) {
		return buildConfig(null);
	}

	try {
		const mod = await import(pathToFileURL(candidate).href);
		const user = mod.default ?? mod.config ?? mod;
		return buildConfig(user);
	} catch (err) {
		process.stderr.write(
			`[drift] Warning: could not load ${candidate} (${err?.message ?? err}). Using built-in defaults.\n`
		);
		return buildConfig(null);
	}
}

// ---------------------------------------------------------------------------
// JSDoc types
//
// Exported as @typedef so drift.config.ts and the drift init generator can
// reference DriftUserConfig without needing TypeScript imports at runtime.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} DriftAuthorConfig
 * @property {string} [pattern] - Extended-regexp alternation for git --author.
 * @property {string} [recentWindow] - Value for git --since ("N weeks ago" etc.).
 */

/**
 * @typedef {Object} DriftThemeConfig
 * @property {string} [primary] - gum cursor/selection foreground colour (hex).
 * @property {string} [accent] - gum item/wordmark foreground colour (hex).
 * @property {string} [markdownTheme] - gum format --theme value (e.g. 'pink').
 */

/**
 * User-supplied config shape. Every field is optional; omitted fields fall back
 * to the built-in defaults, which reproduce the original hard-coded behaviour.
 *
 * @typedef {Object} DriftUserConfig
 * @property {string} [dataDir] - Path to the data directory (repo-relative or absolute). Default: 'src/lib/data'.
 * @property {Record<string,string>} [files] - Per-file path overrides (logical name → path). Logical names: sources, local, overrides, excluded, cache, projects.
 * @property {string} [scanRoot] - Root directory scanned for un-tracked git repos. Default: ~/Code.
 * @property {number} [scanDepth] - Maximum recursion depth for the scan. Default: 3.
 * @property {DriftAuthorConfig} [author] - Git author identity config.
 * @property {string[]} [excludedRepoNames] - Folder names excluded from the scan (paired to scanRoot).
 * @property {DriftThemeConfig} [theme] - gum UI theme config.
 */

/**
 * Fully-resolved config object returned by loadConfig(). All paths are absolute.
 *
 * @typedef {Object} DriftResolvedConfig
 * @property {string} repoRoot - Absolute path to the repository root.
 * @property {{ sources: string, local: string, overrides: string, excluded: string, cache: string, projects: string }} paths - Absolute paths to each data file/directory.
 * @property {string} scanRoot - Absolute root for the git-repo scan.
 * @property {number} scanDepth - Maximum scan depth.
 * @property {Required<DriftAuthorConfig>} author - Resolved author config.
 * @property {string[]} excludedRepoNames - Repo folder names to exclude from the scan.
 * @property {Required<DriftThemeConfig>} theme - Resolved theme config.
 */
