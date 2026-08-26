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
	getStackGroups,
	stackItemsFor,
	keepLegibleEdges,
	computeForceLayout,
	computeRelayoutTargets,
	countCrossings,
	buildSimLinks,
	selectLabelledSlugs,
	MAP_LABEL_COUNT
} from './graph.js';
import { EDGE_CATEGORIES } from './types.js';
import type { LiveSimNode } from './graph.js';
import type { Project, ProjectSlug, TechTag } from './types.js';

const slugs = new Set<ProjectSlug>(projects.map((p) => p.slug));

type Endpoints = { source: string; target: string };

/** Connected components among the endpoints of `universe`, joined by `edges`. */
function componentCount(edges: Endpoints[], universe: Endpoints[]): number {
	const parent = new Map<string, string>();
	const find = (n: string): string => {
		if (!parent.has(n)) parent.set(n, n);
		let r = n;
		while (parent.get(r) !== r) r = parent.get(r)!;
		parent.set(n, r);
		return r;
	};
	for (const e of universe) {
		find(e.source);
		find(e.target);
	}
	for (const e of edges) parent.set(find(e.source), find(e.target));
	const roots = new Set<string>();
	for (const n of parent.keys()) roots.add(find(n));
	return roots.size;
}

/** How many edges a bare per-node cap keeps from strongest-first `candidates`. */
function bareCapCount(candidates: Endpoints[], maxPerNode: number): number {
	const degree = new Map<string, number>();
	let kept = 0;
	for (const e of candidates) {
		const ds = degree.get(e.source) ?? 0;
		const dt = degree.get(e.target) ?? 0;
		if (ds >= maxPerNode || dt >= maxPerNode) continue;
		degree.set(e.source, ds + 1);
		degree.set(e.target, dt + 1);
		kept++;
	}
	return kept;
}

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

	it('caps each node per category, allowing only bridge edges past the cap', () => {
		const maxPerNode = 3;
		const edges = getSharedTechEdges({ maxPerNode });
		const uncapped = getSharedTechEdges({ maxPerNode: Number.POSITIVE_INFINITY });
		for (const category of EDGE_CATEGORIES) {
			const kept = edges.filter((e) => e.category === category);
			const candidates = uncapped.filter((e) => e.category === category);
			// Every kept edge is a real candidate, and the kept set connects
			// exactly what the candidates connect: no cluster is severed by the cap.
			expect(componentCount(kept, candidates)).toBe(componentCount(candidates, candidates));
			// Degree overshoot is bounded by the number of bridges the cap made
			// necessary, which is at most (clusters under the bare cap - 1).
			const degree = new Map<string, number>();
			for (const edge of kept) {
				degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
				degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
			}
			const bridges = kept.length - bareCapCount(candidates, maxPerNode);
			for (const [slug, count] of degree) {
				expect(count, `${slug} exceeds cap + bridges in ${category}`).toBeLessThanOrEqual(
					maxPerNode + bridges
				);
			}
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

describe('getStackGroups', () => {
	const groups = getStackGroups();

	it('assigns every group to a real edge category', () => {
		for (const category of groups.values()) {
			expect(EDGE_CATEGORIES).toContain(category);
		}
	});

	it('only maps real project slugs', () => {
		for (const slug of groups.keys()) {
			expect(slugs.has(slug)).toBe(true);
		}
	});

	it('assigns each project its most-tagged category, EDGE_CATEGORIES order breaking ties', () => {
		for (const project of projects) {
			const counts = EDGE_CATEGORIES.map((category) => ({
				category,
				count: project.tags.filter((t) => t.kind === category).length
			}));
			const maxCount = Math.max(...counts.map((c) => c.count));
			if (maxCount === 0) {
				// No categorised tags: the project is omitted entirely.
				expect(groups.has(project.slug)).toBe(false);
				continue;
			}
			// Expected winner is the first category (in EDGE_CATEGORIES order) at the max.
			const expected = counts.find((c) => c.count === maxCount)?.category;
			expect(groups.get(project.slug)).toBe(expected);
		}
	});

	it('is deterministic', () => {
		expect(getStackGroups()).toEqual(getStackGroups());
	});
});

describe('selectLabelledSlugs', () => {
	// Minimal projects exercising one ranking axis each; only the metric fields
	// the selector reads matter, so the rest is stubbed.
	function faux(
		slug: string,
		m: { last?: string; linesMeAdded?: number; linesAny?: number; commitsMeRecent?: number }
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
			progress: 'dormant',
			repoUrl: '',
			highlights: [],
			relationships: [],
			commitAnyLast: m.last,
			metrics: {
				linesMeAdded: m.linesMeAdded,
				linesAny: m.linesAny,
				commitsMeRecent: m.commitsMeRecent
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
			faux('mine', { linesMeAdded: 9999 }),
			faux('big', { linesAny: 9999 }),
			faux('active', { commitsMeRecent: 9999 }),
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
			faux('a', { last: '2026-06-10', linesMeAdded: 1, linesAny: 1, commitsMeRecent: 1 }),
			faux('b', { last: '2026-06-09', linesMeAdded: 99, linesAny: 99, commitsMeRecent: 99 }),
			faux('c', {})
		];
		const labelled = selectLabelledSlugs(list, 3) as Set<string>;
		expect([...labelled].sort()).toEqual(['a', 'b', 'c']);
	});

	it('dedupes a project that leads multiple axes, then fills from the rest', () => {
		const list = [
			// One project tops both recency and my-contribution.
			faux('double', { last: '2026-06-10', linesMeAdded: 9999 }),
			faux('big', { linesAny: 9999 }),
			faux('active', { commitsMeRecent: 9999 }),
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

	it('every theme stays one connected cluster at maxPerNode: 2', () => {
		const capped = getThemeEdges({ maxPerNode: 2 });
		for (const theme of themes) {
			const kept = capped.filter((e) => e.theme === theme.id);
			const members = theme.slugs.map((slug) => ({ source: slug, target: slug }));
			expect(componentCount(kept, members), `theme ${theme.id} is severed`).toBe(1);
		}
	});

	it('caps each member per theme, allowing only bridge edges past the cap', () => {
		const maxPerNode = 2;
		const capped = getThemeEdges({ maxPerNode });
		for (const theme of themes) {
			const kept = capped.filter((e) => e.theme === theme.id);
			const candidates = getThemeEdges({ maxPerNode: Number.POSITIVE_INFINITY }).filter(
				(e) => e.theme === theme.id
			);
			const bridges = kept.length - bareCapCount(candidates, maxPerNode);
			const degree = new Map<string, number>();
			for (const e of kept) {
				degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
				degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
			}
			for (const [slug, deg] of degree) {
				expect(deg, `${slug} exceeds cap + bridges in ${theme.id}`).toBeLessThanOrEqual(
					maxPerNode + bridges
				);
			}
		}
	});
});

describe('keepLegibleEdges', () => {
	type E = { source: string; target: string; weight: number };
	const edge = (source: string, target: string, weight: number): E => ({ source, target, weight });

	it('keeps the strongest edges under the cap and drops the rest', () => {
		// a is a hub touching b, c, d; cap 2 keeps its two strongest.
		const candidates = [edge('a', 'b', 3), edge('a', 'c', 2), edge('a', 'd', 1), edge('c', 'd', 1)];
		expect(keepLegibleEdges(candidates, 2)).toEqual([
			edge('a', 'b', 3),
			edge('a', 'c', 2),
			edge('c', 'd', 1)
		]);
	});

	it('re-admits the strongest dropped edge that joins two severed clusters', () => {
		// Two triangles, each saturated at cap 2, linked only by two weak
		// candidates. The cap drops both; the bridge pass restores the stronger.
		const candidates = [
			edge('a', 'b', 5),
			edge('b', 'c', 5),
			edge('a', 'c', 5),
			edge('x', 'y', 5),
			edge('y', 'z', 5),
			edge('x', 'z', 5),
			edge('c', 'x', 2),
			edge('a', 'z', 1)
		];
		const kept = keepLegibleEdges(candidates, 2);
		expect(kept).toContainEqual(edge('c', 'x', 2));
		expect(kept).not.toContainEqual(edge('a', 'z', 1));
		expect(kept).toHaveLength(7);
	});

	it('never adds an edge the candidates do not already connect', () => {
		const candidates = [edge('a', 'b', 1), edge('c', 'd', 1)];
		expect(keepLegibleEdges(candidates, 1)).toEqual(candidates);
	});

	it('leaves sparse input untouched when the cap never binds', () => {
		const candidates = [edge('a', 'b', 2), edge('b', 'c', 1)];
		expect(keepLegibleEdges(candidates, 3)).toEqual(candidates);
	});
});

describe('stackItemsFor', () => {
	const tags: TechTag[] = [
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Deno', kind: 'runtime' },
		{ label: 'Vitest', kind: 'tool' }
	];

	it('lists only tags in the requested categories, in EDGE_CATEGORIES order', () => {
		expect(stackItemsFor(tags, ['framework', 'runtime'])).toEqual(['Deno', 'Svelte 5']);
	});

	it('never lists language tags, even when every category is requested', () => {
		expect(stackItemsFor(tags, EDGE_CATEGORIES)).toEqual(['Deno', 'Svelte 5', 'Vitest']);
	});

	it('returns an empty list when no category is requested', () => {
		expect(stackItemsFor(tags, [])).toEqual([]);
	});
});
