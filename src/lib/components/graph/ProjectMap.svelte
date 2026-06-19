<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { EDGE_CATEGORIES, type ProjectKind, type ProjectStatus } from '$lib/data/types.js';
	import type { GraphEdge, LiveSimNode, SharedTechEdge } from '$lib/data/graph.js';
	import { buildSimLinks, createForceSimulation } from '$lib/data/graph.js';
	import { forceLink as d3ForceLink } from 'd3-force';
	import {
		statusColour,
		statusLabel,
		statusOrder,
		categoryColour,
		edgeTypeColour,
		edgeTypeLabel,
		type EdgeType
	} from './graph-style.js';

	interface MapNode {
		slug: string;
		name: string;
		tagline: string;
		status: ProjectStatus;
		kind: ProjectKind;
		flagship: boolean;
		labelled: boolean;
		lastCommit: string | null;
		commits: number | null;
		linesOfCode: number | null;
		x: number;
		y: number;
	}

	interface Props {
		nodes: MapNode[];
		edges: GraphEdge[];
		sharedEdges: SharedTechEdge[];
		size: number;
	}

	let { nodes, edges, sharedEdges, size }: Props = $props();

	const positions = $derived(new Map(nodes.map((n) => [n.slug, n])));

	// Adjacency for neighbourhood highlighting (progressive enhancement only).
	// Includes shared-tech links so highlighting a node also lifts its stack kin.
	const adjacency = $derived.by(() => {
		const map = new Map<string, Set<string>>();
		for (const node of nodes) map.set(node.slug, new Set());
		for (const edge of [...edges, ...sharedEdges]) {
			map.get(edge.source)?.add(edge.target);
			map.get(edge.target)?.add(edge.source);
		}
		return map;
	});

	// Node kinds present, for the type toggles.
	const kinds = $derived([...new Set(nodes.map((n) => n.kind))].sort());

	// Edge types present, curated first then categories in canonical order, so
	// the connection legend lists exactly what the graph actually draws.
	const edgeTypes = $derived.by(() => {
		const present: EdgeType[] = [];
		for (const kind of ['extraction', 'related'] as const) {
			if (edges.some((e) => e.kind === kind)) present.push(kind);
		}
		for (const category of EDGE_CATEGORIES) {
			if (sharedEdges.some((e) => e.category === category)) present.push(category);
		}
		return present;
	});

	// Node radius scales with reach (commits, falling back to lines of code),
	// normalised across the registry; flagships keep a floor so they read as hubs.
	const radiusScale = $derived.by(() => {
		const weights = nodes.map((n) => n.commits ?? (n.linesOfCode ? n.linesOfCode / 50 : 0));
		const max = Math.max(1, ...weights);
		return (node: MapNode): number => {
			const weight = node.commits ?? (node.linesOfCode ? node.linesOfCode / 50 : 0);
			const base = 8 + 9 * Math.sqrt(weight / max);
			return node.flagship ? Math.max(15, base) : base;
		};
	});

	// Recency shading: the freshest commit is full strength, the oldest (and any
	// project with no commit date) fades back, so the map reads as a timeline too.
	const opacityScale = $derived.by(() => {
		const times = nodes
			.map((n) => (n.lastCommit ? Date.parse(n.lastCommit) : NaN))
			.filter((t) => !Number.isNaN(t));
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

	// Interaction state, only meaningful once JavaScript runs.
	let activeSlug = $state<string | null>(null);
	let hiddenKinds = $state(new Set<ProjectKind>());
	let hiddenEdgeTypes = $state(new Set<EdgeType>());
	let isolateMode = $state(false);
	// Isolate mode uses an additive *shown* set: click types one at a time to
	// build up what you want to see. An empty set means "show everything".
	let isolatedKinds = $state(new Set<ProjectKind>());
	let isolatedEdgeTypes = $state(new Set<EdgeType>());

	// --- Visibility: default mode hides one type per click (multi-select);
	// isolate mode builds up a set of types to show additively. ---

	function toggleKind(kind: ProjectKind): void {
		if (isolateMode) {
			const next = new Set(isolatedKinds);
			if (next.has(kind)) next.delete(kind);
			else next.add(kind);
			isolatedKinds = next;
		} else {
			const next = new Set(hiddenKinds);
			if (next.has(kind)) next.delete(kind);
			else next.add(kind);
			hiddenKinds = next;
		}
	}

	function toggleEdgeType(type: EdgeType): void {
		if (isolateMode) {
			const next = new Set(isolatedEdgeTypes);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			isolatedEdgeTypes = next;
		} else {
			const next = new Set(hiddenEdgeTypes);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			hiddenEdgeTypes = next;
		}
	}

	function resetFilters(): void {
		hiddenKinds = new Set();
		hiddenEdgeTypes = new Set();
		isolatedKinds = new Set();
		isolatedEdgeTypes = new Set();
	}

	// Clear isolated sets whenever isolate mode is toggled so the two models
	// do not bleed into each other.
	$effect(() => {
		if (!isolateMode) {
			isolatedKinds = new Set();
			isolatedEdgeTypes = new Set();
		}
	});

	function nodeHidden(node: MapNode): boolean {
		if (isolateMode) {
			// If nothing is isolated yet, all nodes are visible.
			return isolatedKinds.size > 0 && !isolatedKinds.has(node.kind);
		}
		return hiddenKinds.has(node.kind);
	}

	function edgeHidden(source: string, target: string, type: EdgeType): boolean {
		const typeHidden = isolateMode
			? isolatedEdgeTypes.size > 0 && !isolatedEdgeTypes.has(type)
			: hiddenEdgeTypes.has(type);
		if (typeHidden) return true;
		// An edge incident on a hidden node has nothing to connect, so it drops too.
		const s = positions.get(source);
		const t = positions.get(target);
		return (!!s && nodeHidden(s)) || (!!t && nodeHidden(t));
	}

	// Whether a toggle chip should appear as "off" (dimmed/struck-through).
	function kindChipOff(kind: ProjectKind): boolean {
		if (isolateMode) return isolatedKinds.size > 0 && !isolatedKinds.has(kind);
		return hiddenKinds.has(kind);
	}

	function edgeTypeChipOff(type: EdgeType): boolean {
		if (isolateMode) return isolatedEdgeTypes.size > 0 && !isolatedEdgeTypes.has(type);
		return hiddenEdgeTypes.has(type);
	}

	// Show the reset button if anything is actively hidden or isolated.
	const filtersActive = $derived(
		hiddenKinds.size > 0 ||
			hiddenEdgeTypes.size > 0 ||
			isolatedKinds.size > 0 ||
			isolatedEdgeTypes.size > 0
	);

	// --- Dimming: hover/focus lifts a node and its neighbourhood, fading the rest. ---

	function nodeDimmed(node: MapNode): boolean {
		if (activeSlug === null || node.slug === activeSlug) return false;
		return !adjacency.get(activeSlug)?.has(node.slug);
	}

	function edgeDimmed(source: string, target: string): boolean {
		return activeSlug !== null && source !== activeSlug && target !== activeSlug;
	}

	// --- Live force simulation (progressive enhancement) ---
	//
	// The baked node.x/node.y positions from the SSR layout are used as the
	// initial render and as the no-JS fallback. Once the component mounts,
	// a d3-force simulation takes over and updates livePositions on each tick.
	// When filters change, only the visible edges exert force, so the graph
	// physically reorganises around whatever is shown.

	// Live positions populated by the simulation once mounted; empty map = use baked coords.
	let livePositions = $state(new Map<string, { x: number; y: number }>());

	// Returns the effective position for a node: live if the sim has run, baked otherwise.
	function pos(slug: string): { x: number; y: number } {
		return livePositions.get(slug) ?? (positions.get(slug) as { x: number; y: number });
	}

	// The current set of visible edges, used to reheat the simulation.
	const visibleEdges = $derived(edges.filter((e) => !edgeHidden(e.source, e.target, e.kind)));
	const visibleSharedEdges = $derived(
		sharedEdges.filter((e) => !edgeHidden(e.source, e.target, e.category))
	);

	onMount(() => {
		const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		// Build node array seeded from baked positions; radius mirrors radiusScale.
		const weights = nodes.map((n) => n.commits ?? (n.linesOfCode ? n.linesOfCode / 50 : 0));
		const maxWeight = Math.max(1, ...weights);
		const simNodes: LiveSimNode[] = nodes.map((n) => {
			const weight = n.commits ?? (n.linesOfCode ? n.linesOfCode / 50 : 0);
			const base = 16 + 26 * Math.sqrt(weight / maxWeight);
			const radius = n.flagship ? Math.max(34, base) : base;
			return { slug: n.slug, radius, x: n.x, y: n.y };
		});

		const sim = createForceSimulation(simNodes, visibleEdges, visibleSharedEdges, size);

		let rafId: number;

		function flush() {
			// Write updated positions into the reactive map so Svelte re-renders.
			const next = new Map<string, { x: number; y: number }>();
			for (const n of simNodes) {
				next.set(n.slug, { x: n.x ?? 0, y: n.y ?? 0 });
			}
			livePositions = next;
		}

		function loop() {
			if (sim.alpha() < sim.alphaMin()) return;
			sim.tick();
			flush();
			rafId = requestAnimationFrame(loop);
		}

		if (prefersReducedMotion) {
			// Run to convergence in one synchronous burst; snap to result.
			for (let i = 0; i < 320; i++) sim.tick();
			flush();
		} else {
			rafId = requestAnimationFrame(loop);
		}

		// Reheat the simulation whenever the visible edge set changes.
		// $effect.root so we can call it inside onMount and return a cleanup fn.
		// The curEdges/curShared reads must precede the firstRun guard so that
		// Svelte still registers the dependency on the first (no-op) pass.
		let firstRun = true;
		const stopEffect = $effect.root(() => {
			$effect(() => {
				// Snapshot the current visible edges (touches reactive state so Svelte tracks it).
				const curEdges = [...visibleEdges];
				const curShared = [...visibleSharedEdges];

				// The simulation is already seeded with these edges at creation, so the
				// effect's initial synchronous run would re-feed identical data and waste a reheat.
				if (firstRun) {
					firstRun = false;
					return;
				}

				// Replace the link force with only the currently-visible edges, then reheat.
				// d3-force exposes the forceLink instance via sim.force('link'); calling
				// .links() on it updates the data in place without rebuilding the simulation.
				const fl = sim.force<ReturnType<typeof d3ForceLink>>('link');
				if (fl) {
					fl.links(buildSimLinks(curEdges, curShared) as never);
				}

				sim.alpha(0.5).restart();

				if (!prefersReducedMotion) {
					cancelAnimationFrame(rafId);
					rafId = requestAnimationFrame(loop);
				} else {
					for (let i = 0; i < 320; i++) sim.tick();
					flush();
				}
			});
		});

		return () => {
			cancelAnimationFrame(rafId);
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
		aria-label="Map of projects and the connections between them"
	>
		<!-- Shared-tech links: faintest, behind the curated edges, coloured by category. -->
		<g class="map__edges">
			{#each sharedEdges as edge (`shared:${edge.category}:${edge.source}-${edge.target}`)}
				{@const a = pos(edge.source)}
				{@const b = pos(edge.target)}
				{#if a && b}
					<line
						class="map__edge map__edge--shared"
						class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
						class:map__edge--hidden={edgeHidden(edge.source, edge.target, edge.category)}
						style="stroke: {categoryColour(edge.category)}"
						x1={a.x}
						y1={a.y}
						x2={b.x}
						y2={b.y}
					/>
				{/if}
			{/each}
		</g>

		<!-- Curated relationship edges, above the shared-tech web. -->
		<g class="map__edges">
			{#each edges as edge (`${edge.kind}:${edge.source}-${edge.target}`)}
				{@const a = pos(edge.source)}
				{@const b = pos(edge.target)}
				{#if a && b}
					<line
						class="map__edge map__edge--{edge.kind}"
						class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
						class:map__edge--hidden={edgeHidden(edge.source, edge.target, edge.kind)}
						x1={a.x}
						y1={a.y}
						x2={b.x}
						y2={b.y}
					/>
				{/if}
			{/each}
		</g>

		<!-- Nodes: each is a real link, so the map is navigable without JavaScript. -->
		<g class="map__nodes">
			{#each nodes as node (node.slug)}
				{@const r = radiusScale(node)}
				{@const p = pos(node.slug)}
				<a
					class="map__node"
					class:map__node--dim={nodeDimmed(node)}
					class:map__node--hidden={nodeHidden(node)}
					class:map__node--labelled={node.labelled}
					href="{base}/projects/{node.slug}"
					onpointerenter={() => (activeSlug = node.slug)}
					onpointerleave={() => (activeSlug = null)}
					onfocus={() => (activeSlug = node.slug)}
					onblur={() => (activeSlug = null)}
				>
					<title>{node.name}: {node.tagline}</title>
					<circle
						class="map__dot"
						cx={p.x}
						cy={p.y}
						{r}
						style="fill: {statusColour(node.status)}; fill-opacity: {opacityScale(node)}"
					/>
					<text class="map__label" x={p.x} y={p.y + r + 16} text-anchor="middle">
						{node.name}
					</text>
				</a>
			{/each}
		</g>
	</svg>

	<figcaption class="map__legend">
		<div class="map__legend-group">
			<span class="map__legend-title">Connections</span>
			{#each edgeTypes as type (type)}
				<button
					type="button"
					class="map__toggle"
					class:map__toggle--off={edgeTypeChipOff(type)}
					aria-pressed={!edgeTypeChipOff(type)}
					onclick={() => toggleEdgeType(type)}
				>
					<span
						class="map__swatch map__swatch--line"
						style="border-top-color: {edgeTypeColour(type)}"
					></span>
					{edgeTypeLabel(type)}
				</button>
			{/each}
		</div>

		<div class="map__legend-group">
			<span class="map__legend-title">Types</span>
			{#each kinds as kind (kind)}
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
		</div>

		<div class="map__legend-group">
			<button
				type="button"
				class="map__toggle map__toggle--mode"
				class:map__toggle--on={isolateMode}
				aria-pressed={isolateMode}
				onclick={() => (isolateMode = !isolateMode)}
			>
				Isolate
			</button>
			{#if filtersActive}
				<button type="button" class="map__toggle" onclick={resetFilters}>Reset</button>
			{/if}
		</div>

		<div class="map__legend-group" aria-hidden="true">
			<span class="map__legend-title">Status</span>
			{#each statusOrder.filter((s) => nodes.some((n) => n.status === s)) as status (status)}
				<span class="map__legend-item">
					<span class="map__swatch" style="background: {statusColour(status)}"></span>
					{statusLabel[status]}
				</span>
			{/each}
		</div>

		<p class="map__note">
			Node size tracks commit activity; fainter dots are older. Click a type or connection to hide
			it. Turn on Isolate, then click each connection or type you want to keep: you can select more
			than one.
		</p>
	</figcaption>
</figure>

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
		overflow: visible;
	}

	.map__edge {
		stroke-linecap: round;
		transition:
			opacity var(--transition-base),
			stroke var(--transition-base);
	}

	.map__edge--extraction {
		stroke: var(--color-primary);
		stroke-width: 2.5;
	}

	.map__edge--related {
		stroke: var(--color-text-subtle);
		stroke-width: 1.6;
		stroke-dasharray: 5 6;
		opacity: 0.6;
	}

	/* Shared-tech edges carry their category colour inline; this sets weight. */
	.map__edge--shared {
		stroke-width: 1.4;
		opacity: 0.5;
	}

	.map__edge--dim {
		opacity: 0.06;
	}

	/* Hidden by a legend toggle: removed from the picture entirely. */
	.map__edge--hidden,
	.map__node--hidden {
		display: none;
	}

	.map__node {
		cursor: pointer;
		transition: opacity var(--transition-base);
	}

	.map__node--dim {
		opacity: 0.2;
	}

	.map__dot {
		stroke: var(--color-surface);
		stroke-width: 2;
		transition: r var(--transition-fast);
	}

	.map__node:hover .map__dot,
	.map__node:focus-visible .map__dot {
		stroke: var(--color-text);
	}

	.map__label {
		font-size: 17px;
		font-weight: 600;
		fill: var(--color-text-subtle);
		pointer-events: none;
	}

	.map__node:hover .map__label,
	.map__node:focus-visible .map__label {
		fill: var(--color-text);
	}

	.map__node:focus-visible {
		outline: none;
	}

	.map__node:focus-visible .map__dot {
		stroke: var(--color-primary-text);
		stroke-width: 3;
	}

	/*
	 * Mobile: the SVG scales down with the viewport, so every label shrinks at
	 * once and the picture turns to noise. Show only the selected "labelled"
	 * projects (a diverse ten, chosen in the data layer) by default and reveal
	 * the rest on hover/focus, with larger type so what remains stays readable.
	 */
	@media (max-width: 40rem) {
		.map__label {
			font-size: 22px;
		}

		.map__node:not(.map__node--labelled) .map__label {
			opacity: 0;
			transition: opacity var(--transition-base);
		}

		.map__node:hover .map__label,
		.map__node:focus-visible .map__label {
			opacity: 1;
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

	/* A short rule, coloured per edge type via an inline border-top-color. */
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

	/* Hidden: dimmed and struck through, so its "off" state reads at a glance. */
	.map__toggle--off {
		opacity: 0.45;
		text-decoration: line-through;
	}

	/* Isolate mode engaged. */
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

	@media (prefers-reduced-motion: reduce) {
		.map__edge,
		.map__node,
		.map__dot,
		.map__label {
			transition: none;
		}
	}
</style>
