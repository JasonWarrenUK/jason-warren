/**
 * Git-branch-graph layout for the adoption timeline.
 *
 * The x-axis is semantically fixed to each technology's adoption date; the
 * chart reads as a git commit graph rotated 90°. Every lineage-connected
 * technology becomes a horizontal RAIL running from its adoption date to
 * either the adoption date of its replacement (retired) or the right plot
 * edge (still in use, rendered with a fade). Lineage edges become short
 * rounded connectors between rails instead of long diagonal arcs:
 *
 *   - "leads-to" is a branch: an elbow leaving the parent rail and arriving
 *     at the child's start dot, while the parent rail continues. A child that
 *     arrives after the parent's rail has already ended (the parent was
 *     replaced first) gets an orthogonal branch-drop from the parent's dot
 *     instead; siblings share that vertical and peel off at their own lanes.
 *   - "replaced-by" is a merge: the retiring rail curves into its successor's
 *     start dot and ends there. When the successor inherits the retiring
 *     rail's lane (the succession rule below), the merge is a straight
 *     handover and the two rails read as one continuous "role" line —
 *     React ▸ Svelte 5 on the UI-framework line, Node.js ▸ Bun on the
 *     JavaScript-runtime line.
 *
 * Technologies with no lineage at all don't earn a rail (it would encode
 * nothing beyond their dot's x position); they pack into a compact dot strip
 * below the rails using the same greedy first-fit the old banded layout used.
 *
 * A transitive-reduction pass drops any "leads-to" edge already implied by a
 * chain (JavaScript→React disappears because JavaScript→TypeScript→React
 * exists), cutting connector count with no informational loss. "replaced-by"
 * edges are never reduced and never form reduction paths.
 *
 * Deterministic by construction: no randomness or clock reads, every sort
 * keyed by the total order [firstDate, label], every Map built by iterating
 * `items` in order. Identical output on the server and the first client
 * render.
 */

import type { LineageKind, TechRelationship } from '$lib/data/types.js';
import type { TechAdoption } from '$lib/data/adoption.js';

export interface LayoutGeometry {
	width: number;
	leftPad: number;
	rightPad: number;
	topPad: number;
	axisGap: number;
	/** Vertical rhythm of the rail lanes. */
	railLaneHeight: number;
	/** Vertical rhythm of the isolated-dot strip below the rails. */
	stripLaneHeight: number;
	/** Gap between the last rail lane and the first strip lane. */
	stripGap: number;
	/** Horizontal run a branch connector reserves before its child's dot. */
	elbowRun: number;
	/** Corner radius of connector elbows. */
	cornerRadius: number;
	charWidth: number;
	labelGap: number;
}

export interface PlacedNode extends TechAdoption {
	x: number;
	y: number;
	radius: number;
	/** Lane index within its own section (rail lanes and strip lanes count separately). */
	lane: number;
	/** Rails carry lineage; the strip holds technologies with no recorded lineage. */
	section: 'rail' | 'strip';
	/** Where the rail line ends (x). Null for strip dots. */
	railEndX: number | null;
	/** True when the rail runs to the plot edge (still in use) and should fade out. */
	railFades: boolean;
}

export type ConnectorVariant =
	| 'elbow'
	| 's-curve'
	| 'vertical-arrival'
	| 'handover'
	| 'bracket'
	| 'branch-drop';

export interface Connector {
	kind: LineageKind;
	source: string;
	target: string;
	variant: ConnectorVariant;
	/** Complete SVG path data; the component renders it verbatim. */
	path: string;
}

export interface YearTick {
	year: number;
	x: number;
}

export interface AdoptionLayoutResult {
	placed: PlacedNode[];
	connectors: Connector[];
	ticks: YearTick[];
	height: number;
	axisY: number;
	railLaneCount: number;
	stripLaneCount: number;
	/** y of the first strip lane; the component may draw a separator above it. */
	stripTop: number;
}

function dayValue(iso: string): number {
	const [y, m, d] = iso.split('-').map(Number);
	return Date.UTC(y, m - 1, d) / 86_400_000;
}

interface NodeGeom {
	label: string;
	x: number;
	radius: number;
	labelRight: number;
}

interface ResolvedEdge {
	kind: LineageKind;
	source: string;
	target: string;
}

