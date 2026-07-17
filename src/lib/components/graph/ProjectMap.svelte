<script lang="ts">
	import { onMount } from 'svelte';
	import { polygonHull, polygonCentroid } from 'd3-polygon';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import {
		EDGE_CATEGORIES,
		type LineageKind,
		type ProjectKind,
		type ProjectProgress,
		type ProjectTrack,
		type TagKind
	} from '$lib/data/types.js';
	import { techRelationships } from '$lib/data/tech-relationships.js';
	import { parseSet, serialiseSet, encodeTechLabel, decodeTechLabel } from '$lib/url-state.js';
	import { writeParam } from '$lib/url-write.js';
	import SelectionModal from '$lib/components/ui/SelectionModal.svelte';
	import type {
		GraphEdge,
		LiveSimNode,
		MapMode,
		SharedTechEdge,
		SharedThemeEdge,
		SimLink
	} from '$lib/data/graph.js';
	import {
		createForceSimulation,
		createForceSimulationFromLinks,
		computeRelayoutTargets
	} from '$lib/data/graph.js';
	import type { TechCoEdge } from '$lib/data/tech-graph.js';
	import { techNodeRadius } from '$lib/data/tech-graph.js';
	import {
		validatePin,
		nextPinValue,
		projectHref,
		projectsByTagHref,
		techViewHref
	} from '$lib/selection.js';
	import {
		progressColour,
		progressLabel,
		progressOrder,
		trackLabel,
		categoryColour,
		edgeTypeColour,
		edgeTypeLabel,
		kindGlyph,
		kindGlyphPath,
		techMarkColour,
		themeColour,
		themeEdgeType,
		isThemeEdgeType,
		themeIds,
		type EdgeType
	} from './graph-style.js';

	// ---------------------------------------------------------------------------
	// Types
	// ---------------------------------------------------------------------------

	interface MapNode {
		slug: string;
		name: string;
		tagline: string;
		track: ProjectTrack;
		progress: ProjectProgress;
		archived: boolean;
		deployed: boolean;
		/** True when track or progress is a heuristic guess; draws dotted. */
		stageProvisional: boolean;
		kind: ProjectKind;
		hub: boolean;
		labelled: boolean;
		lastCommit: string | null;
		commits: number | null;
		linesOfCode: number | null;
		x: number;
		y: number;
	}

	interface TechMapNode {
		label: string;
		kind: TagKind;
		projectCount: number;
		x: number;
		y: number;
	}

	interface Territory {
		id: string;
		name: string;
		slugs: string[];
	}

	interface Props {
		relationshipsNodes: MapNode[];
		stackNodes: MapNode[];
		techNodes: TechMapNode[];
		edges: GraphEdge[];
		sharedEdges: SharedTechEdge[];
		themeEdges: SharedThemeEdge[];
		techCoEdges: TechCoEdge[];
		territories: Territory[];
		size: number;
	}

	let {
		relationshipsNodes,
		stackNodes,
		techNodes,
		edges,
		sharedEdges,
		themeEdges,
		techCoEdges,
		territories,
		size
	}: Props = $props();

	// ---------------------------------------------------------------------------
	// Mode state
	// ---------------------------------------------------------------------------

	const activeMode = $derived<MapMode>(
		browser
			? $page.url.searchParams.get('mode') === 'stack'
				? 'stack'
				: $page.url.searchParams.get('mode') === 'technologies'
					? 'technologies'
					: 'relationships'
			: 'relationships'
	);

	function setMode(mode: MapMode): void {
		writeParam('mode', mode === 'relationships' ? null : mode);
	}

	// ---------------------------------------------------------------------------
	// Derived state
	// ---------------------------------------------------------------------------

	const projectNodes = $derived(activeMode === 'stack' ? stackNodes : relationshipsNodes);
	const projectPositions = $derived(new Map(projectNodes.map((n) => [n.slug, n])));
	const techPositions = $derived(new Map(techNodes.map((n) => [n.label, n])));

	const adjacency = $derived.by(() => {
		const map = new Map<string, Set<string>>();
		if (activeMode === 'technologies') {
			for (const node of techNodes) map.set(node.label, new Set());
			for (const edge of techCoEdges) {
				map.get(edge.source)?.add(edge.target);
				map.get(edge.target)?.add(edge.source);
			}
		} else {
			for (const node of projectNodes) map.set(node.slug, new Set());
			const activeEdges =
				activeMode === 'stack' ? [...edges, ...sharedEdges] : [...edges, ...themeEdges];
			for (const edge of activeEdges) {
				map.get(edge.source)?.add(edge.target);
				map.get(edge.target)?.add(edge.source);
			}
		}
		return map;
	});

	const projectKinds = $derived([...new Set(projectNodes.map((n) => n.kind))].sort());
	const techKinds = $derived([...new Set(techNodes.map((n) => n.kind))].sort() as TagKind[]);

	// Historic stack: any tech that is the source of a `replaced-by` edge has
	// been superseded, and its mark fades one shade paperward (the same
	// end-of-life convention archived projects use).
	const historicTechLabels = new Set(
		techRelationships.filter((r) => r.kind === 'replaced-by').map((r) => r.source)
	);

	const edgeTypes = $derived.by((): EdgeType[] => {
		const present: EdgeType[] = [];
		if (activeMode === 'relationships') {
			for (const kind of ['extraction', 'related'] as const) {
				if (edges.some((e) => e.kind === kind)) present.push(kind);
			}
			// One toggle per theme, in registry order, for themes that have edges.
			const themeEdgeIds = new Set(themeEdges.map((e) => e.theme));
			for (const id of themeIds) {
				if (themeEdgeIds.has(id)) present.push(themeEdgeType(id));
			}
		} else if (activeMode === 'stack') {
			for (const category of EDGE_CATEGORIES) {
				if (sharedEdges.some((e) => e.category === category)) present.push(category);
			}
		} else {
			for (const kind of ['leads-to', 'replaced-by'] as const) {
				if (
					techRelationships.some(
						(r) => r.kind === kind && techPositions.has(r.source) && techPositions.has(r.target)
					)
				) {
					present.push(kind);
				}
			}
		}
		return present;
	});

	// ---------------------------------------------------------------------------
	// Visual scale helpers
	// ---------------------------------------------------------------------------

	const radiusScale = $derived.by(() => {
		const weights = projectNodes.map((n) => n.commits ?? (n.linesOfCode ? n.linesOfCode / 50 : 0));
		const max = Math.max(1, ...weights);
		return (node: MapNode): number => {
			const w = node.commits ?? (node.linesOfCode ? node.linesOfCode / 50 : 0);
			const base = 8 + 17.5 * Math.sqrt(w / max);
			return node.hub ? Math.max(19, base) : base;
		};
	});

	const opacityScale = $derived.by(() => {
		const times = projectNodes
			.map((n) => (n.lastCommit ? Date.parse(n.lastCommit) : NaN))
			.filter((t) => !Number.isNaN(t));
		if (times.length === 0) return (): number => 0.5;
		const min = Math.min(...times);
		const max = Math.max(...times);
		const span = max - min || 1;
		return (node: MapNode): number => {
			if (!node.lastCommit) return 0.5;
			const t = Date.parse(node.lastCommit);
			if (Number.isNaN(t)) return 0.5;
			return 0.55 + 0.45 * ((t - min) / span);
		};
	});

	const techMaxCount = $derived(Math.max(1, ...techNodes.map((n) => n.projectCount)));
	const techRadiusScale = $derived((node: TechMapNode): number =>
		techNodeRadius(node.projectCount, techMaxCount)
	);

	// Graticule: horizontal lines every ~80px, vertical every ~100px of the
	// square viewBox, scaled from the reference 900x560 sheet.
	const GRATICULE_STEP_Y = 80;
	const GRATICULE_STEP_X = 100;
	const graticuleY = $derived.by(() => {
		const lines: number[] = [];
		for (let y = GRATICULE_STEP_Y; y < size; y += GRATICULE_STEP_Y) lines.push(y);
		return lines;
	});
	const graticuleX = $derived.by(() => {
		const lines: number[] = [];
		for (let x = GRATICULE_STEP_X; x < size; x += GRATICULE_STEP_X) lines.push(x);
		return lines;
	});

	/** Shortens a line from `from` to `to` so it stops `r` short of `to`, leaving room for an arrowhead. */
	function shortenToRadius(
		from: { x: number; y: number },
		to: { x: number; y: number },
		r: number
	): { x: number; y: number } {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const dist = Math.hypot(dx, dy);
		if (dist === 0) return to;
		const t = Math.max(0, (dist - r) / dist);
		return { x: from.x + dx * t, y: from.y + dy * t };
	}

	// ---------------------------------------------------------------------------
	// Survey-route geometry: every edge is drawn as a bowed quadratic path,
	// never a straight line — "plotted", not merely connected.
	// ---------------------------------------------------------------------------

	interface Point {
		x: number;
		y: number;
	}

	/** Control point for a route's quadratic bow: offset perpendicular from the midpoint by 0.14x the edge length. */
	function routeControlPoint(a: Point, b: Point): Point {
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const bow = 0.14 * len;
		return { x: mx - (dy / len) * bow, y: my + (dx / len) * bow };
	}

	/** SVG path `d` for a bowed route from `a` to `b`. */
	function routePath(a: Point, b: Point): string {
		const c = routeControlPoint(a, b);
		return `M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`;
	}

	/** Point on the route's quadratic curve at parameter `t` (0 = start, 1 = end). */
	function routePointAt(a: Point, b: Point, t: number): Point {
		const c = routeControlPoint(a, b);
		const mt = 1 - t;
		return {
			x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
			y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y
		};
	}

	/** Two-stroke arrowhead `d`, wings of length 9 at ±0.42 rad, tipped `r` short of `b` along the route's local tangent. */
	function routeArrowhead(a: Point, b: Point, r: number): string {
		const near = routePointAt(a, b, 0.92);
		const ang = Math.atan2(b.y - near.y, b.x - near.x);
		const tipX = b.x - Math.cos(ang) * r;
		const tipY = b.y - Math.sin(ang) * r;
		const wing = (da: number): string => {
			const wx = tipX - Math.cos(ang + da) * 9;
			const wy = tipY - Math.sin(ang + da) * 9;
			return `${wx} ${wy}`;
		};
		return `M${wing(-0.42)} L${tipX} ${tipY} L${wing(0.42)}`;
	}

	// ---------------------------------------------------------------------------
	// Territory hulls: convex hull per theme cluster, relationships mode only.
	// ---------------------------------------------------------------------------

	const HULL_PADDING = 32;
	const HULL_MIN_MEMBERS = 3;

	/** Expands each hull vertex outward from the centroid by `padding`. */
	function padHull(hull: [number, number][], padding: number): [number, number][] {
		const [ccx, ccy] = polygonCentroid(hull);
		return hull.map(([x, y]) => {
			const dx = x - ccx;
			const dy = y - ccy;
			const len = Math.hypot(dx, dy) || 1;
			return [x + (dx / len) * padding, y + (dy / len) * padding] as [number, number];
		});
	}

	/** Rounded-corner closed path through `points`, via quadratic curves through edge midpoints. */
	function roundedHullPath(points: [number, number][]): string {
		const n = points.length;
		const mid = (a: [number, number], b: [number, number]): [number, number] => [
			(a[0] + b[0]) / 2,
			(a[1] + b[1]) / 2
		];
		const start = mid(points[n - 1], points[0]);
		let d = `M${start[0]} ${start[1]}`;
		for (let i = 0; i < n; i++) {
			const p = points[i];
			const next = points[(i + 1) % n];
			const m = mid(p, next);
			d += ` Q${p[0]} ${p[1]} ${m[0]} ${m[1]}`;
		}
		d += ' Z';
		return d;
	}

	interface TerritoryHull {
		id: string;
		name: string;
		path: string;
		labelX: number;
		labelY: number;
	}

	const territoryHulls = $derived.by((): TerritoryHull[] => {
		if (activeMode !== 'relationships') return [];
		const hulls: TerritoryHull[] = [];
		for (const territory of territories) {
			const points: [number, number][] = territory.slugs
				.filter((slug) => !nodeHidden(projectPositions.get(slug) as MapNode))
				.map((slug) => projectPos(slug))
				.filter((p): p is { x: number; y: number } => !!p)
				.map((p) => [p.x, p.y]);
			if (points.length < HULL_MIN_MEMBERS) continue;
			const hull = polygonHull(points);
			if (!hull) continue;
			const padded = padHull(hull, HULL_PADDING);
			const [, topY] = padded.reduce((top, pt) => (pt[1] < top[1] ? pt : top));
			const [cx] = polygonCentroid(padded);
			hulls.push({
				id: territory.id,
				name: territory.name,
				path: roundedHullPath(padded),
				labelX: cx,
				labelY: topY + 22
			});
		}
		return hulls;
	});

	const TECH_LABEL_COUNT = 12;
	const standingTechLabels = $derived(
		new Set(
			[...techNodes]
				.sort((a, b) => b.projectCount - a.projectCount)
				.slice(0, TECH_LABEL_COUNT)
				.map((n) => n.label)
		)
	);

	// ---------------------------------------------------------------------------
	// Filter / visibility state
	// ---------------------------------------------------------------------------

	// Two separate highlight states rather than one shared variable: relationships/
	// stack modes highlight a project slug, technologies mode highlights a tech
	// label. Modes are mutually exclusive so reusing one variable would work, but
	// keeping them apart matches the effectivePinned*/*Dimmed split below and
	// avoids a name that means two different things depending on `activeMode`.
	let activeSlug = $state<string | null>(null);
	let activeTechLabel = $state<string | null>(null);
	const isolateMode = $derived(browser ? $page.url.searchParams.get('isolate') === '1' : false);

	const hiddenKinds = $derived(
		browser
			? parseSet<ProjectKind>($page.url.searchParams.get('hide-kinds'))
			: new Set<ProjectKind>()
	);
	const hiddenEdgeTypes = $derived(
		browser ? parseSet<EdgeType>($page.url.searchParams.get('hide-edges')) : new Set<EdgeType>()
	);
	const hiddenTechKinds = $derived(
		browser ? parseSet<TagKind>($page.url.searchParams.get('hide-tech-kinds')) : new Set<TagKind>()
	);
	const isolatedKinds = $derived(
		browser
			? parseSet<ProjectKind>($page.url.searchParams.get('show-kinds'))
			: new Set<ProjectKind>()
	);
	const isolatedEdgeTypes = $derived(
		browser ? parseSet<EdgeType>($page.url.searchParams.get('show-edges')) : new Set<EdgeType>()
	);

	// ---------------------------------------------------------------------------
	// Pin state
	// ---------------------------------------------------------------------------

	const pinnedParam = $derived(browser ? $page.url.searchParams.get('project') : null);
	const pinnedSlug = $derived(validatePin(pinnedParam, (slug) => projectPositions.has(slug)));

	const pinnedTechParam = $derived(browser ? $page.url.searchParams.get('tech') : null);
	const pinnedTechLabel = $derived(
		browser
			? decodeTechLabel(
					pinnedTechParam,
					techNodes.map((n) => n.label)
				)
			: null
	);

	const effectivePinnedSlug = $derived(activeSlug ?? pinnedSlug);
	const effectivePinnedTech = $derived(activeTechLabel ?? pinnedTechLabel);

	let selectedProject = $state<{ slug: string; name: string; tagline: string } | null>(null);
	let selectedTech = $state<{ label: string; kind: TagKind; projectCount: number } | null>(null);

	function openProjectModal(node: MapNode): void {
		selectedProject = { slug: node.slug, name: node.name, tagline: node.tagline };
	}

	function openTechModal(node: TechMapNode): void {
		selectedTech = { label: node.label, kind: node.kind, projectCount: node.projectCount };
	}

	function pinSelectedProject(): void {
		if (!selectedProject) return;
		writeParam('project', nextPinValue(pinnedSlug, selectedProject.slug));
		selectedProject = null;
	}

	function pinSelectedTech(): void {
		if (!selectedTech) return;
		const encoded = encodeTechLabel(selectedTech.label);
		writeParam('tech', pinnedTechLabel === selectedTech.label ? null : encoded);
		selectedTech = null;
	}

	// ---------------------------------------------------------------------------
	// Toggle helpers
	// ---------------------------------------------------------------------------

	function toggleKind(kind: ProjectKind): void {
		if (isolateMode) {
			const next = new Set(isolatedKinds);
			if (next.has(kind)) next.delete(kind);
			else next.add(kind);
			writeParam('show-kinds', serialiseSet(next));
		} else {
			const next = new Set(hiddenKinds);
			if (next.has(kind)) next.delete(kind);
			else next.add(kind);
			writeParam('hide-kinds', serialiseSet(next));
		}
	}

	function toggleEdgeType(type: EdgeType): void {
		if (isolateMode) {
			const next = new Set(isolatedEdgeTypes);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			writeParam('show-edges', serialiseSet(next));
		} else {
			const next = new Set(hiddenEdgeTypes);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			writeParam('hide-edges', serialiseSet(next));
		}
	}

	function toggleTechKind(kind: TagKind): void {
		const next = new Set(hiddenTechKinds);
		if (next.has(kind)) next.delete(kind);
		else next.add(kind);
		writeParam('hide-tech-kinds', serialiseSet(next));
	}

	function resetFilters(): void {
		const url = new URL($page.url);
		url.searchParams.delete('hide-kinds');
		url.searchParams.delete('hide-edges');
		url.searchParams.delete('show-kinds');
		url.searchParams.delete('show-edges');
		url.searchParams.delete('hide-tech-kinds');
		goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function toggleIsolate(): void {
		const url = new URL($page.url);
		if (isolateMode) {
			url.searchParams.delete('isolate');
			url.searchParams.delete('show-kinds');
			url.searchParams.delete('show-edges');
		} else {
			url.searchParams.set('isolate', '1');
			url.searchParams.delete('hide-kinds');
			url.searchParams.delete('hide-edges');
		}
		goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	// ---------------------------------------------------------------------------
	// Visibility predicates
	// ---------------------------------------------------------------------------

	function nodeHidden(node: MapNode): boolean {
		if (isolateMode) return isolatedKinds.size > 0 && !isolatedKinds.has(node.kind);
		return hiddenKinds.has(node.kind);
	}

	function techNodeHidden(node: TechMapNode): boolean {
		return hiddenTechKinds.has(node.kind);
	}

	// Progressive disclosure (colour-system.md §6): the theme and category
	// webs rest in paper neutrals; pointing at (or keyboard-focusing) a
	// Connections chip inks that one system of routes in oxide. Isolating a
	// type via its chip lifts it the same way.
	let liftedEdgeType = $state<EdgeType | null>(null);

	function edgeLifted(type: EdgeType): boolean {
		return liftedEdgeType === type || isolatedEdgeTypes.has(type);
	}

	function edgeHidden(source: string, target: string, type: EdgeType): boolean {
		const typeHidden = isolateMode
			? isolatedEdgeTypes.size > 0 && !isolatedEdgeTypes.has(type)
			: hiddenEdgeTypes.has(type);
		if (typeHidden) return true;
		const s = projectPositions.get(source);
		const t = projectPositions.get(target);
		return (!!s && nodeHidden(s)) || (!!t && nodeHidden(t));
	}

	function techEdgeHidden(source: string, target: string): boolean {
		const s = techPositions.get(source);
		const t = techPositions.get(target);
		return (!!s && techNodeHidden(s)) || (!!t && techNodeHidden(t));
	}

	function lineageEdgeHidden(source: string, target: string, kind: LineageKind): boolean {
		const typeHidden = isolateMode
			? isolatedEdgeTypes.size > 0 && !isolatedEdgeTypes.has(kind)
			: hiddenEdgeTypes.has(kind);
		if (typeHidden) return true;
		const s = techPositions.get(source);
		const t = techPositions.get(target);
		return (!!s && techNodeHidden(s)) || (!!t && techNodeHidden(t));
	}

	function kindChipOff(kind: ProjectKind): boolean {
		if (isolateMode) return isolatedKinds.size > 0 && !isolatedKinds.has(kind);
		return hiddenKinds.has(kind);
	}

	function edgeTypeChipOff(type: EdgeType): boolean {
		if (isolateMode) return isolatedEdgeTypes.size > 0 && !isolatedEdgeTypes.has(type);
		return hiddenEdgeTypes.has(type);
	}

	const filtersActive = $derived(
		hiddenKinds.size > 0 ||
			hiddenEdgeTypes.size > 0 ||
			isolatedKinds.size > 0 ||
			isolatedEdgeTypes.size > 0 ||
			hiddenTechKinds.size > 0
	);

	// ---------------------------------------------------------------------------
	// Dimming predicates
	// ---------------------------------------------------------------------------

	const effectiveHighlight = $derived.by((): string | null => {
		if (activeMode === 'technologies') {
			const tech = effectivePinnedTech;
			if (tech === null) return null;
			const node = techPositions.get(tech);
			if (node && techNodeHidden(node)) return null;
			return tech;
		}
		const slug = effectivePinnedSlug;
		if (slug === null) return null;
		const node = projectPositions.get(slug);
		if (node && nodeHidden(node)) return null;
		return slug;
	});

	function nodeDimmed(node: MapNode): boolean {
		const highlight = effectiveHighlight;
		if (highlight === null || node.slug === highlight) return false;
		return !adjacency.get(highlight)?.has(node.slug);
	}

	function techNodeDimmed(node: TechMapNode): boolean {
		const highlight = effectiveHighlight;
		if (highlight === null || node.label === highlight) return false;
		return !adjacency.get(highlight)?.has(node.label);
	}

	function edgeDimmed(source: string, target: string): boolean {
		const highlight = effectiveHighlight;
		return highlight !== null && source !== highlight && target !== highlight;
	}

	// ---------------------------------------------------------------------------
	// Live simulation
	// ---------------------------------------------------------------------------

	let livePositions = $state(new Map<string, { x: number; y: number }>());

	// First-reveal route inking: extraction routes draw in along their path
	// once, the first time the sim settles from its initial layout. Reduced
	// motion (prefersReducedMotion, checked in onMount) skips straight to
	// `true` so routes render fully inked with no animation.
	let routesInked = $state(false);

	function projectPos(slug: string): { x: number; y: number } {
		return livePositions.get(slug) ?? (projectPositions.get(slug) as { x: number; y: number });
	}

	function techPos(label: string): { x: number; y: number } {
		return livePositions.get(label) ?? (techPositions.get(label) as { x: number; y: number });
	}

	// ---------------------------------------------------------------------------
	// Focus annotation: a two-line mono label leadered to the highlighted mark,
	// collision-aware so it never lands on top of another node.
	// ---------------------------------------------------------------------------

	interface FocusAnnotation {
		anchorX: number;
		anchorY: number;
		leaderFromX: number;
		leaderFromY: number;
		alignRight: boolean;
		title: string;
		meta: string;
		boxWidth: number;
	}

	const FOCUS_CANDIDATES: { dx: number; dy: number }[] = [
		{ dx: 130, dy: -95 },
		{ dx: -130, dy: -95 },
		{ dx: 150, dy: 60 },
		{ dx: -150, dy: 60 },
		{ dx: 0, dy: -130 },
		{ dx: 0, dy: 120 }
	];

	const focusAnnotation = $derived.by((): FocusAnnotation | null => {
		const highlight = effectiveHighlight;
		if (highlight === null) return null;

		if (activeMode === 'technologies') {
			const node = techPositions.get(highlight);
			if (!node) return null;
			const p = techPos(highlight);
			const r = techRadiusScale(node);
			const others = techNodes.filter((n) => n.label !== highlight).map((n) => techPos(n.label));
			const routeCount = [...(adjacency.get(highlight) ?? [])].length;
			const meta = `${routeCount} connection${routeCount === 1 ? '' : 's'} · ${node.kind}`;
			return buildAnnotation(p, r, node.label.toUpperCase(), false, meta, others);
		}

		const node = projectPositions.get(highlight);
		if (!node) return null;
		const p = projectPos(highlight);
		const r = radiusScale(node);
		const others = projectNodes.filter((n) => n.slug !== highlight).map((n) => projectPos(n.slug));
		const routeCount = [...(adjacency.get(highlight) ?? [])].length;
		const stage =
			node.track === 'exploration'
				? `${trackLabel[node.track]} · ${progressLabel[node.progress]}`
				: progressLabel[node.progress];
		const meta = `${stage} · ${routeCount} route${routeCount === 1 ? '' : 's'}`;
		return buildAnnotation(p, r, node.name.toUpperCase(), node.hub, meta, others);
	});

	function buildAnnotation(
		p: Point,
		r: number,
		title: string,
		hub: boolean,
		meta: string,
		others: Point[]
	): FocusAnnotation {
		const clearOf = (x: number, y: number): boolean =>
			others.every((o) => Math.hypot(o.x - x, o.y - y) > 85);

		let ax = p.x + 130;
		let ay = p.y - 95;
		for (const c of FOCUS_CANDIDATES) {
			const cx = Math.min(size - 20, Math.max(20, p.x + c.dx));
			const cy = Math.min(size - 40, Math.max(40, p.y + c.dy));
			if (clearOf(cx, cy)) {
				ax = cx;
				ay = cy;
				break;
			}
		}
		const alignRight = ax >= p.x;
		const label = hub ? `${title} · HUB` : title;
		const boxWidth = Math.max(label.length, meta.length) * 7.2 + 20;
		return {
			anchorX: ax,
			anchorY: ay,
			leaderFromX: p.x + (alignRight ? r + 4 : -(r + 4)),
			leaderFromY: p.y - r * 0.5,
			alignRight,
			title: label,
			meta,
			boxWidth
		};
	}

	const visibleEdges = $derived(edges.filter((e) => !edgeHidden(e.source, e.target, e.kind)));
	const visibleSharedEdges = $derived(
		activeMode === 'stack'
			? sharedEdges.filter((e) => !edgeHidden(e.source, e.target, e.category))
			: []
	);
	const visibleThemeEdges = $derived(
		activeMode === 'relationships'
			? themeEdges.filter((e) => !edgeHidden(e.source, e.target, themeEdgeType(e.theme)))
			: []
	);

	// Pre-built SimLinks for tech co-occurrence (TechCoEdge has no `category`,
	// so it can't be passed directly to createForceSimulation).
	// Formula matches computeTechLayout so the client sim starts from the same physics.
	const techSimLinks = $derived<SimLink[]>(
		techCoEdges.map((e) => ({
			source: e.source,
			target: e.target,
			distance: 60 + 40 / Math.max(1, e.weight),
			strength: Math.min(0.5, 0.08 * e.weight)
		}))
	);

	onMount(() => {
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		function buildProjectSimNodes(nodes: MapNode[]): LiveSimNode[] {
			const weights = nodes.map((n) => n.commits ?? (n.linesOfCode ? n.linesOfCode / 50 : 0));
			const maxWeight = Math.max(1, ...weights);
			return nodes.map((n) => {
				const weight = n.commits ?? (n.linesOfCode ? n.linesOfCode / 50 : 0);
				const base = 16 + 39 * Math.sqrt(weight / maxWeight);
				const radius = n.hub ? Math.max(43, base) : base;
				return { slug: n.slug, radius, x: n.x, y: n.y };
			});
		}

		function buildTechSimNodes(nodes: TechMapNode[]): LiveSimNode[] {
			const max = Math.max(1, ...nodes.map((n) => n.projectCount));
			return nodes.map((n) => ({
				slug: n.label,
				radius: techNodeRadius(n.projectCount, max),
				x: n.x,
				y: n.y
			}));
		}

		type SimType = ReturnType<typeof createForceSimulation>;

		function buildSim(
			mode: MapMode,
			sNodes: LiveSimNode[],
			curEdges: typeof visibleEdges,
			curShared: typeof visibleSharedEdges,
			curTheme: typeof visibleThemeEdges
		): SimType {
			if (mode === 'technologies') {
				return createForceSimulationFromLinks(sNodes, techSimLinks, size);
			}
			return createForceSimulation(sNodes, curEdges, curShared, size, mode, curTheme);
		}

		let simNodes: LiveSimNode[] =
			activeMode === 'technologies'
				? buildTechSimNodes(techNodes)
				: buildProjectSimNodes(activeMode === 'stack' ? stackNodes : relationshipsNodes);

		let sim: SimType = buildSim(
			activeMode,
			simNodes,
			visibleEdges,
			visibleSharedEdges,
			visibleThemeEdges
		);

		let rafId: number;

		function flush(): void {
			const next = new Map<string, { x: number; y: number }>();
			for (const n of simNodes) next.set(n.slug, { x: n.x ?? 0, y: n.y ?? 0 });
			livePositions = next;
		}

		function loop(): void {
			if (sim.alpha() < sim.alphaMin()) {
				routesInked = true;
				return;
			}
			sim.tick();
			flush();
			rafId = requestAnimationFrame(loop);
		}

		if (prefersReducedMotion) {
			for (let i = 0; i < 320; i++) sim.tick();
			flush();
			routesInked = true;
		} else {
			rafId = requestAnimationFrame(loop);
		}

		let firstRun = true;
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		const stopEffect = $effect.root(() => {
			$effect(() => {
				const curEdges = [...visibleEdges];
				const curShared = [...visibleSharedEdges];
				const curTheme = [...visibleThemeEdges];
				const curMode = activeMode;
				const curTechNodes = [...techNodes];

				if (firstRun) {
					firstRun = false;
					return;
				}

				if (prefersReducedMotion) {
					sim.stop();
					simNodes =
						curMode === 'technologies'
							? buildTechSimNodes(curTechNodes)
							: buildProjectSimNodes(curMode === 'stack' ? stackNodes : relationshipsNodes);
					sim = buildSim(curMode, simNodes, curEdges, curShared, curTheme);
					for (let i = 0; i < 320; i++) sim.tick();
					flush();
					return;
				}

				if (debounceTimer !== null) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					debounceTimer = null;
					sim.stop();

					if (curMode === 'technologies') {
						simNodes = buildTechSimNodes(curTechNodes);
					} else {
						simNodes = buildProjectSimNodes(curMode === 'stack' ? stackNodes : relationshipsNodes);
						const targets = computeRelayoutTargets(
							{
								nodes: simNodes,
								visibleEdges: curEdges,
								visibleSharedEdges: curShared,
								visibleThemeEdges: curTheme,
								mode: curMode,
								size
							},
							{ candidates: 5, ticks: 220 }
						);
						for (const n of simNodes) {
							const t = targets.get(n.slug);
							if (t) {
								n.x = t.x;
								n.y = t.y;
							}
						}
					}

					sim = buildSim(curMode, simNodes, curEdges, curShared, curTheme);
					cancelAnimationFrame(rafId);
					rafId = requestAnimationFrame(loop);
				}, 120);
			});
		});

		return () => {
			cancelAnimationFrame(rafId);
			if (debounceTimer !== null) clearTimeout(debounceTimer);
			sim.stop();
			stopEffect();
		};
	});
