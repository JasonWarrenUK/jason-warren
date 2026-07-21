<script lang="ts">
	import { base } from '$app/paths';
	import type { EngineThread } from '$lib/data/threads.js';

	interface Props {
		threads: EngineThread[];
	}

	let { threads }: Props = $props();
</script>

<section class="threads" aria-label="Engine extraction stories">
	<header class="threads__header">
		<h2 class="threads__title">Libraries from the inside out</h2>
		<p class="threads__strapline">
			Each of these began as code buried inside one application. When the problem turned out to be
			more general than the app it lived in, I pulled the engine into its own library: still used by
			the original, now usable by anything that hits the same wall.
		</p>
	</header>

	<div class="threads__list">
		{#each threads as thread (thread.library.slug)}
			<div class="threads__thread">
				<div class="threads__connector" aria-hidden="true">
					<div class="threads__connector-line"></div>
					<span class="threads__connector-label">extracted into</span>
					<div class="threads__connector-line"></div>
				</div>

				<div class="threads__pair">
					<a
						href="{base}/projects/{thread.consumer.slug}"
						class="threads__card threads__card--consumer"
					>
						<span class="threads__card-kind">Application</span>
						<span class="threads__card-name">{thread.consumer.name}</span>
						<span class="threads__card-tagline">{thread.consumer.blurb}</span>
					</a>

					<svg
						class="threads__arrow"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M5 12h14M12 5l7 7-7 7" />
					</svg>

					<a
						href="{base}/projects/{thread.library.slug}"
						class="threads__card threads__card--library"
					>
						<span class="threads__card-kind">Library</span>
						<span class="threads__card-name">{thread.library.name}</span>
						<span class="threads__card-tagline">{thread.library.blurb}</span>
					</a>
				</div>

				{#if thread.note}
					<p class="threads__note">{thread.note}</p>
				{/if}
			</div>
		{/each}
	</div>
</section>

<style>
	.threads {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		padding: var(--space-12) 0;
		border-top: 1px solid var(--color-border);
	}

	.threads__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.threads__title {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.threads__strapline {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		max-width: var(--measure-lead);
		margin: 0;
	}

	.threads__list {
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	.threads__thread {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.threads__connector {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.threads__connector-line {
		flex: 1;
		height: 0;
		border-top: 1.5px dashed var(--color-border-strong);
	}

	.threads__connector-label {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.threads__pair {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: stretch;
		gap: var(--space-4);
	}

	@media (max-width: 48rem) {
		/* --bp-md */
		.threads__pair {
			grid-template-columns: 1fr;
		}

		.threads__arrow {
			transform: rotate(90deg);
			justify-self: center;
		}
	}

	.threads__arrow {
		width: 22px;
		height: 22px;
		color: var(--color-accent);
		flex-shrink: 0;
		align-self: center;
	}

	.threads__card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 20px;
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		text-decoration: none;
		transition: border-color var(--dur-micro) var(--ease-standard);
	}

	.threads__card--library {
		border-left: 3px solid var(--color-accent);
	}

	.threads__card--consumer:hover {
		border-color: var(--color-primary);
	}

	.threads__card--library:hover {
		border-color: var(--color-accent);
	}

	.threads__card-kind {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-text-muted);
	}

	.threads__card--library .threads__card-kind {
		color: var(--color-accent);
	}

	.threads__card-name {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 600;
		color: var(--color-text);
		line-height: 1.2;
	}

	.threads__card-tagline {
		font-size: 13.5px;
		color: var(--color-text-subtle);
		line-height: 1.5;
	}

	.threads__note {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 15.5px;
		color: var(--color-text-subtle);
		line-height: 1.6;
		margin: 0;
		max-width: var(--measure);
	}
</style>
