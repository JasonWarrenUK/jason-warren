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
	computeForceLayout,
	selectLabelledSlugs,
	MAP_LABEL_COUNT
} from './graph.js';
import type { Project, ProjectSlug } from './types.js';

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
	it('weights each edge by the shared tags within its own category', () => {
		const minShared = 1;
		const edges = getSharedTechEdges({ minShared });
		const labelsByKind = new Map(
			projects.map((p) => {
				const byKind = new Map<string, Set<string>>();
				for (const tag of p.tags) {
					if (!byKind.has(tag.kind)) byKind.set(tag.kind, new Set());
					byKind.get(tag.kind)!.add(tag.label);
				}
				return [p.slug, byKind];
			})
		);
		for (const edge of edges) {
			const a = labelsByKind.get(edge.source)?.get(edge.category) ?? new Set();
			const b = labelsByKind.get(edge.target)?.get(edge.category) ?? new Set();
			const shared = [...a].filter((label) => b.has(label)).length;
			expect(shared, `${edge.source}–${edge.target} (${edge.category})`).toBeGreaterThanOrEqual(
				minShared
			);
			expect(edge.weight, `${edge.source}–${edge.target} (${edge.category}) weight`).toBe(shared);
		}
	});

	it('never emits a language-category edge', () => {
		const edges = getSharedTechEdges();
		expect(edges.some((e) => (e.category as string) === 'language')).toBe(false);
	});

	it('caps each node at maxPerNode edges within a category', () => {
		const maxPerNode = 3;
		const edges = getSharedTechEdges({ maxPerNode });
		const degree = new Map<string, number>();
		for (const edge of edges) {
			const ks = `${edge.source}:${edge.category}`;
			const kt = `${edge.target}:${edge.category}`;
			degree.set(ks, (degree.get(ks) ?? 0) + 1);
			degree.set(kt, (degree.get(kt) ?? 0) + 1);
		}
		for (const [key, count] of degree) {
			expect(count, `${key} exceeds the per-category cap`).toBeLessThanOrEqual(maxPerNode);
		}
	});

	it('produces canonically ordered, non-self, unique edges', () => {
		const edges = getSharedTechEdges();
		const keys = new Set<string>();
		for (const edge of edges) {
			expect(edge.source < edge.target, `${edge.source}–${edge.target} not ordered`).toBe(true);
			keys.add(`${edge.category}:${edge.source}--${edge.target}`);
		}
		expect(keys.size).toBe(edges.length);
	});

	it('is deterministic', () => {
		expect(getSharedTechEdges()).toEqual(getSharedTechEdges());
	});
});

describe('selectLabelledSlugs', () => {
	// Minimal projects exercising one ranking axis each; only the metric fields
	// the selector reads matter, so the rest is stubbed.
	function faux(
		slug: string,
		m: { last?: string; linesAdded?: number; linesOfCode?: number; commitsRecent?: number }
	): Project {
		return {
			slug,
			name: slug,
			tagline: '',
			description: '',
			kind: 'tool',
			contribution: { role: 'solo' },
			tags: [],
			status: 'finished',
			repoUrl: '',
			highlights: [],
			relationships: [],
			lastCommit: m.last,
			metrics: {
				linesAdded: m.linesAdded,
				linesOfCode: m.linesOfCode,
				commitsRecent: m.commitsRecent
			}
		} as unknown as Project;
	}

	it('returns the configured count for the real registry, all real slugs', () => {
		const labelled = selectLabelledSlugs();
		expect(labelled.size).toBe(MAP_LABEL_COUNT);
		for (const slug of labelled) {
			expect(slugs.has(slug), `${slug} is not a real slug`).toBe(true);
		}
	});

	it('is deterministic', () => {
		expect([...selectLabelledSlugs()]).toEqual([...selectLabelledSlugs()]);
	});

	it('rotates through all four axes, one leader from each', () => {
		const list = [
			faux('recent', { last: '2026-06-01' }),
			faux('mine', { linesAdded: 9999 }),
			faux('big', { linesOfCode: 9999 }),
			faux('active', { commitsRecent: 9999 }),
			faux('filler-a', {}),
			faux('filler-b', {})
		];
		const labelled = selectLabelledSlugs(list, 4);
		expect([...labelled].sort()).toEqual(['active', 'big', 'mine', 'recent']);
	});

	it('dedupes a project that leads multiple axes, then fills from the rest', () => {
		const list = [
			// One project tops both recency and my-contribution.
			faux('double', { last: '2026-06-10', linesAdded: 9999 }),
			faux('big', { linesOfCode: 9999 }),
			faux('active', { commitsRecent: 9999 }),
			faux('next-recent', { last: '2026-06-09' }),
			faux('filler', {})
		];
		const labelled = selectLabelledSlugs(list, 4) as Set<string>;
		expect(labelled.size).toBe(4);
		expect(labelled.has('double')).toBe(true);
		expect(labelled.has('big')).toBe(true);
		expect(labelled.has('active')).toBe(true);
	});

	it('still fills when axes are unpopulated (graceful degradation)', () => {
		const list = [faux('a', {}), faux('b', {}), faux('c', {})];
		const labelled = selectLabelledSlugs(list, 2);
		expect(labelled.size).toBe(2);
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
