<script lang="ts">
	import { base } from '$app/paths';
	import type { TagKind } from '$lib/data/types.js';
	import type { TechAdoption } from '$lib/data/adoption.js';
	import { categoryColour } from '$lib/components/graph/graph-style.js';

	interface Props {
		items: TechAdoption[];
		/** When true, dates are provisional estimates pending a repo sync. */
		provisional?: boolean;
	}

	let { items, provisional = false }: Props = $props();

	// Colour by tag kind. The shared-tech categories already own distinct hues;
	// languages read as the spine of the toolkit, so they take the primary colour.
	function kindColour(kind: TagKind): string {
		if (kind === 'language') return 'var(--color-primary)';
		if (kind === 'concept') return 'var(--color-edge-concept)';
		// runtime, framework, data, ai, tool are all EdgeCategory members.
		return categoryColour(kind as Exclude<TagKind, 'language'>);
	}

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

	// --- Highlight ----------------------------------------------------------
	// Tracks the hovered or focused technology label. Drives --active / --dim
	// modifier classes on each item's children (dot and label), deliberately
	// NOT on the parent .adoption__item element so the reveal animation's own
	// opacity/transform channel on that element stays uncontested.
	let activeLabel = $state<string | null>(null);

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

		<!-- Technologies. -->
		<g class="adoption__items">
			{#each layout.placed as item, index (item.label)}
				<g
					class="adoption__item"
					class:adoption__item--active={activeLabel === item.label}
					class:adoption__item--dim={activeLabel !== null && activeLabel !== item.label}
					style="--reveal-delay: {Math.min(index * 28, 700)}ms; color: {kindColour(item.kind)}"
					role="img"
					aria-label={describe(item)}
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
				<span class="adoption__swatch" style="background: {kindColour(entry.kind)}"></span>
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
		fill-opacity: 0.25;
	}

	/* Derived hollow dots need fill-opacity on the stroke channel instead. */
	.adoption__item--dim .adoption__dot--derived {
		fill-opacity: 1;
		stroke-opacity: 0.25;
	}

	.adoption__item--dim .adoption__label {
		opacity: 0.3;
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

		/* Kill highlight transitions too — state still applies instantly. */
		.adoption__dot,
		.adoption__label {
			transition: none;
		}
	}
</style>
