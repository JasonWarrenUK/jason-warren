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

	const centreRadius = 11;
	const neighbourRadius = 7;

	const placed = $derived(
		neighbours.length === 0
			? []
			: neighbours.map((neighbour, index) => {
					const angle = (2 * Math.PI * index) / neighbours.length - Math.PI / 2;
					return {
						...neighbour,
						x: cx + radiusX * Math.cos(angle),
						y: cy + radiusY * Math.sin(angle)
					};
				})
	);

	/** Quadratic control point, bowed perpendicular from the midpoint by 0.14x the edge length — same rule as ProjectMap's routes. */
	function routeControlPoint(
		a: { x: number; y: number },
		b: { x: number; y: number }
	): { x: number; y: number } {
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const bow = 0.14 * len;
		return { x: mx - (dy / len) * bow, y: my + (dx / len) * bow };
	}

	// Graticule: a light 4-line grid behind the routes, matching the survey
	// canvas on /map at a scale that suits this compact diagram.
	const gridLinesY = [height / 3, (height * 2) / 3];
	const gridLinesX = [width / 3, (width * 2) / 3];

	const centreColour = $derived(statusColour(centre.status));
</script>

<svg
	class="neighbourhood"
	viewBox="0 0 {width} {height}"
	role="img"
	aria-label="Diagram of this project and its immediate connections"
>
	<g class="neighbourhood__grid">
		{#each gridLinesY as y (y)}
			<line x1="0" y1={y} x2={width} y2={y} />
		{/each}
		{#each gridLinesX as x (x)}
			<line x1={x} y1="0" x2={x} y2={height} />
		{/each}
	</g>

	<g class="neighbourhood__edges">
		{#each placed as neighbour (neighbour.slug)}
			{@const c = routeControlPoint({ x: cx, y: cy }, neighbour)}
			<path
				class="neighbourhood__edge neighbourhood__edge--{neighbour.kind}"
				d="M{cx} {cy} Q{c.x} {c.y} {neighbour.x} {neighbour.y}"
				fill="none"
			/>
		{/each}
	</g>

	<g class="neighbourhood__nodes">
		{#each placed as neighbour (neighbour.slug)}
			{@const colour = statusColour(neighbour.status)}
			<g>
				<circle
					class="neighbourhood__ring"
					cx={neighbour.x}
					cy={neighbour.y}
					r={neighbourRadius}
					style="stroke: {colour}"
				/>
				<circle
					class="neighbourhood__dot"
					cx={neighbour.x}
					cy={neighbour.y}
					r="2.4"
					style="fill: {colour}"
				/>
				<text
					class="neighbourhood__label"
					x={neighbour.x}
					y={neighbour.y - neighbourRadius - 6}
					text-anchor="middle"
				>
					{neighbour.name}
				</text>
			</g>
		{/each}

		<circle
			class="neighbourhood__ring neighbourhood__ring--centre"
			{cx}
			{cy}
			r={centreRadius}
			style="stroke: {centreColour}"
		/>
		<circle
			class="neighbourhood__ring neighbourhood__ring--hub"
			{cx}
			{cy}
			r={centreRadius + 6}
			style="stroke: {centreColour}"
		/>
		<circle class="neighbourhood__dot" {cx} {cy} r="2.8" style="fill: {centreColour}" />
		<text class="neighbourhood__centre-label" x={cx} y={cy + centreRadius + 18} text-anchor="middle">
			{centre.name}
		</text>
	</g>
</svg>

<style>
	.neighbourhood {
		width: 100%;
		height: auto;
		background: var(--color-surface-sunken);
	}

	.neighbourhood__grid line {
		stroke: var(--color-grid);
		stroke-width: 1;
		stroke-dasharray: 1 5;
	}

	.neighbourhood__edge {
		stroke-linecap: round;
	}

	.neighbourhood__edge--extraction {
		stroke: var(--color-primary);
		stroke-width: 2;
	}

	.neighbourhood__edge--related {
		stroke: var(--color-border-strong);
		stroke-width: 1.5;
		stroke-dasharray: 5 4;
	}

	.neighbourhood__ring {
		fill: none;
		stroke-width: 1.75;
	}

	.neighbourhood__ring--centre {
		stroke-width: 1.75;
	}

	.neighbourhood__ring--hub {
		stroke-width: 1.25;
		opacity: 0.6;
	}

	.neighbourhood__label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.06em;
		fill: var(--color-text-subtle);
	}

	.neighbourhood__centre-label {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		fill: var(--color-text);
	}
</style>
