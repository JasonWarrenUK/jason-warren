/**
 * Tech-node graph for the "Technologies" map mode.
 *
 * Nodes: every distinct technology tag in the project registry, keyed by label,
 * excluding language-kind labels (TypeScript, CSS, HTML etc.) — they sit on
 * almost every project and would produce a hairball hub rather than clusters.
 * Edges: co-occurrence — two tech labels are linked when at least one project
 * uses both. Weight = number of projects that use both labels together.
 *
 * Design mirrors `getSharedTechEdges` / `getThemeEdges` in graph.ts (candidate →
 * sort strongest-first → per-node degree cap), but inverted: instead of iterating
 * tech categories to find which *projects* share a tag, we iterate projects to find
 * which *tech labels* share a project.
 *
 * All functions are deterministic and DOM-free, safe for build-time prerender.
 */

import { projects } from './index.js';
import { hiddenTechLabels } from './tech-overlays.js';
import { getTechIndex, layoutSimNodes, normaliseToCanvas, LAYOUT_CANDIDATES } from './graph.js';
import type { SimNode, SimLink, LayoutResult, Point } from './graph.js';
import type { TagKind } from './types.js';

// ---------------------------------------------------------------------------
// Node shape
// ---------------------------------------------------------------------------

/** A technology label as a graph node. */
export interface TechNode {
	/** Exact tag label, e.g. "TypeScript", "SvelteKit", "Neo4j". */
	label: string;
	/** Tag kind — drives the glyph shape via `kindGlyph`. */
	kind: TagKind;
	/** Number of projects in the registry that carry this label. */
	projectCount: number;
}

/**
 * Returns every distinct non-language tech label in the registry as a `TechNode[]`,
 * sorted alphabetically. Language-kind labels (TypeScript, CSS, HTML etc.) are
 * excluded: they appear on almost every project and produce isolated hubs with no
 * meaningful co-occurrence clustering. Kind is read from the first occurrence in
 * registry order — a label always maps to one kind.
 */
export function getTechNodes(): TechNode[] {
	// Build label → kind map by walking the registry once.
	const kindByLabel = new Map<string, TagKind>();
	for (const project of projects) {
		for (const tag of project.tags) {
			if (!kindByLabel.has(tag.label)) {
				kindByLabel.set(tag.label, tag.kind);
			}
		}
	}

	const index = getTechIndex(); // label → ProjectSlug[]
	const hidden = hiddenTechLabels('map');
	const nodes: TechNode[] = [];
	for (const [label, slugs] of index) {
		const kind = kindByLabel.get(label);
		if (!kind) continue; // should never happen — index is derived from the same tags
		if (kind === 'language') continue; // excluded: language nodes float with no edges
		if (hidden.has(label)) continue; // authored as hidden from the map surface
		nodes.push({ label, kind, projectCount: slugs.length });
	}

	// index is already sorted alphabetically; nodes follows that order.
	return nodes;
}

// ---------------------------------------------------------------------------
// Shared radius helper
// ---------------------------------------------------------------------------

/**
 * Radius in SVG/layout user units for a tech node. Single source of truth used
 * by both `computeTechLayout` (build-time sim) and `ProjectMap.svelte` (render +
 * client sim), so collision detection and visual size always match.
 */
export function techNodeRadius(projectCount: number, maxCount: number): number {
	return 7 + 22 * Math.sqrt(projectCount / Math.max(1, maxCount));
}

// ---------------------------------------------------------------------------
// Co-occurrence edges
// ---------------------------------------------------------------------------

/** An undirected "used together in a project" link between two tech labels. */
export interface TechCoEdge {
	/** Canonically ordered: source < target (lexicographic). */
	source: string;
	target: string;
	/** Number of projects that carry both labels. */
	weight: number;
}

export interface TechCoEdgeOptions {
	/**
	 * Minimum number of shared projects to emit an edge.
	 * Default 1 — "used together at least once" is the co-occurrence story;
	 * matches `getSharedTechEdges` which also defaults to 1.
	 */
	minShared?: number;
	/**
	 * Maximum edges kept per tech node, strongest first.
	 * Default 6 — raised from 5 to prevent hub saturation from starving
	 * peripheral nodes that legitimately co-occur with popular techs.
	 */
	maxPerNode?: number;
}

