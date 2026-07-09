<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { TagKind } from '$lib/data/types.js';
	import type { TechAdoption } from '$lib/data/adoption.js';
	import { techRelationships } from '$lib/data/tech-relationships.js';
	import { techKindColour, edgeTypeColour } from '$lib/components/graph/graph-style.js';
	import { encodeTechLabel, decodeTechLabel } from '$lib/url-state.js';
	import { writeParam } from '$lib/url-write.js';
	import { projectsByTagHref, techViewHref } from '$lib/selection.js';
	import SelectionModal from '$lib/components/ui/SelectionModal.svelte';

	interface Props {
		items: TechAdoption[];
		/** When true, dates are provisional estimates pending a repo sync. */
		provisional?: boolean;
	}

	let { items, provisional = false }: Props = $props();

	// Colour by tag kind — single-sourced in graph-style.ts via techKindColour.

	// --- Geometry -----------------------------------------------------------
	// A horizontal time axis with greedy lane-packing: each technology sits at
	// its adoption date on the x-axis, then drops into the first lane whose last
	// label has cleared, so nothing overlaps and the layout is deterministic.
	const width = 920;
	const leftPad = 28;
	const rightPad = 28;
	const topPad = 28;
	const axisGap = 28; // space under the lanes for the year axis
	const laneHeight = 30;
	const charWidth = 7.2; // rough advance for the 13px label font
	const labelGap = 10; // min horizontal gap between two labels in a lane
	const maxRadius = 4 + 8 * 0.9; // upper bound of the dot radius (projectCount caps at 8)

	function dayValue(iso: string): number {
		const [y, m, d] = iso.split('-').map(Number);
		return Date.UTC(y, m - 1, d) / 86_400_000;
	}

	/**
	 * Builds an SVG quadratic-bezier path from `from` to `to`, bowed upward
	 * (away from the axis) so overlapping lineage arcs stay legible rather than
	 * stacking as straight lines. The end point is trimmed back along the
	 * straight from→to line by `trimEnd` so the arrowhead marker clears the
	 * target dot: an approximation, since the true curve tangent at the
	 * endpoint differs slightly, but close enough for a decorative arc.
	 */
	function arcPath(
		from: { x: number; y: number },
		to: { x: number; y: number },
		trimEnd: number
	): string {
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const dist = Math.hypot(dx, dy) || 1;

		const lift = Math.min(24, dist * 0.18);
		const cx = (from.x + to.x) / 2;
		const cy = (from.y + to.y) / 2 - lift;

		const t = Math.max(0, (dist - trimEnd) / dist);
		const ex = from.x + dx * t;
		const ey = from.y + dy * t;

		return `M ${from.x} ${from.y} Q ${cx} ${cy} ${ex} ${ey}`;
	}

	interface PlacedItem extends TechAdoption {
		x: number;
		y: number;
		radius: number;
	}

	interface YearTick {
		year: number;
		x: number;
	}

	interface Layout {
		placed: PlacedItem[];
		ticks: YearTick[];
		height: number;
		axisY: number;
	}

	const layout = $derived.by<Layout>(() => {
		if (items.length === 0) {
			return { placed: [], ticks: [], height: topPad * 2, axisY: topPad };
		}

		const plotLeft = leftPad;
		// Reserve room on the right for the widest right-anchored label (plus the
		// largest dot and its gap) so no label ever clips at the viewBox edge.
		const maxLabelWidth = Math.max(...items.map((item) => item.label.length)) * charWidth;
		const plotRight = width - rightPad - maxLabelWidth - maxRadius - 6;
		const plotWidth = plotRight - plotLeft;

		const days = items.map((item) => dayValue(item.firstDate));
		const minDay = Math.min(...days);
		const maxDay = Math.max(...days);
		const span = maxDay - minDay || 1;

		const xFor = (iso: string): number => plotLeft + ((dayValue(iso) - minDay) / span) * plotWidth;

		// Greedy lane packing. items arrive sorted by date ascending, so a single
		// left-to-right pass keeps each lane's running right-edge accurate.
		const laneRight: number[] = [];
		const placed: PlacedItem[] = items.map((item) => {
			const x = xFor(item.firstDate);
			const radius = 4 + Math.min(item.projectCount, 8) * 0.9;
			const labelRight = x + radius + 6 + item.label.length * charWidth;

			let lane = laneRight.findIndex((right) => x - radius > right + labelGap);
			if (lane === -1) {
				lane = laneRight.length;
				laneRight.push(labelRight);
			} else {
				laneRight[lane] = labelRight;
			}

			return { ...item, x, y: topPad + lane * laneHeight, radius };
		});

		const laneCount = laneRight.length;
		const axisY = topPad + laneCount * laneHeight + axisGap / 2;
		const height = axisY + axisGap;

		const firstYear = Number(items[0].firstDate.slice(0, 4));
		const lastYear = Number(items[items.length - 1].firstDate.slice(0, 4));
		const ticks: YearTick[] = [];
		for (let year = firstYear; year <= lastYear; year++) {
			ticks.push({ year, x: xFor(`${year}-01-01`) });
		}

		return { placed, ticks, height, axisY };
	});

	// --- Lineage arcs ---------------------------------------------------------
	// Authored tech-relationship edges resolved against this chart's placed
	// items. A relationship whose source or target isn't rendered here (rare,
	// but not impossible if a tech is filtered from the adoption list) is
	// silently dropped rather than partially drawn.
	const placedByLabel = $derived(new Map(layout.placed.map((p) => [p.label, p])));

	interface LineageArc {
		rel: (typeof techRelationships)[number];
		from: PlacedItem;
		to: PlacedItem;
	}

	const lineageArcs = $derived.by((): LineageArc[] => {
		const arcs: LineageArc[] = [];
		for (const rel of techRelationships) {
			const from = placedByLabel.get(rel.source);
			const to = placedByLabel.get(rel.target);
			if (from && to) arcs.push({ rel, from, to });
		}
		return arcs;
	});

	// --- Highlight ----------------------------------------------------------
	// Tracks the hovered or focused technology label. Drives --active / --dim
	// modifier classes on each item's children (dot and label), deliberately
	// NOT on the parent .adoption__item element so the reveal animation's own
	// opacity/transform channel on that element stays uncontested.
	let activeLabel = $state<string | null>(null);

	// URL search params are only readable in the browser; during prerender we
	// show the full chart so the prerendered HTML is always complete.
	const pinnedParam = $derived(browser ? $page.url.searchParams.get('tech') : null);
	// Validate the decoded label against items actually present — a stale link
	// must never dim the whole chart with nothing highlighted.
	const pinnedLabel = $derived(
		decodeTechLabel(
			pinnedParam,
			items.map((i) => i.label)
		)
	);
	// Hover overrides the pin; releasing the pointer/focus falls back to it.
	const effectiveLabel = $derived(activeLabel ?? pinnedLabel);

	// Modal state: the tech the user clicked.
	let selected = $state<TechAdoption | null>(null);

	function openModal(item: TechAdoption): void {
		selected = item;
	}

	function pinSelected(): void {
		if (!selected) return;
		// Toggle: clicking the already-pinned tech clears the pin.
		writeParam('tech', pinnedLabel === selected.label ? null : encodeTechLabel(selected.label));
		selected = null;
	}

	// Returns the accessible description for an item — shared between the
	// SVG <title> tooltip and the aria-label so the two never drift.
	function describe(item: PlacedItem): string {
		const origin = item.dateSource === 'derived' ? ` in ${item.firstProjectName}` : '';
		const plural = item.projectCount === 1 ? '' : 's';
		return `${item.label}: first used ${item.firstYear}${origin}, now in ${item.projectCount} project${plural}`;
	}

	// --- Reveal animation ---------------------------------------------------
	// Final positions are always in the SSR markup. The animation only fades the
	// already-rendered dots in; with no JS, reduced motion, or no observer the
	// chart simply shows complete.
	let figureEl: HTMLElement;
	let animate = $state(false);
	let revealed = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;
		const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReduced || typeof IntersectionObserver === 'undefined') {
			revealed = true;
			return;
		}
		animate = true;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					revealed = true;
					observer.disconnect();
				}
			},
			{ threshold: 0.2 }
		);
		observer.observe(figureEl);
		return () => observer.disconnect();
	});

	const kindLegend: { kind: TagKind; label: string }[] = [
		{ kind: 'language', label: 'Language' },
		{ kind: 'framework', label: 'Framework' },
		{ kind: 'runtime', label: 'Runtime' }
	];
	const presentKinds = $derived(kindLegend.filter((k) => items.some((i) => i.kind === k.kind)));
