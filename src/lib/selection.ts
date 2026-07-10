/**
 * Pure, framework-free selection helpers for cross-view project continuity.
 *
 * These underpin `selection.svelte.ts` (the rune wrapper) and are also
 * unit-testable under Vitest's node-only environment.
 */

import { encodeTagSet, encodeTechLabel } from './url-state.js';

/**
 * Validate a raw `?project=` URL param against the slugs visible in the
 * current view. A stale or absent value returns `null` so a dead pin can
 * never dim the whole view with nothing highlighted.
 */
export function validatePin(raw: string | null, isKnown: (slug: string) => boolean): string | null {
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
export function viewHref(base: string, view: 'map' | 'timeline' | 'toolkit', slug: string): string {
	return `${base}/${view}?project=${encodeURIComponent(slug)}`;
}

/**
 * Build a `/projects` href pre-filtered to a single technology tag.
 *
 * `/projects` reads the plural `?tags=` param (a comma-joined set, each token
 * percent-encoded — see `decodeTagSet`), so a single-tag link must still go
 * through that codec rather than a bare `?tag=`. Single-sourced here so every
 * "see projects using this" link (adoption timeline, map) stays correct.
 */
export function projectsByTagHref(base: string, label: string): string {
	return `${base}/projects?tags=${encodeTagSet(new Set([label]))}`;
}

/**
 * Build a connection-view href that pins the given technology on arrival.
 * `ProjectMap` (technologies mode) and `AdoptionTimeline` both honour an
 * incoming `?tech=` param; the map additionally needs `&mode=technologies`
 * to land on the surface that renders tech nodes at all.
 */
export function techViewHref(base: string, view: 'map' | 'toolkit', label: string): string {
	const tech = `tech=${encodeTechLabel(label)}`;
	return view === 'map' ? `${base}/map?mode=technologies&${tech}` : `${base}/toolkit?${tech}`;
}
