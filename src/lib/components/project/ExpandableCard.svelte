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

	// Slide is the only motion; honour reduced-motion by collapsing the duration.
	// Transitions never run on the initial (collapsed) SSR render, only on toggle.
	function slideDuration(): number {
		if (typeof window === 'undefined') return 0;
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
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
		border-radius: var(--radius-lg);
		overflow: hidden;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			transform var(--transition-fast);
	}

	.ecard:hover {
		border-color: var(--color-primary-light);
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}

	@media (prefers-reduced-motion: reduce) {
		.ecard:hover {
			transform: none;
		}
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
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-primary-text);
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