/** Frozen x + label-collision metrics for every node. x never changes after this. */
function measure(
	items: TechAdoption[],
	geo: LayoutGeometry
): { geomByLabel: Map<string, NodeGeom>; xFor: (iso: string) => number; plotRight: number } {
	const plotLeft = geo.leftPad;
	// Reserve room on the right for the widest right-anchored label (plus the
	// largest dot and its gap) so no label ever clips at the viewBox edge.
	const maxLabelWidth = Math.max(...items.map((item) => item.label.length)) * geo.charWidth;
	const maxRadius = 4 + 8 * 0.9; // projectCount caps at 8
	const plotRight = geo.width - geo.rightPad - maxLabelWidth - maxRadius - 6;
	const plotWidth = plotRight - plotLeft;

	const days = items.map((item) => dayValue(item.firstDate));
	const minDay = Math.min(...days);
	const maxDay = Math.max(...days);
	const span = maxDay - minDay || 1;

	const xFor = (iso: string): number => plotLeft + ((dayValue(iso) - minDay) / span) * plotWidth;

	const geomByLabel = new Map<string, NodeGeom>();
	for (const item of items) {
		const x = xFor(item.firstDate);
		const radius = 4 + Math.min(item.projectCount, 8) * 0.9;
		const labelRight = x + radius + 6 + item.label.length * geo.charWidth;
		geomByLabel.set(item.label, { label: item.label, x, radius, labelRight });
	}

	return { geomByLabel, xFor, plotRight };
}

/**
 * Drops any "leads-to" edge (u,v) already implied by a longer leads-to path
 * u→…→v, so chains render as chains rather than as chains plus shortcuts.
 * "replaced-by" edges pass through untouched — they carry distinct semantics
 * (a merge, not a branch) and never participate in reduction paths.
 */
function transitiveReduceLeadsTo(edges: ResolvedEdge[]): ResolvedEdge[] {
	const leadsTo = edges.filter((e) => e.kind === 'leads-to');
	const adjacency = new Map<string, string[]>();
	for (const edge of leadsTo) {
		const list = adjacency.get(edge.source);
		if (list) list.push(edge.target);
		else adjacency.set(edge.source, [edge.target]);
	}

	// v is implied-reachable from u when some neighbour w ≠ v of u reaches v.
	// Cycle-safe via the visited set; the graph is tiny, so plain DFS is fine.
	function reaches(from: string, to: string, visited: Set<string>): boolean {
		if (from === to) return true;
		if (visited.has(from)) return false;
		visited.add(from);
		for (const next of adjacency.get(from) ?? []) {
			if (reaches(next, to, visited)) return true;
		}
		return false;
	}

	return edges.filter((edge) => {
		if (edge.kind !== 'leads-to') return true;
		const implied = (adjacency.get(edge.source) ?? []).some(
			(w) => w !== edge.target && reaches(w, edge.target, new Set())
		);
		return !implied;
	});
}

/**
 * Connected components over the (undirected) edge set, each listed in date
 * order, families ordered by their earliest member. Labels with no edges are
 * returned separately — they become the strip.
 */
function buildFamilies(
	items: TechAdoption[],
	edges: ResolvedEdge[]
): { families: string[][]; isolated: string[] } {
	const undirected = new Map<string, string[]>();
	for (const item of items) undirected.set(item.label, []);
	for (const edge of edges) {
		undirected.get(edge.source)!.push(edge.target);
		undirected.get(edge.target)!.push(edge.source);
	}

	const visited = new Set<string>();
	const families: string[][] = [];
	const isolated: string[] = [];

	// items is date-ascending, so each unvisited connected node seeds its
	// family from the family's earliest member — families come out ordered
	// by earliest member automatically.
	for (const item of items) {
		if (visited.has(item.label)) continue;
		if (undirected.get(item.label)!.length === 0) {
			isolated.push(item.label);
			continue;
		}
		const queue = [item.label];
		visited.add(item.label);
		const memberSet = new Set([item.label]);
		while (queue.length > 0) {
			const label = queue.shift()!;
			for (const next of [...undirected.get(label)!].sort((a, b) => a.localeCompare(b))) {
				if (visited.has(next)) continue;
				visited.add(next);
				memberSet.add(next);
				queue.push(next);
			}
		}
		// Family members in global date order (the order of `items`).
		families.push(items.filter((i) => memberSet.has(i.label)).map((i) => i.label));
	}

	return { families, isolated };
}

interface RailEnd {
	/** x where the rail line stops. */
	railEndX: number;
	/** True when the rail reaches the plot edge (no replacement recorded). */
	fades: boolean;
	/** The last replaced-by successor — the rail ends at this tech's dot. */
	lastSuccessor: string | null;
}

