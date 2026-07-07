<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import {
		EDGE_CATEGORIES,
		type LineageKind,
		type ProjectKind,
		type ProjectStatus,
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
	import { validatePin, nextPinValue, projectHref } from '$lib/selection.js';
	import {
		statusColour,
		statusLabel,
		statusOrder,
		categoryColour,
		edgeTypeColour,
		edgeTypeLabel,
		techKindColour,
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
		status: ProjectStatus;
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

	interface Props {
		relationshipsNodes: MapNode[];
		stackNodes: MapNode[];
		techNodes: TechMapNode[];
		edges: GraphEdge[];
		sharedEdges: SharedTechEdge[];
		themeEdges: SharedThemeEdge[];
		techCoEdges: TechCoEdge[];
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
	const effectivePinnedTech = $derived(activeSlug ?? pinnedTechLabel);

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

	function effectiveHighlight(): string | null {
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
	}

	function nodeDimmed(node: MapNode): boolean {
		const highlight = effectiveHighlight();
		if (highlight === null || node.slug === highlight) return false;
		return !adjacency.get(highlight)?.has(node.slug);
	}

	function techNodeDimmed(node: TechMapNode): boolean {
		const highlight = effectiveHighlight();
		if (highlight === null || node.label === highlight) return false;
		return !adjacency.get(highlight)?.has(node.label);
	}

	function edgeDimmed(source: string, target: string): boolean {
		const highlight = effectiveHighlight();
		return highlight !== null && source !== highlight && target !== highlight;
	}

	// ---------------------------------------------------------------------------
	// Live simulation
	// ---------------------------------------------------------------------------

	let livePositions = $state(new Map<string, { x: number; y: number }>());

	function projectPos(slug: string): { x: number; y: number } {
		return livePositions.get(slug) ?? (projectPositions.get(slug) as { x: number; y: number });
	}

	function techPos(label: string): { x: number; y: number } {
		return livePositions.get(label) ?? (techPositions.get(label) as { x: number; y: number });
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
			if (sim.alpha() < sim.alphaMin()) return;
			sim.tick();
			flush();
			rafId = requestAnimationFrame(loop);
		}

		if (prefersReducedMotion) {
			for (let i = 0; i < 320; i++) sim.tick();
			flush();
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
		{#if activeMode === 'relationships'}
			<!-- Theme edges: one per (pair, theme), each coloured by its theme. -->
			<g class="map__edges">
				{#each themeEdges as edge (`theme:${edge.theme}:${edge.source}-${edge.target}`)}
					{@const a = projectPos(edge.source)}
					{@const b = projectPos(edge.target)}
					{#if a && b}
						<line
							class="map__edge map__edge--theme"
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={edgeHidden(
								edge.source,
								edge.target,
								themeEdgeType(edge.theme)
							)}
							style="stroke: {themeColour(edge.theme)}"
							x1={a.x}
							y1={a.y}
							x2={b.x}
							y2={b.y}
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
		{:else if activeMode === 'stack'}
			<!-- Stack mode: shared-tech edges coloured by category. -->
			<g class="map__edges">
				{#each sharedEdges as edge (`shared:${edge.category}:${edge.source}-${edge.target}`)}
					{@const a = projectPos(edge.source)}
					{@const b = projectPos(edge.target)}
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
		{:else}
			<!-- Technologies mode: co-occurrence edges, neutral colour. -->
			<g class="map__edges">
				{#each techCoEdges as edge (`co:${edge.source}-${edge.target}`)}
					{@const a = techPos(edge.source)}
					{@const b = techPos(edge.target)}
					{#if a && b}
						<line
							class="map__edge map__edge--co-occurrence"
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={techEdgeHidden(edge.source, edge.target)}
							x1={a.x}
							y1={a.y}
							x2={b.x}
							y2={b.y}
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
						<line
							class="map__edge map__edge--lineage"
							class:map__edge--dim={edgeDimmed(edge.source, edge.target)}
							class:map__edge--hidden={lineageEdgeHidden(edge.source, edge.target, edge.kind)}
							style="stroke: {edgeTypeColour(edge.kind)}"
							marker-end="url(#lineage-arrow-{edge.kind})"
							x1={a.x}
							y1={a.y}
							x2={end.x}
							y2={end.y}
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
					<a
						class="map__node"
						class:map__node--dim={nodeDimmed(node)}
						class:map__node--hidden={nodeHidden(node)}
						class:map__node--labelled={node.labelled}
						class:map__node--pinned={pinnedSlug === node.slug}
						href="{base}/projects/{node.slug}"
						onclick={(e) => {
							e.preventDefault();
							openProjectModal(node);
						}}
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
		{/if}

		<!-- Tech nodes (technologies mode) -->
		{#if activeMode === 'technologies'}
			<g class="map__nodes">
				{#each techNodes as node (node.label)}
					{@const r = techRadiusScale(node)}
					{@const p = techPos(node.label)}
					<a
						class="map__node map__node--tech"
						class:map__node--dim={techNodeDimmed(node)}
						class:map__node--hidden={techNodeHidden(node)}
						class:map__node--labelled={standingTechLabels.has(node.label)}
						class:map__node--pinned={pinnedTechLabel === node.label}
						href="{base}/projects?tags={encodeTechLabel(node.label)}"
						onclick={(e) => {
							e.preventDefault();
							openTechModal(node);
						}}
						onpointerenter={() => (activeSlug = node.label)}
						onpointerleave={() => (activeSlug = null)}
						onfocus={() => (activeSlug = node.label)}
						onblur={() => (activeSlug = null)}
					>
						<title
							>{node.label} — used in {node.projectCount} project{node.projectCount === 1
								? ''
								: 's'}</title
						>
						<circle
							class="map__dot"
							cx={p.x}
							cy={p.y}
							{r}
							style="fill: {techKindColour(node.kind)}"
						/>
						<text class="map__label" x={p.x} y={p.y + r + 15} text-anchor="middle">
							{node.label}
						</text>
					</a>
				{/each}
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
					<button
						type="button"
						class="map__toggle"
						class:map__toggle--off={hiddenTechKinds.has(kind)}
						aria-pressed={!hiddenTechKinds.has(kind)}
						onclick={() => toggleTechKind(kind)}
					>
						<span class="map__swatch" style="background: {techKindColour(kind)}"></span>
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

		<!-- Status key (project modes only) -->
		{#if activeMode !== 'technologies'}
			<div class="map__legend-group" aria-hidden="true">
				<span class="map__legend-title">Status</span>
				{#each statusOrder.filter( (s) => projectNodes.some((n) => n.status === s) ) as status (status)}
					<span class="map__legend-item">
						<span class="map__swatch" style="background: {statusColour(status)}"></span>
						{statusLabel[status]}
					</span>
				{/each}
			</div>
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
			href="{base}/projects?tags={encodeTechLabel(selectedTech.label)}"
			class="modal-action modal-action--secondary"
		>
			See projects using this
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

	.map__edge--theme {
		/* stroke colour set inline per-theme */
		stroke-width: 1.2;
		stroke-dasharray: 3 7;
		opacity: 0.5;
	}

	.map__edge--shared {
		stroke-width: 1.4;
		opacity: 0.5;
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
		opacity: 0.06;
	}

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

	.map__node--pinned .map__dot {
		stroke: var(--color-primary-text);
		stroke-width: 2.5;
	}

	/* Tech nodes: slightly smaller label — they're denser. */
	.map__node--tech .map__label {
		font-size: 14px;
		font-weight: 500;
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
