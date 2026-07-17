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

// ---------------------------------------------------------------------------
// Tech-kind glyphs (colour-system.md §5)
//
// Kind is a feature class, and feature classes get symbols: every tech mark
// draws in the one tech ink, and its SHAPE carries the kind. The vocabulary
// is the abstraction-gradient variant chosen at the design review:
// language = ring + centre dot (the base survey mark; languages are the
// stations everything else is measured from), framework = hexagon (an
// assembly you build inside), runtime = triangle (engine), data = diamond
// (store), tool = square (a block you pick up), ai = four-point star
// (spark), concept = dashed ring (abstract, unbuilt).
//
// Single source for node marks AND legend mini-glyphs, so the legend always
// draws exactly what the chart draws.
// ---------------------------------------------------------------------------

export interface KindGlyph {
	/** 'circle' kinds draw <circle> rings; 'path' kinds draw kindGlyphPath. */
	shape: 'circle' | 'path';
	/** Concept's ring dashes — longer dashes than the dotted-provisional convention, and fixed to the glyph rather than the data. */
	dashed?: boolean;
	/** Language keeps the survey mark's solid centre dot; every other kind is its shape alone. */
	centreDot?: boolean;
}

/** Glyph spec per tag kind. */
export function kindGlyph(kind: TagKind): KindGlyph {
	if (kind === 'language') return { shape: 'circle', centreDot: true };
	if (kind === 'concept') return { shape: 'circle', dashed: true };
	return { shape: 'path' };
}

/** Regular polygon path with every vertex on the circumradius `r`. */
function regularPolygonPath(
	cx: number,
	cy: number,
	r: number,
	sides: number,
	startAngle: number
): string {
	const points: string[] = [];
	for (let i = 0; i < sides; i++) {
		const angle = startAngle + (2 * Math.PI * i) / sides;
		points.push(
			`${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`
		);
	}
	return `M ${points.join(' L ')} Z`;
}

/** Four-point star: outer vertices on `r`, inner pinched to `r * innerRatio`. */
function starPath(cx: number, cy: number, r: number, innerRatio = 0.42): string {
	const points: string[] = [];
	for (let i = 0; i < 8; i++) {
		const angle = -Math.PI / 2 + (Math.PI * i) / 4;
		const radius = i % 2 === 0 ? r : r * innerRatio;
		points.push(
			`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`
		);
	}
	return `M ${points.join(' L ')} Z`;
}

/** Path `d` for the polygon glyph kinds. Circle kinds never reach here. */
export function kindGlyphPath(kind: TagKind, cx: number, cy: number, r: number): string {
	switch (kind) {
		case 'framework':
			return regularPolygonPath(cx, cy, r, 6, -Math.PI / 2);
		case 'runtime':
			return regularPolygonPath(cx, cy, r, 3, -Math.PI / 2);
		case 'data':
			// Diamond: a pointy-top square, vertices on the axes.
			return regularPolygonPath(cx, cy, r, 4, -Math.PI / 2);
		case 'tool':
			// Square: axis-aligned, corners on the diagonals.
			return regularPolygonPath(cx, cy, r, 4, -Math.PI / 4);
		case 'ai':
			return starPath(cx, cy, r);
		default:
			// language/concept are circle kinds; this arm exists for exhaustiveness.
			return regularPolygonPath(cx, cy, r, 6, -Math.PI / 2);
	}
}

/**
 * The tech-mark ink: current stack in the drawing ink, historic stack one
 * shade paperward (the end-of-life convention). A technology is historic
 * when it is the source of any `replaced-by` edge.
 */
export function techMarkColour(historic: boolean): string {
	return historic ? 'var(--tech-mark-historic)' : 'var(--tech-mark)';
}

/** Colour token for any edge type, curated or category. */
export function edgeTypeColour(type: EdgeType): string {
	// Extraction is the authored survey mark of one project begetting
	// another; it draws in oxide, the accent ink (colour-system.md §5).
	if (type === 'extraction') return 'var(--edge-extraction)';
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