/** A retired rail ends at its last replacement's dot edge; others run to the plot edge. */
function computeRailEnds(
	railLabels: Set<string>,
	edges: ResolvedEdge[],
	geomByLabel: Map<string, NodeGeom>,
	plotRight: number
): Map<string, RailEnd> {
	const ends = new Map<string, RailEnd>();
	for (const label of railLabels) {
		const successors = edges
			.filter((e) => e.kind === 'replaced-by' && e.source === label)
			.map((e) => geomByLabel.get(e.target)!)
			.sort((a, b) => a.x - b.x || a.label.localeCompare(b.label));
		if (successors.length === 0) {
			ends.set(label, { railEndX: plotRight, fades: true, lastSuccessor: null });
		} else {
			const last = successors[successors.length - 1];
			ends.set(label, {
				railEndX: last.x - last.radius - 2,
				fades: false,
				lastSuccessor: last.label
			});
		}
	}
	return ends;
}

interface LaneAssignment {
	laneOf: Map<string, number>;
	/** Labels that inherited their replaced-by predecessor's lane. */
	inherited: Set<string>;
	laneCount: number;
}

/**
 * Re-orders a family's members so a lineage source always precedes its direct
 * target when the two share an exact adoption date, breaking the tie in the
 * incoming order otherwise. Defence-in-depth: `getTechAdoption`'s own sort
 * already breaks a same-date tie toward the lineage parent, so `family`
 * should already arrive parent-first, but `assignLanes`'s per-family loop
 * treats array order as the anchor-visitation order — if a parent ever
 * arrived after its child (a stale caller, a future data source that doesn't
 * share that tie-break), the anchor lookup at line ~340 would silently find
 * nothing and open a spurious new lane instead of anchoring beside its child.
 *
 * Deliberately scoped to same-date pairs only: a lineage edge whose target
 * predates its source (backward in time, e.g. an authoring mistake) must
 * never move a member across a genuine date boundary, since `claimRight`
 * assumes family members are visited in date-ascending x order — visiting an
 * out-of-date-order member early would let a later `claimRight` update get
 * silently overwritten with an earlier x, corrupting overlap checks for every
 * lane placed afterward. Restricting eligible edges to date ties keeps this
 * pass a strict refinement of the existing date order rather than a
 * replacement for it.
 */
function topologicalWithinFamily(
	family: string[],
	edges: ResolvedEdge[],
	itemDates: Map<string, string>
): string[] {
	const members = new Set(family);
	const indexOf = new Map(family.map((label, i) => [label, i]));
	const childrenOf = new Map<string, string[]>();
	const indegree = new Map<string, number>(family.map((label) => [label, 0]));
	for (const edge of edges) {
		if (!members.has(edge.source) || !members.has(edge.target)) continue;
		if (itemDates.get(edge.source) !== itemDates.get(edge.target)) continue;
		const list = childrenOf.get(edge.source);
		if (list) list.push(edge.target);
		else childrenOf.set(edge.source, [edge.target]);
		indegree.set(edge.target, indegree.get(edge.target)! + 1);
	}

	// Min-heap-by-original-index via a sorted array is overkill at family
	// sizes this small; a linear scan for the lowest-index ready node keeps
	// the pass simple and still deterministic.
	const ready = family.filter((label) => indegree.get(label) === 0);
	const remaining = new Map(indegree);
	const ordered: string[] = [];

	while (ready.length > 0) {
		ready.sort((a, b) => indexOf.get(a)! - indexOf.get(b)!);
		const next = ready.shift()!;
		ordered.push(next);
		for (const child of childrenOf.get(next) ?? []) {
			const left = remaining.get(child)! - 1;
			remaining.set(child, left);
			if (left === 0) ready.push(child);
		}
	}

	// A cycle (e.g. mutually contradictory authored edges) leaves members
	// unresolved; append them in original order rather than dropping them.
	if (ordered.length < family.length) {
		for (const label of family) if (!ordered.includes(label)) ordered.push(label);
	}

	return ordered;
}

/**
 * Assigns each rail a lane. Families occupy contiguous lane blocks. Within a
 * family (rails arriving in date order):
 *
 *   1. Succession: a rail inherits its replaced-by predecessor's lane when it
 *      is that predecessor's LAST successor (the predecessor's rail actually
 *      ends here — Deno fails this for Node.js because Bun ends the rail
 *      later) and the predecessor's label clears this rail's dot.
 *   2. Otherwise the nearest free lane in the family block to its anchor (the
 *      leads-to parent, or the replaced-by predecessor when succession was
 *      rejected), the anchor's own lane included, ties preferring below.
 *   3. Family roots with no placed anchor open a new lane.
 *
 * Lane occupancy is a single claimRight scalar per lane — valid because rails
 * within a family arrive date-ascending, so occupants append left-to-right.
 */
