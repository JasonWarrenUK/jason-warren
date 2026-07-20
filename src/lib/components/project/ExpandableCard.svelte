<script lang="ts">
	import { base } from '$app/paths';
	import { slide } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		slug: string;
		name: string;
		/** Short card face, shown collapsed. */
		blurb: string;
		/** The full detail, rendered when expanded. Its textual region should link
		 *  to the detail page; interactive controls (links, tags) sit outside it. */
		expanded: Snippet;
	}

	let { slug, name, blurb, expanded }: Props = $props();

	let open = $state(false);

	// Slide is the only motion. svelte/transition needs a numeric ms duration,
	// so read --dur-base off the resolved CSS rather than hand-picking a
	// value that could drift from the token scale — --motion-scale already
	// collapses it to 0 under reduced motion, so no separate matchMedia
	// check is needed here. Transitions never run on the initial (collapsed)
	// SSR render, only on toggle.
	function slideDuration(): number {
		if (typeof window === 'undefined') return 0;
		const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-base');
		return parseFloat(raw) || 0;
	}
</script>

<article class="ecard" class:ecard--open={open}>
	{#if open}
		<button
			type="button"
			class="ecard__thumb ecard__thumb--button"
			aria-label="Collapse {name}"
			aria-expanded="true"
			onclick={() => (open = false)}
		>
			<img
				class="ecard__img"
				src="{base}/og/{slug}.png"
				alt="{name} social card"
				width="1200"
				height="630"
				loading="lazy"
			/>
		</button>

		<div class="ecard__detail" transition:slide={{ duration: slideDuration() }}>
			{@render expanded()}
		</div>
	{:else}
		<button
			type="button"
			class="ecard__collapsed"
			aria-expanded="false"
			aria-label="Expand {name}"
			onclick={() => (open = true)}
		>
			<span class="ecard__thumb">
				<img
					class="ecard__img"
					src="{base}/og/{slug}.png"
					alt="{name} social card"
					width="1200"
					height="630"
					loading="lazy"
				/>
			</span>
			<span class="ecard__face">
				<span class="ecard__blurb">{blurb}</span>
				<span class="ecard__expand" aria-hidden="true">Expand +</span>
			</span>
		</button>
	{/if}
</article>

<style>
	.ecard {
		display: flex;
		flex-direction: column;
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		overflow: hidden;
		transition:
			border-color var(--dur-base) var(--ease-standard),
			box-shadow var(--dur-base) var(--ease-standard);
	}

	.ecard:hover {
		border-color: var(--color-border-strong);
		box-shadow: var(--shadow-warm-sm);
	}

	/* Collapsed face: the whole tile is one expand control. */
	.ecard__collapsed {
		display: flex;
		flex-direction: column;
		flex: 1;
		padding: 0;
		border: 0;
		background: none;
		text-align: left;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}

	/* Thumbnail: wrapper owns the aspect ratio, image fills it. Shared by the
	   collapsed face and the expanded collapse-button. */
	.ecard__thumb {
		display: block;
		width: 100%;
		aspect-ratio: 1200 / 630;
		overflow: hidden;
		border-bottom: 1px solid var(--color-border);
	}

	.ecard__thumb--button {
		padding: 0;
		border-width: 0 0 1px 0;
		border-style: solid;
		border-color: var(--color-border);
		background: none;
		cursor: zoom-out;
	}

	.ecard__img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.ecard__face {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		flex: 1;
	}

	.ecard__blurb {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.5;
	}

	.ecard__expand {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-accent);
		margin-top: auto;
	}

	.ecard__detail {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.ecard__collapsed:focus-visible,
	.ecard__thumb--button:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: -2px;
	}
</style>