/**
 * Derives co-occurrence edges between tech labels. Two labels get an edge when
 * `minShared` or more projects use both. A per-node degree cap prevents any one
 * technology from becoming a hairball hub.
 *
 * Language-kind labels are excluded from both edges and nodes (see `getTechNodes`).
 *
 * Deterministic for a fixed registry (registry order + label sort = no randomness).
 */
export function getTechCoEdges(options: TechCoEdgeOptions = {}): TechCoEdge[] {
	const minShared = options.minShared ?? 1;
	const maxPerNode = options.maxPerNode ?? 6;

	// Build label → kind map.
	const kindByLabel = new Map<string, TagKind>();
	for (const project of projects) {
		for (const tag of project.tags) {
			if (!kindByLabel.has(tag.label)) {
				kindByLabel.set(tag.label, tag.kind);
			}
		}
	}

	// Accumulate co-occurrence weight: (labelA, labelB) → shared-project count.
	// Only consider non-language labels as edge endpoints.
	const coCount = new Map<string, number>();

	const hidden = hiddenTechLabels('map');
	for (const project of projects) {
		// Non-language labels present in this project. Use kindByLabel (first-occurrence
		// wins) so labels with multiple kind entries (e.g. Go as language + runtime)
		// are classified consistently with getTechNodes; map-hidden labels drop
		// out of co-occurrence entirely so no edge dangles towards a missing node.
		const nonLangLabels = [
			...new Set(
				project.tags
					.filter((t) => kindByLabel.get(t.label) !== 'language' && !hidden.has(t.label))
					.map((t) => t.label)
			)
		];

		for (let i = 0; i < nonLangLabels.length; i++) {
			for (let j = i + 1; j < nonLangLabels.length; j++) {
				const [a, b] = [nonLangLabels[i], nonLangLabels[j]].sort();
				const key = `${a}\0${b}`;
				coCount.set(key, (coCount.get(key) ?? 0) + 1);
			}
		}
	}

	// Build candidate edges from the accumulated counts.
	const candidates: TechCoEdge[] = [];
	for (const [key, weight] of coCount) {
		if (weight < minShared) continue;
		const [source, target] = key.split('\0') as [string, string];
		candidates.push({ source, target, weight });
	}

	// Strongest first; ties broken by source then target for stable output.
	candidates.sort(
		(a, b) =>
			b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
	);

	// Greedily keep an edge while both endpoints are below the cap.
	const degree = new Map<string, number>();
	const edges: TechCoEdge[] = [];
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
// Build-time layout
// ---------------------------------------------------------------------------

/**
 * Force-directed layout for the technologies mode. Reuses the generic
 * `layoutSimNodes` engine from graph.ts (no Project coupling). Node radius
 * scales with `projectCount` via a sqrt curve, matching the visual language of
 * the project-node radius.
 *
 * Deterministic for a fixed registry (same seeding, no Math.random).
 */
export function computeTechLayout(
	techNodes: TechNode[],
	coEdges: TechCoEdge[],
	size = 1000
): LayoutResult {
	if (techNodes.length === 0) {
		return { positions: new Map<string, Point>(), width: size, height: size };
	}

	const maxCount = Math.max(1, ...techNodes.map((n) => n.projectCount));

	// SimLink for the co-occurrence edges.
	const links: SimLink[] = coEdges.map((e) => ({
		source: e.source,
		target: e.target,
		distance: 60 + 40 / Math.max(1, e.weight), // heavier edges pull tighter
		strength: Math.min(0.5, 0.08 * e.weight)
	}));

	// Build SimNodes: radius from projectCount. Formula matches the render-side
	// `techRadiusScale` in ProjectMap.svelte so layout collision == rendered size.
	const simNodes: SimNode[] = techNodes.map((n) => ({
		slug: n.label, // layout engine keys on "slug" — tech label acts as the key
		radius: techNodeRadius(n.projectCount, maxCount)
	}));

	const winner = layoutSimNodes(simNodes, links, size, LAYOUT_CANDIDATES);
	return { positions: normaliseToCanvas(winner, size, simNodes), width: size, height: size };
}