function assignLanes(
	families: string[][],
	edges: ResolvedEdge[],
	geomByLabel: Map<string, NodeGeom>,
	railEnds: Map<string, RailEnd>,
	itemDates: Map<string, string>,
	geo: LayoutGeometry
): LaneAssignment {
	const laneOf = new Map<string, number>();
	const inherited = new Set<string>();
	const claimRight: number[] = [];

	const byDateThenLabel = (a: string, b: string): number =>
		itemDates.get(a)!.localeCompare(itemDates.get(b)!) || a.localeCompare(b);

	for (const family of families) {
		const blockStart = claimRight.length;
		const ordered = topologicalWithinFamily(family, edges, itemDates);

		for (const label of ordered) {
			const geom = geomByLabel.get(label)!;
			const dotLeft = geom.x - geom.radius;
			const claim = Math.max(railEnds.get(label)!.railEndX, geom.labelRight);

			// Succession: inherit the primary replaced-by predecessor's lane.
			const predecessors = edges
				.filter((e) => e.kind === 'replaced-by' && e.target === label)
				.map((e) => e.source)
				.sort(byDateThenLabel);
			const predecessor = predecessors[0];

			if (predecessor !== undefined && laneOf.has(predecessor)) {
				const predEnd = railEnds.get(predecessor)!;
				const predGeom = geomByLabel.get(predecessor)!;
				if (
					predEnd.lastSuccessor === label &&
					predGeom.labelRight + geo.labelGap <= dotLeft
				) {
					const lane = laneOf.get(predecessor)!;
					laneOf.set(label, lane);
					inherited.add(label);
					claimRight[lane] = claim;
					continue;
				}
			}

			// Anchor: the leads-to parent, else the (succession-rejected)
			// replaced-by predecessor. Only already-placed anchors count.
			const parents = edges
				.filter((e) => e.kind === 'leads-to' && e.target === label && laneOf.has(e.source))
				.map((e) => e.source)
				.sort(byDateThenLabel);
			const anchor =
				parents[0] ?? (predecessor !== undefined && laneOf.has(predecessor) ? predecessor : undefined);

			let lane = -1;
			if (anchor !== undefined) {
				const anchorLane = laneOf.get(anchor)!;
				// Distance 0, then ±1, ±2 … below first, within the family block.
				for (let distance = 0; distance < claimRight.length - blockStart; distance++) {
					for (const candidate of distance === 0
						? [anchorLane]
						: [anchorLane + distance, anchorLane - distance]) {
						if (candidate < blockStart || candidate >= claimRight.length) continue;
						if (dotLeft > claimRight[candidate] + geo.labelGap) {
							lane = candidate;
							break;
						}
					}
					if (lane !== -1) break;
				}
			}
			if (lane === -1) {
				lane = claimRight.length;
				claimRight.push(0);
			}

			laneOf.set(label, lane);
			claimRight[lane] = claim;
		}
	}

	return { laneOf, inherited, laneCount: claimRight.length };
}

/** Greedy first-fit packing for the isolated-dot strip — the old banded layout's packer. */
function packStrip(
	labels: string[],
	geomByLabel: Map<string, NodeGeom>,
	geo: LayoutGeometry
): { laneOf: Map<string, number>; laneCount: number } {
	const laneRight: number[] = [];
	const laneOf = new Map<string, number>();

	for (const label of labels) {
		const geom = geomByLabel.get(label)!;
		let lane = laneRight.findIndex((right) => geom.x - geom.radius > right + geo.labelGap);
		if (lane === -1) {
			lane = laneRight.length;
			laneRight.push(geom.labelRight);
		} else {
			laneRight[lane] = geom.labelRight;
		}
		laneOf.set(label, lane);
	}

	return { laneOf, laneCount: laneRight.length };
}

// --- Connector path builders ------------------------------------------------
// All builders take resolved pixel coordinates and return complete SVG path
// data. Corners use quadratic beziers (visually identical to arcs at these
// radii, with no sweep-flag bookkeeping).

interface RailPoint {
	x: number;
	y: number;
	radius: number;
	railEndX: number;
	/** Right edge of the dot-plus-label extent, for clearance checks. */
	labelRight: number;
}

