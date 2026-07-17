/**
 * Shared presentation helpers for the graph views (map, neighbourhood, threads).
 * Keeps colour and label vocabulary consistent with StageBadge and the
 * semantic tokens in tokens.css, so every connection view reads the same.
 */

import type {
	EdgeCategory,
	LineageKind,
	ProjectProgress,
	ProjectTrack,
	TagKind
} from '$lib/data/types.js';
import type { GraphEdge } from '$lib/data/graph.js';
import { themes } from '$lib/data/themes.js';

// ---------------------------------------------------------------------------
// Track × progress vocabulary (colour-system.md §3)
//
// THE single source for stage labels, orders and colours. Badges, filters and
// every graph view import from here; the old status vocabulary was triplicated
// across the old StatusBadge, FilterBar and this file; now it lives here alone.
// ---------------------------------------------------------------------------

/** Track labels: intent, not maturity. A finished spike is a spike that worked. */
export const trackLabel: Record<ProjectTrack, string> = {
	exploration: 'Spike',
	product: 'Product'
};

export const progressLabel: Record<ProjectProgress, string> = {
	'in-progress': 'Building',
	complete: 'Complete'
};

export const trackOrder: ProjectTrack[] = ['product', 'exploration'];

export const progressOrder: ProjectProgress[] = ['in-progress', 'complete'];

/**
 * Progress ink for a project's marks, rails and rings. Archived applies the
 * end-of-life convention: the same hue, one shade nearer the paper.
 */
export function progressColour(progress: ProjectProgress, archived = false): string {
	if (progress === 'in-progress') {
		return archived ? 'var(--progress-in-progress-archived)' : 'var(--progress-in-progress)';
	}
	return archived ? 'var(--progress-complete-archived)' : 'var(--progress-complete)';
}

/** Human-readable label for an edge kind, phrased from source to target. */
export function edgeLabel(kind: GraphEdge['kind']): string {
	return kind === 'extraction' ? 'extracted into a library' : 'related';
}

// ---------------------------------------------------------------------------
// Theme edge types
// ---------------------------------------------------------------------------

/**
 * A theme edge type is a keyed string `theme:<themeId>` so each theme can be
 * toggled independently in the legend.
 */
export type ThemeEdgeType = `theme:${string}`;

/** Constructs the edge type key for a given theme id. */
export function themeEdgeType(themeId: string): ThemeEdgeType {
	return `theme:${themeId}`;
}

/** Returns true when an EdgeType string belongs to a theme edge. */
export function isThemeEdgeType(type: string): type is ThemeEdgeType {
	return type.startsWith('theme:');
}

/** Returns true when an EdgeType string is a tech lineage kind. */
export function isLineageKind(type: string): type is LineageKind {
	return type === 'leads-to' || type === 'replaced-by';
}

/** CSS colour token for a theme edge. */
export function themeColour(themeId: string): string {
	return `var(--color-edge-theme-${themeId})`;
}

/** id → name lookup, built from themes.ts. */
const themeNameById: Record<string, string> = Object.fromEntries(themes.map((t) => [t.id, t.name]));

/** Human-readable label for a theme edge type. */
export function themeLabel(themeId: string): string {
	return themeNameById[themeId] ?? themeId;
}

/** Theme ids in registry order, for consistent legend ordering. */
export const themeIds: string[] = themes.map((t) => t.id);

// ---------------------------------------------------------------------------
// Unified edge type vocabulary
// ---------------------------------------------------------------------------

/**
 * The full set of toggleable edge types on the map: the two curated kinds, one
 * per-theme type for relationships mode, and one per shared-tech category for
 * stack mode. Keyed strings so node/edge legends and the hidden-set state can
 * share one vocabulary.
 */
export type EdgeType = GraphEdge['kind'] | ThemeEdgeType | EdgeCategory | LineageKind;

/** Colour token for a shared-tech category edge. Decorative, distinct hues. */
export function categoryColour(category: EdgeCategory): string {
	return `var(--color-edge-${category})`;
}

/**
 * Colour token for a tech node by its tag kind. Language tags take the primary
 * colour (they are the spine of the toolkit); all other kinds use the same edge
 * category tokens so colour vocabulary stays consistent across map and timeline.
 *
 * Single-sourced here so both `AdoptionTimeline` and `ProjectMap` (tech mode)
 * use the same mapping.
 */
export function techKindColour(kind: TagKind): string {
	if (kind === 'language') return 'var(--color-primary)';
	if (kind === 'concept') return 'var(--color-edge-concept)';
	// runtime, framework, data, ai, tool are all EdgeCategory members.
	return categoryColour(kind as Exclude<TagKind, 'language' | 'concept'>);
}

/** Colour token for any edge type, curated or category. */
export function edgeTypeColour(type: EdgeType): string {
	if (type === 'extraction') return 'var(--color-primary)';
	if (type === 'related') return 'var(--color-text-subtle)';
	if (type === 'leads-to') return 'var(--color-edge-lineage-leads-to)';
	if (type === 'replaced-by') return 'var(--color-edge-lineage-replaced-by)';
	if (isThemeEdgeType(type)) return themeColour(type.slice('theme:'.length));
	return categoryColour(type as EdgeCategory);
}

/** Short legend label for a shared-tech category. */
export const categoryLabel: Record<EdgeCategory, string> = {
	runtime: 'Runtime',
	framework: 'Framework',
	data: 'Data',
	ai: 'AI',
	concept: 'Concept',
	tool: 'Tooling'
};

/** Legend label for any edge type, curated or category. */
export function edgeTypeLabel(type: EdgeType): string {
	if (type === 'extraction') return 'Extraction';
	if (type === 'related') return 'Related';
	if (type === 'leads-to') return 'Leads to';
	if (type === 'replaced-by') return 'Replaced by';
	if (isThemeEdgeType(type)) return themeLabel(type.slice('theme:'.length));
	return categoryLabel[type as EdgeCategory];
}
