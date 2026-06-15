<script lang="ts">
	import type { ProjectStatus } from '$lib/data/types.js';
	import { statusColour } from './graph-style.js';

	interface NeighbourPoint {
		slug: string;
		name: string;
		status: ProjectStatus;
		kind: 'extraction' | 'related';
		direction: 'outgoing' | 'incoming';
	}

	interface Props {
		centre: { name: string; status: ProjectStatus };
		neighbours: NeighbourPoint[];
	}

	let { centre, neighbours }: Props = $props();

	// Compact radial layout: the current project sits in the middle, its
	// neighbours fan out around it. Deterministic by neighbour order.
	const width = 300;
	const height = 240;
	const cx = width / 2;
	const cy = height / 2;
	const radiusX = 108;
	const radiusY = 82;

	const placed = $derived(
		neighbours.map((neighbour, index) => {
			const angle = (2 * Math.PI * index) / neighbours.length - Math.PI / 2;
			return {
				...neighbour,
				x: cx + radiusX * Math.cos(angle),
				y: cy + radiusY * Math.sin(angle)
			};
		})
	);
</script>

<svg
	class="neighbourhood"
	viewBox="0 0 {width} {height}"
	role="img"
	aria-label="Diagram of this project and its immediate connections"
>
	<g class="neighbourhood__edges">
		{#each placed as neighbour (neighbour.slug)}
			<line
				class="neighbourhood__edge neighbourhood__edge--{neighbour.kind}"
				x1={cx}
				y1={cy}
				x2={neighbour.x}
				y2={neighbour.y}
			/>
		{/each}
	</g>

	<g class="neighbourhood__nodes">
		{#each placed as neighbour (neighbour.slug)}
			<g>
				<circle
					cx={neighbour.x}
					cy={neighbour.y}
					r="7"
					style="fill: {statusColour(neighbour.status)}"
				/>
				<text
					class="neighbourhood__label"
					x={neighbour.x}
					y={neighbour.y - 12}
					text-anchor="middle"
				>
					{neighbour.name}
				</text>
			</g>
		{/each}

		<circle
			class="neighbourhood__centre-dot"
			{cx}
			{cy}
			r="11"
			style="fill: {statusColour(centre.status)}"
		/>
		<text class="neighbourhood__centre-label" x={cx} y={cy + 26} text-anchor="middle">
			{centre.name}
		</text>
	</g>
</svg>

<style>
	.neighbourhood {
		width: 100%;
		height: auto;
	}

	.neighbourhood__edge--extraction {
		stroke: var(--color-primary);
		stroke-width: 2;
	}

	.neighbourhood__edge--related {
		stroke: var(--color-border-strong);
		stroke-width: 1.5;
		stroke-dasharray: 3 4;
	}

	.neighbourhood__centre-dot {
		stroke: var(--color-surface);
		stroke-width: 2;
	}

	.neighbourhood__label {
		font-size: 11px;
		fill: var(--color-text-subtle);
	}

	.neighbourhood__centre-label {
		font-size: 12px;
		font-weight: 700;
		fill: var(--color-text);
	}
</style>