/**
 * Branch elbow with a horizontal arrival at the child dot's left edge. The
 * corridor defaults to elbowRun before the child; routing may supply another
 * x (always between the parent's dot and rail end).
 */
function elbowPath(
	parent: RailPoint,
	child: RailPoint,
	geo: LayoutGeometry,
	corridorX: number = child.x - geo.elbowRun
): string {
	const s = Math.sign(child.y - parent.y);
	const r = Math.min(geo.cornerRadius, Math.abs(child.y - parent.y) / 2, child.x - corridorX - 2);
	const arriveX = child.x - child.radius - 2;
	return [
		`M ${corridorX - r} ${parent.y}`,
		`Q ${corridorX} ${parent.y} ${corridorX} ${parent.y + s * r}`,
		`V ${child.y - s * r}`,
		`Q ${corridorX} ${child.y} ${corridorX + r} ${child.y}`,
		`H ${arriveX}`
	].join(' ');
}

/** Single-corner connector arriving vertically at the child dot's top or bottom. */
function verticalArrivalPath(parent: RailPoint, child: RailPoint, geo: LayoutGeometry): string {
	const s = Math.sign(child.y - parent.y);
	const r = Math.min(geo.cornerRadius, Math.abs(child.y - parent.y) / 2);
	return [
		`M ${child.x - r} ${parent.y}`,
		`Q ${child.x} ${parent.y} ${child.x} ${parent.y + s * r}`,
		`V ${child.y - s * (child.radius + 2)}`
	].join(' ');
}

/** Dot-to-dot cubic for gaps too tight for an elbow (departs/arrives vertically). */
function sCurvePath(parent: RailPoint, child: RailPoint): string {
	const s = Math.sign(child.y - parent.y);
	const fromY = parent.y + s * (parent.radius + 2);
	const toY = child.y - s * (child.radius + 2);
	const midY = (fromY + toY) / 2;
	return `M ${parent.x} ${fromY} C ${parent.x} ${midY} ${child.x} ${midY} ${child.x} ${toY}`;
}

/**
 * Left-side bracket for a parent and child whose dots leave no vertical room
 * for an s-curve — typically a same-date pair in adjacent lanes whose radii
 * swallow the lane pitch (HTML → CSS). Departs the parent dot's left edge,
 * bulges left and arrives at the child dot's left edge, so the connector
 * stays visible however tightly the dots pack.
 */
function bracketPath(parent: RailPoint, child: RailPoint, geo: LayoutGeometry): string {
	const departX = parent.x - parent.radius - 2;
	const arriveX = child.x - child.radius - 2;
	const bulge = geo.elbowRun;
	return [
		`M ${departX} ${parent.y}`,
		`C ${departX - bulge} ${parent.y} ${arriveX - bulge} ${child.y} ${arriveX} ${child.y}`
	].join(' ');
}

/** Vertical clearance (px) below which an s-curve degenerates into a bracket. */
const MIN_S_CURVE_GAP = 6;

/**
 * Dot-to-dot fallback variant. An s-curve spans the vertical gap between the
 * two dots' clearance edges; when the dots sit so close that this gap shrinks
 * below MIN_S_CURVE_GAP (or inverts entirely, drawing a sub-pixel path
 * backwards), a bracket around the dots' left side takes over.
 */
function dotToDotVariant(parent: RailPoint, child: RailPoint): ConnectorVariant {
	const gap = Math.abs(child.y - parent.y) - (parent.radius + child.radius + 4);
	return gap < MIN_S_CURVE_GAP ? 'bracket' : 's-curve';
}

/**
 * Orthogonal branch for a child that outlives its parent's rail: departs the
 * parent DOT vertically, drops to the child's lane and runs horizontally to
 * the child dot's left edge. Late children of one parent all share the
 * collinear vertical at parent.x and peel off at their own lanes, so a fan of
 * branches reads as one git-style branch line rather than a sheaf of
 * diagonals.
 */
function branchDropPath(parent: RailPoint, child: RailPoint, geo: LayoutGeometry): string {
	const s = Math.sign(child.y - parent.y);
	const arriveX = child.x - child.radius - 2;
	const r = Math.min(geo.cornerRadius, Math.abs(child.y - parent.y) / 2, arriveX - parent.x - 2);
	return [
		`M ${parent.x} ${parent.y + s * (parent.radius + 2)}`,
		`V ${child.y - s * r}`,
		`Q ${parent.x} ${child.y} ${parent.x + r} ${child.y}`,
		`H ${arriveX}`
	].join(' ');
}

