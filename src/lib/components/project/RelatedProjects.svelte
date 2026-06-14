<script lang="ts">
	import { base } from '$app/paths';
	import type { ProjectRelationship } from '$lib/data/types.js';
	import { getBySlug } from '$lib/data/queries.js';

	interface Props {
		relationships: ProjectRelationship[];
	}

	let { relationships }: Props = $props();

	const relatedWithData = $derived(
		relationships
			.map((rel) => {
				const target = getBySlug(rel.target);
				return target ? { rel, target } : null;
			})
			.filter((r): r is NonNullable<typeof r> => r !== null)
	);

	const kindLabels: Record<string, string> = {
		'extracted-from': 'Extracted into',
		powers: 'Powers',
		related: 'Related project'
	};
</script>

{#if relatedWithData.length > 0}
	<section class="related" aria-label="Related projects">
		<h2 class="related__heading">Related projects</h2>
		<ul class="related__list">
			{#each relatedWithData as { rel, target } (rel.target)}
				<li class="related__item">
					<span class="related__kind">{kindLabels[rel.kind] ?? rel.kind}</span>
					<a href="{base}/projects/{target.slug}" class="related__link">
						{target.name}
					</a>
					{#if rel.note}
						<span class="related__note">{rel.note}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.related {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.related__heading {
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.related__list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.related__item {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.related__kind {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.related__link {
		font-weight: 600;
		color: var(--color-primary-text);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.related__link:hover {
		color: var(--color-primary);
	}

	.related__note {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		width: 100%;
	}
</style>
