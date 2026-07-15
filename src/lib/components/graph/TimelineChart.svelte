<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { formatMonthYear } from '$lib/format-date.js';
	import { statusColour, statusLabel, statusOrder, edgeTypeColour } from './graph-style.js';
	import { writeParam } from '$lib/url-write.js';
	import { validatePin, nextPinValue, projectHref } from '$lib/selection.js';
	import SelectionModal from '$lib/components/ui/SelectionModal.svelte';
	import {
		computeTimelineLayout,
		HUB_RING_OFFSET,
		type TimelineGeometry,
		type TimelineRail,
		type TimelineLineage,
		type PlacedRail
	} from './timeline-layout.js';

	interface Props {
		rails: TimelineRail[];
		lineage: TimelineLineage[];
		now: string;
	}

	let { rails, lineage, now }: Props = $props();

	// --- Geometry -------------------------------------------------------------
	// A vertical time axis: `now` at the top, older dates running down. The
	// horizontal axis is pure collision-avoidance packing (see
	// timeline-layout.ts) — it carries no meaning of its own, unlike the
	// adoption chart's lineage lanes.
	const GEO: TimelineGeometry = {
		width: 760,
		leftGutter: 90,
		rightPad: 24,
		topPad: 32,
		bottomPad: 40,
		columnWidth: 130,
		laneGap: 16,
		minRailHeight: 24,
		nodeRadius: 8,
		hubRingOffset: HUB_RING_OFFSET,
		stillLiveFade: 48
	};

	const layout = $derived.by(() => computeTimelineLayout(rails, lineage, now, GEO));

	// `layout.width` always echoes `GEO.width` verbatim — the layout module
	// doesn't grow it with `columnCount` (packing is column-count-agnostic by
	// design). With 33 real projects front-loaded into 2026, the recent
	// cluster needs more columns than fit in GEO.width at GEO.columnWidth, so
	// the viewBox must size itself to the packed content or the rightmost
	// columns render outside it. This is a rendering concern, not a packing
	// one — it doesn't touch computeTimelineLayout's algorithm. Zoom/expand
	// (a later build step) will ease the crush; until then the static chart
	// simply widens to show every column in full.
	const chartWidth = $derived(
		Math.max(layout.width, GEO.leftGutter + layout.columnCount * GEO.columnWidth + GEO.rightPad)
	);

	// --- Highlight --------------------------------------------------------
	// Tracks the hovered or focused rail. Drives --active / --dim modifier
	// classes on each rail's CHILD elements, never on .timeline__rail-group
	// itself — that element's own opacity/transform channel is reserved for
	// the reveal animation.
	let activeSlug = $state<string | null>(null);

	// URL search params are only readable in the browser; during prerender we
	// show the full chart so the prerendered HTML is always complete.
	const pinnedParam = $derived(browser ? $page.url.searchParams.get('project') : null);
	const pinnedSlug = $derived(
		validatePin(pinnedParam, (slug) => rails.some((r) => r.slug === slug))
	);
	// Hover overrides the pin; releasing the pointer/focus falls back to it.
	const effectiveSlug = $derived(activeSlug ?? pinnedSlug);

	// The highlight neighbourhood: the active rail plus any rail joined to it by
	// an extraction lineage. Empty when nothing is active, read as "dim nothing".
	const neighbourhood = $derived.by((): Set<string> => {
		if (effectiveSlug === null) return new Set();
		const set = new Set<string>([effectiveSlug]);
		for (const path of layout.lineagePaths) {
			if (path.source === effectiveSlug) set.add(path.target);
			else if (path.target === effectiveSlug) set.add(path.source);
		}
		return set;
	});

	// --- Modal --------------------------------------------------------------
	let selected = $state<PlacedRail | null>(null);

	function openModal(rail: PlacedRail): void {
		selected = rail;
	}

	function pinSelected(): void {
		if (!selected) return;
		writeParam('project', nextPinValue(pinnedSlug, selected.slug));
		selected = null;
	}

	const roleLabel: Record<string, string> = {
		solo: 'Solo',
		lead: 'Lead',
		collaborator: 'Collaborator'
	};

	/** "Mar 2024 – Jul 2026, 2y 4mo" style lifespan summary for the modal. */
	function lifespanSummary(rail: PlacedRail): string {
		if (!rail.firstCommit || !rail.lastCommit) return 'Undated';
		const start = formatMonthYear(rail.firstCommit);
		const end = formatMonthYear(rail.lastCommit);
		const span = start === end ? start : `${start} – ${end}`;
		const days = rail.durationDays ?? 0;
		if (days === 0) return `${span} (single day)`;
		const years = Math.floor(days / 365);
		const months = Math.round((days % 365) / 30);
		const duration =
			years > 0 ? (months > 0 ? `${years}y ${months}mo` : `${years}y`) : `${Math.max(1, months)}mo`;
		return `${span}, ${duration}`;
	}

	// Lineage note for the modal: the extraction note touching the selected
	// rail, phrased from its point of view. Placeholder for step 5 — lineage
	// isn't rendered on the chart yet, but the modal field is wired so the
	// next step only has to stop returning null.
	const lineageNote = $derived.by((): string | null => {
		if (!selected) return null;
		const path = layout.lineagePaths.find(
			(p) => p.source === selected!.slug || p.target === selected!.slug
		);
		return path?.note ?? null;
	});

	// Present statuses only, in the shared status order.
	const presentStatuses = $derived(statusOrder.filter((s) => rails.some((r) => r.status === s)));
	const hasLineage = $derived(layout.lineagePaths.length > 0);

	function describe(rail: PlacedRail): string {
		const lifespan = rail.firstCommit
			? rail.lastCommit && rail.lastCommit !== rail.firstCommit
				? `${rail.firstCommit} to ${rail.lastCommit}`
				: rail.firstCommit
			: 'undated';
		return `${rail.name}: ${statusLabel[rail.status as keyof typeof statusLabel]}, ${lifespan}`;
	}

	// --- Reveal animation -----------------------------------------------------
	// Final positions are always in the SSR markup; the animation only fades
	// the already-rendered rails in. No JS, reduced motion, or no observer:
	// the chart simply shows complete.
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
</script>