/** Same-lane merge: the final stretch of the retiring rail, recoloured. */
function handoverPath(parent: RailPoint, child: RailPoint): string {
	const arriveX = child.x - child.radius - 2;
	const fromX = Math.max(arriveX - 16, parent.x + parent.radius + 2);
	return `M ${fromX} ${parent.y} H ${arriveX}`;
}

/**
 * One edge's routing decision, produced by the routing phase and consumed by
 * the emission phase. Splitting the two keeps every geometric decision (which
 * variant, where the vertical corridor sits) in one place, so passes that
 * adjust routes — corridor de-overlap, future variants — never touch path
 * emission.
 */
interface RoutedEdge {
	edge: ResolvedEdge;
	variant: ConnectorVariant;
	/** x of the connector's vertical corridor; null for variants without one. */
	corridorX: number | null;
}

/** One rail node's footprint within its lane, for clearance checks. */
interface RailOccupant {
	label: string;
	x: number;
	radius: number;
	labelRight: number;
}

/** Rail nodes grouped by lane, x-ascending — the interval index routing needs. */
function indexOccupants(
	pointOf: Map<string, RailPoint>,
	laneOf: Map<string, number>
): Map<number, RailOccupant[]> {
	const occupantsByLane = new Map<number, RailOccupant[]>();
	for (const [label, point] of pointOf) {
		const lane = laneOf.get(label)!;
		const occupant = { label, x: point.x, radius: point.radius, labelRight: point.labelRight };
		const list = occupantsByLane.get(lane);
		if (list) list.push(occupant);
		else occupantsByLane.set(lane, [occupant]);
	}
	for (const list of occupantsByLane.values()) {
		list.sort((a, b) => a.x - b.x || a.label.localeCompare(b.label));
	}
	return occupantsByLane;
}

interface BranchDropRoute {
	corridorX: number;
	/** True when the corridor sits right of the parent dot and departs the rail. */
	viaRail: boolean;
}

/**
 * Finds a vertical corridor for a branch to a child beyond the parent's rail
 * end. The first candidate is parent.x itself (the git-branch fan: departs
 * the dot, and siblings bundle onto one collinear vertical). A candidate is
 * rejected when it would slice through a dot in an intermediate lane (labels
 * are fine — the component's halo keeps text legible over verticals) or when
 * the horizontal run along the child's lane would collide with an earlier
 * occupant of that lane. Each rejection pushes the corridor just right of the
 * furthest obstruction; corridors right of the parent dot must depart the
 * rail instead (emitted as a generalised elbow), which bounds them by the
 * rail's end and the child's own approach. Deterministic throughout: the scan
 * is a pure function of node geometry.
 */
function chooseBranchDropRoute(
	parent: RailPoint,
	child: RailPoint,
	parentLane: number,
	childLane: number,
	childLabel: string,
	occupantsByLane: Map<number, RailOccupant[]>,
	geo: LayoutGeometry
): BranchDropRoute | null {
	const arriveX = child.x - child.radius - 2;
	const departLimit = parent.x + parent.radius + 2;
	const loLane = Math.min(parentLane, childLane);
	const hiLane = Math.max(parentLane, childLane);

	let corridorX = parent.x;
	for (let attempt = 0; attempt < 8; attempt++) {
		const viaRail = corridorX > parent.x;
		if (viaRail) {
			corridorX = Math.max(corridorX, departLimit + geo.cornerRadius);
			if (corridorX > parent.railEndX || corridorX > child.x - geo.elbowRun) return null;
		}
		if (arriveX - corridorX < geo.cornerRadius + 2) return null;

		// Furthest clearance x demanded by any obstruction at this corridor;
		// taking the max guarantees monotonic progress rightwards.
		let pushTo = -Infinity;
		for (let lane = loLane + 1; lane < hiLane; lane++) {
			for (const occupant of occupantsByLane.get(lane) ?? []) {
				if (Math.abs(corridorX - occupant.x) <= occupant.radius + 3) {
					pushTo = Math.max(pushTo, occupant.x + occupant.radius + 4);
				}
			}
		}
		for (const occupant of occupantsByLane.get(childLane) ?? []) {
			if (occupant.label === childLabel) continue;
			if (occupant.labelRight > corridorX && occupant.x - occupant.radius < arriveX) {
				pushTo = Math.max(pushTo, occupant.labelRight + 4);
			}
		}

		if (pushTo === -Infinity) return { corridorX, viaRail };
		corridorX = pushTo;
	}
	return null;
}

