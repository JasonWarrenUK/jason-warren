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
			These projects started as code inside an application. When the problem turned out to be
			general, the engine was extracted into its own library, consumed by the original app and open
			to others.
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
						<span class="threads__card-tagline">{thread.consumer.tagline}</span>
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
						<span class="threads__card-tagline">{thread.library.tagline}</span>
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
		font-size: var(--text-3xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.threads__strapline {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		max-width: 52rem;
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
		height: 1px;
		background-color: var(--color-border);
	}

	.threads__connector-label {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
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
		.threads__pair {
			grid-template-columns: 1fr;
		}

		.threads__arrow {
			transform: rotate(90deg);
			justify-self: center;
		}
	}

	.threads__arrow {
		width: 1.5rem;
		height: 1.5rem;
		color: var(--color-text-muted);
		flex-shrink: 0;
		align-self: center;
	}

	.threads__card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-5) var(--space-6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		text-decoration: none;
		transition:
			border-color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.threads__card--consumer {
		background-color: var(--color-surface-raised);
	}

	.threads__card--library {
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary-light);
	}

	.threads__card:hover {
		border-color: var(--color-primary);
	}

	.threads__card--consumer:hover {
		background-color: var(--color-surface-raised);
	}

	.threads__card--library:hover {
		background-color: var(--color-primary-bg);
	}

	.threads__card-kind {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.threads__card--library .threads__card-kind {
		color: var(--color-primary-text);
	}

	.threads__card-name {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
	}

	.threads__card-tagline {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.5;
	}

	.threads__note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
		padding: 0 var(--space-2);
	}
</style>
