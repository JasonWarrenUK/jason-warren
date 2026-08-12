<script lang="ts">
	import type { ProjectMetrics } from '$lib/data/types.js';

	interface Props {
		metrics: ProjectMetrics;
	}

	let { metrics }: Props = $props();

	interface Metric {
		label: string;
		value: string;
		/** Muted secondary line, e.g. "of 309 total" for team-project commit counts. */
		context?: string;
	}

	const entries = $derived<Metric[]>(
		[
			metrics.commitsHeadline != null
				? {
						label: 'Commits',
						value: metrics.commitsHeadline.toLocaleString(),
						// Only a Jason-scoped headline has an all-authors total to sit against.
						context:
							metrics.commitsHeadlineScope === 'me' && metrics.commitsAny != null
								? `of ${metrics.commitsAny.toLocaleString()} total`
								: undefined
					}
				: null,
			metrics.linesMeAdded != null
				? { label: 'Lines added', value: `+${metrics.linesMeAdded.toLocaleString()}` }
				: null,
			metrics.linesMeRemoved != null
				? { label: 'Lines removed', value: `−${metrics.linesMeRemoved.toLocaleString()}` }
				: null,
			metrics.linesAny != null
				? { label: 'Source files', value: metrics.linesAny.toLocaleString() }
				: null
		].filter((m): m is Metric => m !== null)
	);
</script>

{#if entries.length > 0}
	<section class="metrics" aria-label="Project metrics">
		<h2 class="metrics__heading">By the numbers</h2>
		<dl class="metrics__grid">
			{#each entries as entry (entry.label)}
				<div class="metrics__item">
					<dt class="metrics__label">{entry.label}</dt>
					<dd class="metrics__value">{entry.value}</dd>
					{#if entry.context}
						<p class="metrics__context">{entry.context}</p>
					{/if}
				</div>
			{/each}
		</dl>
	</section>
{/if}

<style>
	.metrics {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.metrics__heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.metrics__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 8rem), 1fr));
		gap: var(--space-3);
	}

	.metrics__item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-4);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-panel);
	}

	.metrics__label {
		font-family: var(--font-mono);
		font-size: var(--text-apparatus);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.metrics__value {
		font-family: var(--font-mono);
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--color-primary);
		font-variant-numeric: tabular-nums;
	}

	.metrics__context {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-apparatus-lg);
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