</script>

<figure class="adoption" bind:this={figureEl}>
	<svg
		class="adoption__svg"
		class:adoption__svg--animate={animate}
		class:adoption__svg--revealed={revealed}
		viewBox="0 0 {width} {layout.height}"
		role="group"
		aria-label="Timeline of when each technology first entered the work, earliest on the left"
	>
		<defs>
			<marker
				id="adoption-arrow-leads-to"
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="6"
				markerHeight="6"
				orient="auto-start-reverse"
			>
				<path d="M0 0 L10 5 L0 10 z" fill="var(--color-edge-lineage-leads-to)" />
			</marker>
			<marker
				id="adoption-arrow-replaced-by"
				viewBox="0 0 10 10"
				refX="9"
				refY="5"
				markerWidth="6"
				markerHeight="6"
				orient="auto-start-reverse"
			>
				<path d="M0 0 L10 5 L0 10 z" fill="var(--color-edge-lineage-replaced-by)" />
			</marker>
		</defs>

		<!-- Year axis. -->
		<g class="adoption__axis" aria-hidden="true">
			<line
				class="adoption__axis-line"
				x1={leftPad}
				y1={layout.axisY}
				x2={width - rightPad}
				y2={layout.axisY}
			/>
			{#each layout.ticks as tick (tick.year)}
				<line class="adoption__tick" x1={tick.x} y1={topPad - 8} x2={tick.x} y2={layout.axisY} />
				<text class="adoption__tick-label" x={tick.x} y={layout.axisY + 18}>{tick.year}</text>
			{/each}
		</g>

		<!-- Lineage arcs: authored "leads-to" / "replaced-by" relationships between
		     technologies, rendered behind the dots for a subtle connective layer. -->
		<g class="adoption__lineage" aria-hidden="true">
			{#each lineageArcs as { rel, from, to } (`${rel.kind}:${rel.source}-${rel.target}`)}
				<path
					class="adoption__arc adoption__arc--{rel.kind}"
					d={arcPath(from, to, to.radius + 3)}
					style="stroke: {edgeTypeColour(rel.kind)}"
					marker-end="url(#adoption-arrow-{rel.kind})"
				/>
			{/each}
		</g>

		<!-- Technologies. -->
		<g class="adoption__items">
			{#each layout.placed as item, index (item.label)}
				<g
					class="adoption__item"
					class:adoption__item--active={effectiveLabel === item.label}
					class:adoption__item--dim={effectiveLabel !== null && effectiveLabel !== item.label}
					class:adoption__item--pinned={pinnedLabel === item.label}
					style="--reveal-delay: {Math.min(index * 28, 700)}ms; color: {techKindColour(item.kind)}"
					role="button"
					tabindex="0"
					aria-pressed={pinnedLabel === item.label}
					aria-label="{describe(item)}. {pinnedLabel === item.label
						? 'Pinned. Activate to unpin'
						: 'Activate to pin'}"
					onclick={() => openModal(item)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							openModal(item);
						}
					}}
					onpointerenter={() => (activeLabel = item.label)}
					onpointerleave={() => (activeLabel = null)}
					onfocus={() => (activeLabel = item.label)}
					onblur={() => (activeLabel = null)}
				>
					<title>{describe(item)}</title>
					<circle
						class="adoption__dot"
						class:adoption__dot--derived={item.dateSource === 'derived'}
						cx={item.x}
						cy={item.y}
						r={item.radius}
					/>
					<text class="adoption__label" x={item.x + item.radius + 6} y={item.y + 4}>
						{item.label}
					</text>
				</g>
			{/each}
		</g>
	</svg>

	<!-- Screen-reader alternative to the visual scatter. -->
	<ul class="adoption__sr">
		{#each items as item (item.label)}
			<li>
				{item.label}: first used in {item.firstYear}{item.dateSource === 'derived'
					? ` (${item.firstProjectName})`
					: ''}, now across {item.projectCount}
				project{item.projectCount === 1 ? '' : 's'}.
			</li>
		{/each}
	</ul>

	<figcaption class="adoption__legend">
		{#each presentKinds as entry (entry.kind)}
			<span class="adoption__legend-item">
				<span class="adoption__swatch" style="background: {techKindColour(entry.kind)}"></span>
				{entry.label}
			</span>
		{/each}
		<span class="adoption__legend-note">Dot size reflects how many projects use it.</span>
		<span class="adoption__legend-item">
			<span class="adoption__swatch adoption__swatch--curated"></span>
			Authored date
		</span>
		<span class="adoption__legend-item">
			<span class="adoption__swatch adoption__swatch--derived"></span>
			Estimated from project history
		</span>
		{#if provisional}
			<span class="adoption__provisional">
				Dates are approximate; uncurated technologies are estimated from project history.
			</span>
		{/if}
	</figcaption>
</figure>

{#if selected !== null}
	{@const isPinned = pinnedLabel === selected.label}
	<SelectionModal open={true} title={selected.label} onclose={() => (selected = null)}>
		<p class="adoption-modal__desc">
			First used in {selected.firstYear}{selected.dateSource === 'derived'
				? ` (estimated from ${selected.firstProjectName})`
				: ''}, across {selected.projectCount}
			{selected.projectCount === 1 ? 'project' : 'projects'}.
		</p>
		<button type="button" class="modal-action modal-action--primary" onclick={pinSelected}>
			{isPinned ? 'Unpin' : 'Pin this technology'}
		</button>
		<a href={projectsByTagHref(base, selected.label)} class="modal-action modal-action--secondary">
			See projects using this
		</a>
		<a href={techViewHref(base, 'map', selected.label)} class="modal-action modal-action--secondary">
			See in the map
		</a>
	</SelectionModal>
{/if}

<style>
	.adoption {
		margin: 0;
	}

	.adoption__svg {
		width: 100%;
		height: auto;
	}

	.adoption__axis-line {
		stroke: var(--color-border);
		stroke-width: 1.5;
	}

	.adoption__tick {
		stroke: var(--color-border);
		stroke-width: 1;
		opacity: 0.5;
	}

	.adoption__tick-label {
		font-size: 13px;
		font-weight: 700;
		fill: var(--color-text-muted);
		text-anchor: middle;
	}

	.adoption__dot {
		fill: currentColor;
		stroke: var(--color-surface);
		stroke-width: 1.5;
		transition:
			transform var(--transition-fast),
			fill-opacity var(--transition-fast),
			stroke var(--transition-fast);
		transform-box: fill-box;
		transform-origin: center;
	}

	/* Derived dots render hollow (outlined) to distinguish from curated authored dates. */
	.adoption__dot--derived {
		fill: var(--color-surface);
		stroke: currentColor;
		stroke-width: 2;
	}

	.adoption__arc {
		fill: none;
		stroke-width: 1.5;
		stroke-opacity: 0.55;
	}

	.adoption__label {
		font-size: 13px;
		font-weight: 600;
		fill: var(--color-text-subtle);
		transition:
			fill var(--transition-fast),
			opacity var(--transition-fast);
	}

	/* Highlight: lift the active tech and dim the rest. Drives dot and label
	   only — the reveal animation owns opacity/transform on .adoption__item,
	   so the two never contend for the same property. */
	.adoption__item--active .adoption__dot {
		transform: scale(1.18);
		stroke: var(--color-text);
	}

	.adoption__item--active .adoption__label {
		fill: var(--color-primary-text);
		font-weight: 700;
	}

	.adoption__item--dim .adoption__dot {
		fill-opacity: var(--dim-node);
	}

	/* Derived hollow dots need fill-opacity on the stroke channel instead. */
	.adoption__item--dim .adoption__dot--derived {
		fill-opacity: 1;
		stroke-opacity: var(--dim-node);
	}

	.adoption__item--dim .adoption__label {
		opacity: var(--dim-label);
	}

	/* Pinned tech: persistent highlight on dot stroke so the selection reads as
	   "locked". Deliberately targets children only — never opacity/transform on
	   .adoption__item, which is owned by the reveal animation. */
	.adoption__item--pinned .adoption__dot {
		stroke: var(--color-text);
		stroke-width: 2.5;
	}

	.adoption__item--pinned .adoption__label {
		fill: var(--color-primary-text);
		font-weight: 700;
	}

	/* Reveal: only active once JS has added the animate class. Default (no JS,
	   reduced motion) leaves items at full opacity. */
	.adoption__svg--animate .adoption__item {
		opacity: 0;
		transform: translateY(8px);
	}

	.adoption__svg--animate.adoption__svg--revealed .adoption__item {
		opacity: 1;
		transform: none;
		transition:
			opacity var(--transition-slow) var(--reveal-delay),
			transform var(--transition-slow) var(--reveal-delay);
	}

	.adoption__svg--animate .adoption__lineage {
		opacity: 0;
	}

	.adoption__svg--animate.adoption__svg--revealed .adoption__lineage {
		opacity: 1;
		transition: opacity var(--transition-slow);
	}

	.adoption__legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-5);
		margin-top: var(--space-6);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
	}

	.adoption__legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.adoption__swatch {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	/* Curated / derived legend swatches use the primary colour as a stand-in
	   since the actual dots are coloured by kind. */
	.adoption__swatch--curated {
		background: var(--color-primary);
	}

	.adoption__swatch--derived {
		background: var(--color-surface);
		border: 2px solid var(--color-primary);
	}

	.adoption__legend-note {
		color: var(--color-text-muted);
	}

	.adoption__provisional {
		flex-basis: 100%;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Modal desc */
	.adoption-modal__desc {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		margin: 0;
		line-height: 1.5;
	}

	/* Visually hidden, available to screen readers. */
	.adoption__sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.adoption__svg--animate .adoption__item {
			opacity: 1;
			transform: none;
			transition: none;
		}

		.adoption__lineage {
			opacity: 1;
			transition: none;
		}

		/* Kill highlight transitions too — state still applies instantly. */
		.adoption__dot,
		.adoption__label {
			transition: none;
		}
	}
</style>
