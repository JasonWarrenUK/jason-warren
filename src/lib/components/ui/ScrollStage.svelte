<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/**
		 * One snippet per station, rendered in-flow in the scrolling column.
		 * This is the SSR truth: always in the DOM, readable with no JS.
		 * Each snippet holds the station's real prose, headings, and figures.
		 */
		stations: Snippet[];
		/**
		 * One snippet per station for the sticky stage visual.
		 * Receives the station index so the caller can switch on it.
		 * Rendered only as a JS enhancement: aria-hidden, never the SSR truth.
		 * stations.length must equal stagePanels.length.
		 */
		stagePanels: Snippet<[number]>[];
		/** Accessible label for the region as a whole. */
		label: string;
	}

	let { stations, stagePanels, label }: Props = $props();

	let rootEl: HTMLElement | undefined = $state();
	// sectionEls is populated by bind:this inside the #each below.
	// Initialised as an empty array; entries are filled in as the DOM mounts.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let sectionEls: (HTMLElement | undefined)[] = $state([]);
	let activeStation = $state(0);
	// live: flipped true when JS can safely enhance to the two-column sticky layout.
	// Stays false on SSR, reduced-motion, and missing IntersectionObserver.
	let live = $state(false);

	// Mirror the AdoptionTimeline.svelte reduced-motion + observer idiom exactly.
	// The SSR markup is always the complete truth; this effect only adds the
	// sticky-stage enhancement on top.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (prefersReduced || typeof IntersectionObserver === 'undefined') {
			// Do not go live: leave the plain stacked layout. Stage stays hidden.
			return;
		}
		live = true;

		// A thin detection band near vertical centre (-45%/-54% rootMargin):
		// the section whose body crosses that sliver becomes active.
		// threshold:0 = triggers on any pixel crossing, no rAF scroll loop needed.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const idx = Number((entry.target as HTMLElement).dataset.station);
					if (!Number.isNaN(idx)) activeStation = idx;
				}
			},
			{
				root: null,
				rootMargin: '-45% 0px -54% 0px',
				threshold: 0
			}
		);

		for (const el of sectionEls) if (el) observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<!--
	Structure:
	  .scrolly (single-column by default; .scrolly--live adds two-column when JS enhances)
	    .scrolly__stage-col  (aria-hidden, JS-only decorative mirror — hidden when not live)
	      .scrolly__stage    (position: sticky inside this col)
	        .scrolly__panel × N  (all stacked, cross-fade on activeStation)
	    .scrolly__flow-col   (THE SSR TRUTH — always fully rendered in-flow)
	      section.scrolly__station × N  (real headings, prose, figures, table)