/**
 * Routing phase: picks a variant and corridor for every surviving edge. Per
 * child, exactly one incoming connector earns the horizontal arrival (the
 * leads-to parent, nearest lane first); the rest arrive vertically so
 * multiple arrivals at one dot stay distinguishable. A lane-inheriting
 * child's incoming connectors are all vertical (its predecessor's rail
 * occupies the horizontal approach) except the succession merge itself,
 * which is a same-lane handover.
 */
function routeEdges(
	edges: ResolvedEdge[],
	pointOf: Map<string, RailPoint>,
	laneOf: Map<string, number>,
	inherited: Set<string>,
	itemDates: Map<string, string>,
	geo: LayoutGeometry
): RoutedEdge[] {
	// Designated horizontal-arrival edge per child.
	const horizontalFor = new Map<string, ResolvedEdge>();
	const incomingByChild = new Map<string, ResolvedEdge[]>();
	for (const edge of edges) {
		const list = incomingByChild.get(edge.target);
		if (list) list.push(edge);
		else incomingByChild.set(edge.target, [edge]);
	}
	for (const [child, incoming] of incomingByChild) {
		if (inherited.has(child)) continue; // all vertical (or handover)
		const childLane = laneOf.get(child)!;
		const leadsTo = incoming
			.filter((e) => e.kind === 'leads-to')
			.sort(
				(a, b) =>
					Math.abs(laneOf.get(a.source)! - childLane) -
						Math.abs(laneOf.get(b.source)! - childLane) || a.source.localeCompare(b.source)
			);
		const replacedBy = incoming
			.filter((e) => e.kind === 'replaced-by')
			.sort(
				(a, b) =>
					itemDates.get(a.source)!.localeCompare(itemDates.get(b.source)!) ||
					a.source.localeCompare(b.source)
			);
		const designated = leadsTo[0] ?? replacedBy[0];
		if (designated) horizontalFor.set(child, designated);
	}

	const occupantsByLane = indexOccupants(pointOf, laneOf);

	const routed: RoutedEdge[] = [];
	for (const edge of edges) {
		const parent = pointOf.get(edge.source)!;
		const child = pointOf.get(edge.target)!;
		const departLimit = parent.x + parent.radius + 2;

		if (laneOf.get(edge.source) === laneOf.get(edge.target)) {
			// Same lane: succession merge or lane-reuse — a straight handover.
			routed.push({ edge, variant: 'handover', corridorX: null });
		} else if (horizontalFor.get(edge.target) === edge) {
			const corridorX = child.x - geo.elbowRun;
			// The elbow needs room to depart the parent rail and the corridor
			// must sit where the parent rail still exists. When it cannot —
			// the child outlives the parent's rail, or sits too close — try
			// the orthogonal branch-drop before conceding a dot-to-dot curve.
			if (corridorX - geo.cornerRadius < departLimit || corridorX > parent.railEndX) {
				const route =
					child.x > parent.x
						? chooseBranchDropRoute(
								parent,
								child,
								laneOf.get(edge.source)!,
								laneOf.get(edge.target)!,
								edge.target,
								occupantsByLane,
								geo
							)
						: null;
				if (route === null) {
					routed.push({ edge, variant: dotToDotVariant(parent, child), corridorX: null });
				} else {
					routed.push({
						edge,
						variant: route.viaRail ? 'elbow' : 'branch-drop',
						corridorX: route.corridorX
					});
				}
			} else {
				routed.push({ edge, variant: 'elbow', corridorX });
			}
		} else {
			if (child.x - geo.cornerRadius < departLimit || child.x > parent.railEndX) {
				routed.push({ edge, variant: dotToDotVariant(parent, child), corridorX: null });
			} else {
				routed.push({ edge, variant: 'vertical-arrival', corridorX: child.x });
			}
		}
	}
	return routed;
}

/** Emission phase: a pure RoutedEdge → Connector mapping over the path builders. */
function emitConnector(routed: RoutedEdge, pointOf: Map<string, RailPoint>, geo: LayoutGeometry): Connector {
	const { edge, variant, corridorX } = routed;
	const parent = pointOf.get(edge.source)!;
	const child = pointOf.get(edge.target)!;

	let path: string;
	switch (variant) {
		case 'handover':
			path = handoverPath(parent, child);
			break;
		case 'elbow':
			path = elbowPath(parent, child, geo, corridorX!);
			break;
		case 'vertical-arrival':
			path = verticalArrivalPath(parent, child, geo);
			break;
		case 'bracket':
			path = bracketPath(parent, child, geo);
			break;
		case 'branch-drop':
			path = branchDropPath(parent, child, geo);
			break;
		case 's-curve':
			path = sCurvePath(parent, child);
			break;
	}

	return { kind: edge.kind, source: edge.source, target: edge.target, variant, path };
}

