/**
 * Shared presentation helpers for the graph views (map, neighbourhood, threads).
 * Keeps colour and label vocabulary consistent with StatusBadge and the
 * semantic tokens in tokens.css, so every connection view reads the same.
 */

import type { EdgeCategory, ProjectStatus } from '$lib/data/types.js';
import type { GraphEdge } from '$lib/data/graph.js';

/** Status colour token, matching the status badges. */
export function statusColour(status: ProjectStatus): string {
	const map: Record<ProjectStatus, string> = {
		live: 'var(--color-live)',
		wip: 'var(--color-wip)',
		finished: 'var(--color-finished)',
		prototype: 'var(--color-prototype)',
		archived: 'var(--color-archived)',
		uncategorised: 'var(--color-uncategorised)'
	};
	return map[status];
}

/** Status labels, identical to the badge vocabulary. */
export const statusLabel: Record<ProjectStatus, string> = {
	live: 'Live',
	wip: 'Active',
	finished: 'Complete',
	prototype: 'Prototype',
	archived: 'Archived',
	uncategorised: 'Uncategorised'
};

/** Ordered status list for legends. Uncategorised last — it's a placeholder. */
export const statusOrder: ProjectStatus[] = [
	'live',
	'wip',
	'finished',
	'prototype',
	'archived',
	'uncategorised'
];

/** Human-readable label for an edge kind, phrased from source to target. */
export function edgeLabel(kind: GraphEdge['kind']): string {
	return kind === 'extraction' ? 'extracted into a library' : 'related';
}

/**
 * The full set of toggleable edge types on the map: the two curated kinds plus
 * one per shared-tech category. Keyed strings so node/edge legends and the
 * hidden-set state can share one vocabulary.
 */
export type EdgeType = GraphEdge['kind'] | EdgeCategory;

/** Colour token for a shared-tech category edge. Decorative, distinct hues. */
export function categoryColour(category: EdgeCategory): string {
	return `var(--color-edge-${category})`;
}

/** Colour token for any edge type, curated or category. */
export function edgeTypeColour(type: EdgeType): string {
	if (type === 'extraction') return 'var(--color-primary)';
	if (type === 'related') return 'var(--color-text-subtle)';
	return categoryColour(type);
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
	return categoryLabel[type];
}
