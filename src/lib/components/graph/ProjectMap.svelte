<script lang="ts">
	import { base } from '$app/paths';
	import type { ProjectKind, ProjectStatus } from '$lib/data/types.js';
	import type { GraphEdge, SharedTechEdge } from '$lib/data/graph.js';
	import { statusColour, statusLabel, statusOrder } from './graph-style.js';

	interface MapNode {
		slug: string;
		name: string;
		tagline: string;
		status: ProjectStatus;
		kind: ProjectKind;
		flagship: boolean;
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

	// The kinds present, for the filter legend.
	const kinds = $derived([...new Set(nodes.map((n) => n.kind))].sort());

	const kindLabel: Record<ProjectKind, string> = {
		app: 'Apps',
		game: 'Games',
		website: 'Websites',
		toy: 'Toys',
		library: 'Libraries',
		tool: 'Tools',
		tui: 'TUIs'
	};

	// Cluster labels: one per kind, placed above the centroid of its members.
	const clusters = $derived.by(() => {
		const groups = new Map<ProjectKind, MapNode[]>();
		for (const node of nodes) {
			const bucket = groups.get(node.kind);
			if (bucket) bucket.push(node);
			else groups.set(node.kind, [node]);
		}
		return [...groups.entries()].map(([kind, members]) => {
			const cx = members.reduce((sum, n) => sum + n.x, 0) / members.length;
			const minY = Math.min(...members.map((n) => n.y));
			return { kind, x: cx, y: minY };
		});
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
	let activeKind = $state<ProjectKind | null>(null);

	function nodeDimmed(node: MapNode): boolean {
		if (activeKind !== null && node.kind !== activeKind) return true;
		if (activeSlug !== null) {
			if (node.slug === activeSlug) return false;
			if (!adjacency.get(activeSlug)?.has(node.slug)) return true;
		}
		return false;
	}

	function endpointsDimmed(source: string, target: string): boolean {
		if (activeKind !== null) {
			const s = positions.get(source);
			const t = positions.get(target);
			if (s?.kind !== activeKind && t?.kind !== activeKind) return true;
		}
		if (activeSlug !== null && source !== activeSlug && target !== activeSlug) {
			return true;
		}
		return false;
	}

	function toggleKind(kind: ProjectKind): void {
		activeKind = activeKind === kind ? null : kind;
	}
</script>

<figure class="map">
	<svg
		class="map__svg"
		viewBox="0 0 {size} {size}"
		role="group"
		aria-label="Map of projects and the connections between them"
	>
		<!-- Cluster labels sit furthest back. -->
		<g class="map__clusters" aria-hidden="true">
			{#each clusters as cluster (cluster.kind)}
				<text
					class="map__cluster"
					class:map__cluster--dim={activeKind !== null && activeKind !== cluster.kind}
					x={cluster.x}
					y={Math.max(cluster.y - 34, 24)}
					text-anchor="middle">{kindLabel[cluster.kind]}</text
				>
			{/each}
		</g>

		<!-- Shared-tech links: faintest, behind the curated edges. -->
		<g class="map__edges">
			{#each sharedEdges as edge (`shared:${edge.source}-${edge.target}`)}
				{@const a = positions.get(edge.source)}
				{@const b = positions.get(edge.target)}
				{#if a && b}
					<line
						class="map__edge map__edge--shared"
						class:map__edge--dim={endpointsDimmed(edge.source, edge.target)}
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
				{@const a = positions.get(edge.source)}
				{@const b = positions.get(edge.target)}
				{#if a && b}
					<line
						class="map__edge map__edge--{edge.kind}"
						class:map__edge--dim={endpointsDimmed(edge.source, edge.target)}
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
				<a
					class="map__node"
					class:map__node--dim={nodeDimmed(node)}
					class:map__node--flagship={node.flagship}
					href="{base}/projects/{node.slug}"
					onpointerenter={() => (activeSlug = node.slug)}
					onpointerleave={() => (activeSlug = null)}
					onfocus={() => (activeSlug = node.slug)}
					onblur={() => (activeSlug = null)}
				>
					<title>{node.name}: {node.tagline}</title>
					<circle
						class="map__dot"
						cx={node.x}
						cy={node.y}
						{r}
						style="fill: {statusColour(node.status)}; fill-opacity: {opacityScale(node)}"
					/>
					<text class="map__label" x={node.x} y={node.y + r + 16} text-anchor="middle">
						{node.name}
					</text>
				</a>
			{/each}
		</g>
	</svg>

	<figcaption class="map__legend">
		<div class="map__legend-group" aria-hidden="true">
			<span class="map__legend-title">Connection</span>
			<span class="map__legend-item"
				><span class="map__swatch map__swatch--extraction"></span>Extracted into a library</span
			>
			<span class="map__legend-item"
				><span class="map__swatch map__swatch--related"></span>Related</span
			>
			<span class="map__legend-item"
				><span class="map__swatch map__swatch--shared"></span>Shared stack</span
			>
		</div>

		<div class="map__legend-group">
			<span class="map__legend-title">Filter by type</span>
			{#each kinds as kind (kind)}
				<button
					type="button"
					class="map__kind"
					class:map__kind--active={activeKind === kind}
					aria-pressed={activeKind === kind}
					onclick={() => toggleKind(kind)}
				>
					{kind}
				</button>
			{/each}
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

		<p class="map__note">Node size tracks commit activity; fainter dots are older.</p>
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

	.map__cluster {
		font-size: 26px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		fill: var(--color-text-muted);
		opacity: 0.32;
		transition: opacity var(--transition-base);
	}

	.map__cluster--dim {
		opacity: 0.1;
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
		stroke: var(--color-border-strong);
		stroke-width: 1.5;
		stroke-dasharray: 4 6;
	}

	.map__edge--shared {
		stroke: var(--color-border-strong);
		stroke-width: 1;
		opacity: 0.28;
	}

	.map__edge--dim {
		opacity: 0.06;
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
	 * once and the picture turns to noise. Keep only the flagship labels by
	 * default and reveal the rest on hover/focus, and enlarge the type so what
	 * remains stays readable.
	 */
	@media (max-width: 40rem) {
		.map__label {
			font-size: 26px;
		}

		.map__cluster {
			font-size: 34px;
		}

		.map__node:not(.map__node--flagship) .map__label {
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

	.map__swatch--extraction {
		height: 0;
		border-top: 2.5px solid var(--color-primary);
		border-radius: 0;
		width: 1.25rem;
	}

	.map__swatch--related {
		height: 0;
		border-top: 1.5px dashed var(--color-border-strong);
		border-radius: 0;
		width: 1.25rem;
	}

	.map__swatch--shared {
		height: 0;
		border-top: 1px solid var(--color-border-strong);
		border-radius: 0;
		width: 1.25rem;
		opacity: 0.5;
	}

	.map__kind {
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
			color var(--transition-fast);
	}

	.map__kind:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.map__kind--active {
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
		.map__cluster,
		.map__label {
			transition: none;
		}
	}
</style>
