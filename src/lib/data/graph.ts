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
 * - `computeLayout` is deterministic: identical input always yields identical
 *   coordinates, so the prerendered SVG is reproducible across builds.
 */

import { projects } from './index.js';
import type { Project, ProjectSlug } from './types.js';

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
 * ordered (source < target) and `weight` is the number of shared tag labels.
 */
export interface SharedTechEdge {
	source: ProjectSlug;
	target: ProjectSlug;
	weight: number;
}

export interface SharedTechOptions {
	/** Minimum shared tag labels for a pair to qualify. */
	minShared?: number;
	/** Maximum edges kept per node, strongest first. */
	maxPerNode?: number;
}

/**
 * Derives "shared stack" edges from tag overlap to give the map structure the
 * sparse curated relationships cannot. Two guards stop the dense core (most
 * projects share TypeScript + SvelteKit + Bun) from collapsing into a
 * hairball: a `minShared` floor, and a greedy per-node degree cap that keeps
 * only each project's strongest links. Deterministic for a fixed registry.
 */
export function getSharedTechEdges(options: SharedTechOptions = {}): SharedTechEdge[] {
	const minShared = options.minShared ?? 3;
	const maxPerNode = options.maxPerNode ?? 3;

	// Tag-label sets per project, in registry order.
	const tagSets = projects.map((p) => ({
		slug: p.slug,
		labels: new Set(p.tags.map((t) => t.label))
	}));

	// All qualifying pairs with their overlap weight.
	const candidates: SharedTechEdge[] = [];
	for (let i = 0; i < tagSets.length; i++) {
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
				candidates.push({ source, target, weight });
			}
		}
	}

	// Strongest first; ties broken by slug for stable output.
	candidates.sort(
		(a, b) =>
			b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
	);

	// Greedily keep an edge only while both endpoints are below the cap, so the
	// densest hubs surface their best links without dominating the picture.
	const degree = new Map<ProjectSlug, number>();
	const edges: SharedTechEdge[] = [];
	for (const edge of candidates) {
		const ds = degree.get(edge.source) ?? 0;
		const dt = degree.get(edge.target) ?? 0;
		if (ds >= maxPerNode || dt >= maxPerNode) continue;
		degree.set(edge.source, ds + 1);
		degree.set(edge.target, dt + 1);
		edges.push(edge);
	}

	return edges;
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
// Deterministic layout
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

/** Fixed kind ordering so cluster placement is stable regardless of registry order. */
const KIND_ORDER: Project['kind'][] = ['app', 'game', 'website', 'tui', 'tool', 'library', 'toy'];

/**
 * Deterministic clustered-radial layout. Projects are grouped by `kind`; each
 * kind becomes a cluster whose centre sits on a large ring, and the projects
 * within a cluster fan out on a smaller ring around that centre. Ordering is
 * fixed (kind order, then slug) so the same graph always lays out identically.
 */
export function computeLayout(graph: ProjectGraph, size = 1000): LayoutResult {
	const centre = size / 2;
	const clusterRingRadius = size * 0.34;
	const nodeRingRadius = size * 0.13;

	const byKind = new Map<Project['kind'], GraphNode[]>();
	for (const node of graph.nodes) {
		const bucket = byKind.get(node.project.kind);
		if (bucket) bucket.push(node);
		else byKind.set(node.project.kind, [node]);
	}

	// Stable kind list: known kinds in fixed order, then any unknown kinds sorted.
	const presentKinds = [...byKind.keys()];
	const orderedKinds = [
		...KIND_ORDER.filter((k) => byKind.has(k)),
		...presentKinds.filter((k) => !KIND_ORDER.includes(k)).sort()
	];

	const positions = new Map<ProjectSlug, Point>();

	orderedKinds.forEach((kind, clusterIndex) => {
		const clusterAngle = (2 * Math.PI * clusterIndex) / orderedKinds.length - Math.PI / 2;
		const clusterX = centre + clusterRingRadius * Math.cos(clusterAngle);
		const clusterY = centre + clusterRingRadius * Math.sin(clusterAngle);

		const members = [...(byKind.get(kind) ?? [])].sort((a, b) => a.slug.localeCompare(b.slug));

		members.forEach((node, memberIndex) => {
			if (members.length === 1) {
				positions.set(node.slug, { x: clusterX, y: clusterY });
				return;
			}
			const nodeAngle = (2 * Math.PI * memberIndex) / members.length - Math.PI / 2;
			positions.set(node.slug, {
				x: clusterX + nodeRingRadius * Math.cos(nodeAngle),
				y: clusterY + nodeRingRadius * Math.sin(nodeAngle)
			});
		});
	});

	return { positions, width: size, height: size };
}
