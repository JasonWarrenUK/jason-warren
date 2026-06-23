/**
 * Graph derivation for the project network.
 *
 * The project registry already encodes a relationship graph via each project's
 * `relationships[]` (see `types.ts`). This module turns that raw, per-project,
 * often-reciprocal edge list into a single normalised graph that the
 * presentation layer (map, timeline, neighbourhood views) can render.
 *
 * Design principles, mirroring the rest of the data layer:
 * - Pure functions over the `projects` array; no side effects, easy to test.
 * - Reciprocal pairs collapse to ONE edge. A `powers` edge and its reciprocal
 *   `extracted-from` edge describe the same connection, so the graph keeps a
 *   single directed extraction edge (library → consumer). Mutual `related`
 *   edges collapse to one undirected edge.
 * - `computeForceLayout` is deterministic: identical input always yields
 *   identical coordinates, so the prerendered SVG is reproducible across builds.
 */

import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type Simulation,
	type SimulationNodeDatum
} from 'd3-force';
import { projects } from './index.js';
import { EDGE_CATEGORIES } from './types.js';
import type { EdgeCategory, Project, ProjectSlug } from './types.js';
import { substanceScore, hubThreshold } from './scoring.js';

// ---------------------------------------------------------------------------
// Graph shape
// ---------------------------------------------------------------------------

export interface GraphNode {
	slug: ProjectSlug;
	project: Project;
}

/**
 * A normalised edge. Reciprocal source-data edges are collapsed into one.
 * - `extraction`: directed, source = library (the `powers` side),
 *   target = consumer (the `extracted-from` side).
 * - `related`: undirected; endpoints are canonically ordered so a single
 *   edge represents the pair regardless of which side declared it.
 */
export interface GraphEdge {
	source: ProjectSlug;
	target: ProjectSlug;
	kind: 'extraction' | 'related';
	note?: string;
}

export interface ProjectGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Builds the normalised project graph from the relationship data.
 * One node per project; reciprocal edges collapsed (see GraphEdge).
 */
