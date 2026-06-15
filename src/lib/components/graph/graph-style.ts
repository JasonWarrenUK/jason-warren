/**
 * Shared presentation helpers for the graph views (map, neighbourhood, threads).
 * Keeps colour and label vocabulary consistent with StatusBadge and the
 * semantic tokens in tokens.css, so every connection view reads the same.
 */

import type { ProjectStatus } from '$lib/data/types.js';
import type { GraphEdge } from '$lib/data/graph.js';

/** Status colour token, matching the status badges. */
export function statusColour(status: ProjectStatus): string {
	const map: Record<ProjectStatus, string> = {
		live: 'var(--color-live)',
		wip: 'var(--color-wip)',
		finished: 'var(--color-finished)',
		prototype: 'var(--color-prototype)',
		archived: 'var(--color-archived)'
	};
	return map[status];
}

/** Status labels, identical to the badge vocabulary. */
export const statusLabel: Record<ProjectStatus, string> = {
	live: 'Live',
	wip: 'Active',
	finished: 'Complete',
	prototype: 'Prototype',
	archived: 'Archived'
};

/** Ordered status list for legends. */
export const statusOrder: ProjectStatus[] = ['live', 'wip', 'finished', 'prototype', 'archived'];

/** Human-readable label for an edge kind, phrased from source to target. */
export function edgeLabel(kind: GraphEdge['kind']): string {
	return kind === 'extraction' ? 'extracted into a library' : 'related';
}
