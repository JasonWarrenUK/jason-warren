/**
 * Site-wide constants. Centralised so the production origin and identity
 * links live in exactly one place.
 */

/** Canonical production origin. No trailing slash. */
export const SITE_URL = 'https://jason-warren.vercel.app';

export const AUTHOR = 'Jason Warren';

export const GITHUB_URL = 'https://github.com/JasonWarrenUK/jason-warren';

export const BLUESKY_URL = 'https://bsky.app/profile/neurosocialist.bsky.social';

export const BLUESKY_HANDLE = '@neurosocialist.bsky.social';

/** Fallback description for pages that do not set their own. */
export const DEFAULT_DESCRIPTION =
	'Jason Warren is a full-stack developer whose toolkit runs unusually wide: TypeScript, Go, Rust, SvelteKit, Tauri and Neo4j, across everything from terminal tools to graph-native applications.';
