/**
 * Tests for the normalised project graph.
 *
 * These cover the two things that are easy to get wrong when collapsing a
 * reciprocal, per-project edge list into a single graph: edge integrity
 * (no dangling or duplicated edges) and layout determinism.
 */

import { describe, it, expect } from 'vitest';
import { projects } from './index.js';
import {
	getProjectGraph,
	getNeighbours,
	getTechIndex,
	getSharedTechEdges,
	computeForceLayout
} from './graph.js';
import type { ProjectSlug } from './types.js';

const slugs = new Set<ProjectSlug>(projects.map((p) => p.slug));

describe('getProjectGraph', () => {
	const graph = getProjectGraph();

	it('has one node per project', () => {
		expect(graph.nodes).toHaveLength(projects.length);
	});

	it('every edge endpoint resolves to a real slug', () => {
		const broken: string[] = [];
		for (const edge of graph.edges) {
			if (!slugs.has(edge.source)) broken.push(`source ${edge.source}`);
			if (!slugs.has(edge.target)) broken.push(`target ${edge.target}`);
		}
		expect(broken, `Dangling edge endpoints: ${broken.join(', ')}`).toHaveLength(0);
	});

	it('collapses reciprocal extraction edges to a single directed edge', () => {
		// Count raw `powers` edges in the source data; the graph should have
		// exactly that many extraction edges (the reciprocal extracted-from
		// edges must not produce duplicates).
		const rawPowers = projects.reduce(
			(total, p) => total + p.relationships.filter((r) => r.kind === 'powers').length,
			0
		);
		const extractionEdges = graph.edges.filter((e) => e.kind === 'extraction');
		expect(extractionEdges).toHaveLength(rawPowers);
	});

	it('has no duplicate edges', () => {
		const keys = graph.edges.map((e) =>
			e.kind === 'related'
				? `related:${[e.source, e.target].sort().join('--')}`
				: `extraction:${e.source}->${e.target}`
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('extraction edges run library → consumer', () => {
		// The source of an extraction edge declared the `powers` relationship.
		for (const edge of graph.edges) {
			if (edge.kind !== 'extraction') continue;
			const source = projects.find((p) => p.slug === edge.source);
			expect(
				source?.relationships.some((r) => r.kind === 'powers' && r.target === edge.target),
				`${edge.source} → ${edge.target} is not backed by a powers edge`
			).toBe(true);
		}
	});
});

describe('getNeighbours', () => {
	it('returns neighbours reciprocally: if A neighbours B, B neighbours A', () => {
		const mismatches: string[] = [];
		for (const project of projects) {
			for (const neighbour of getNeighbours(project.slug)) {
				const back = getNeighbours(neighbour.project.slug).some(
					(n) => n.project.slug === project.slug
				);
				if (!back) {
					mismatches.push(`${project.slug} sees ${neighbour.project.slug} but not vice versa`);
				}
			}
		}
		expect(mismatches, mismatches.join('\n')).toHaveLength(0);
	});

	it('never lists a project as its own neighbour', () => {
		for (const project of projects) {
			const self = getNeighbours(project.slug).some((n) => n.project.slug === project.slug);
			expect(self, `${project.slug} is its own neighbour`).toBe(false);
		}
	});
});

describe('getTechIndex', () => {
	const index = getTechIndex();

	it('maps every tag label to at least one project', () => {
		for (const [label, owners] of index) {
			expect(owners.length, `${label} has no projects`).toBeGreaterThan(0);
		}
	});

	it('lists a project under each of its tags', () => {
		const missing: string[] = [];
		for (const project of projects) {
			for (const tag of project.tags) {
				if (!index.get(tag.label)?.includes(project.slug)) {
					missing.push(`${project.slug} missing under ${tag.label}`);
				}
			}
		}
		expect(missing, missing.join('\n')).toHaveLength(0);
	});

	it('is sorted by label', () => {
		const labels = [...index.keys()];
		const sorted = [...labels].sort((a, b) => a.localeCompare(b));
		expect(labels).toEqual(sorted);
	});
});

describe('getSharedTechEdges', () => {
	it('only links projects that share at least minShared tags', () => {
		const minShared = 3;
		const edges = getSharedTechEdges({ minShared });
		const bySlug = new Map(projects.map((p) => [p.slug, new Set(p.tags.map((t) => t.label))]));
		for (const edge of edges) {
			const a = bySlug.get(edge.source)!;
			const b = bySlug.get(edge.target)!;
			const shared = [...a].filter((label) => b.has(label)).length;
			expect(shared, `${edge.source}–${edge.target}`).toBeGreaterThanOrEqual(minShared);
			expect(edge.weight, `${edge.source}–${edge.target} weight`).toBe(shared);
		}
	});

	it('caps each node at maxPerNode edges', () => {
		const maxPerNode = 3;
		const edges = getSharedTechEdges({ maxPerNode });
		const degree = new Map<string, number>();
		for (const edge of edges) {
			degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
			degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
		}
		for (const [slug, count] of degree) {
			expect(count, `${slug} exceeds the cap`).toBeLessThanOrEqual(maxPerNode);
		}
	});

	it('produces canonically ordered, non-self, unique edges', () => {
		const edges = getSharedTechEdges();
		const keys = new Set<string>();
		for (const edge of edges) {
			expect(edge.source < edge.target, `${edge.source}–${edge.target} not ordered`).toBe(true);
			keys.add(`${edge.source}--${edge.target}`);
		}
		expect(keys.size).toBe(edges.length);
	});

	it('is deterministic', () => {
		expect(getSharedTechEdges()).toEqual(getSharedTechEdges());
	});
});

describe('computeForceLayout', () => {
	const graph = getProjectGraph();
	const shared = getSharedTechEdges();

	it('positions every node', () => {
		const layout = computeForceLayout(graph, shared);
		for (const node of graph.nodes) {
			expect(layout.positions.has(node.slug), `${node.slug} has no position`).toBe(true);
		}
	});

	it('gives every node a finite position within the canvas bounds', () => {
		const layout = computeForceLayout(graph, shared);
		for (const [slug, point] of layout.positions) {
			expect(Number.isFinite(point.x), `${slug}.x not finite`).toBe(true);
			expect(Number.isFinite(point.y), `${slug}.y not finite`).toBe(true);
			expect(point.x, `${slug}.x out of bounds`).toBeGreaterThanOrEqual(0);
			expect(point.x, `${slug}.x out of bounds`).toBeLessThanOrEqual(layout.width);
			expect(point.y, `${slug}.y out of bounds`).toBeGreaterThanOrEqual(0);
			expect(point.y, `${slug}.y out of bounds`).toBeLessThanOrEqual(layout.height);
		}
	});

	it('is deterministic: identical input yields identical coordinates', () => {
		const a = computeForceLayout(graph, shared);
		const b = computeForceLayout(graph, shared);
		for (const [slug, point] of a.positions) {
			expect(b.positions.get(slug)).toEqual(point);
		}
	});
});
