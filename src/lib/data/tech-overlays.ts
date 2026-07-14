/**
 * Authored per-tech overlays: first-used floor dates, modal notes, kind
 * overrides and per-surface visibility, keyed by exact tag label.
 *
 * Registry-free by design: this module is imported by AdoptionTimeline.svelte
 * and by registry modules (adoption.ts, index.ts), so it must not import
 * './index.js' or anything that transitively pulls in the project registry,
 * the same constraint tech-relationships.ts documents. Labels are validated
 * against the real tag set by a data test instead of the compiler.
 *
 * Managed by `drift tech`; hand-editing is fine too.
 */

import type { TagKind, TechOverlay, TechSurface } from './types.js';

export const techOverlays: TechOverlay[] = [
	// Languages
	{ label: 'JavaScript', firstUsed: '2021-09-15' },
	{ label: 'Shell', firstUsed: '2023-06-15' },
	// Markup & styling (pre-repo history: first used years before any tracked repo)
	{ label: 'HTML', firstUsed: '2020-06-15' },
	{ label: 'CSS', firstUsed: '2020-06-15' },
	// Ink predates every tracked repo; inkjs (the runtime) has no curated floor
	// and only appears once a repo derives a date for it.
	{ label: 'Ink', firstUsed: '2019-06-15' },
	// Runtimes
	{ label: 'Node.js', firstUsed: '2021-09-15' },
	{ label: 'CPython', firstUsed: '2022-06-15' },
	{ label: 'POSIX shell', firstUsed: '2023-06-15' },
	{ label: 'Deno', firstUsed: '2025-07-15' },
	// Frameworks
	{ label: 'Express', firstUsed: '2022-11-15' },
	{ label: 'Tailwind CSS v4', firstUsed: '2025-01-15' },
	{ label: 'Oak', firstUsed: '2025-07-15' }
	// Bun, SvelteKit, Svelte 5: no curated floor. Per-tech dating (techFirstSeen)
	// derives these honestly from when they actually entered the-work's history;
	// a curated floor earlier than the true date would silently override the
	// honest derived date and reintroduce the back-dating bug techFirstSeen
	// exists to fix.
];

/** Labels hidden from the given aggregate surface. */
export function hiddenTechLabels(surface: TechSurface): Set<string> {
	const hidden = new Set<string>();
	for (const overlay of techOverlays) {
		if (overlay.hiddenFrom?.includes(surface)) hidden.add(overlay.label);
	}
	return hidden;
}

/** label → overridden kind, for the single application point in index.ts. */
export function getTechKindOverrides(): Map<string, TagKind> {
	const overrides = new Map<string, TagKind>();
	for (const overlay of techOverlays) {
		if (overlay.kind !== undefined) overrides.set(overlay.label, overlay.kind);
	}
	return overrides;
}

/** The overlay for one label, if authored. */
export function getTechOverlay(label: string): TechOverlay | undefined {
	return techOverlays.find((overlay) => overlay.label === label);
}
