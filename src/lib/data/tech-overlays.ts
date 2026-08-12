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
	{ label: 'HTML', firstUsed: '2019-12-01' },
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
	{ label: 'Oak', firstUsed: '2025-07-15' },
	{ label: 'Svelte 4', firstUsed: '2024-11-01' },
	{ label: 'Tailwind CSS', hiddenFrom: ['toolkit', 'map', 'stack', 'relate'] },
	{ label: '.NET', hiddenFrom: ['toolkit', 'map', 'stack', 'relate'] },
	{ label: 'C', hiddenFrom: ['toolkit', 'map', 'stack', 'relate'] },
	// Dual-kind labels pinned to one kind (4QU.8). Both carried two kinds across
	// the registry, and every surface resolved them by first-occurrence in
	// registry order: a silent dependency on authoring order that could flip a
	// label's glyph on the map, or drop it from a surface entirely, purely from
	// an unrelated edit elsewhere. Pinning makes the choice explicit and stable.
	//
	// Vite is a build tool that projects reach for as part of a framework setup;
	// top-girls authors it as 'tool' while the dependency parser infers
	// 'framework'. Framework is the honest reading and the one already shown.
	{ label: 'Vite', kind: 'framework' },
	// Go is detected both as a language (file extensions) and a runtime (the
	// toolchain). Language is the reading that matters for a breadth claim, and
	// keeps it beside Rust and C# on the timeline.
	{ label: 'Go', kind: 'language' },
	// Data-shape descriptors, not adopted technologies. They are legitimate
	// `data` tags (the map reads them as real architectural choices) but an
	// adoption timeline is a claim about tools picked up on a date, and
	// "no persistence" was never adopted. stack.ts excludes the same three via
	// its DATA_TECH allowlist.
	{ label: 'Document / JSON', hiddenFrom: ['toolkit'] },
	{ label: 'Ephemeral / in-memory', hiddenFrom: ['toolkit'] },
	{ label: 'No persistence', hiddenFrom: ['toolkit'] }
	// Bun, SvelteKit, Svelte 5: no curated floor. Per-tech dating (detectedTechFirstSeen)
	// derives these honestly from when they actually entered the-work's history;
	// a curated floor earlier than the true date would silently override the
	// honest derived date and reintroduce the back-dating bug detectedTechFirstSeen
	// exists to fix.
];

/**
 * Which tag kinds each aggregate surface admits (4QU.8).
 *
 * Both surfaces derive from the same registry tags and the same canonical
 * labels, so the vocabularies never disagreed on spelling. What they disagreed
 * on was scope, and the two rules lived 200 lines apart in different modules:
 * the map excluded languages inside getTechNodes, the toolkit listed its kinds
 * in a private DEFAULT_KINDS. The result was 66 labels on one surface and 32 on
 * the other with only 22 in common, and no single place stating why.
 *
 * Stated together, each exclusion has to earn itself:
 *
 * - `map` excludes languages deliberately. TypeScript sits on 27 of 33
 *   projects; as a node it is a hub wired to nearly everything, which buries
 *   the co-occurrence clusters the constellation exists to show.
 * - `toolkit` excludes `tool`, `ai` and `concept`. An adoption timeline is a
 *   claim about tools picked up and kept; "Accessibility" and "PWA" are
 *   properties of work, not things adopted on a date.
 * - `toolkit` admits `data`. Databases are adopted exactly like frameworks
 *   are, and excluding them left the page silently claiming no database
 *   experience at all.
 * - `stack` and `relate` keep their own narrower policies, applied by their
 *   own modules (stack.ts allowlists, tech-relationships.ts authorship).
 */
export const SURFACE_KINDS: Record<TechSurface, readonly TagKind[]> = {
	toolkit: ['language', 'framework', 'runtime', 'data'],
	map: ['framework', 'runtime', 'data', 'tool', 'ai', 'concept'],
	stack: ['language', 'framework', 'runtime', 'data', 'tool'],
	relate: ['language', 'framework', 'runtime', 'data', 'tool', 'ai', 'concept']
};

/** Whether a tag kind is admitted by the given aggregate surface. */
export function surfaceAdmitsKind(surface: TechSurface, kind: TagKind): boolean {
	return SURFACE_KINDS[surface].includes(kind);
}

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
