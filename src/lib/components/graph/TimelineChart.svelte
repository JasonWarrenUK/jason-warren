<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { ProjectRole } from '$lib/data/types.js';
	import { formatMonthYear } from '$lib/format-date.js';
	import { progressColour, progressLabel, progressOrder, trackLabel } from './graph-style.js';
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
	// `columnWidth` is deliberately tight: with labels hover/standing-gated
	// (see `.timeline__label` below), an at-rest column only ever has to fit
	// ONE rail's ring plus hit target, not a permanently-visible name — so the
	// pitch no longer has to budget for the longest label in the registry
	// ("Those Who Came Before", 22 characters). `leftGutter`/`rightPad` are
	// trimmed to match: the year-tick labels are 4 digits and don't need 90px.
	//
	// These four numbers are chosen so `chartWidth` (below) lands inside the
	// page's REAL rendered content width, not just the outer `--layout-max-width`
	// cap: `.page` (routes/timeline/+page.svelte) is `max-width: 72rem` (1152px)
	// INCLUDING its own `--layout-padding` (clamps to 3rem/48px per side under
	// global `box-sizing: border-box`), so the actual space available to the
	// SVG at desktop widths is ~1056px, not 1152px. With the real registry's
	// fixed 14-column packing (column count is a function of overlapping rail
	// intervals, not columnWidth), `columnWidth: 66` plus these gutters lands
	// chartWidth at ~1026px — comfortably inside that 1056px budget, so the
	// `width: 100%` CSS scale-down is ~1:1 rather than the ~0.6x squeeze the
	// previous 1934px viewBox suffered.
	const GEO: TimelineGeometry = {
		width: 760,
		leftGutter: 64,
		rightPad: 20,
		topPad: 32,
		bottomPad: 40,
		columnWidth: 66,
		laneGap: 16,
		minRailHeight: 24,
		nodeRadius: 8,
		hubRingOffset: HUB_RING_OFFSET,
		stillLiveFade: 48
	};

	const layout = $derived.by(() => computeTimelineLayout(rails, lineage, now, GEO));

	// `layout.width` always echoes `GEO.width` verbatim — the layout module
	// doesn't grow it with `columnCount` (packing is column-count-agnostic by
	// design), so the viewBox must size itself to the packed content or the
	// rightmost columns render outside it. With the tightened GEO above this
	// still needs to widen for real registry data (14 columns), but now lands
	// close to the page's real content width instead of ballooning past it.
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

	const roleLabel: Record<ProjectRole, string> = {
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

	// Present progress values only, in the shared order; plus which of the
	// auxiliary treatments (spike hollow, deployed ring, archived fade) the
	// legend actually needs to explain for this dataset.
	const presentProgresses = $derived(
		progressOrder.filter((p) => rails.some((r) => r.progress === p))
	);
	const hasSpikes = $derived(rails.some((r) => r.track === 'exploration'));
	const hasDeployed = $derived(rails.some((r) => r.deployed));
	const hasArchived = $derived(rails.some((r) => r.archived));

	/** Rail ink: progress hue, shade-shifted paperward when archived. */
	const railColour = (rail: TimelineRail): string => progressColour(rail.progress, rail.archived);

	/** Stage phrase for aria text: `Spike · Complete, archived`. */
	function stagePhrase(rail: TimelineRail): string {
		const base =
			rail.track === 'exploration'
				? `${trackLabel[rail.track]} · ${progressLabel[rail.progress]}`
				: progressLabel[rail.progress];
		return rail.archived ? `${base}, archived` : base;
	}
	const hasLineage = $derived(layout.lineagePaths.length > 0);
	const hasDensity = $derived(layout.density.length > 0);

	function describe(rail: PlacedRail): string {
		const lifespan = rail.firstCommit
			? rail.lastCommit && rail.lastCommit !== rail.firstCommit
				? `${rail.firstCommit} to ${rail.lastCommit}`
				: rail.firstCommit
			: 'undated';
		return `${rail.name}: ${stagePhrase(rail)}, ${lifespan}`;
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
		<!-- Fade gradients for still-live rails: one per still-live rail, each
		     anchored in userSpaceOnUse at that rail's own (x, yTop) to
		     (x, yTop - stillLiveFade) — objectBoundingBox (the SVG default)
		     cannot be used here, because a perfectly vertical line has a
		     zero-WIDTH bounding box, and the SVG spec disables an
		     objectBoundingBox paint server entirely (not just the degenerate
		     axis) whenever either bbox dimension is zero, silently painting
		     nothing. userSpaceOnUse sidesteps that by working in absolute
		     coordinates instead of the element's own bbox. currentColor on
		     each <stop> resolves against the <stop>'s OWN inherited colour,
		     which a <defs> block never gets from the per-rail <g style="color:
		     ...">, so the rail's own status colour is threaded in explicitly
		     via stop-color rather than relying on inheritance. -->
		<defs>
			{#each layout.placed as rail (rail.slug)}
				{#if rail.stillLive}
					<linearGradient
						id="timeline-live-fade-{rail.slug}"
						gradientUnits="userSpaceOnUse"
						x1={rail.x}
						y1={rail.yTop}
						x2={rail.x}
						y2={rail.yTop - GEO.stillLiveFade}
					>
						<stop offset="0" stop-color={railColour(rail)} stop-opacity="0.4" />
						<stop offset="1" stop-color={railColour(rail)} stop-opacity="0" />
					</linearGradient>
				{/if}
			{/each}
		</defs>

		<!-- Density gutter: a thin count-scaled bar per density band, seated in
		     the left margin between the year labels and the first rail column.
		     A stretch of the chart with few VISIBLE rail lines (most projects
		     there are short capsules that don't reach this y-range) can still
		     have several concurrently "alive" long-running projects passing
		     through it; the gutter bar is what tells you that stretch is
		     "quietly busy" rather than dead. A full-width background wash read
		     as noise rather than signal, so density lives only in this margin
		     strip now — the chart body stays clean. Rendered first so every
		     other layer draws on top of it. -->
		<g class="timeline__density" aria-hidden="true">
			{#each layout.density as band (band.yTop)}
				<rect
					x={GEO.leftGutter - 18}
					y={band.yTop}
					width={10}
					height={Math.max(0, band.yBottom - band.yTop)}
					fill-opacity={Math.min(0.7, 0.08 * band.count)}
				/>
			{/each}
		</g>

		<!-- Graticule: horizontal year lines, the survey sheet's grid. Time runs
		     vertically here, so the ticks are horizontal (contrast the adoption
		     chart's vertical ticks). -->
		<g class="timeline__graticule" aria-hidden="true">
			{#each layout.ticks as tick (tick.year)}
				<line x1={GEO.leftGutter - 4} y1={tick.y} x2={chartWidth - GEO.rightPad} y2={tick.y} />
				<text class="timeline__tick-label" x={GEO.leftGutter - 26} y={tick.y + 4}>
					{tick.year}
				</text>
			{/each}
		</g>

		<!-- Extraction ribbons: a filled oxide band between each pair's
		     adjacent rails, spanning from the library's inception to
		     whichever terminal comes first — the period both projects ran
		     together after the extraction. Rendered before the rails so
		     every ribbon sits underneath the rings/labels it joins.
		     Dim-only on hover/pin: the touching ribbon holds its base
		     opacity, everything else fades. -->
		<g class="timeline__lineage" aria-hidden="true">
			{#each layout.lineagePaths as edge (`${edge.source}-${edge.target}`)}
				<path
					class="timeline__ribbon"
					class:timeline__ribbon--dim={effectiveSlug !== null &&
						edge.source !== effectiveSlug &&
						edge.target !== effectiveSlug}
					d={edge.path}
				/>
			{/each}
		</g>

		<!-- Rails. Two passes over the same `layout.placed` list, deliberately
		     split into separate `<g>` groups: SVG paints strictly in source
		     order, so with everything in a single per-rail group a LATER rail's
		     ring can paint over an EARLIER rail's label regardless of the
		     label's halo stroke — the halo only defends against elements within
		     the same paint layer, not a sibling group later in the document.
		     Rendering every ring/rail/hit-target first and every label second
		     guarantees every visible label sits on top of every ring, independent
		     of which column or rail index either belongs to. Both passes apply
		     the identical modifier classes (--active/--dim/--pinned/--labelled)
		     per rail so the shared CSS state rules keep driving both halves. -->
		<g class="timeline__rails">
			{#each layout.placed as rail, index (rail.slug)}
				<g
					class="timeline__rail-group"
					class:timeline__rail-group--active={effectiveSlug === rail.slug}
					class:timeline__rail-group--dim={effectiveSlug !== null && !neighbourhood.has(rail.slug)}
					class:timeline__rail-group--pinned={pinnedSlug === rail.slug}
					class:timeline__rail-group--labelled={rail.labelled}
					style="--reveal-delay: {Math.min(index * 24, 700)}ms; color: {railColour(rail)}"
					role="presentation"
				>
					<title>{describe(rail)}</title>

					<!-- Rail line: this project's lifespan, from the inception node
					     (yBottom, firstCommit) to the terminal node (yTop, lastCommit).
					     No colour segments — a timeline rail has no lineage-lane concept,
					     unlike the adoption chart. -->
					<line class="timeline__rail" x1={rail.x} y1={rail.yTop} x2={rail.x} y2={rail.yBottom} />

					<!-- Open-ended fade: still-live rails only. Extends the line past
					     the terminal node up to `stillLiveFade` px, gradient-stroked to
					     transparent, so "still going" reads as the rail itself trailing
					     off rather than a hard stop. A dormant rail has no such segment
					     and ends cleanly at yTop (rendered by the line above alone). -->
					{#if rail.stillLive}
						<line
							class="timeline__rail-fade"
							x1={rail.x}
							y1={rail.yTop}
							x2={rail.x}
							y2={rail.yTop - GEO.stillLiveFade}
							style="stroke: url(#timeline-live-fade-{rail.slug})"
						/>
					{/if}

					<!-- Terminal node (yTop = lastCommit, most recent activity, nearest
					     the `now` line). Deployed projects earn the outer ring here —
					     the one meaning the second ring carries anywhere on the site:
					     this runs somewhere. Liveness reads from the rail fade above. -->
					{#if rail.deployed}
						<circle
							class="timeline__ring timeline__ring--hub"
							cx={rail.x}
							cy={rail.yTop}
							r={GEO.nodeRadius + GEO.hubRingOffset}
						/>
					{/if}
					<circle
						class="timeline__ring"
						class:timeline__ring--provisional={rail.stageProvisional}
						cx={rail.x}
						cy={rail.yTop}
						r={GEO.nodeRadius}
					/>
					<circle
						class="timeline__centre"
						class:timeline__centre--hollow={rail.track === 'exploration'}
						cx={rail.x}
						cy={rail.yTop}
						r="2.8"
					/>
					<circle
						class="timeline__hit"
						cx={rail.x}
						cy={rail.yTop}
						r={rail.deployed ? GEO.nodeRadius + GEO.hubRingOffset : GEO.nodeRadius}
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

					<!-- Inception node (yBottom = firstCommit). Plain survey mark, no
					     outer ring — deployment reads at the terminal end above, not here. -->
					<circle
						class="timeline__ring"
						class:timeline__ring--provisional={rail.stageProvisional}
						cx={rail.x}
						cy={rail.yBottom}
						r={GEO.nodeRadius}
					/>
					<circle
						class="timeline__centre"
						class:timeline__centre--hollow={rail.track === 'exploration'}
						cx={rail.x}
						cy={rail.yBottom}
						r="2.8"
					/>

					<!-- Full-disc hit target: an invisible filled circle over the node,
					     rendered last in this pass so it sits topmost for hit-testing
					     among rings/rails. Every visible element above is
					     pointer-events: none. -->
					<circle
						class="timeline__hit"
						cx={rail.x}
						cy={rail.yBottom}
						r={GEO.nodeRadius}
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

		<!-- Label pass: every rail's label, painted after every rail's ring
		     above so no ring can ever clip a label — see the comment on
		     `.timeline__rails` above. Purely presentational (aria-hidden); the
		     accessible name lives on the `.timeline__hit` target in the pass
		     above, so duplicating no interactive semantics here. -->
		<g class="timeline__labels" aria-hidden="true">
			{#each layout.placed as rail, index (rail.slug)}
				<g
					class="timeline__rail-group"
					class:timeline__rail-group--active={effectiveSlug === rail.slug}
					class:timeline__rail-group--dim={effectiveSlug !== null && !neighbourhood.has(rail.slug)}
					class:timeline__rail-group--pinned={pinnedSlug === rail.slug}
					class:timeline__rail-group--labelled={rail.labelled}
					style="--reveal-delay: {Math.min(index * 24, 700)}ms; color: {railColour(rail)}"
				>
					<text class="timeline__label" x={rail.x + GEO.nodeRadius + 6} y={rail.yBottom + 4}>
						{rail.name}
					</text>
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

	<!-- Legend: one titled row per channel, matching the map and toolkit
	     keys, so hue, mark treatment, ribbon and gutter each get their own
	     explanation instead of one undifferentiated line. -->
	<figcaption class="timeline__legend">
		<div class="timeline__legend-row">
			<span class="timeline__legend-title">Progress</span>
			{#each presentProgresses as progress (progress)}
				<span class="timeline__legend-item">
					<svg class="timeline__swatch-mark" viewBox="0 0 14 14" aria-hidden="true">
						<circle
							class="timeline__swatch-ring"
							cx="7"
							cy="7"
							r="5"
							style="color: {progressColour(progress)}"
						/>
						<circle
							class="timeline__swatch-centre"
							cx="7"
							cy="7"
							r="1.6"
							style="color: {progressColour(progress)}"
						/>
					</svg>
					{progressLabel[progress]}
				</span>
			{/each}
		</div>
		{#if hasSpikes || hasDeployed || hasArchived}
			<div class="timeline__legend-row">
				<span class="timeline__legend-title">Marks</span>
				{#if hasSpikes}
					<span class="timeline__legend-item">
						<svg class="timeline__swatch-mark" viewBox="0 0 14 14" aria-hidden="true">
							<circle
								class="timeline__swatch-ring"
								cx="7"
								cy="7"
								r="5"
								style="color: var(--color-text-subtle)"
							/>
							<circle
								class="timeline__swatch-hollow"
								cx="7"
								cy="7"
								r="1.6"
								style="color: var(--color-text-subtle)"
							/>
						</svg>
						Spike (hollow centre)
					</span>
				{/if}
				{#if hasDeployed}
					<span class="timeline__legend-item">
						<svg class="timeline__swatch-mark" viewBox="0 0 14 14" aria-hidden="true">
							<circle
								class="timeline__swatch-ring"
								cx="7"
								cy="7"
								r="4"
								style="color: var(--color-text-subtle)"
							/>
							<circle
								class="timeline__swatch-ring timeline__swatch-ring--outer"
								cx="7"
								cy="7"
								r="6.2"
								style="color: var(--color-text-subtle)"
							/>
							<circle
								class="timeline__swatch-centre"
								cx="7"
								cy="7"
								r="1.4"
								style="color: var(--color-text-subtle)"
							/>
						</svg>
						Deployed (outer ring)
					</span>
				{/if}
				{#if hasArchived}
					<span class="timeline__legend-item">
						<svg class="timeline__swatch-mark" viewBox="0 0 14 14" aria-hidden="true">
							<circle
								class="timeline__swatch-ring"
								cx="7"
								cy="7"
								r="5"
								style="color: {progressColour('complete', true)}"
							/>
							<circle
								class="timeline__swatch-centre"
								cx="7"
								cy="7"
								r="1.6"
								style="color: {progressColour('complete', true)}"
							/>
						</svg>
						Archived (faded)
					</span>
				{/if}
			</div>
		{/if}
		{#if hasLineage || hasDensity}
			<div class="timeline__legend-row">
				<span class="timeline__legend-title">Context</span>
				{#if hasLineage}
					<span class="timeline__legend-item">
						<span class="timeline__legend-ribbon" aria-hidden="true"></span>
						Extraction lineage (shared span)
					</span>
				{/if}
				{#if hasDensity}
					<span class="timeline__legend-item">
						<span class="timeline__legend-density" aria-hidden="true"></span>
						Concurrent projects (gutter)
					</span>
				{/if}
			</div>
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

	/* Density gutter bar: a thin neutral fill, opacity carrying the band's
	   overlap count (set inline per-rect via fill-opacity, see the markup
	   above) so busier year-stretches read as a darker segment of the margin
	   strip. Uses --color-border-strong rather than a status colour, since a
	   band can span many differently-coloured rails at once. */
	.timeline__density rect {
		/* Oxide wash: sepia hachures in the sheet's margin (colour-system.md
		   §5, density register). Opacity carries the count, set per-rect. */
		fill: var(--ink-oxide);
		pointer-events: none;
	}

	/* Extraction ribbons: translucent oxide bands between adjacent lineage
	   rails — the sankey read of a library running alongside the app it
	   came from. Quiet enough that the rails stay the subject. Dim-only,
	   no hover brighten. */
	.timeline__ribbon {
		fill: var(--ink-oxide);
		fill-opacity: 0.14;
		stroke: none;
		pointer-events: none;
		transition: fill-opacity var(--dur-micro) var(--ease-standard);
	}

	/* Dimmed when another rail is highlighted and this ribbon touches
	   neither endpoint. Mirrors the edge dim maths. */
	.timeline__ribbon--dim {
		fill-opacity: calc(0.14 * var(--dim-node));
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

	/* Outer ring: a second, quieter ring marking a deployed project — the
	   one meaning the second ring carries anywhere on the site. */
	.timeline__ring--hub {
		stroke-width: 1.25;
		stroke-opacity: 0.4;
		pointer-events: none;
	}

	/* Heuristic stage: the unsurveyed convention, dotted where authored
	   marks draw solid. */
	.timeline__ring--provisional {
		stroke-dasharray: 2 3;
	}

	.timeline__centre {
		fill: currentColor;
		pointer-events: none;
	}

	/* Exploration track: hollow centre dot where product draws solid. */
	.timeline__centre--hollow {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.25;
	}

	/* Rail: this project's lifespan line, coloured by status via currentColor.
	   No colour segments — a timeline rail has no lineage-lane concept. */
	.timeline__rail {
		stroke: currentColor;
		stroke-width: 2;
		stroke-opacity: 0.4;
		pointer-events: none;
		transition:
			stroke-opacity var(--dur-micro) var(--ease-standard),
			stroke-width var(--dur-micro) var(--ease-standard);
	}

	/* Open-ended fade past the terminal node, still-live rails only. Same
	   width channel as .timeline__rail, but stroked through a per-rail
	   gradient def (set inline, see the markup above — one gradient per
	   still-live rail, since userSpaceOnUse coordinates are absolute) instead
	   of a flat stroke-opacity, so it reads as opaque at the rail end fading
	   to fully transparent at the open end. */
	.timeline__rail-fade {
		stroke-width: 2;
		pointer-events: none;
		transition: stroke-width var(--dur-micro) var(--ease-standard);
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

	/* Labels are hover/standing-set-only, mirroring ProjectMap's
	   `.map__node:not(--labelled):not(--pinned) .map__label` idiom: with 32
	   rails packed at a 66px column pitch, every label permanently on-screen
	   guarantees collisions (see timeline-layout.ts's columnWidth comment).
	   Only the curated standing set (--labelled, from selectLabelledSlugs)
	   and a pinned rail show a name at rest; --active (hover/focus, driven by
	   the .timeline__hit target below) reveals any rail's label on demand —
	   see the opacity:1 folded into the existing --active rule further down.
	   :not(--active) is included here (not just --labelled/--pinned) so this
	   rule's higher specificity (4 class-selectors vs --active's 1) can never
	   outrank the reveal-on-hover rule for a rail that's active but otherwise
	   unlabelled — without it, a hovered non-standing rail's OWN label stayed
	   at opacity:0, a real bug caught by hovering in a live browser. */
	.timeline__rail-group:not(.timeline__rail-group--labelled):not(.timeline__rail-group--pinned):not(
			.timeline__rail-group--active
		)
		.timeline__label {
		opacity: 0;
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
		opacity: 1;
	}

	.timeline__rail-group--active .timeline__rail {
		stroke-opacity: 0.85;
		stroke-width: 3;
	}

	.timeline__rail-group--active .timeline__rail-fade {
		stroke-width: 3;
	}

	.timeline__rail-group--dim .timeline__ring {
		stroke-opacity: var(--dim-node);
	}

	.timeline__rail-group--dim .timeline__centre {
		fill-opacity: var(--dim-node);
	}

	/* Unlike the map/adoption charts' shared --dim-label (a partial fade), a
	   dimmed rail's label goes fully to 0 here: with 32 rails packed at a
	   66px column pitch, a standing/pinned label sitting in the densely
	   clustered top rows can horizontally overlap whichever OTHER rail is
	   currently hovered/focused (its label draws at full opacity over
	   everything). A 32%-opacity ghost of that neighbour's text would still
	   visually clash with the crisp active label; hiding it outright avoids
	   that clash and keeps the active label as the sole legible thing in a
	   crowded neighbourhood while it's being read. */
	.timeline__rail-group--dim .timeline__label {
		opacity: 0;
	}

	.timeline__rail-group--dim .timeline__rail {
		stroke-opacity: calc(0.4 * var(--dim-node));
	}

	.timeline__rail-group--dim .timeline__rail-fade {
		stroke-opacity: var(--dim-node);
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
			opacity var(--dur-deliberate) var(--ease-standard) var(--reveal-delay),
			transform var(--dur-deliberate) var(--ease-standard) var(--reveal-delay);
	}

	/* Legend: a centred column of titled rows, one per channel, sharing one
	   visual language with the map and toolkit keys. */
	.timeline__legend {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-6);
		padding-top: var(--space-5);
		border-top: 1px solid var(--color-border);
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
	}

	.timeline__legend-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--space-2) var(--space-5);
	}

	.timeline__legend-title {
		font-family: var(--font-mono);
		font-size: var(--text-apparatus-lg);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.timeline__legend-item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.timeline__swatch-mark {
		width: 1rem;
		height: 1rem;
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

	.timeline__swatch-hollow {
		fill: none;
		stroke: currentColor;
		stroke-width: 1;
	}

	.timeline__swatch-ring--outer {
		stroke-width: 1;
		stroke-opacity: 0.4;
	}

	/* Miniature of the extraction ribbon: a small translucent oxide band. */
	.timeline__legend-ribbon {
		display: inline-block;
		width: 1.25rem;
		height: 0.75rem;
		background: var(--ink-oxide);
		opacity: 0.25;
		flex-shrink: 0;
	}

	/* Miniature of the density gutter bar: a short filled strip, echoing the
	   left-margin rects at their darkest. */
	.timeline__legend-density {
		display: inline-block;
		width: 0.35rem;
		height: 1rem;
		background: var(--color-border-strong);
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
		.timeline__rail,
		.timeline__rail-fade,
		.timeline__ribbon {
			transition: none;
		}
	}

	/* Below --bp-sm, stop scaling the SVG down to illegibility: hold it at a
	   width that keeps the column pitch and labels readable, and let the
	   user pan horizontally instead. The layout itself is unchanged, only
	   how it's framed on a narrow viewport. */
	@media (max-width: 40rem) {
		/* --bp-sm */
		.timeline {
			overflow-x: auto;
			overflow-y: hidden;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: thin;
			overscroll-behavior-x: contain;
		}

		.timeline__svg {
			width: auto;
			min-width: 44rem;
			height: auto;
		}
	}

	@media (pointer: coarse) {
		/* Match the ~44px touch-target floor (WCAG 2.5.8): the inline
		   nodeRadius is 8, far below that once hit-tested by touch. */
		.timeline__hit {
			r: 22px;
		}

		/* Labels are opacity: 0 unless --labelled/--pinned/--active (see the
		   rule above). That's fine for a mouse, which reveals a name on
		   hover, but touch has no hover state, so most rails would stay
		   anonymous until tapped. Show a dim name at rest instead. */
		.timeline__rail-group:not(.timeline__rail-group--labelled):not(
				.timeline__rail-group--pinned
			):not(.timeline__rail-group--active)
			.timeline__label {
			opacity: 0.55;
		}
	}
</style>
