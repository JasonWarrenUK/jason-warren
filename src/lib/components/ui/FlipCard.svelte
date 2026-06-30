<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The face shown by default — keep this the essential prose. */
		front: Snippet;
		/**
		 * The detail face — supplementary content (code figures etc.).
		 * With JS disabled the flip toggle cannot operate, so the front face
		 * remains visible and the back stays hidden behind it. This mirrors the
		 * site's existing posture: interactivity is enhancement, not a gate.
		 */
		back: Snippet;
		/** Accessible name for the toggle, e.g. "The content is code". */
		label: string;
	}

	let { front, back, label }: Props = $props();

	let flipped = $state(false);

	// Mirror the ExpandableCard / AdoptionTimeline reduced-motion idiom.
	// The @media block in the style handles the visual; this affects only
	// the hint label so it stays honest about what the button does.
	function reducedMotion(): boolean {
		if (typeof window === 'undefined') return false;
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}
</script>

<div class="flip" class:flip--flipped={flipped}>
	<button
		type="button"
		class="flip__toggle"
		aria-pressed={flipped}
		aria-label={flipped ? `Show front of ${label}` : `Show back of ${label}`}
		onclick={() => (flipped = !flipped)}
	>
		<span aria-hidden="true">
			{#if flipped}
				{reducedMotion() ? 'Back ←' : 'Back ↩'}
			{:else}
				{reducedMotion() ? 'Detail →' : 'Flip ↻'}
			{/if}
		</span>
	</button>

	<div class="flip__inner">
		<!--
			Both faces are always in the DOM so SSR and no-JS visitors see the
			front face in full. aria-hidden toggles per face so a screen reader
			only narrates the currently-visible side.
		-->
		<div class="flip__face flip__face--front" aria-hidden={flipped}>
			{@render front()}
		</div>
		<div class="flip__face flip__face--back" aria-hidden={!flipped}>
			{@render back()}
		</div>
	</div>
</div>

<style>
	/* Scene container — sets the perspective for the 3D viewport. */
	.flip {
		position: relative;
		perspective: 1200px;
		border-radius: var(--radius-lg);
	}

	/* The rotating stage. min-height stabilises the scene when front and back
	   have different content heights. */
	.flip__inner {
		position: relative;
		transform-style: preserve-3d;
		transition: transform var(--transition-slow);
		min-height: 14rem;
	}

	.flip--flipped .flip__inner {
		transform: rotateY(180deg);
	}

	/* Shared face rules. */
	.flip__face {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-6);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	/* Back face pre-rotated so it reads correctly once the scene flips.
	   Absolutely positioned over the front within the stage. */
	.flip__face--back {
		position: absolute;
		inset: 0;
		transform: rotateY(180deg);
		overflow-y: auto;
	}

	/* Flip toggle — sits above both faces in z-order; stays on the rotating
	   stage so it flips with the scene (avoids the button appearing
	   mirrored on the back face by being outside the scene). */
	.flip__toggle {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.2em 0.6em;
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-full);
		background-color: var(--color-primary-bg);
		color: var(--color-primary-text);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.flip__toggle:hover {
		background-color: var(--color-primary-light);
	}

	.flip__toggle:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* ── Reduced-motion fallback ───────────────────────────────────────────
	 * No 3D rotation. Both faces sit in the same place; the hidden face
	 * fades out via opacity so content is always reachable once visible.
	 * The @media block is the authoritative fallback — it applies before
	 * JS hydrates and regardless of the reducedMotion() helper above.
	 */
	@media (prefers-reduced-motion: reduce) {
		.flip__inner {
			transform: none !important;
			transition: none;
		}

		.flip__face {
			backface-visibility: visible;
			-webkit-backface-visibility: visible;
			transition: opacity var(--transition-base);
		}

		/* Back sits absolutely over front regardless of scene rotation. */
		.flip__face--back {
			transform: none;
		}

		/* Show exactly one face at a time via opacity. */
		.flip--flipped .flip__face--front {
			opacity: 0;
			pointer-events: none;
		}

		.flip:not(.flip--flipped) .flip__face--back {
			opacity: 0;
			pointer-events: none;
		}
	}
</style>