/** Builds one connector per surviving edge: route, then emit. */
function buildConnectors(
	edges: ResolvedEdge[],
	pointOf: Map<string, RailPoint>,
	laneOf: Map<string, number>,
	inherited: Set<string>,
	itemDates: Map<string, string>,
	geo: LayoutGeometry
): Connector[] {
	const routed = routeEdges(edges, pointOf, laneOf, inherited, itemDates, geo);
	return routed.map((r) => emitConnector(r, pointOf, geo));
}

export function computeAdoptionLayout(
	items: TechAdoption[],
	edges: TechRelationship[],
	geo: LayoutGeometry
): AdoptionLayoutResult {
	if (items.length === 0) {
		return {
			placed: [],
			connectors: [],
			ticks: [],
			height: geo.topPad * 2,
			axisY: geo.topPad,
			railLaneCount: 0,
			stripLaneCount: 0,
			stripTop: geo.topPad
		};
	}

	const { geomByLabel, xFor, plotRight } = measure(items, geo);
	const itemDates = new Map(items.map((item) => [item.label, item.firstDate]));

	// Edges resolved against rendered items, then transitively reduced.
	const labels = new Set(items.map((item) => item.label));
	const resolved: ResolvedEdge[] = edges.filter(
		(e) => labels.has(e.source) && labels.has(e.target)
	);
	const reduced = transitiveReduceLeadsTo(resolved);

	const { families, isolated } = buildFamilies(items, reduced);
	const railLabels = new Set(families.flat());

	const railEnds = computeRailEnds(railLabels, reduced, geomByLabel, plotRight);
	const rails = assignLanes(families, reduced, geomByLabel, railEnds, itemDates, geo);
	const strip = packStrip(isolated, geomByLabel, geo);

	const railBlockHeight = rails.laneCount * geo.railLaneHeight;
	const stripTop =
		geo.topPad + railBlockHeight + (rails.laneCount > 0 && strip.laneCount > 0 ? geo.stripGap : 0);
	const contentBottom = stripTop + strip.laneCount * geo.stripLaneHeight;

	const placed: PlacedNode[] = items.map((item) => {
		const geom = geomByLabel.get(item.label)!;
		if (railLabels.has(item.label)) {
			const end = railEnds.get(item.label)!;
			return {
				...item,
				x: geom.x,
				y: geo.topPad + rails.laneOf.get(item.label)! * geo.railLaneHeight,
				radius: geom.radius,
				lane: rails.laneOf.get(item.label)!,
				section: 'rail' as const,
				railEndX: end.railEndX,
				railFades: end.fades
			};
		}
		return {
			...item,
			x: geom.x,
			y: stripTop + strip.laneOf.get(item.label)! * geo.stripLaneHeight,
			radius: geom.radius,
			lane: strip.laneOf.get(item.label)!,
			section: 'strip' as const,
			railEndX: null,
			railFades: false
		};
	});

	const pointOf = new Map<string, RailPoint>(
		placed
			.filter((p) => p.section === 'rail')
			.map((p) => [
				p.label,
				{
					x: p.x,
					y: p.y,
					radius: p.radius,
					railEndX: p.railEndX!,
					labelRight: geomByLabel.get(p.label)!.labelRight
				}
			])
	);
	const connectors = buildConnectors(
		reduced,
		pointOf,
		rails.laneOf,
		rails.inherited,
		itemDates,
		geo
	);

	const axisY = contentBottom + geo.axisGap / 2;
	const height = axisY + geo.axisGap;

	const firstYear = Number(items[0].firstDate.slice(0, 4));
	const lastYear = Number(items[items.length - 1].firstDate.slice(0, 4));
	const ticks: YearTick[] = [];
	for (let year = firstYear; year <= lastYear; year++) {
		ticks.push({ year, x: xFor(`${year}-01-01`) });
	}

	return {
		placed,
		connectors,
		ticks,
		height,
		axisY,
		railLaneCount: rails.laneCount,
		stripLaneCount: strip.laneCount,
		stripTop
	};
}
