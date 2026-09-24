/**
 * Site-wide constants. Centralised so the production origin and identity
 * links live in exactly one place.
 */

export const AUTHOR = 'Jason Warren';
export const EMAIL = 'contact.jwarren@gmail.com';
// export const EMAIL = 'jason@foundersandcoders.com';

/** Canonical production origin. No trailing slash. */
export const SITE_URL = 'https://jason-warren.vercel.app';

/** URL of the portfolio source repository. */
export const GITHUB_REPO_URL = 'https://github.com/JasonWarrenUK/jason-warren';
/** URL of the GitHub profile. */
export const GITHUB_PROFILE_URL = 'https://github.com/JasonWarrenUK';

export const BLUESKY_URL = 'https://bsky.app/profile/neurosocialist.bsky.social';
export const BLUESKY_HANDLE = '@neurosocialist.bsky.social';

/** Fallback description for pages that do not set their own. */
export const DEFAULT_DESCRIPTION =
	'Developer at Tandem Creative Dev. TypeScript, Go, SvelteKit, PostgreSQL, Neo4j and Bun; everything from terminal tools to graph-native applications.';

/**
 * Fixed dimensions of every OG card (see $lib/og/card.ts). Lives here, not
 * in card.ts, so the client-safe Seo component can read them without pulling
 * in card.ts's build-time-only font loading (node:fs, createRequire).
 */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
