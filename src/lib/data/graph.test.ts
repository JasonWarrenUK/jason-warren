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
	computeRelayoutTargets,
	countCrossings,
	buildSimLinks,
	selectLabelledSlugs,
	MAP_LABEL_COUNT
} from './graph.js';
import type { LiveSimNode } from './graph.js';
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
			track: 'product',
			progress: 'complete',
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

	it('keeps filling when a round of axis heads are all already selected', () => {
		// A tops recency; B tops the other three axes. In round two every
		// queue's head is a duplicate (the recency queue offers B, the rest
		// offer A), which the old early-exit misread as "queues drained",
		// stranding C below the requested count.
		const list = [
			faux('a', { last: '2026-06-10', linesAdded: 1, linesOfCode: 1, commitsRecent: 1 }),
			faux('b', { last: '2026-06-09', linesAdded: 99, linesOfCode: 99, commitsRecent: 99 }),
			faux('c', {})
		];
		const labelled = selectLabelledSlugs(list, 3) as Set<string>;
		expect([...labelled].sort()).toEqual(['a', 'b', 'c']);
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
	// Use no theme edges to keep the layout fast; these tests verify geometry,
	// not theme-edge influence.
	const layout = computeForceLayout(graph);

	it('positions every node', () => {
		for (const node of graph.nodes) {
			expect(layout.positions.has(node.slug), `${node.slug} has no position`).toBe(true);
		}
	});

	it('gives every node a finite position within the canvas bounds', () => {
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
		const b = computeForceLayout(graph);
		for (const [slug, point] of layout.positions) {
			expect(b.positions.get(slug)).toEqual(point);
		}
	});
});

// ---------------------------------------------------------------------------
// computeRelayoutTargets
// ---------------------------------------------------------------------------

/**
 * Build a minimal hand-crafted LiveSimNode array from a slug list,
 * positioned in a line so crossings between diagonal links are guaranteed.
 */
function makeNodes(slugs: string[], size = 500): LiveSimNode[] {
	return slugs.map((slug, i) => ({
		slug: slug as ProjectSlug,
		radius: 18,
		x: (size / (slugs.length + 1)) * (i + 1),
		y: i % 2 === 0 ? 100 : 400 // alternating rows → crossing-prone with cross-links
	}));
}

