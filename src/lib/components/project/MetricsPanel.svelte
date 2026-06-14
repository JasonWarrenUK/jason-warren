<script lang="ts">
	import type { ProjectMetrics } from '$lib/data/types.js';

	interface Props {
		metrics: ProjectMetrics;
	}

	let { metrics }: Props = $props();

	interface Metric {
		label: string;
		value: string;
	}

	const entries = $derived<Metric[]>(
		[
			metrics.commits != null
				? { label: 'Commits', value: metrics.commits.toLocaleString() }
				: null,
			metrics.testCoverage != null
				? { label: 'Test coverage', value: `${metrics.testCoverage}%` }
				: null,
			metrics.mergedPrs != null
				? { label: 'Merged PRs', value: metrics.mergedPrs.toLocaleString() }
				: null,
			metrics.linesAdded != null
				? { label: 'Lines added', value: `+${metrics.linesAdded.toLocaleString()}` }
				: null,
			metrics.linesRemoved != null
				? { label: 'Lines removed', value: `−${metrics.linesRemoved.toLocaleString()}` }
				: null,
			metrics.linesOfCode != null
				? { label: 'Source files', value: metrics.linesOfCode.toLocaleString() }
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
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.metrics__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: var(--space-3);
	}

	.metrics__item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-4);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.metrics__label {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.metrics__value {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-primary-text);
		font-variant-numeric: tabular-nums;
	}
</style>
