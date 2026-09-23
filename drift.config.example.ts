/**
 * drift.config.ts — per-machine Drift engine config.
 *
 * Copy this file to `drift.config.ts` (gitignored) and edit. Every key is optional;
 * omitted keys fall back to Drift's built-in defaults, which reproduce the original
 * portfolio behaviour. Run `bun run drift --help` to confirm the config loads.
 *
 * Set the DRIFT_CONFIG env variable to an alternative path if you want to keep
 * the config somewhere other than the repository root.
 *
 * `drift init` scaffolds a narrower version of this shape: it omits `files`
 * entirely, so a fresh config silently inherits its built-in default from
 * drift-config.js until you add it by hand (copying from this file, or from
 * the keys documented below).
 */

/** @type {import('./scripts/drift-config.js').DriftUserConfig} */
export default {
	/**
	 * Where the four data files live, relative to the repo root (or absolute).
	 * Default: 'src/lib/data'
	 */
	dataDir: 'src/lib/data',

	/**
	 * Optional per-file path overrides, keyed by logical name.
	 * Use when one file lives outside the data directory.
	 * Logical names: sources, topology, local, overrides, excluded, cache,
	 * projects, inProgress.
	 * Paths may be absolute or relative to the repo root.
	 */
	// files: {
	//   cache: '/tmp/.drift-cache.json'
	// },

	/**
	 * Root directory scanned for git repos not yet in the manifest.
	 * Paired to `excludedRepoNames` — update both when configuring a new machine.
	 * Default: ~/Code
	 */
	scanRoot: '/Users/you/Code',

	/**
	 * Maximum directory depth for the git-repo scan.
	 * Default: 3
	 */
	scanDepth: 3,

	/**
	 * Bounded-concurrency pool size for `drift enrich`'s gh repo view fan-out.
	 * Fixed and small rather than cpu-count-scaled: this pool crosses the
	 * network, and GitHub answers a large concurrent burst with secondary
	 * rate limits.
	 * Default: 4
	 */
	enrichConcurrency: 4,

	author: {
		/**
		 * Extended-regexp alternation over your git identities across repos.
		 * Used as the --author flag in commit/churn queries so "by me" metrics
		 * count your work and not collaborators'. A miss degrades to 0, never an error.
		 * Default: Jason Warren's identities (replace with your own).
		 */
		pattern: 'Your Name|you@example.com',

		/**
		 * Trailing window for "recent" metrics. Accepts git --since values.
		 * Appears in report output. Default: '4 weeks ago'
		 */
		recentWindow: '4 weeks ago',

		/**
		 * Extended-regexp alternation matching non-human commit authors: CI bots
		 * and GitHub Actions by default. Excluded from the all-authors commit
		 * count so co-authorship means a human collaborator, not a bot.
		 * Extend with AI-agent identities if agents commit under their own
		 * identity in your repos, e.g. append |noreply@anthropic\\.com.
		 * Default: '\\[bot\\]|github-actions'
		 */
		botPattern: '\\[bot\\]|github-actions'
	},

	/**
	 * Repository folder names excluded from the directory scan.
	 * Paired to `scanRoot` — these are the folder names that should never appear
	 * in the portfolio (the portfolio repo itself, sub-repos, non-project tooling).
	 * Default: the original 18 portfolio-specific names.
	 */
	excludedRepoNames: ['your-portfolio', 'node_modules', '.git'],

	/** gum UI theme. */
	theme: {
		/** Cursor, selection, and border foreground colour (hex). Default: '#3E7F96' (teal). */
		primary: '#3E7F96',
		/** Item and wordmark foreground colour (hex). Default: '#B34480' (magenta). */
		accent: '#B34480',
		/** Theme name passed to `gum format --theme`. Default: 'pink'. */
		markdownTheme: 'pink'
	}
};