export function getProjectGraph(): ProjectGraph {
	const nodes: GraphNode[] = projects.map((project) => ({
		slug: project.slug,
		project
	}));

	const edges: GraphEdge[] = [];
	const seen = new Set<string>();

	for (const project of projects) {
		for (const rel of project.relationships) {
			if (rel.kind === 'powers') {
				// Directed extraction edge, library → consumer.
				// The reciprocal `extracted-from` on the consumer is the same
				// connection, so we only ever materialise the `powers` side.
				const key = `extraction:${project.slug}->${rel.target}`;
				if (seen.has(key)) continue;
				seen.add(key);
				edges.push({
					source: project.slug,
					target: rel.target,
					kind: 'extraction',
					note: rel.note
				});
			} else if (rel.kind === 'related') {
				// Undirected: canonicalise the endpoint order so A↔B and B↔A
				// resolve to the same key and collapse to one edge.
				const [a, b] = [project.slug, rel.target].sort() as [ProjectSlug, ProjectSlug];
				const key = `related:${a}--${b}`;
				if (seen.has(key)) continue;
				seen.add(key);
				edges.push({ source: a, target: b, kind: 'related', note: rel.note });
			}
			// `extracted-from` is intentionally skipped: it is the reciprocal of a
			// `powers` edge and is validated as such by the data-integrity tests.
		}
	}

	return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Shared-technology edges
// ---------------------------------------------------------------------------

/**
 * A faint, undirected "shares a stack" link, kept separate from the curated
 * `GraphEdge` relationships so the two never mix. Endpoints are canonically
 * ordered (source < target). Each edge is keyed to one tag `category`, so the
 * map can show *why* two projects relate (same runtime vs same data layer) and
 * let the viewer toggle categories independently. `weight` is the number of
 * shared tags within that category.
 */
export interface SharedTechEdge {
	source: ProjectSlug;
	target: ProjectSlug;
	category: EdgeCategory;
	weight: number;
}

export interface SharedTechOptions {
	/** Minimum shared tags (within a category) for a pair to qualify. */
	minShared?: number;
	/** Maximum edges kept per node, per category, strongest first. */
	maxPerNode?: number;
}

/**
 * Derives per-category "shared stack" edges from tag overlap to give the map
 * structure the sparse curated relationships cannot. One edge type per tag
 * category (`language` excluded, see `EDGE_CATEGORIES`) so related-by-runtime
 * reads differently from related-by-data. The hairball is tamed by a per-node,
 * per-category degree cap that keeps only each project's strongest links in
 * each category. Deterministic for a fixed registry.
 */
export function getSharedTechEdges(options: SharedTechOptions = {}): SharedTechEdge[] {
	const minShared = options.minShared ?? 1;
	const maxPerNode = options.maxPerNode ?? 3;

	const edges: SharedTechEdge[] = [];

	for (const category of EDGE_CATEGORIES) {
		// Tag-label sets restricted to this category, per project, in registry order.
		const tagSets = projects.map((p) => ({
			slug: p.slug,
			labels: new Set(p.tags.filter((t) => t.kind === category).map((t) => t.label))
		}));

		// All qualifying pairs with their within-category overlap weight.
		const candidates: SharedTechEdge[] = [];
		for (let i = 0; i < tagSets.length; i++) {
			if (tagSets[i].labels.size === 0) continue;
			for (let j = i + 1; j < tagSets.length; j++) {
				let weight = 0;
				for (const label of tagSets[i].labels) {
					if (tagSets[j].labels.has(label)) weight++;
				}
				if (weight >= minShared) {
					const [source, target] = [tagSets[i].slug, tagSets[j].slug].sort() as [
						ProjectSlug,
						ProjectSlug
					];
					candidates.push({ source, target, category, weight });
				}
			}
		}

		// Strongest first; ties broken by slug for stable output.
		candidates.sort(
			(a, b) =>
				b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
		);

		// Greedily keep an edge only while both endpoints are below the cap for
		// this category, so common categories (framework, runtime) surface their
		// best links without dominating the picture.
		const degree = new Map<ProjectSlug, number>();
		for (const edge of candidates) {
			const ds = degree.get(edge.source) ?? 0;
			const dt = degree.get(edge.target) ?? 0;
			if (ds >= maxPerNode || dt >= maxPerNode) continue;
			degree.set(edge.source, ds + 1);
			degree.set(edge.target, dt + 1);
			edges.push(edge);
		}
	}

	return edges;
}

// ---------------------------------------------------------------------------
// Map label selection
// ---------------------------------------------------------------------------

/** How many project labels the map shows by default (the rest reveal on hover). */
export const MAP_LABEL_COUNT = 10;

/**
 * Selects which projects get a standing label on the map. Rather than ranking
 * on a single metric (which a few hubs would dominate), it rotates through four
 * importance axes and shifts the front of each into a set in turn, so the names
 * shown are a *diverse* slice: the freshest, the largest contributions, the
 * biggest codebases, and the most recently active.
 *
 * Axes (all best-first; missing values sort last, ties broken by slug so the
 * result stays deterministic even when an axis is unpopulated):
 *   1. most recent commit            (`lastCommit`)
 *   2. most code contributed by me   (`metrics.linesAdded`)
 *   3. largest overall codebase      (`metrics.linesOfCode`)
 *   4. most of my commits, last 4wks (`metrics.commitsRecent`)
 *
 * Two of these axes are only populated once the drift pipeline syncs; until
 * then they contribute ties and selection leans on the populated axes.
 */
export function selectLabelledSlugs(
	projectList: Project[] = projects,
	count = MAP_LABEL_COUNT
): Set<ProjectSlug> {
	const bySlug = (a: Project, b: Project): number => a.slug.localeCompare(b.slug);
	const byDesc =
		(value: (p: Project) => number | undefined) =>
		(a: Project, b: Project): number =>
			(value(b) ?? -Infinity) - (value(a) ?? -Infinity) || bySlug(a, b);

	const commitTime = (p: Project): number | undefined =>
		p.lastCommit ? Date.parse(p.lastCommit) : undefined;

	const queues: Project[][] = [
		[...projectList].sort(byDesc(commitTime)),
		[...projectList].sort(byDesc((p) => p.metrics?.linesAdded)),
		[...projectList].sort(byDesc((p) => p.metrics?.linesOfCode)),
		[...projectList].sort(byDesc((p) => p.metrics?.commitsRecent))
	];

	const selected = new Set<ProjectSlug>();

	// Hubs (p85 substance) are always labelled regardless of the count cap.
	const hubSlugs = getHubSlugs(projectList);
	for (const slug of hubSlugs) selected.add(slug);

	// Fill remaining slots via round-robin until the count is met.
	while (selected.size < count) {
		let advanced = false;
		for (const queue of queues) {
			const next = queue.shift();
			if (!next) continue;
			if (!selected.has(next.slug)) {
				selected.add(next.slug);
				advanced = true;
				if (selected.size >= count) break;
			}
		}
		if (!advanced) break; // every queue is drained
	}

	return selected;
}

// ---------------------------------------------------------------------------
// Neighbourhoods
// ---------------------------------------------------------------------------

export interface Neighbour {
	project: Project;
	kind: GraphEdge['kind'];
	/** Relative to the queried project: does the edge leave it or arrive at it? */
	direction: 'outgoing' | 'incoming';
	note?: string;
}

/**
 * The immediate neighbourhood of a project: every project one edge away,
 * derived from the normalised graph so reciprocal edges are not double-counted.
 * For `related` edges, direction is reported as `outgoing` by convention.
 */
export function getNeighbours(slug: ProjectSlug): Neighbour[] {
	const { edges } = getProjectGraph();
	const bySlug = new Map(projects.map((p) => [p.slug, p]));
	const neighbours: Neighbour[] = [];

	for (const edge of edges) {
		if (edge.source === slug) {
			const project = bySlug.get(edge.target);
			if (project) {
				neighbours.push({ project, kind: edge.kind, direction: 'outgoing', note: edge.note });
			}
		} else if (edge.target === slug) {
			const project = bySlug.get(edge.source);
			if (project) {
				neighbours.push({ project, kind: edge.kind, direction: 'incoming', note: edge.note });
			}
		}
	}

	return neighbours;
}

// ---------------------------------------------------------------------------
// Technology index
// ---------------------------------------------------------------------------

/**
 * Maps each technology label to the projects that use it, for tech-centred
 * cross-navigation ("what I use and where"). Labels are keyed exactly as they
 * appear on tags; the value preserves project registry order. Sorted by label.
 */
export function getTechIndex(): Map<string, ProjectSlug[]> {
	const index = new Map<string, ProjectSlug[]>();

	for (const project of projects) {
		for (const tag of project.tags) {
			const existing = index.get(tag.label);
			if (existing) {
				existing.push(project.slug);
			} else {
				index.set(tag.label, [project.slug]);
			}
		}
	}

	return new Map([...index.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

// ---------------------------------------------------------------------------
// Force-directed layout
// ---------------------------------------------------------------------------

export interface Point {
	x: number;
	y: number;
}

export interface LayoutResult {
	positions: Map<ProjectSlug, Point>;
	width: number;
	height: number;
}

interface SimNode extends SimulationNodeDatum {
	slug: ProjectSlug;
	radius: number;
}

/**
 * Returns the set of slugs whose substance score meets the hub threshold (p85).
 * These nodes receive an enlarged minimum radius AND are always labelled on the map.
 * Substance is recency-independent so foundational projects stay prominent when dormant.
 */
export function getHubSlugs(projectList: Project[] = projects): Set<ProjectSlug> {
	const threshold = hubThreshold(projectList);
	return new Set(projectList.filter((p) => substanceScore(p) >= threshold).map((p) => p.slug));
}

// ---------------------------------------------------------------------------
// Edge-crossing helpers (build-time only)
// ---------------------------------------------------------------------------

/**
 * Returns true if segment AB crosses segment CD, sharing NO endpoint.
 * Uses the CCW orientation test (cross-product sign).
 */
function segmentsIntersect(
	ax: number, ay: number,
	bx: number, by: number,
	cx: number, cy: number,
	dx: number, dy: number
): boolean {
	// Shared endpoint → not a crossing.
	if ((ax === cx && ay === cy) || (ax === dx && ay === dy)) return false;
	if ((bx === cx && by === cy) || (bx === dx && by === dy)) return false;

	const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number): number =>
		(px - ox) * (qy - oy) - (py - oy) * (qx - ox);

	const d1 = cross(cx, cy, dx, dy, ax, ay);
	const d2 = cross(cx, cy, dx, dy, bx, by);
	const d3 = cross(ax, ay, bx, by, cx, cy);
	const d4 = cross(ax, ay, bx, by, dx, dy);

	if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
		((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;

	// Collinear cases: treat as non-crossing to avoid false positives on
	// T-junctions formed by shared-tech edges meeting at a hub.
	return false;
}

/**
 * Counts the number of crossing edge pairs in a settled candidate layout.
 * O(E²) but E is small (~40 nodes, low-hundreds of edges) so cost is trivial.
 * Tie-breaking secondary score: total edge length (lower is better).
 *
 * Accepts both `SimNode` (build-time) and `LiveSimNode` (client-time) since
 * both carry `slug`, `x?`, and `y?`.
 */
function scoreLayout(
	nodes: Array<{ slug: ProjectSlug; x?: number; y?: number }>,
	links: SimLink[]
): { crossings: number; totalLength: number } {
	const pos = new Map<string, { x: number; y: number }>();
	for (const n of nodes) pos.set(n.slug, { x: n.x ?? 0, y: n.y ?? 0 });

	// Resolve slug-keyed links (after simulation, source/target are still slugs
	// because buildSimLinks uses string ids and forceLink resolves them internally
	// by mutating; we re-resolve manually from the slug strings we passed in).
	const resolved: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
	let totalLength = 0;
	for (const link of links) {
		const src = typeof link.source === 'object'
			? (link.source as { slug: string }).slug
			: (link.source as string);
		const tgt = typeof link.target === 'object'
			? (link.target as { slug: string }).slug
			: (link.target as string);
		const a = pos.get(src);
		const b = pos.get(tgt);
		if (!a || !b) continue;
		resolved.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		totalLength += Math.sqrt(dx * dx + dy * dy);
	}

	let crossings = 0;
	for (let i = 0; i < resolved.length; i++) {
		for (let j = i + 1; j < resolved.length; j++) {
			const e = resolved[i];
			const f = resolved[j];
			if (segmentsIntersect(e.ax, e.ay, e.bx, e.by, f.ax, f.ay, f.bx, f.by)) {
				crossings++;
			}
		}
	}

	return { crossings, totalLength };
}

// ---------------------------------------------------------------------------
// Shared force-simulation constants
// ---------------------------------------------------------------------------

/**
 * Force constants shared by the build-time best-of-N layout and the
 * client-side relayout lottery. Centralised so both paths stay in lockstep.
 */
export const FORCE_TUNING = {
	/** Repulsion strength (negative = repel). */
	chargeStrength: -320,
	/** Extra padding around each node radius for collision detection. */
	collidePadding: 22,
	/** Weak pull toward the canvas centre on each axis. */
	axisStrength: 0.04,
	/** Fraction of canvas size used as the initial ring radius. */
	ringRadiusFactor: 0.3,
	/** Fixed tick count per candidate (build-time and relayout lottery). */
	ticks: 320
} as const;

/**
 * Thin export so tests can assert crossing counts without duplicating the
 * geometry. Wraps the private `scoreLayout`.
 */
export function countCrossings(
	nodes: Array<{ slug: ProjectSlug; x?: number; y?: number }>,
	links: SimLink[]
): number {
	return scoreLayout(nodes, links).crossings;
}

// ---------------------------------------------------------------------------
// Build-time force layout
// ---------------------------------------------------------------------------

/**
 * How many distinct deterministic seeds to try. Each uses a different initial
 * ring rotation; the layout with fewest edge crossings wins. 12 candidates
 * cost ~12 × 320 ticks on ~40 nodes (sub-second) and yield a meaningfully
 * better layout than a single seed by lottery.
 */
const LAYOUT_CANDIDATES = 12;

/** Golden angle in radians — maximally spreads candidate seeds apart. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ---------------------------------------------------------------------------
// Client-side relayout lottery
// ---------------------------------------------------------------------------

export interface RelayoutInput {
	/** Live node array (positions used as seed reference; radii copied). */
	nodes: LiveSimNode[];
	/** Only edges currently visible on the map. */
	visibleEdges: GraphEdge[];
	/** Only shared-tech edges currently visible. */
	visibleSharedEdges: SharedTechEdge[];
	/** Canvas size in pixels — must match the SVG viewBox. */
	size?: number;
}

export interface RelayoutOptions {
	/** Number of seeded candidates to try. Default: 5. */
	candidates?: number;
	/** Synchronous ticks per candidate. Default: 220. */
	ticks?: number;
}

/**
 * Deterministic reduced best-of-N layout lottery over the VISIBLE subgraph.
 *
 * Runs `candidates` seeded ring configurations (identical force parameters to
 * the build-time pass, using `FORCE_TUNING`), counts crossings via
 * `scoreLayout`, and returns the lowest-crossing candidate's positions.
 *
 * Intended as a filter-toggle reheat seed: write the returned positions into
 * the live `simNodes`, re-feed links, then `sim.alpha(0.5).restart()`. The
 * live sim relaxes from the low-crossing starting topology rather than from
 * wherever it last settled (which may be tangled).
 *
 * Properties:
 * - No `Math.random` — fully deterministic given the same visible subgraph.
 * - No DOM — safe to call on the main thread.
 * - Does NOT normalise-to-canvas (the running sim's centre/x/y forces reframe).
 * - Hidden-only nodes are omitted from the returned Map.
 */
export function computeRelayoutTargets(
	input: RelayoutInput,
	options: RelayoutOptions = {}
): Map<ProjectSlug, Point> {
	const { nodes, visibleEdges, visibleSharedEdges, size = 1000 } = input;
	const { candidates = 5, ticks = 220 } = options;
	const centre = size / 2;
	const links = buildSimLinks(visibleEdges, visibleSharedEdges);

	// Determine the visible node set (only nodes incident to a visible edge,
	// or all nodes — using all keeps the relayout sensible when edges are hidden
	// but nodes remain).
	const candidateResults = Array.from({ length: candidates }, (_, seed) => {
		const angleOffset = seed * GOLDEN_ANGLE;
		const simNodes: SimNode[] = nodes.map((n, index) => {
			const angle =
				(2 * Math.PI * index) / nodes.length - Math.PI / 2 + angleOffset;
			return {
				slug: n.slug,
				radius: n.radius,
				x: centre + size * FORCE_TUNING.ringRadiusFactor * Math.cos(angle),
				y: centre + size * FORCE_TUNING.ringRadiusFactor * Math.sin(angle)
			};
		});

		const candidateLinks = buildSimLinks(visibleEdges, visibleSharedEdges);

		const sim = forceSimulation<SimNode>(simNodes)
			.force(
				'link',
				forceLink<SimNode, SimLink>(candidateLinks)
					.id((n) => n.slug)
					.distance((l) => l.distance)
					.strength((l) => l.strength)
			)
			.force('charge', forceManyBody<SimNode>().strength(FORCE_TUNING.chargeStrength))
			.force(
				'collide',
				forceCollide<SimNode>((n) => n.radius + FORCE_TUNING.collidePadding).strength(1)
			)
			.force('centre', forceCenter<SimNode>(centre, centre))
			.force('x', forceX<SimNode>(centre).strength(FORCE_TUNING.axisStrength))
			.force('y', forceY<SimNode>(centre).strength(FORCE_TUNING.axisStrength))
			.stop();

		for (let i = 0; i < ticks; i++) sim.tick();

		return { simNodes, ...scoreLayout(simNodes, links) };
	});

	const best = candidateResults.reduce((a, b) =>
		b.crossings < a.crossings || (b.crossings === a.crossings && b.totalLength < a.totalLength)
			? b
			: a
	);

	const positions = new Map<ProjectSlug, Point>();
	for (const n of best.simNodes) {
		positions.set(n.slug, { x: n.x ?? centre, y: n.y ?? centre });
	}
	return positions;
}

// ---------------------------------------------------------------------------
// Build-time force layout
// ---------------------------------------------------------------------------

/**
 * Force-directed layout, run to completion at build time so the prerendered SVG
 * stays static (no runtime simulation, no JavaScript needed to view it).
 *
 * Position reflects connection: curated extraction/related edges pull hard,
 * shared-stack edges pull gently, charge separates, and collision keeps the
 * activity-scaled dots from overlapping.
 *
 * Determinism is guaranteed: all seeding uses only the integer candidate index
 * (no Math.random), d3-force's own PRNG is deterministic given the same input,
 * and the tick count is fixed — so identical input always yields identical
 * coordinates across builds. The best-of-N pass selects the candidate with the
 * fewest edge crossings (ties broken by shorter total edge length).
 */
export function computeForceLayout(
	graph: ProjectGraph,
	sharedEdges: SharedTechEdge[] = [],
	size = 1000
): LayoutResult {
	const centre = size / 2;
	const hubSlugs = getHubSlugs(graph.nodes.map((n) => n.project));
	const weights = graph.nodes.map((n) => substanceScore(n.project));
	const maxWeight = Math.max(1, ...weights);

	const radiusOf = (project: Project): number => {
		const base = 16 + 39 * Math.sqrt(substanceScore(project) / maxWeight);
		// Hubs (p85 substance) keep a minimum radius so they read as network anchors.
		return hubSlugs.has(project.slug) ? Math.max(43, base) : base;
	};

	// All curated + shared-tech edges; constants live in buildSimLinks.
	const links = buildSimLinks(graph.edges, sharedEdges);

	/**
	 * Runs one candidate: a ring seeded with angle offset `seed * GOLDEN_ANGLE`,
	 * ticked to convergence. Returns the settled SimNodes (mutated in place by d3).
	 */
	function runCandidate(seed: number): SimNode[] {
		const angleOffset = seed * GOLDEN_ANGLE;
		const nodes: SimNode[] = graph.nodes.map((node, index) => {
			const angle = (2 * Math.PI * index) / graph.nodes.length - Math.PI / 2 + angleOffset;
			return {
				slug: node.slug,
				radius: radiusOf(node.project),
				x: centre + size * 0.3 * Math.cos(angle),
				y: centre + size * 0.3 * Math.sin(angle)
			};
		});

		// Re-build links each time so forceLink resolves fresh node references.
		const candidateLinks = buildSimLinks(graph.edges, sharedEdges);

		const simulation = forceSimulation<SimNode>(nodes)
			.force(
				'link',
				forceLink<SimNode, SimLink>(candidateLinks)
					.id((node) => node.slug)
					.distance((link) => link.distance)
					.strength((link) => link.strength)
			)
			.force('charge', forceManyBody<SimNode>().strength(-320))
			.force('collide', forceCollide<SimNode>((node) => node.radius + 22).strength(1))
			.force('centre', forceCenter<SimNode>(centre, centre))
			.force('x', forceX<SimNode>(centre).strength(0.04))
			.force('y', forceY<SimNode>(centre).strength(0.04))
			.stop();

		for (let i = 0; i < 320; i++) simulation.tick();

		return nodes;
	}

	// Run all candidates and pick the one with fewest crossings (shorter total
	// edge length as tiebreaker). Seed 0 is the canonical ring (original
	// behaviour baseline); subsequent seeds rotate the ring by golden-angle
	// increments for maximally diverse starting configurations.
	const candidates = Array.from({ length: LAYOUT_CANDIDATES }, (_, seed) => {
		const settled = runCandidate(seed);
		return { settled, ...scoreLayout(settled, links) };
	});

	const best = candidates.reduce((a, b) =>
		b.crossings < a.crossings || (b.crossings === a.crossings && b.totalLength < a.totalLength)
			? b
			: a
	);

	const winner = best.settled;

	// Normalise the settled cloud to fill the canvas with uniform scaling.
	const xs = winner.map((n) => n.x ?? centre);
	const ys = winner.map((n) => n.y ?? centre);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const spanX = maxX - minX || 1;
	const spanY = maxY - minY || 1;
	const pad = size * 0.09;
	const usable = size - 2 * pad;
	const scale = Math.min(usable / spanX, usable / spanY);
	const offsetX = pad + (usable - spanX * scale) / 2;
	const offsetY = pad + (usable - spanY * scale) / 2;

	const positions = new Map<ProjectSlug, Point>();
	for (const node of winner) {
		positions.set(node.slug, {
			x: offsetX + ((node.x ?? centre) - minX) * scale,
			y: offsetY + ((node.y ?? centre) - minY) * scale
		});
	}

	return { positions, width: size, height: size };
}

// ---------------------------------------------------------------------------
// Client-side live simulation
// ---------------------------------------------------------------------------

/**
 * The node shape used by the live client simulation. Positions are mutable
 * so d3-force can update them in place each tick.
 */
export interface LiveSimNode extends SimulationNodeDatum {
	slug: ProjectSlug;
	radius: number;
	x: number;
	y: number;
}

/** A slug-keyed link for the live simulation's forceLink. */
export interface SimLink {
	source: string;
	target: string;
	distance: number;
	strength: number;
}

/**
 * Builds the force-link array from the currently-visible edges. Used both to
 * seed `createForceSimulation` and to re-feed the link force on reheat, so the
 * distance/strength constants live in exactly one place.
 */
export function buildSimLinks(
	visibleEdges: GraphEdge[],
	visibleSharedEdges: SharedTechEdge[]
): SimLink[] {
	return [
		...visibleEdges.map((edge) => ({
			source: edge.source,
			target: edge.target,
			distance: edge.kind === 'extraction' ? 90 : 140,
			strength: edge.kind === 'extraction' ? 0.9 : 0.45
		})),
		...visibleSharedEdges.map((edge) => ({
			source: edge.source,
			target: edge.target,
			distance: 180,
			strength: Math.min(0.12, 0.03 * edge.weight)
		}))
	];
}

/**
 * Creates a live d3-force simulation for client-side use. Unlike
 * `computeForceLayout`, which runs synchronously and returns baked positions,
 * this returns the running simulation so the caller can drive an animation
 * loop and reheat on filter changes.
 *
 * The caller is responsible for constructing `initialNodes` (one entry per
 * project, with `slug`, `radius`, and seed `x`/`y` from the baked layout) so
 * the simulation starts from the rendered picture instead of a cold ring.
 *
 * @param initialNodes - Pre-built node array seeded with baked positions.
 * @param visibleEdges - Only the curated edges currently shown; hidden edges
 *   do not exert force, so the visible structure relaxes into a new shape.
 * @param visibleSharedEdges - Only the shared-tech edges currently shown.
 * @param size - Canvas size in pixels (must match the SVG viewBox).
 */
export function createForceSimulation(
	initialNodes: LiveSimNode[],
	visibleEdges: GraphEdge[],
	visibleSharedEdges: SharedTechEdge[],
	size = 1000
): Simulation<LiveSimNode, never> {
	const centre = size / 2;
	const links = buildSimLinks(visibleEdges, visibleSharedEdges);

	return forceSimulation<LiveSimNode>(initialNodes)
		.force(
			'link',
			forceLink<LiveSimNode, SimLink>(links)
				.id((node) => node.slug)
				.distance((link) => link.distance)
				.strength((link) => link.strength)
		)
		.force('charge', forceManyBody<LiveSimNode>().strength(-320))
		.force('collide', forceCollide<LiveSimNode>((node) => node.radius + 22).strength(1))
		.force('centre', forceCenter<LiveSimNode>(centre, centre))
		.force('x', forceX<LiveSimNode>(centre).strength(0.04))
		.force('y', forceY<LiveSimNode>(centre).strength(0.04))
		.alphaDecay(0.02);
}
