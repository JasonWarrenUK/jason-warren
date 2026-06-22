<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { EDGE_CATEGORIES, type ProjectKind, type ProjectStatus } from '$lib/data/types.js';
	import { parseSet, serialiseSet } from '$lib/url-state.js';
	import { writeParam } from '$lib/url-write.js';
	import SelectionModal from '$lib/components/ui/SelectionModal.svelte';
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
		/** Derived: substance score ≥ p85 across all projects. */
		hub: boolean;
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
	// normalised across the registry; hubs (p85 substance) keep a floor so they
	// read as network anchors regardless of activity.
	const radiusScale = $derived.by(() => {
		const weights = nodes.map((n) => n.commits ?? (n.linesOfCode ? n.linesOfCode / 50 : 0));
		const max = Math.max(1, ...weights);
		return (node: MapNode): number => {
			const weight = node.commits ?? (node.linesOfCode ? node.linesOfCode / 50 : 0);
			const base = 8 + 17.5 * Math.sqrt(weight / max);
			return node.hub ? Math.max(19, base) : base;
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
	// URL search params are only readable in the browser; during prerender we
	// show the full graph so the prerendered HTML is always complete.
	let activeSlug = $state<string | null>(null);
	const isolateMode = $derived(browser ? $page.url.searchParams.get('isolate') === '1' : false);
	const hiddenKinds = $derived(
		browser
			? parseSet<ProjectKind>($page.url.searchParams.get('hide-kinds'))
			: new Set<ProjectKind>()
	);
	const hiddenEdgeTypes = $derived(
		browser ? parseSet<EdgeType>($page.url.searchParams.get('hide-edges')) : new Set<EdgeType>()
	);
	// Isolate mode uses an additive *shown* set: click types one at a time to
	// build up what you want to see. An empty set means "show everything".
	const isolatedKinds = $derived(
		browser
			? parseSet<ProjectKind>($page.url.searchParams.get('show-kinds'))
			: new Set<ProjectKind>()
	);
	const isolatedEdgeTypes = $derived(
		browser ? parseSet<EdgeType>($page.url.searchParams.get('show-edges')) : new Set<EdgeType>()
	);

	// --- Pinned selection state (deep-link) ---
	// The pin is separate from the transient hover activeSlug. A pinned node
	// stays highlighted after the pointer leaves, making the selection shareable.
	const pinnedParam = $derived(browser ? $page.url.searchParams.get('project') : null);
	// Validate the pin against the nodes actually present; a stale link must
	// never dim the whole graph with nothing highlighted.
	const pinnedSlug = $derived(
		pinnedParam !== null && positions.has(pinnedParam) ? pinnedParam : null
	);
	// Hover overrides the pin; releasing the pointer/focus falls back to it.
	const effectivePinnedSlug = $derived(activeSlug ?? pinnedSlug);

	// Modal state: the node the user clicked, waiting for a Pin or Navigate action.
	let selected = $state<{ slug: string; name: string; tagline: string } | null>(null);

	function openModal(node: MapNode): void {
		selected = { slug: node.slug, name: node.name, tagline: node.tagline };
	}

	function pinSelected(): void {
		if (!selected) return;
		// Toggle: clicking the already-pinned node clears the pin.
		writeParam('project', pinnedSlug === selected.slug ? null : selected.slug);
		selected = null;
	}

	// --- Visibility: default mode hides one type per click (multi-select);
	// isolate mode builds up a set of types to show additively. ---

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

	function resetFilters(): void {
		const url = new URL($page.url);
		url.searchParams.delete('hide-kinds');
		url.searchParams.delete('hide-edges');
		url.searchParams.delete('show-kinds');
		url.searchParams.delete('show-edges');
		goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	// Toggle isolate mode and atomically clear the now-irrelevant filter family
	// so the two models never bleed into each other.
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

	// --- Dimming: hover/focus (or pin) lifts a node and its neighbourhood. ---
	// Uses effectivePinnedSlug (hover overrides pin) so a pinned node keeps its
	// neighbourhood lit after the pointer leaves.
	//
	// Stale-pin-hidden guard: if the pinned/hovered node is currently filtered
	// out, treat it as null so an invisible anchor can't dim the whole graph.

	function effectiveHighlight(): string | null {
		const slug = effectivePinnedSlug;
		if (slug === null) return null;
		const node = positions.get(slug);
		if (node && nodeHidden(node)) return null;
		return slug;
	}

	function nodeDimmed(node: MapNode): boolean {
		const highlight = effectiveHighlight();
		if (highlight === null || node.slug === highlight) return false;
		return !adjacency.get(highlight)?.has(node.slug);
	}

	function edgeDimmed(source: string, target: string): boolean {
		const highlight = effectiveHighlight();
		return highlight !== null && source !== highlight && target !== highlight;
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
			const base = 16 + 39 * Math.sqrt(weight / maxWeight);
			const radius = n.hub ? Math.max(43, base) : base;
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
					class:map__node--pinned={pinnedSlug === node.slug}
					href="{base}/projects/{node.slug}"
					onclick={(e) => { e.preventDefault(); openModal(node); }}
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
				onclick={toggleIsolate}
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
			Node size tracks commit activity; fainter dots are older. Click a node to pin it or navigate
			to the project. Click a type or connection to hide it. Turn on Isolate, then click each
			connection or type you want to keep: you can select more than one.
		</p>
	</figcaption>
</figure>

{#if selected !== null}
	{@const isPinned = pinnedSlug === selected.slug}
	<SelectionModal
		open={true}
		title={selected.name}
		onclose={() => (selected = null)}
	>
		<p class="map-modal__tagline">{selected.tagline}</p>
		<button
			type="button"
			class="modal-action modal-action--primary"
			onclick={pinSelected}
		>
			{isPinned ? 'Unpin' : 'Pin this project'}
		</button>
		<a
			href="{base}/projects/{selected.slug}"
			class="modal-action modal-action--secondary"
		>
			Go to project
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

	/*
	 * Show only the selected "labelled" projects (a diverse ~10, chosen in the
	 * data layer) plus any pinned node. The rest reveal on hover/focus.
	 */
	.map__node:not(.map__node--labelled):not(.map__node--pinned) .map__label {
		opacity: 0;
		transition: opacity var(--transition-base);
	}

	.map__node:hover .map__label,
	.map__node:focus-visible .map__label {
		fill: var(--color-text);
		opacity: 1;
	}

	.map__node:focus-visible {
		outline: none;
	}

	.map__node:focus-visible .map__dot {
		stroke: var(--color-primary-text);
		stroke-width: 3;
	}

	/* Pinned node: persistent ring so the selection reads as "locked". */
	.map__node--pinned .map__dot {
		stroke: var(--color-primary-text);
		stroke-width: 2.5;
	}

	/*
	 * Mobile: the SVG scales down with the viewport, so every label shrinks at
	 * once and the picture turns to noise. Larger type so the ~10 standing labels
	 * stay readable; the hide/reveal logic is already in the base rules above.
	 */
	@media (max-width: 40rem) {
		.map__label {
			font-size: 22px;
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

	/* Modal tagline (shown in the map modal since it has the tagline available) */
	.map-modal__tagline {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		margin: 0;
		line-height: 1.5;
	}

	/* Modal action buttons */
	.modal-action {
		display: block;
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.modal-action:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	.modal-action--primary {
		background-color: var(--color-primary-bg);
		border: 1px solid var(--color-primary);
		color: var(--color-primary-text);
	}

	.modal-action--primary:hover {
		background-color: var(--color-primary);
		color: var(--color-surface);
	}

	.modal-action--secondary {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text-subtle);
	}

	.modal-action--secondary:hover {
		border-color: var(--color-border-strong);
		color: var(--color-text);
	}

	@media (prefers-reduced-motion: reduce) {
		.map__edge,
		.map__node,
		.map__dot,
		.map__label {
			transition: none;
		}

		.modal-action {
			transition: none;
		}
	}
</style>
