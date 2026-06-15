<script lang="ts">
	import { base } from '$app/paths';
	import type { ProjectKind, ProjectStatus } from '$lib/data/types.js';
	import type { GraphEdge } from '$lib/data/graph.js';
	import { statusColour, statusLabel, statusOrder } from './graph-style.js';

	interface MapNode {
		slug: string;
		name: string;
		tagline: string;
		status: ProjectStatus;
		kind: ProjectKind;
		flagship: boolean;
		x: number;
		y: number;
	}

	interface Props {
		nodes: MapNode[];
		edges: GraphEdge[];
		size: number;
	}

	let { nodes, edges, size }: Props = $props();

	const positions = $derived(new Map(nodes.map((n) => [n.slug, n])));

	// Adjacency for neighbourhood highlighting (progressive enhancement only).
	const adjacency = $derived.by(() => {
		const map = new Map<string, Set<string>>();
		for (const node of nodes) map.set(node.slug, new Set());
		for (const edge of edges) {
			map.get(edge.source)?.add(edge.target);
			map.get(edge.target)?.add(edge.source);
		}
		return map;
	});

	// The kinds present, for the filter legend.
	const kinds = $derived([...new Set(nodes.map((n) => n.kind))].sort());

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

	function edgeDimmed(edge: GraphEdge): boolean {
		if (activeKind !== null) {
			const s = positions.get(edge.source);
			const t = positions.get(edge.target);
			if (s?.kind !== activeKind && t?.kind !== activeKind) return true;
		}
		if (activeSlug !== null && edge.source !== activeSlug && edge.target !== activeSlug) {
			return true;
		}
		return false;
	}

	function radius(node: MapNode): number {
		return node.flagship ? 15 : 10;
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
		<!-- Edges first, behind the nodes. -->
		<g class="map__edges">
			{#each edges as edge (`${edge.kind}:${edge.source}-${edge.target}`)}
				{@const a = positions.get(edge.source)}
				{@const b = positions.get(edge.target)}
				{#if a && b}
					<line
						class="map__edge map__edge--{edge.kind}"
						class:map__edge--dim={edgeDimmed(edge)}
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
				<a
					class="map__node"
					class:map__node--dim={nodeDimmed(node)}
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
						r={radius(node)}
						style="fill: {statusColour(node.status)}"
					/>
					<text class="map__label" x={node.x} y={node.y + radius(node) + 16} text-anchor="middle">
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
		stroke: var(--color-border-strong);
		stroke-width: 1.5;
		stroke-dasharray: 4 6;
	}

	.map__edge--dim {
		opacity: 0.08;
	}

	.map__node {
		cursor: pointer;
		transition: opacity var(--transition-base);
	}

	.map__node--dim {
		opacity: 0.25;
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

	@media (prefers-reduced-motion: reduce) {
		.map__edge,
		.map__node,
		.map__dot {
			transition: none;
		}
	}
</style>
