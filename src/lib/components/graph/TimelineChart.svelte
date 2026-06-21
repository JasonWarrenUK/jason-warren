<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { ProjectStatus } from '$lib/data/types.js';
	import { statusColour, statusLabel, statusOrder } from './graph-style.js';

	interface TimelineRow {
		slug: string;
		name: string;
		status: ProjectStatus;
		/** Year label, or null when the project has no recorded date. */
		year: string | null;
	}

	interface Connector {
		/** Row indices of the two ends of an extraction lineage. */
		from: number;
		to: number;
	}

	interface Props {
		rows: TimelineRow[];
		connectors: Connector[];
	}

	let { rows, connectors }: Props = $props();

	// Highlight state: transient hover/focus + a pinned slug from ?project=.
	// URL search params are only readable in the browser; during prerender we
	// show the full chart so the prerendered HTML is always complete.
	let activeSlug = $state<string | null>(null);
	const pinnedParam = $derived(browser ? $page.url.searchParams.get('project') : null);
	// Ignore a pin that names no row here, so a stale link can never dim the whole
	// chart with nothing highlighted.
	const pinnedSlug = $derived(
		pinnedParam !== null && rows.some((r) => r.slug === pinnedParam) ? pinnedParam : null
	);
	// Hover overrides the pin; releasing the pointer/focus falls back to it.
	const effectiveSlug = $derived(activeSlug ?? pinnedSlug);
	const activeIndex = $derived(
		effectiveSlug !== null ? rows.findIndex((r) => r.slug === effectiveSlug) : -1
	);

	function connectorLit(connector: Connector): boolean {
		return activeIndex !== -1 && (connector.from === activeIndex || connector.to === activeIndex);
	}

	// Geometry. Rows are evenly spaced so connector paths can be computed from
	// indices alone, which keeps the whole chart deterministic and prerenderable.
	const step = 46;
	const topPad = 32;
	const spineX = 168;
	const width = 760;
	const height = $derived(rows.length * step + topPad * 2);

	function rowY(index: number): number {
		return topPad + index * step + step / 2;
	}

	// Draw a year label only on the first row of each year, reading top to bottom.
	function showYear(index: number): boolean {
		if (rows[index].year === null) return index === 0 || rows[index - 1].year !== null;
		return index === 0 || rows[index - 1].year !== rows[index].year;
	}

	function connectorPath(connector: Connector): string {
		const y1 = rowY(connector.from);
		const y2 = rowY(connector.to);
		const bulge = spineX - 96;
		const mid = (y1 + y2) / 2;
		return `M ${spineX} ${y1} Q ${bulge} ${mid} ${spineX} ${y2}`;
	}
</script>

<figure class="timeline">
	<svg
		class="timeline__svg"
		viewBox="0 0 {width} {height}"
		role="group"
		aria-label="Timeline of projects by first commit, most recently started at the top, with extraction lineages drawn as curves"
	>
		<!-- The spine. -->
		<line class="timeline__spine" x1={spineX} y1={topPad} x2={spineX} y2={height - topPad} />

		<!-- Extraction lineages: curves linking a library to the application it came from. -->
		<g class="timeline__connectors" aria-hidden="true">
			{#each connectors as connector (`${connector.from}-${connector.to}`)}
				<path
					class="timeline__connector"
					class:timeline__connector--lit={connectorLit(connector)}
					class:timeline__connector--dim={activeIndex !== -1 && !connectorLit(connector)}
					d={connectorPath(connector)}
					fill="none"
				/>
			{/each}
		</g>

		<!-- Rows. -->
		<g class="timeline__rows">
			{#each rows as row, index (row.slug)}
				{#if showYear(index)}
					<text class="timeline__year" x={spineX - 116} y={rowY(index) + 5}>
						{row.year ?? 'Undated'}
					</text>
				{/if}

				<circle
					class="timeline__dot"
					cx={spineX}
					cy={rowY(index)}
					r="10"
					style="fill: {statusColour(row.status)}"
				/>

				<a
					class="timeline__node"
					class:timeline__node--active={effectiveSlug === row.slug}
					class:timeline__node--dim={effectiveSlug !== null && effectiveSlug !== row.slug}
					href="{base}/projects/{row.slug}"
					onpointerenter={() => (activeSlug = row.slug)}
					onpointerleave={() => (activeSlug = null)}
					onfocus={() => (activeSlug = row.slug)}
					onblur={() => (activeSlug = null)}
				>
					<title>{row.name}{row.year ? ` (${row.year})` : ''}, {statusLabel[row.status]}</title>
					<text class="timeline__name" x={spineX + 22} y={rowY(index) + 5}>{row.name}</text>
				</a>
			{/each}
		</g>
	</svg>

	<figcaption class="timeline__legend" aria-hidden="true">
		<span class="timeline__legend-item">
			<span class="timeline__legend-curve"></span> Extraction lineage
		</span>
		{#each statusOrder.filter((s) => rows.some((r) => r.status === s)) as status (status)}
			<span class="timeline__legend-item">
				<span class="timeline__swatch" style="background: {statusColour(status)}"></span>
				{statusLabel[status]}
			</span>
		{/each}
	</figcaption>
</figure>

<style>
	.timeline {
		margin: 0;
	}

	.timeline__svg {
		width: 100%;
		height: auto;
	}

	.timeline__spine {
		stroke: var(--color-border);
		stroke-width: 2;
	}

	.timeline__connector {
		stroke: var(--color-primary);
		stroke-width: 2;
		opacity: 0.7;
	}

	.timeline__connector--lit {
		stroke-width: 3;
		opacity: 1;
	}

	.timeline__connector--dim {
		opacity: 0.15;
	}

	.timeline__dot {
		stroke: var(--color-surface);
		stroke-width: 2;
	}

	.timeline__year {
		font-size: 14px;
		font-weight: 700;
		fill: var(--color-text-muted);
	}

	.timeline__name {
		font-size: 16px;
		font-weight: 600;
		fill: var(--color-text-subtle);
	}

	.timeline__node:hover .timeline__name,
	.timeline__node:focus-visible .timeline__name,
	.timeline__node--active .timeline__name {
		fill: var(--color-primary-text);
		text-decoration: underline;
	}

	.timeline__node--dim .timeline__name {
		opacity: 0.35;
	}

	.timeline__node:focus-visible {
		outline: none;
	}

	.timeline__legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-5);
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.timeline__legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
	}

	.timeline__legend-curve {
		width: 1.25rem;
		height: 0;
		border-top: 2px solid var(--color-primary);
		opacity: 0.7;
	}

	.timeline__swatch {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: var(--radius-full);
	}

	@media (prefers-reduced-motion: reduce) {
		.timeline__node,
		.timeline__name,
		.timeline__connector {
			transition: none;
		}
	}
</style>