-->
<div class="scrolly" class:scrolly--live={live} aria-label={label} bind:this={rootEl}>
	<!-- Stage col: decorative pinned visual. aria-hidden because the real content
	     is always present in the flow column below. No focusable elements here. -->
	<div class="scrolly__stage-col" aria-hidden="true">
		<div class="scrolly__stage">
			{#each stagePanels as panel, i (i)}
				<div class="scrolly__panel" class:scrolly__panel--active={activeStation === i}>
					{@render panel(i)}
				</div>
			{/each}
		</div>
	</div>

	<!-- Flow col: THE SSR TRUTH. Always fully rendered regardless of JS or motion. -->
	<div class="scrolly__flow-col">
		{#each stations as station, i (i)}
			<section class="scrolly__station" data-station={i} bind:this={sectionEls[i]}>
				{@render station()}
			</section>
		{/each}
	</div>
</div>

<style>
	/* ── Default layout: single column (mobile / no-JS / reduced-motion) ─── */

	.scrolly {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--layout-gap);
	}

	/* Stage col hidden by default: shown only in live two-column mode. */
	.scrolly__stage-col {
		display: none;
	}

	.scrolly__flow-col {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	/* Each station: real content in-flow. Padding gives visual rhythm;
	   border-top separates stations. */
	.scrolly__station {
		padding: var(--space-8) 0;
		border-top: 1px solid var(--color-border);
	}

	/* ── JS-live, wide viewports: two-column sticky layout ──────────────── */

	@media (min-width: 60rem) {
		/* --bp-lg */
		.scrolly--live {
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
			gap: var(--space-12);
			align-items: start;
		}

		/* Stage col on the right. */
		.scrolly--live .scrolly__stage-col {
			display: block;
			grid-column: 2;
			grid-row: 1;
		}

		/* Flow col on the left. */
		.scrolly--live .scrolly__flow-col {
			grid-column: 1;
			grid-row: 1;
		}

		.scrolly--live .scrolly__stage {
			position: sticky;
			top: var(--space-16); /* clearance below the fixed site header */
			height: min(32rem, 72vh);
			/* Stack all panels in one cell; cross-fade by opacity. */
			display: grid;
			border-radius: var(--radius-xl);
			overflow: hidden;
		}

		.scrolly--live .scrolly__panel {
			grid-area: 1 / 1; /* all panels overlap in the same cell */
			opacity: 0;
			transition: opacity var(--dur-base) var(--ease-standard);
			padding: var(--space-6);
			background-color: var(--color-surface-raised);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-xl);
			overflow-y: auto;
		}

		.scrolly--live .scrolly__panel--active {
			opacity: 1;
		}

		/* Give the last station room to reach the detection band. */
		.scrolly--live .scrolly__station:last-child {
			min-height: 60vh;
		}
	}

	/* ── Reduced-motion: authoritative kill-switch regardless of .scrolly--live ──
	 * Mirrors FlipCard's defensive @media block with !important.
	 * The $effect short-circuits before setting live=true when reduced-motion
	 * is on; this belt-and-braces rule covers any edge case where live could
	 * be true (e.g. motion preference toggled after hydration). */
	@media (prefers-reduced-motion: reduce) {
		.scrolly__stage-col {
			display: none !important;
		}

		.scrolly {
			grid-template-columns: 1fr !important;
		}

		.scrolly__stage {
			position: static !important;
		}

		.scrolly__panel {
			transition: none !important;
		}
	}

	/* ── Stage panel interior: arch/split diagram vocabulary ────────────── */
	/* Duplicated from +page.svelte's scoped rules (Svelte scopes per component).
	   Only the subset needed by the stage panel schematics lives here. */

	.scrolly :global(.stage-arch) {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		height: 100%;
	}

	.scrolly :global(.stage-arch__layers) {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		flex: 1;
	}

	.scrolly :global(.stage-arch__layer) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
	}

	.scrolly :global(.stage-arch__layer--contract) {
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary);
	}

	.scrolly :global(.stage-arch__label) {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-text);
	}

	.scrolly :global(.stage-arch__layer--contract .stage-arch__label) {
		color: var(--color-primary-text);
	}

	.scrolly :global(.stage-arch__path) {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.scrolly :global(.stage-arch__detail) {
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--color-text-subtle);
	}

	.scrolly :global(.stage-arch__arrow) {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		padding: var(--space-1) 0;
	}

	.scrolly :global(.stage-gate) {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		height: 100%;
		justify-content: center;
	}

	.scrolly :global(.stage-gate__node) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
	}

	.scrolly :global(.stage-gate__node--schema) {
		border-color: var(--color-primary);
		background-color: var(--color-primary-bg);
	}

	.scrolly :global(.stage-gate__node--pass) {
		border-color: var(--color-accent);
		background-color: var(--color-accent-bg);
	}

	.scrolly :global(.stage-gate__node--fail) {
		border-color: var(--color-border-strong);
		background-color: var(--color-surface-sunken);
	}

	.scrolly :global(.stage-gate__label) {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-text);
	}

	.scrolly :global(.stage-gate__node--schema .stage-gate__label) {
		color: var(--color-primary-text);
	}

	.scrolly :global(.stage-gate__node--pass .stage-gate__label) {
		color: var(--color-accent-text);
	}

	.scrolly :global(.stage-gate__detail) {
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--color-text-subtle);
	}

	.scrolly :global(.stage-gate__arrow) {
		text-align: center;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		padding: var(--space-1) 0;
	}

	.scrolly :global(.stage-pool) {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		height: 100%;
		justify-content: center;
	}

	.scrolly :global(.stage-pool__source) {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-md);
		background-color: var(--color-primary-bg);
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-primary-text);
		text-align: center;
	}

	.scrolly :global(.stage-pool__workers) {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: center;
	}

	.scrolly :global(.stage-pool__worker) {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-subtle);
	}

	.scrolly :global(.stage-pool__result) {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-raised);
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-text);
		text-align: center;
	}

	.scrolly :global(.stage-pool__arrow) {
		text-align: center;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.scrolly :global(.stage-tiers) {
		display: flex;
		flex-direction: column;
		gap: 0;
		height: 100%;
		justify-content: center;
	}

	.scrolly :global(.stage-tiers__tier) {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border);
		border-top: none;
		font-size: var(--text-xs);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
	}

	.scrolly :global(.stage-tiers__tier:first-child) {
		border-top: 1px solid var(--color-border);
		border-radius: var(--radius-md) var(--radius-md) 0 0;
	}

	.scrolly :global(.stage-tiers__tier:last-child) {
		border-radius: 0 0 var(--radius-md) var(--radius-md);
	}

	.scrolly :global(.stage-tiers__tier--active) {
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary);
	}

	.scrolly :global(.stage-tiers__name) {
		font-family: var(--font-mono);
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.scrolly :global(.stage-tiers__tier--active .stage-tiers__name) {
		color: var(--color-primary-text);
	}

	.scrolly :global(.stage-tiers__note) {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.scrolly :global(.stage-verbs) {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		height: 100%;
	}

	.scrolly :global(.stage-verbs__title) {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.scrolly :global(.stage-verbs__chips) {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-content: flex-start;
	}

	.scrolly :global(.stage-verbs__chip) {
		padding: 0.2em 0.6em;
		border-radius: var(--radius-full);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		border: 1px solid var(--color-border);
		background-color: var(--color-surface);
		color: var(--color-text-subtle);
	}

	.scrolly :global(.stage-verbs__chip--write) {
		border-color: var(--color-primary);
		background-color: var(--color-primary-bg);
		color: var(--color-primary-text);
	}
</style>
