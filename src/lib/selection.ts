/**
 * Pure, framework-free selection helpers for cross-view project continuity.
 *
 * These underpin `selection.svelte.ts` (the rune wrapper) and are also
 * unit-testable under Vitest's node-only environment.
 */

/**
 * Validate a raw `?project=` URL param against the slugs visible in the
 * current view. A stale or absent value returns `null` so a dead pin can
 * never dim the whole view with nothing highlighted.
 */
export function validatePin(
	raw: string | null,
	isKnown: (slug: string) => boolean
): string | null {
	if (raw === null) return null;
	return isKnown(raw) ? raw : null;
}

/**
 * Toggle semantics: clicking the already-pinned slug clears it; clicking
 * any other slug sets it. Returns the next value for `writeParam`.
 */
export function nextPinValue(currentPin: string | null, clicked: string): string | null {
	return currentPin === clicked ? null : clicked;
}

/**
 * Build a bare project-detail href. The detail page shows exactly one
 * project and reads no `?project=` param, so carrying it there is noise.
 * Continuity is preserved via the detail page's outbound `viewHref` links.
 */
export function projectHref(base: string, slug: string): string {
	return `${base}/projects/${slug}`;
}

/**
 * Build a connection-view href that pins the given project on arrival.
 * Every view (`ProjectMap`, `TimelineChart`, `ThemeTerritories`) already
 * honours an incoming `?project=` param and highlights it immediately.
 */
export function viewHref(
	base: string,
	view: 'map' | 'timeline' | 'toolkit',
	slug: string
): string {
	return `${base}/${view}?project=${encodeURIComponent(slug)}`;
}
