<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { TagKind } from '$lib/data/types.js';
	import type { TechAdoption } from '$lib/data/adoption.js';
	import { techRelationships } from '$lib/data/tech-relationships.js';
	import { getTechOverlay } from '$lib/data/tech-overlays.js';
	import { formatMonthYear } from '$lib/format-date.js';
	import { techKindColour, edgeTypeColour, edgeTypeLabel } from '$lib/components/graph/graph-style.js';
	import { encodeTechLabel, decodeTechLabel } from '$lib/url-state.js';
	import { writeParam } from '$lib/url-write.js';
	import { projectsByTagHref, techViewHref } from '$lib/selection.js';
	import SelectionModal from '$lib/components/ui/SelectionModal.svelte';
	import { computeAdoptionLayout, type LayoutGeometry, type PlacedNode } from './adoption-layout.js';

	interface Props {
		items: TechAdoption[];
		/** When true, dates are provisional estimates pending a repo sync. */
		provisional?: boolean;
	}

	let { items, provisional = false }: Props = $props();

	// Colour by tag kind — single-sourced in graph-style.ts via techKindColour.

	// --- Geometry -----------------------------------------------------------
	// A horizontal time axis rendered as a git-branch graph: each lineage-
	// connected technology is a rail running from its adoption date until it
	// was replaced (or to the right edge, fading, when still in use), with
	// branch/merge connectors for the lineage edges. Technologies with no
	// lineage pack into a dot strip below. See adoption-layout.ts for the
	// algorithm.
	const GEO: LayoutGeometry = {
		width: 920,
		leftPad: 28,
		rightPad: 28,
		topPad: 28,
		axisGap: 28, // space under the chart for the year axis
		railLaneHeight: 26,
		stripLaneHeight: 30,
		stripGap: 16, // breathing room between the rails and the strip
		elbowRun: 14, // horizontal approach a branch connector reserves
		cornerRadius: 8,
		charWidth: 7.2, // rough advance for the 13px label font
		labelGap: 10 // min horizontal gap between two labels in a lane
	};

	const layout = $derived.by(() => computeAdoptionLayout(items, techRelationships, GEO));

	// Width of the still-in-use fade at the right end of an unreplaced rail.
	const railFadeWidth = 56;
	// Where fading rails actually end (the layout's plot-right edge); the fade
	// gradient anchors to it. Falls back to the viewBox edge when nothing fades.
	const railFadeEnd = $derived(
		layout.placed.find((p) => p.railFades)?.railEndX ?? GEO.width - GEO.rightPad
	);

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

	// Lineage lines for the modal: every authored relationship touching the
	// selected tech, phrased from its point of view, with the authored note
	// (the "why") when one exists. Reads the full techRelationships list, not
	// the reduced connector set — the modal is where implied links belong.
	interface LineageLine {
		text: string;
		note?: string;
	}

	// Authored note for the selected tech, read straight from the overlays —
	// the same pattern the lineage lines use with techRelationships.
	const selectedNote = $derived(selected !== null ? getTechOverlay(selected.label)?.note : undefined);

	const selectedLineage = $derived.by((): LineageLine[] => {
		if (!selected) return [];
		const label = selected.label;
		const phrase = (rel: (typeof techRelationships)[number]): string => {
			if (rel.kind === 'replaced-by') {
				return rel.source === label ? `Replaced by ${rel.target}` : `Replaced ${rel.source}`;
			}
			return rel.source === label ? `Led to ${rel.target}` : `Followed ${rel.source}`;
		};
		return techRelationships
			.filter((rel) => rel.source === label || rel.target === label)
			.map((rel) => ({ text: phrase(rel), note: rel.note }));
	});

	function pinSelected(): void {
		if (!selected) return;
		// Toggle: clicking the already-pinned tech clears the pin.
		writeParam('tech', pinnedLabel === selected.label ? null : encodeTechLabel(selected.label));
		selected = null;
	}

	// Returns the accessible description for an item — shared between the
	// SVG <title> tooltip and the aria-label so the two never drift.
	function describe(item: PlacedNode): string {
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

	// Edge-type legend: only the lineage kinds actually drawn on this chart
	// (mirrors presentKinds, keyed off the layout's connectors instead of items).
	const LINEAGE_KINDS = ['leads-to', 'replaced-by'] as const;
	const presentLineageKinds = $derived(
		LINEAGE_KINDS.filter((kind) => layout.connectors.some((c) => c.kind === kind))
	);
</script>

<figure class="adoption" bind:this={figureEl}>
	<svg
		class="adoption__svg"
		class:adoption__svg--animate={animate}
		class:adoption__svg--revealed={revealed}
		viewBox="0 0 {GEO.width} {layout.height}"
		role="group"
		aria-label="Timeline of when each technology first entered the work, earliest on the left"
	>
		<defs>
			<!-- Still-in-use rails fade out where they meet the right plot edge.
			     One shared user-space gradient drives an alpha mask applied per
			     fading rail, so it works regardless of each rail's stroke colour
			     (spreadMethod "pad" keeps everything left of the fade fully
			     opaque). -->
			<linearGradient
				id="adoption-rail-fade-gradient"
				gradientUnits="userSpaceOnUse"
				x1={railFadeEnd - railFadeWidth}
				y1="0"
				x2={railFadeEnd}
				y2="0"
			>
				<stop offset="0" stop-color="white" />
				<stop offset="1" stop-color="white" stop-opacity="0" />
			</linearGradient>
			<mask id="adoption-rail-fade" maskUnits="userSpaceOnUse">
				<rect x="0" y="0" width={GEO.width} height={layout.height} fill="url(#adoption-rail-fade-gradient)" />
			</mask>
		</defs>

		<!-- Year axis. -->
		<g class="adoption__axis" aria-hidden="true">
			<line
				class="adoption__axis-line"
				x1={GEO.leftPad}
				y1={layout.axisY}
				x2={GEO.width - GEO.rightPad}
				y2={layout.axisY}
			/>
			{#each layout.ticks as tick (tick.year)}
				<line
					class="adoption__tick"
					x1={tick.x}
					y1={GEO.topPad - 8}
					x2={tick.x}
					y2={layout.axisY}
				/>
				<text class="adoption__tick-label" x={tick.x} y={layout.axisY + 18}>{tick.year}</text>
			{/each}
		</g>

		<!-- Strip separator: a whisper of a line between the lineage rails and
		     the no-lineage dot strip below them. -->
		{#if layout.stripLaneCount > 0 && layout.railLaneCount > 0}
			<line
				class="adoption__strip-divider"
				aria-hidden="true"
				x1={GEO.leftPad}
				y1={layout.stripTop - GEO.stripGap / 2}
				x2={GEO.width - GEO.rightPad}
				y2={layout.stripTop - GEO.stripGap / 2}
			/>
		{/if}

		<!-- Lineage connectors: branch ("leads-to") and merge ("replaced-by")
		     elbows between rails, rendered behind rails and dots. Direction is
		     carried by time (left to right), so there are no arrowheads. -->
		<g class="adoption__lineage" aria-hidden="true">
			{#each layout.connectors as c (`${c.kind}:${c.source}-${c.target}`)}
				<path
					class="adoption__connector"
					d={c.path}
					style="stroke: {edgeTypeColour(c.kind)}"
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
					role="presentation"
					onpointerenter={() => (activeLabel = item.label)}
					onpointerleave={() => (activeLabel = null)}
				>
					<title>{describe(item)}</title>
					<!-- The rail: this tech's lifespan, from adoption until replaced
					     (ends at its successor's dot) or the present (fades out at the
					     right edge). Split into colour segments — each stretch coloured
					     by the edge to the next node it reaches (leads-to while still
					     branching, replaced-by into a successor, kind-colour otherwise).
					     A base (kind-colour) segment inherits currentColor from this
					     group; edge segments set stroke inline. Only the rightmost
					     segment carries the still-in-use fade. Strip items carry no
					     rail. Rendered before the dot so the dot sits on its rail head. -->
					{#if item.railSegments !== null}
						{#each item.railSegments as seg, si (`${seg.kind ?? 'base'}:${seg.startX}`)}
							<line
								class="adoption__rail"
								x1={seg.startX}
								y1={item.y}
								x2={seg.endX}
								y2={item.y}
								style={seg.kind !== null ? `stroke: ${edgeTypeColour(seg.kind)}` : undefined}
								mask={item.railFades && si === item.railSegments.length - 1
									? 'url(#adoption-rail-fade)'
									: undefined}
							/>
						{/each}
					{/if}
					<!-- Only the dot opens the pin modal — the label is a passive
					     caption. Interactive handlers and ARIA live here, not on the
					     wrapping <g>, so clicking/tabbing to the label text does nothing. -->
					<circle
						class="adoption__dot"
						class:adoption__dot--derived={item.dateSource === 'derived'}
						cx={item.x}
						cy={item.y}
						r={item.radius}
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
						onfocus={() => (activeLabel = item.label)}
						onblur={() => (activeLabel = null)}
					/>
					<text
						class="adoption__label"
						aria-hidden="true"
						x={item.x + item.radius + 6}
						y={item.y + 4}
					>
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
		{#each presentLineageKinds as kind (kind)}
			<span class="adoption__legend-item">
				<span
					class="adoption__legend-edge"
					style="border-color: {edgeTypeColour(kind)}"
				></span>
				{edgeTypeLabel(kind)}
			</span>
		{/each}
		<span class="adoption__legend-note">
			Each line is coloured by what comes next: leading to a new technology, then
			merging into its replacement; fading lines are still in use.
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
			First used in {formatMonthYear(selected.firstDate)}{selected.dateSource === 'derived'
				? ` (estimated from ${selected.firstProjectName})`
				: ''}, across {selected.projectCount}
			{selected.projectCount === 1 ? 'project' : 'projects'}.
		</p>
		{#if selectedNote}
			<p class="adoption-modal__note">{selectedNote}</p>
		{/if}
		{#if selectedLineage.length > 0}
			<ul class="adoption-modal__lineage">
				{#each selectedLineage as line (line.text)}
					<li>
						<span class="adoption-modal__lineage-what">{line.text}</span>
						{#if line.note}
							<span class="adoption-modal__lineage-note">{line.note}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
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
		cursor: pointer;
		transition:
			transform var(--transition-fast),
			fill-opacity var(--transition-fast),
			stroke var(--transition-fast);
		transform-box: fill-box;
		transform-origin: center;
	}

	.adoption__dot:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* Derived dots render hollow (outlined) to distinguish from curated authored dates. */
	.adoption__dot--derived {
		fill: var(--color-surface);
		stroke: currentColor;
		stroke-width: 2;
	}

	/* Rails: each tech's lifespan line, coloured by kind via the item group's
	   currentColor. Quiet by default so the dots and labels stay the loudest
	   layer; the fade mask on still-in-use rails is applied inline. */
	.adoption__rail {
		stroke: currentColor;
		stroke-width: 2;
		stroke-opacity: 0.4;
		transition:
			stroke-opacity var(--transition-fast),
			stroke-width var(--transition-fast);
	}

	/* Connectors: branch and merge elbows between rails. */
	.adoption__connector {
		fill: none;
		stroke-width: 1.5;
		stroke-opacity: 0.7;
	}

	/* Divider between the lineage rails and the no-lineage dot strip. */
	.adoption__strip-divider {
		stroke: var(--color-border);
		stroke-width: 1;
		stroke-dasharray: 2 6;
		opacity: 0.6;
	}

	.adoption__label {
		font-size: 13px;
		font-weight: 600;
		fill: var(--color-text-subtle);
		/* Halo: vertical connectors legitimately pass through label zones; the
		   surface-coloured stroke keeps the text legible over them. */
		paint-order: stroke;
		stroke: var(--color-surface);
		stroke-width: 3px;
		stroke-linejoin: round;
		/* Decorative caption only — the dot owns the interaction, not the label. */
		pointer-events: none;
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

	/* Rail highlight rides the same active/dim channels as the dot. */
	.adoption__item--active .adoption__rail {
		stroke-opacity: 0.85;
		stroke-width: 3;
	}

	.adoption__item--dim .adoption__rail {
		stroke-opacity: calc(0.4 * var(--dim-node));
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

	/* Edge-type swatch: a short line rather than a dot, echoing the lineage
	   connector strokes it stands for. Colour comes from edgeTypeColour per kind. */
	.adoption__legend-edge {
		display: inline-block;
		width: 1.25rem;
		height: 0;
		border-top: 2px solid;
		flex-shrink: 0;
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

	/* Modal note: the authored per-tech sentence from tech-overlays.ts. */
	.adoption-modal__note {
		font-size: var(--text-sm);
		color: var(--color-text);
		margin: 0;
		line-height: 1.5;
	}

	/* Modal lineage: the authored relationship lines with their "why" notes. */
	.adoption-modal__lineage {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--text-sm);
	}

	.adoption-modal__lineage li {
		line-height: 1.4;
	}

	.adoption-modal__lineage-what {
		font-weight: 600;
		color: var(--color-text);
	}

	.adoption-modal__lineage-note {
		display: block;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
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
		.adoption__label,
		.adoption__rail {
			transition: none;
		}
	}
</style>