</script>

<figure class="map">
	<svg
		class="map__svg"
		viewBox="0 0 {size} {size}"
		role="group"
		aria-label="Map of projects and connections"
	>
		<defs>
			<marker
				id="lineage-arrow-leads-to"
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto-start-reverse"
			>
				<path d="M0 0 L10 5 L0 10 z" fill="var(--color-edge-lineage-leads-to)" />
			</marker>
			<marker
				id="lineage-arrow-replaced-by"
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="7"
				markerHeight="7"
				orient="auto-start-reverse"
			>
				<path d="M0 0 L10 5 L0 10 z" fill="var(--color-edge-lineage-replaced-by)" />
			</marker>
		</defs>

		<!-- Graticule: the survey sheet's grid, behind everything. -->
		<g class="map__graticule">
			{#each graticuleY as y (y)}
				<line x1="0" y1={y} x2={size} y2={y} />
			{/each}
			{#each graticuleX as x (x)}
				<line x1={x} y1="0" x2={x} y2={size} />
			{/each}
		</g>

		<!-- Territory hulls: theme clusters as surveyed regions, behind routes/marks. -->
		{#if territoryHulls.length > 0}
			<g class="map__territories">
				<!-- Paper-tint hulls with italic serif names: the label carries the
				     theme's identity, the way it already does everywhere else. -->
				{#each territoryHulls as hull (hull.id)}
					<path class="map__territory-fill" d={hull.path} />
					<path class="map__territory-boundary" d={hull.path} />
					<text class="map__territory-label" x={hull.labelX} y={hull.labelY} text-anchor="middle">
						{hull.name}
					</text>
				{/each}
			</g>
		{/if}

		{#if activeMode === 'relationships'}
			<!-- Theme edges: one quiet paper-neutral web at rest; the legend's
			     chips lift one theme's routes to oxide at a time. -->
			<g class="map__edges">
				{#each themeEdges as edge (`theme:${edge.theme}:${edge.source}-${edge.target}`)}
					{@const a = projectPos(edge.source)}
					{@const b = projectPos(edge.target)}
					{#if a && b}
						<path
							class="map__edge map__edge--theme"
							class:map__edge--lifted={edgeLifted(themeEdgeType(edge.theme))}
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={edgeHidden(
								edge.source,
								edge.target,
								themeEdgeType(edge.theme)
							)}
							fill="none"
							d={routePath(a, b)}
						/>
					{/if}
				{/each}
			</g>
			<!-- Curated relationship edges, above the theme web. -->
			<g class="map__edges">
				{#each edges as edge (`${edge.kind}:${edge.source}-${edge.target}`)}
					{@const a = projectPos(edge.source)}
					{@const b = projectPos(edge.target)}
					{#if a && b}
						{@const tNode = projectPositions.get(edge.target)}
						<path
							class="map__edge map__edge--{edge.kind}"
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={edgeHidden(edge.source, edge.target, edge.kind)}
							class:map__edge--inked={edge.kind === 'extraction' && routesInked}
							pathLength={edge.kind === 'extraction' ? 1 : undefined}
							fill="none"
							d={routePath(a, b)}
						/>
						{#if edge.kind === 'extraction' && tNode}
							<path
								class="map__edge-arrowhead"
								class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
								class:map__edge--hidden={edgeHidden(edge.source, edge.target, edge.kind)}
								fill="none"
								d={routeArrowhead(a, b, radiusScale(tNode) + 4)}
							/>
						{/if}
					{/if}
				{/each}
			</g>
		{:else if activeMode === 'stack'}
			<!-- Stack mode: one quiet shared-tech web; category chips lift. -->
			<g class="map__edges">
				{#each sharedEdges as edge (`shared:${edge.category}:${edge.source}-${edge.target}`)}
					{@const a = projectPos(edge.source)}
					{@const b = projectPos(edge.target)}
					{#if a && b}
						<path
							class="map__edge map__edge--shared"
							class:map__edge--lifted={edgeLifted(edge.category)}
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={edgeHidden(edge.source, edge.target, edge.category)}
							fill="none"
							d={routePath(a, b)}
						/>
					{/if}
				{/each}
			</g>
		{:else}
			<!-- Technologies mode: co-occurrence edges, neutral colour. -->
			<g class="map__edges">
				{#each techCoEdges as edge (`co:${edge.source}-${edge.target}`)}
					{@const a = techPos(edge.source)}
					{@const b = techPos(edge.target)}
					{#if a && b}
						<path
							class="map__edge map__edge--co-occurrence"
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={techEdgeHidden(edge.source, edge.target)}
							fill="none"
							d={routePath(a, b)}
						/>
					{/if}
				{/each}
			</g>
			<!-- Lineage edges: authored "leads-to" / "replaced-by" arrows between tech tags. -->
			<g class="map__edges">
				{#each techRelationships as edge (`lineage:${edge.kind}:${edge.source}-${edge.target}`)}
					{@const a = techPos(edge.source)}
					{@const b = techPos(edge.target)}
					{@const sNode = techPositions.get(edge.source)}
					{@const tNode = techPositions.get(edge.target)}
					{#if a && b && sNode && tNode}
						{@const end = shortenToRadius(a, b, techRadiusScale(tNode) + 4)}
						<path
							class="map__edge map__edge--lineage"
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={lineageEdgeHidden(edge.source, edge.target, edge.kind)}
							style="stroke: {edgeTypeColour(edge.kind)}"
							fill="none"
							marker-end="url(#lineage-arrow-{edge.kind})"
							d={routePath(a, end)}
						/>
					{/if}
				{/each}
			</g>
		{/if}

		<!-- Project nodes (relationships + stack modes) -->
		{#if activeMode !== 'technologies'}
			<g class="map__nodes">
				{#each projectNodes as node (node.slug)}
					{@const r = radiusScale(node)}
					{@const p = projectPos(node.slug)}
					{@const isFocus = effectiveHighlight === node.slug}
					{@const colour = isFocus
						? 'var(--color-accent)'
						: progressColour(node.progress, node.archived)}
					<a
						class="map__node"
						class:map__node--dim={nodeDimmed(node)}
						class:map__node--hidden={nodeHidden(node)}
						class:map__node--labelled={node.labelled}
						class:map__node--pinned={pinnedSlug === node.slug}
						href="{base}/projects/{node.slug}"
						role="button"
						aria-haspopup="dialog"
						aria-pressed={pinnedSlug === node.slug}
						onclick={(e) => {
							e.preventDefault();
							openProjectModal(node);
						}}
						onkeydown={(e) => {
							if (e.key === ' ') {
								e.preventDefault();
								openProjectModal(node);
							}
						}}
						onpointerenter={() => (activeSlug = node.slug)}
						onpointerleave={() => (activeSlug = null)}
						onfocus={() => (activeSlug = node.slug)}
						onblur={() => (activeSlug = null)}
					>
						<title>{node.name}: {node.tagline}</title>
						<circle
							class="map__ring"
							class:map__ring--provisional={node.stageProvisional}
							cx={p.x}
							cy={p.y}
							{r}
							style="stroke: {colour}; opacity: {0.55 + 0.45 * opacityScale(node)}"
						/>
						{#if node.deployed || isFocus}
							<!-- Outer ring = deployed (the site-wide second-ring meaning);
							     the focused mark keeps its accent double-ring emphasis.
							     Hub emphasis retired — node size already carries weight. -->
							<circle
								class="map__ring map__ring--hub"
								cx={p.x}
								cy={p.y}
								r={r + 7}
								style="stroke: {colour}"
							/>
						{/if}
						<circle
							class="map__dot"
							cx={p.x}
							cy={p.y}
							r="2.8"
							style={node.track === 'exploration'
								? `fill: none; stroke: ${colour}; stroke-width: 1.25`
								: `fill: ${colour}`}
						/>
						<circle
							class="map__hit"
							cx={p.x}
							cy={p.y}
							r={Math.max(r + 10, 22)}
							fill="transparent"
						/>
						<text
							class="map__label"
							class:map__label--hub={node.hub}
							x={p.x}
							y={p.y + r + 18}
							text-anchor="middle"
						>
							{node.name}
						</text>
					</a>
				{/each}
			</g>
		{/if}

		<!-- Tech nodes (technologies mode) -->
		{#if activeMode === 'technologies'}
			<g class="map__nodes">
				{#each techNodes as node (node.label)}
					{@const r = techRadiusScale(node)}
					{@const p = techPos(node.label)}
					{@const isFocus = effectiveHighlight === node.label}
					{@const glyph = kindGlyph(node.kind)}
					{@const colour = isFocus
						? 'var(--color-accent)'
						: techMarkColour(historicTechLabels.has(node.label))}
					<a
						class="map__node map__node--tech"
						class:map__node--dim={techNodeDimmed(node)}
						class:map__node--hidden={techNodeHidden(node)}
						class:map__node--labelled={standingTechLabels.has(node.label)}
						class:map__node--pinned={pinnedTechLabel === node.label}
						href={projectsByTagHref(base, node.label)}
						role="button"
						aria-haspopup="dialog"
						aria-pressed={pinnedTechLabel === node.label}
						onclick={(e) => {
							e.preventDefault();
							openTechModal(node);
						}}
						onkeydown={(e) => {
							if (e.key === ' ') {
								e.preventDefault();
								openTechModal(node);
							}
						}}
						onpointerenter={() => (activeTechLabel = node.label)}
						onpointerleave={() => (activeTechLabel = null)}
						onfocus={() => (activeTechLabel = node.label)}
						onblur={() => (activeTechLabel = null)}
					>
						<title
							>{node.label} — used in {node.projectCount} project{node.projectCount === 1
								? ''
								: 's'}</title
						>
						<!-- Kind is carried by glyph shape, not hue: every tech mark
						     draws in the tech ink, historic stack one shade paperward
						     (colour-system.md §5). -->
						{#if glyph.shape === 'circle'}
							<circle
								class="map__ring"
								class:map__ring--dashed={glyph.dashed}
								cx={p.x}
								cy={p.y}
								{r}
								style="stroke: {colour}"
							/>
						{:else}
							<path
								class="map__ring"
								d={kindGlyphPath(node.kind, p.x, p.y, r)}
								style="stroke: {colour}"
							/>
						{/if}
						{#if isFocus}
							<circle
								class="map__ring map__ring--hub"
								cx={p.x}
								cy={p.y}
								r={r + 7}
								style="stroke: {colour}"
							/>
						{/if}
						{#if glyph.centreDot}
							<circle class="map__dot" cx={p.x} cy={p.y} r="2.8" style="fill: {colour}" />
						{/if}
						<circle
							class="map__hit"
							cx={p.x}
							cy={p.y}
							r={Math.max(r + 10, 22)}
							fill="transparent"
						/>
						<text class="map__label" x={p.x} y={p.y + r + 15} text-anchor="middle">
							{node.label}
						</text>
					</a>
				{/each}
			</g>
		{/if}

		<!-- Focus annotation: leader line + collision-aware two-line label. -->
		{#if focusAnnotation}
			{@const fa = focusAnnotation}
			<g class="map__annotation">
				<line
					x1={fa.leaderFromX}
					y1={fa.leaderFromY}
					x2={fa.anchorX}
					y2={fa.anchorY + 8}
					class="map__annotation-leader"
				/>
				<circle cx={fa.anchorX} cy={fa.anchorY + 8} r="2" class="map__annotation-dot" />
				<rect
					x={fa.alignRight ? fa.anchorX - 6 : fa.anchorX - fa.boxWidth + 6}
					y={fa.anchorY - 14}
					width={fa.boxWidth}
					height="38"
					rx="4"
					class="map__annotation-bg"
				/>
				<text
					x={fa.anchorX + (fa.alignRight ? 8 : -8)}
					y={fa.anchorY}
					text-anchor={fa.alignRight ? 'start' : 'end'}
					class="map__annotation-title"
				>
					{fa.title}
				</text>
				<text
					x={fa.anchorX + (fa.alignRight ? 8 : -8)}
					y={fa.anchorY + 17}
					text-anchor={fa.alignRight ? 'start' : 'end'}
					class="map__annotation-meta"
				>
					{fa.meta}
				</text>
			</g>
		{/if}
	</svg>

	<figcaption class="map__legend">
		<!-- View toggle -->
		<div class="map__legend-group">
			<span class="map__legend-title">View</span>
			<button
				type="button"
				class="map__toggle"
				class:map__toggle--on={activeMode === 'relationships'}
				aria-pressed={activeMode === 'relationships'}
				onclick={() => setMode('relationships')}
			>
				Relationships
			</button>
			<button
				type="button"
				class="map__toggle"
				class:map__toggle--on={activeMode === 'stack'}
				aria-pressed={activeMode === 'stack'}
				onclick={() => setMode('stack')}
			>
				By stack
			</button>
			<button
				type="button"
				class="map__toggle"
				class:map__toggle--on={activeMode === 'technologies'}
				aria-pressed={activeMode === 'technologies'}
				onclick={() => setMode('technologies')}
			>
				Technologies
			</button>
		</div>

		<!-- Connections toggle -->
		{#if edgeTypes.length > 0}
			<div class="map__legend-group">
				<span class="map__legend-title">Connections</span>
				{#each edgeTypes as type (type)}
					<button
						type="button"
						class="map__toggle"
						class:map__toggle--off={edgeTypeChipOff(type)}
						aria-pressed={!edgeTypeChipOff(type)}
						onclick={() => toggleEdgeType(type)}
						onpointerenter={() => (liftedEdgeType = type)}
						onpointerleave={() => (liftedEdgeType = null)}
						onfocus={() => (liftedEdgeType = type)}
						onblur={() => (liftedEdgeType = null)}
					>
						<span
							class="map__swatch map__swatch--line"
							style="border-top-color: {edgeTypeColour(type)}"
						></span>
						{edgeTypeLabel(type)}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Types toggle -->
		<div class="map__legend-group">
			<span class="map__legend-title">Types</span>
			{#if activeMode === 'technologies'}
				{#each techKinds as kind (kind)}
					{@const chipGlyph = kindGlyph(kind)}
					<button
						type="button"
						class="map__toggle"
						class:map__toggle--off={hiddenTechKinds.has(kind)}
						aria-pressed={!hiddenTechKinds.has(kind)}
						onclick={() => toggleTechKind(kind)}
					>
						<svg class="map__swatch-glyph" viewBox="0 0 14 14" aria-hidden="true">
							{#if chipGlyph.shape === 'circle'}
								<circle
									cx="7"
									cy="7"
									r="5"
									class="map__swatch-glyph-mark"
									class:map__swatch-glyph-mark--dashed={chipGlyph.dashed}
								/>
							{:else}
								<path d={kindGlyphPath(kind, 7, 7, 5.5)} class="map__swatch-glyph-mark" />
							{/if}
							{#if chipGlyph.centreDot}
								<circle cx="7" cy="7" r="1.6" class="map__swatch-glyph-dot" />
							{/if}
						</svg>
						{kind}
					</button>
				{/each}
			{:else}
				{#each projectKinds as kind (kind)}
					<button
						type="button"
						class="map__toggle"
						class:map__toggle--off={kindChipOff(kind)}
						aria-pressed={!kindChipOff(kind)}
						onclick={() => toggleKind(kind)}
					>
						{kind}
					</button>
				{/each}
			{/if}
		</div>

		<!-- Isolate / Reset -->
		{#if activeMode !== 'technologies'}
			<div class="map__legend-group">
				<button
					type="button"
					class="map__toggle map__toggle--mode"
					class:map__toggle--on={isolateMode}
					aria-pressed={isolateMode}
					onclick={toggleIsolate}
				>
					Isolate
				</button>
				{#if filtersActive}
					<button type="button" class="map__toggle" onclick={resetFilters}>Reset</button>
				{/if}
			</div>
		{:else if filtersActive}
			<div class="map__legend-group">
				<button type="button" class="map__toggle" onclick={resetFilters}>Reset</button>
			</div>
		{/if}

		<!-- Stage key (project modes only): one group per axis, each entry a
		     mini survey mark drawn the way the chart draws it, so the legend
		     never conflates the hue, centre-dot, outer-ring and fade channels. -->
		{#if activeMode !== 'technologies'}
			<div class="map__legend-group" aria-hidden="true">
				<span class="map__legend-title">Progress</span>
				{#each progressOrder.filter( (p) => projectNodes.some((n) => n.progress === p) ) as progress (progress)}
					<span class="map__legend-item">
						<svg class="map__legend-mark" viewBox="0 0 16 16">
							<circle
								class="map__legend-ring"
								cx="8"
								cy="8"
								r="5"
								style="stroke: {progressColour(progress)}"
							/>
							<circle
								class="map__legend-dot"
								cx="8"
								cy="8"
								r="1.8"
								style="fill: {progressColour(progress)}"
							/>
						</svg>
						{progressLabel[progress]}
					</span>
				{/each}
			</div>
			{#if projectNodes.some((n) => n.track === 'exploration')}
				<div class="map__legend-group" aria-hidden="true">
					<span class="map__legend-title">Track</span>
					<span class="map__legend-item">
						<svg class="map__legend-mark" viewBox="0 0 16 16">
							<circle class="map__legend-ring" cx="8" cy="8" r="5" />
							<circle class="map__legend-ring" cx="8" cy="8" r="1.8" stroke-width="1.25" />
						</svg>
						Spike (hollow centre)
					</span>
				</div>
			{/if}
			{#if projectNodes.some((n) => n.deployed || n.archived)}
				<div class="map__legend-group" aria-hidden="true">
					<span class="map__legend-title">Flags</span>
					{#if projectNodes.some((n) => n.deployed)}
						<span class="map__legend-item">
							<svg class="map__legend-mark" viewBox="0 0 16 16">
								<circle class="map__legend-ring" cx="8" cy="8" r="4.2" />
								<circle class="map__legend-ring map__legend-ring--outer" cx="8" cy="8" r="6.6" />
								<circle class="map__legend-dot" cx="8" cy="8" r="1.6" />
							</svg>
							Deployed (outer ring)
						</span>
					{/if}
					{#if projectNodes.some((n) => n.archived)}
						<span class="map__legend-item">
							<svg class="map__legend-mark" viewBox="0 0 16 16">
								<circle
									class="map__legend-ring"
									cx="8"
									cy="8"
									r="5"
									style="stroke: {progressColour('complete', true)}"
								/>
								<circle
									class="map__legend-dot"
									cx="8"
									cy="8"
									r="1.8"
									style="fill: {progressColour('complete', true)}"
								/>
							</svg>
							Archived (faded)
						</span>
					{/if}
				</div>
			{/if}
		{/if}

		<p class="map__note">
			{#if activeMode === 'relationships'}
				Solid lines trace engine extraction: a library pulled out of an application. Dashed lines
				mark related work. Coloured threads link projects in a shared theme; each theme has its own
				colour and toggle. Switch to "By stack" to cluster by shared technology, or "Technologies"
				to explore the tech landscape directly.
			{:else if activeMode === 'stack'}
				Projects cluster by shared technology: runtime, framework, data layer, and tooling. Dense
				nodes share multiple tools; outliers use a distinct stack. Switch to "Relationships" for
				curated connections, or "Technologies" to see the tech nodes themselves.
			{:else}
				Every technology in the registry, sized by how many projects use it and coloured by kind.
				Lines connect technologies that appear together in the same project. Language tags
				(TypeScript, Go, etc.) are shown as nodes but have no edges — they connect almost
				everything, so they cluster nothing useful. Arrowed lines trace lineage: what led to what,
				and what replaced what. Click any node to see the projects that use it.
			{/if}
			{#if activeMode !== 'technologies'}
				Node size tracks commit activity; fainter dots are older. Click a node to pin it or navigate
				to the project.
			{/if}
		</p>
	</figcaption>
</figure>

<!-- Project selection modal -->
{#if selectedProject !== null}
	{@const isPinned = pinnedSlug === selectedProject.slug}
	<SelectionModal open={true} title={selectedProject.name} onclose={() => (selectedProject = null)}>
		<p class="map-modal__tagline">{selectedProject.tagline}</p>
		<button type="button" class="modal-action modal-action--primary" onclick={pinSelectedProject}>
			{isPinned ? 'Unpin' : 'Pin this project'}
		</button>
		<a href={projectHref(base, selectedProject.slug)} class="modal-action modal-action--secondary">
			Go to project
		</a>
	</SelectionModal>
{/if}

<!-- Tech selection modal -->
{#if selectedTech !== null}
	{@const isPinnedTech = pinnedTechLabel === selectedTech.label}
	<SelectionModal open={true} title={selectedTech.label} onclose={() => (selectedTech = null)}>
		<p class="map-modal__tagline">
			Used in {selectedTech.projectCount} project{selectedTech.projectCount === 1 ? '' : 's'}. Kind: {selectedTech.kind}.
		</p>
		<button type="button" class="modal-action modal-action--primary" onclick={pinSelectedTech}>
			{isPinnedTech ? 'Unpin' : 'Pin this technology'}
		</button>
		<a
			href={projectsByTagHref(base, selectedTech.label)}
			class="modal-action modal-action--secondary"
		>
			See projects using this
		</a>
		<a
			href={techViewHref(base, 'toolkit', selectedTech.label)}
			class="modal-action modal-action--secondary"
		>
			See on the timeline
		</a>
	</SelectionModal>
{/if}

<style>
	.map {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.map__svg {
		width: 100%;
		height: auto;
		max-height: 80vh;
		overflow: clip;
		background: var(--color-surface-sunken);
	}

	.map__graticule line {
		stroke: var(--color-grid);
		stroke-width: 1;
		stroke-dasharray: 1 6;
	}

	/* Territories: paper-tint regions named by their italic serif labels,
	   like any political map — the label identifies, never the hue. */
	.map__territory-fill {
		fill: var(--color-border-strong);
		opacity: 0.07;
	}

	.map__territory-boundary {
		fill: none;
		stroke: var(--color-border-strong);
		stroke-width: 1;
		stroke-dasharray: 3 5;
		opacity: 0.5;
	}

	.map__territory-label {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 18px;
		fill: var(--color-text-subtle);
		opacity: 0.9;
		pointer-events: none;
	}

	.map__edge {
		fill: none;
		stroke-linecap: round;
		transition:
			opacity var(--dur-base) var(--ease-standard),
			stroke var(--dur-base) var(--ease-standard);
	}

	.map__edge--extraction {
		stroke: var(--edge-extraction);
		stroke-width: 2;
		/* First-reveal route inking: drawn in along its path once, the first
		   time the sim settles (routesInked flips true in ProjectMap's
		   onMount). pathLength="1" normalises dash units to the 0-1 range
		   regardless of the route's actual length. Under reduced motion,
		   --motion-scale zeroes --dur-plate, so this becomes an instant
		   swap rather than a draw — the spec's "routes render fully inked". */
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		transition:
			opacity var(--dur-base) var(--ease-standard),
			stroke var(--dur-base) var(--ease-standard),
			stroke-dashoffset var(--dur-plate) var(--ease-standard);
	}

	.map__edge--extraction.map__edge--inked {
		stroke-dashoffset: 0;
	}

	.map__edge-arrowhead {
		stroke: var(--color-accent);
		stroke-width: 1.75;
		stroke-linecap: round;
		transition: opacity var(--dur-base) var(--ease-standard);
	}

	.map__edge--related {
		stroke: var(--color-text-subtle);
		stroke-width: 1.5;
		stroke-dasharray: 5 4;
		opacity: 0.6;
	}

	/* Theme and category webs rest as quiet paper linework; identity comes
	   from labels and the chip-lift, never from hue (colour-system.md §5). */
	.map__edge--theme,
	.map__edge--shared {
		stroke: var(--color-border-strong);
		stroke-width: 1.5;
		stroke-dasharray: 5 4;
		opacity: 0.5;
	}

	/* The lifted web: one system of routes inked in oxide at a time, driven
	   by chip hover/focus or an isolate toggle. */
	.map__edge--lifted {
		stroke: var(--ink-oxide);
		opacity: 0.9;
	}

	.map__edge--co-occurrence {
		stroke: var(--color-border-strong);
		stroke-width: 1.2;
		opacity: 0.4;
	}

	.map__edge--lineage {
		/* stroke colour set inline per-kind */
		stroke-width: 2;
		opacity: 1;
	}

	.map__edge--dim {
		opacity: var(--dim-edge);
	}

	.map__edge--hidden,
	.map__node--hidden {
		display: none;
	}

	.map__node {
		cursor: pointer;
		transition: opacity var(--dur-base) var(--ease-standard);
	}

	.map__node--dim {
		opacity: var(--dim-node);
	}

	/* Survey marks: an open ring plus a centre point, not a filled blob. */
	.map__ring {
		fill: none;
		stroke-width: 1.75;
		transition:
			r var(--dur-micro) var(--ease-standard),
			stroke var(--dur-base) var(--ease-standard);
	}

	/* Heuristic stage: the unsurveyed convention, dotted ring. */
	.map__ring--provisional {
		stroke-dasharray: 2 3;
	}

	/* Concept glyph: a dashed ring — longer dashes than provisional dotting,
	   and fixed to the glyph rather than the data. */
	.map__ring--dashed {
		stroke-dasharray: 4 3;
	}

	.map__ring--hub {
		stroke-width: 1.25;
		opacity: 0.6;
	}

	.map__dot {
		pointer-events: none;
	}

	.map__hit {
		pointer-events: all;
	}

	.map__node:hover .map__ring,
	.map__node:focus-visible .map__ring {
		stroke: var(--color-text);
	}

	.map__label {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 400;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		fill: var(--color-text-subtle);
		pointer-events: none;
	}

	.map__label--hub {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		fill: var(--color-text);
	}

	.map__node:not(.map__node--labelled):not(.map__node--pinned) .map__label {
		opacity: 0;
		transition: opacity var(--dur-base) var(--ease-standard);
	}

	.map__node:hover .map__label,
	.map__node:focus-visible .map__label {
		fill: var(--color-text);
		opacity: 1;
	}

	.map__node:focus-visible {
		outline: none;
	}

	.map__node:focus-visible .map__ring {
		stroke: var(--color-primary-text);
		stroke-width: 2.5;
	}

	.map__node--pinned .map__ring {
		stroke-width: 2.25;
	}

	/* Tech nodes: slightly smaller label — they're denser. */
	.map__node--tech .map__label {
		font-size: 10px;
	}

	/* Focus annotation: leadered mono label, collision-placed per render. */
	.map__annotation-leader {
		stroke: var(--color-border-strong);
		stroke-width: 1;
	}

	.map__annotation-dot {
		fill: var(--color-border-strong);
	}

	.map__annotation-bg {
		fill: var(--color-surface-sunken);
		opacity: 0.92;
	}

	.map__annotation-title {
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.05em;
		fill: var(--color-text);
	}

	.map__annotation-meta {
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.03em;
		fill: var(--color-text-muted);
	}

	@media (max-width: 40rem) {
		.map__label {
			font-size: 22px;
		}

		.map__node--tech .map__label {
			font-size: 18px;
		}
	}

	.map__legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.map__legend-group {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.map__legend-title {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		margin-right: var(--space-1);
	}

	.map__legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
	}

	.map__swatch {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	/* Kind chips: mini-glyphs drawn from the same vocabulary as the marks. */
	.map__swatch-glyph {
		width: 0.85rem;
		height: 0.85rem;
		flex-shrink: 0;
	}

	.map__swatch-glyph-mark {
		fill: none;
		stroke: var(--tech-mark);
		stroke-width: 1.5;
	}

	.map__swatch-glyph-mark--dashed {
		stroke-dasharray: 4 3;
	}

	.map__swatch-glyph-dot {
		fill: var(--tech-mark);
	}

	/* Stage-key mini marks: drawn exactly as the chart draws its survey
	   marks, so each legend entry shows its own channel undistorted. */
	.map__legend-mark {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.map__legend-ring {
		fill: none;
		stroke: var(--color-text-subtle);
		stroke-width: 1.5;
	}

	.map__legend-ring--outer {
		stroke-width: 1;
		opacity: 0.5;
	}

	.map__legend-dot {
		fill: var(--color-text-subtle);
	}

	.map__swatch--line {
		width: 1.25rem;
		height: 0;
		border-radius: 0;
		border-top: 2.5px solid var(--color-text-muted);
	}

	.map__toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 500;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		background-color: var(--color-surface-raised);
		color: var(--color-text-subtle);
		cursor: pointer;
		text-transform: capitalize;
		transition:
			border-color var(--transition-fast),
			background-color var(--transition-fast),
			color var(--transition-fast),
			opacity var(--transition-fast);
	}

	.map__toggle:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.map__toggle--off {
		opacity: 0.45;
		text-decoration: line-through;
	}

	.map__toggle--on {
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary);
		color: var(--color-primary-text);
	}

	.map__note {
		flex-basis: 100%;
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.map-modal__tagline {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		margin: 0;
		line-height: 1.5;
	}

	@media (prefers-reduced-motion: reduce) {
		.map__edge,
		.map__edge-arrowhead,
		.map__node,
		.map__ring,
		.map__label {
			transition: none;
		}
	}
</style>