<figure class="timeline" bind:this={figureEl}>
	<svg
		class="timeline__svg"
		class:timeline__svg--animate={animate}
		class:timeline__svg--revealed={revealed}
		viewBox="0 0 {chartWidth} {layout.height}"
		role="group"
		aria-label="Timeline of projects by lifespan, most recent activity at the top, packed by column with no horizontal meaning"
	>
		<!-- Graticule: horizontal year lines, the survey sheet's grid. Time runs
		     vertically here, so the ticks are horizontal (contrast the adoption
		     chart's vertical ticks). -->
		<g class="timeline__graticule" aria-hidden="true">
			{#each layout.ticks as tick (tick.year)}
				<line x1={GEO.leftGutter - 8} y1={tick.y} x2={chartWidth - GEO.rightPad} y2={tick.y} />
				<text class="timeline__tick-label" x={GEO.leftGutter - 14} y={tick.y + 4}>
					{tick.year}
				</text>
			{/each}
		</g>

		<!-- Lineage connectors: rendered container only for now. Extraction
		     branch-in-time rendering is step 5 — layout.lineagePaths already
		     carries the geometry, this group intentionally stays empty. -->
		<g class="timeline__lineage" aria-hidden="true"></g>

		<!-- Rails. -->
		<g class="timeline__rails">
			{#each layout.placed as rail, index (rail.slug)}
				<g
					class="timeline__rail-group"
					class:timeline__rail-group--active={effectiveSlug === rail.slug}
					class:timeline__rail-group--dim={effectiveSlug !== null && !neighbourhood.has(rail.slug)}
					class:timeline__rail-group--pinned={pinnedSlug === rail.slug}
					style="--reveal-delay: {Math.min(index * 24, 700)}ms; color: {statusColour(
						rail.status as Parameters<typeof statusColour>[0]
					)}"
					role="presentation"
				>
					<title>{describe(rail)}</title>

					<!-- Rail line: this project's lifespan, from inception (yBottom) to
					     most recent activity (yTop). No colour segments — a timeline
					     rail has no lineage-lane concept, unlike the adoption chart. -->
					<line class="timeline__rail" x1={rail.x} y1={rail.yTop} x2={rail.x} y2={rail.yBottom} />

					<!-- Survey mark at the newer end (yTop = most recent activity).
					     Still-live rails earn the hub ring, marking active work. -->
					{#if rail.stillLive}
						<circle
							class="timeline__ring timeline__ring--hub"
							cx={rail.x}
							cy={rail.yTop}
							r={GEO.nodeRadius + GEO.hubRingOffset}
						/>
					{/if}
					<circle class="timeline__ring" cx={rail.x} cy={rail.yTop} r={GEO.nodeRadius} />
					<circle class="timeline__centre" cx={rail.x} cy={rail.yTop} r="2.8" />

					<text
						class="timeline__label"
						aria-hidden="true"
						x={rail.x + GEO.nodeRadius + 6}
						y={rail.yTop + 4}
					>
						{rail.name}
					</text>

					<!-- Full-disc hit target: an invisible filled circle over the node,
					     rendered last so it sits topmost for hit-testing. Every visible
					     element above is pointer-events: none. -->
					<circle
						class="timeline__hit"
						cx={rail.x}
						cy={rail.yTop}
						r={rail.stillLive ? GEO.nodeRadius + GEO.hubRingOffset : GEO.nodeRadius}
						role="button"
						tabindex="0"
						aria-pressed={pinnedSlug === rail.slug}
						aria-label="{describe(rail)}. {pinnedSlug === rail.slug
							? 'Pinned. Activate to unpin'
							: 'Activate to pin'}"
						onpointerenter={() => (activeSlug = rail.slug)}
						onpointerleave={() => (activeSlug = null)}
						onclick={() => openModal(rail)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								openModal(rail);
							}
						}}
						onfocus={() => (activeSlug = rail.slug)}
						onblur={() => (activeSlug = null)}
					/>
				</g>
			{/each}
		</g>
	</svg>

	<!-- Screen-reader alternative to the visual chart. -->
	<ul class="timeline__sr">
		{#each layout.placed as rail (rail.slug)}
			<li>{describe(rail)}.</li>
		{/each}
	</ul>

	<figcaption class="timeline__legend">
		{#each presentStatuses as status (status)}
			<span class="timeline__legend-item">
				<svg class="timeline__swatch-mark" viewBox="0 0 14 14" aria-hidden="true">
					<circle
						class="timeline__swatch-ring"
						cx="7"
						cy="7"
						r="5"
						style="color: {statusColour(status)}"
					/>
					<circle
						class="timeline__swatch-centre"
						cx="7"
						cy="7"
						r="1.6"
						style="color: {statusColour(status)}"
					/>
				</svg>
				{statusLabel[status]}
			</span>
		{/each}
		{#if hasLineage}
			<span class="timeline__legend-item">
				<span class="timeline__legend-edge" style="border-color: {edgeTypeColour('extraction')}"
				></span>
				Extraction lineage
			</span>
		{/if}
	</figcaption>
</figure>

{#if selected !== null}
	{@const isPinned = pinnedSlug === selected.slug}
	<SelectionModal open={true} title={selected.name} onclose={() => (selected = null)}>
		<p class="timeline-modal__desc">{selected.tagline}</p>
		<dl class="timeline-modal__facts">
			<div>
				<dt>Role</dt>
				<dd>{roleLabel[selected.role] ?? selected.role}</dd>
			</div>
			<div>
				<dt>Lifespan</dt>
				<dd>{lifespanSummary(selected)}</dd>
			</div>
		</dl>
		{#if lineageNote}
			<p class="timeline-modal__note">{lineageNote}</p>
		{/if}
		<button type="button" class="modal-action modal-action--primary" onclick={pinSelected}>
			{isPinned ? 'Unpin' : 'Pin this project'}
		</button>
		<a href={projectHref(base, selected.slug)} class="modal-action modal-action--secondary">
			Go to project
		</a>
	</SelectionModal>
{/if}

<style>
	.timeline {
		margin: 0;
	}

	.timeline__svg {
		width: 100%;
		height: auto;
		/* The survey sheet: warm sunken paper the graticule is ruled on. */
		background: var(--color-surface-sunken);
	}

	/* Graticule: horizontal year lines, a light dotted rule the way a plotted
	   chart is ruled, not a solid gridline. */
	.timeline__graticule line {
		stroke: var(--color-grid);
		stroke-width: 1;
		stroke-dasharray: 1 6;
	}

	.timeline__tick-label {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.06em;
		fill: var(--color-text-muted);
		text-anchor: end;
	}

	/* Survey marks: an open ring plus a centre point, matching the map and the
	   adoption chart. The ring takes the rail group's status colour via
	   currentColor at reduced opacity; the solid centre carries full colour. */
	.timeline__ring {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-opacity: 0.7;
		pointer-events: none;
		transition:
			transform var(--dur-micro) var(--ease-standard),
			stroke var(--dur-base) var(--ease-standard),
			stroke-opacity var(--dur-micro) var(--ease-standard);
		transform-box: fill-box;
		transform-origin: center;
	}

	/* Hub ring: a second, quieter outer ring marking a still-live project. */
	.timeline__ring--hub {
		stroke-width: 1.25;
		stroke-opacity: 0.4;
		pointer-events: none;
	}

	.timeline__centre {
		fill: currentColor;
		pointer-events: none;
	}

	/* Rail: this project's lifespan line, coloured by status via currentColor.
	   No colour segments — a timeline rail has no lineage-lane concept. */
	.timeline__rail {
		stroke: currentColor;
		stroke-width: 2;
		stroke-opacity: 0.4;
		pointer-events: none;
		transition:
			stroke-opacity var(--transition-fast),
			stroke-width var(--transition-fast);
	}

	/* Labels: JetBrains Mono micro-caps, the atlas apparatus convention. */
	.timeline__label {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 400;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		fill: var(--color-text-subtle);
		paint-order: stroke;
		stroke: var(--color-surface-sunken);
		stroke-width: 3px;
		stroke-linejoin: round;
		pointer-events: none;
		transition:
			fill var(--dur-micro) var(--ease-standard),
			opacity var(--dur-micro) var(--ease-standard);
	}

	/* Full-disc hit target: an invisible filled circle at the outer ring
	   radius so hover, click and focus fire anywhere in the disc. fill:
	   transparent (NOT none) is required for hit-testing to work. */
	.timeline__hit {
		fill: transparent;
		cursor: pointer;
	}

	.timeline__hit:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* Highlight: lift the active rail and dim the rest. Drives the survey
	   mark, rail and label only — the reveal animation owns opacity/transform
	   on .timeline__rail-group, so the two never contend for the same property. */
	.timeline__rail-group--active .timeline__ring {
		transform: scale(1.18);
		stroke: var(--color-accent);
		stroke-opacity: 1;
	}

	.timeline__rail-group--active .timeline__centre {
		fill: var(--color-accent);
	}

	.timeline__rail-group--active .timeline__label {
		fill: var(--color-text);
		font-weight: 500;
	}

	.timeline__rail-group--active .timeline__rail {
		stroke-opacity: 0.85;
		stroke-width: 3;
	}

	.timeline__rail-group--dim .timeline__ring {
		stroke-opacity: var(--dim-node);
	}

	.timeline__rail-group--dim .timeline__centre {
		fill-opacity: var(--dim-node);
	}

	.timeline__rail-group--dim .timeline__label {
		opacity: var(--dim-label);
	}

	.timeline__rail-group--dim .timeline__rail {
		stroke-opacity: calc(0.4 * var(--dim-node));
	}

	/* Pinned project: persistent accent ring so the selection reads as
	   "locked". Targets children only — never .timeline__rail-group itself. */
	.timeline__rail-group--pinned .timeline__ring {
		stroke: var(--color-accent);
		stroke-width: 2.5;
	}

	.timeline__rail-group--pinned .timeline__centre {
		fill: var(--color-accent);
	}

	.timeline__rail-group--pinned .timeline__label {
		fill: var(--color-text);
		font-weight: 500;
	}

	/* Reveal: only active once JS has added the animate class. Default (no
	   JS, reduced motion) leaves rails at full opacity. */
	.timeline__svg--animate .timeline__rail-group {
		opacity: 0;
		transform: translateY(8px);
	}

	.timeline__svg--animate.timeline__svg--revealed .timeline__rail-group {
		opacity: 1;
		transform: none;
		transition:
			opacity var(--transition-slow) var(--reveal-delay),
			transform var(--transition-slow) var(--reveal-delay);
	}

	.timeline__legend {
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

	.timeline__legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.timeline__swatch-mark {
		width: 0.85rem;
		height: 0.85rem;
		flex-shrink: 0;
	}

	.timeline__swatch-ring {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-opacity: 0.7;
	}

	.timeline__swatch-centre {
		fill: currentColor;
	}

	.timeline__legend-edge {
		display: inline-block;
		width: 1.25rem;
		height: 0;
		border-top: 2px solid;
		flex-shrink: 0;
	}

	/* Visually hidden, available to screen readers. */
	.timeline__sr {
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

	/* Modal content. */
	.timeline-modal__desc {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		margin: 0;
		line-height: 1.5;
	}

	.timeline-modal__facts {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
	}

	.timeline-modal__facts div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.timeline-modal__facts dt {
		color: var(--color-text-muted);
	}

	.timeline-modal__facts dd {
		margin: 0;
		color: var(--color-text);
		font-weight: 500;
		text-align: right;
	}

	.timeline-modal__note {
		font-size: var(--text-sm);
		color: var(--color-text);
		margin: 0;
		line-height: 1.5;
	}

	@media (prefers-reduced-motion: reduce) {
		.timeline__svg--animate .timeline__rail-group {
			opacity: 1;
			transform: none;
			transition: none;
		}

		.timeline__ring,
		.timeline__centre,
		.timeline__label,
		.timeline__rail {
			transition: none;
		}
	}
</style>