describe('computeRelayoutTargets', () => {
	const graph = getProjectGraph();
	const shared = getSharedTechEdges();

	// Use the first four slugs from the actual graph for a realistic smoke test.
	const slugs = graph.nodes.slice(0, 6).map((n) => n.slug);
	const edges = graph.edges.filter(
		(e) => slugs.includes(e.source as ProjectSlug) && slugs.includes(e.target as ProjectSlug)
	);
	const sharedEdges = shared.filter(
		(e) => slugs.includes(e.source as ProjectSlug) && slugs.includes(e.target as ProjectSlug)
	);
	const nodes = makeNodes(slugs);

	it('is deterministic: identical input yields identical positions', () => {
		const a = computeRelayoutTargets({
			nodes,
			visibleEdges: edges,
			visibleSharedEdges: sharedEdges
		});
		const b = computeRelayoutTargets({
			nodes,
			visibleEdges: edges,
			visibleSharedEdges: sharedEdges
		});
		expect(a.size).toBe(b.size);
		for (const [slug, point] of a) {
			expect(b.get(slug)).toEqual(point);
		}
	});

	it('covers all input node slugs', () => {
		const result = computeRelayoutTargets({
			nodes,
			visibleEdges: edges,
			visibleSharedEdges: sharedEdges
		});
		for (const node of nodes) {
			expect(result.has(node.slug), `${node.slug} missing from result`).toBe(true);
		}
	});

	it('returns positions that are all finite', () => {
		const result = computeRelayoutTargets({
			nodes,
			visibleEdges: edges,
			visibleSharedEdges: sharedEdges
		});
		for (const [slug, point] of result) {
			expect(Number.isFinite(point.x), `${slug}.x not finite`).toBe(true);
			expect(Number.isFinite(point.y), `${slug}.y not finite`).toBe(true);
		}
	});

	it('best-of-5 has lower or equal crossings than single seed on the tangled fixture', () => {
		// Hand-craft a crossing-prone 4-node layout with crossing links:
		//   A---D  (link A→D crosses link B→C when A/B are left, C/D are right)
		//   B---C
		const crossingNodes: LiveSimNode[] = [
			{ slug: 'a' as ProjectSlug, radius: 18, x: 50, y: 50 },
			{ slug: 'b' as ProjectSlug, radius: 18, x: 50, y: 200 },
			{ slug: 'c' as ProjectSlug, radius: 18, x: 200, y: 200 },
			{ slug: 'd' as ProjectSlug, radius: 18, x: 200, y: 50 }
		];
		const crossingEdges = [
			{ source: 'a' as ProjectSlug, target: 'd' as ProjectSlug, kind: 'related' as const },
			{ source: 'b' as ProjectSlug, target: 'c' as ProjectSlug, kind: 'related' as const }
		];

		const links = buildSimLinks(crossingEdges, []);

		const multi = computeRelayoutTargets(
			{ nodes: crossingNodes, visibleEdges: crossingEdges, visibleSharedEdges: [], size: 300 },
			{ candidates: 5, ticks: 150 }
		);
		const single = computeRelayoutTargets(
			{ nodes: crossingNodes, visibleEdges: crossingEdges, visibleSharedEdges: [], size: 300 },
			{ candidates: 1, ticks: 150 }
		);

		// Convert Map<slug, Point> to the shape scoreLayout expects.
		const toNodes = (m: Map<string, { x: number; y: number }>) =>
			[...m.entries()].map(([slug, p]) => ({ slug: slug as ProjectSlug, x: p.x, y: p.y }));

		const multiCrossings = countCrossings(toNodes(multi), links);
		const singleCrossings = countCrossings(toNodes(single), links);

		expect(multiCrossings).toBeLessThanOrEqual(singleCrossings);
	});
});

// ---------------------------------------------------------------------------
// getThemeEdges — per-theme model
// ---------------------------------------------------------------------------

import { getThemeEdges } from './graph.js';
import { themes } from './themes.js';

describe('getThemeEdges', () => {
	const edges = getThemeEdges();

	it('emits at least one edge', () => {
		expect(edges.length).toBeGreaterThan(0);
	});

	it('every edge carries a valid theme id', () => {
		const validIds = new Set(themes.map((t) => t.id));
		for (const e of edges) {
			expect(validIds.has(e.theme), `unknown theme id "${e.theme}"`).toBe(true);
		}
	});

	it('each edge connects two members of its named theme', () => {
		const membersByTheme = new Map(themes.map((t) => [t.id, new Set(t.slugs)]));
		for (const e of edges) {
			const members = membersByTheme.get(e.theme)!;
			expect(members.has(e.source), `${e.source} not in theme ${e.theme}`).toBe(true);
			expect(members.has(e.target), `${e.target} not in theme ${e.theme}`).toBe(true);
		}
	});

	it('source < target (canonical ordering)', () => {
		for (const e of edges) {
			expect(e.source <= e.target, `${e.source} > ${e.target}`).toBe(true);
		}
	});

	it('is deterministic', () => {
		expect(getThemeEdges()).toEqual(edges);
	});

	it('per-theme degree cap holds at maxPerNode: 2', () => {
		const capped = getThemeEdges({ maxPerNode: 2 });
		const degree = new Map<string, Map<string, number>>();
		for (const e of capped) {
			if (!degree.has(e.theme)) degree.set(e.theme, new Map());
			const td = degree.get(e.theme)!;
			td.set(e.source, (td.get(e.source) ?? 0) + 1);
			td.set(e.target, (td.get(e.target) ?? 0) + 1);
		}
		for (const [themeId, td] of degree) {
			for (const [slug, deg] of td) {
				expect(deg, `${slug} exceeds cap in theme ${themeId}`).toBeLessThanOrEqual(2);
			}
		}
	});
});
