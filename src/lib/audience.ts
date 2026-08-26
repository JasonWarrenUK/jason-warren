/**
 * Home-page audience switch: which version of the home page the reader wants.
 *
 * 'developer' is the existing page (stack, engine threads, theme territories).
 * 'everyone' is the same person explained without assuming any knowledge of
 * software. The choice is remembered in localStorage under AUDIENCE_STORAGE_KEY
 * so a returning reader lands on the version they picked last time.
 *
 * Framework-free so the parser is trivially unit-testable.
 */

export type Audience = 'developer' | 'everyone';

export const AUDIENCE_STORAGE_KEY = 'home-audience';

export const DEFAULT_AUDIENCE: Audience = 'developer';

/**
 * Narrow a stored value to an Audience, falling back to the default for
 * anything absent, empty or unrecognised (an old key, a hand-edited value).
 */
export function parseAudience(raw: string | null | undefined): Audience {
	return raw === 'everyone' || raw === 'developer' ? raw : DEFAULT_AUDIENCE;
}
