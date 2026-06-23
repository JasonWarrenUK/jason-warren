<script lang="ts">
	import { base } from '$app/paths';
	import type { ProjectSlug } from '$lib/data/types.js';
	import { getBySlug } from '$lib/data/queries.js';
	import { getNeighbours } from '$lib/data/graph.js';
	import NeighbourhoodGraph from '$lib/components/graph/NeighbourhoodGraph.svelte';
	import { projectHref } from '$lib/selection.js';

	interface Props {
		slug: ProjectSlug;
	}

	let { slug }: Props = $props();

	const project = $derived(getBySlug(slug));
	const neighbours = $derived(getNeighbours(slug));

	/**
	 * Label phrased from the current project's point of view. An outgoing
	 * extraction edge means this project is the library powering another; an
	 * incoming one means this project is the application a library was pulled from.
	 */
	function label(kind: 'extraction' | 'related', direction: 'outgoing' | 'incoming'): string {
		if (kind === 'related') return 'Related project';
		return direction === 'outgoing' ? 'Powers' : 'Extracted into';
	}
</script>

{#if project && neighbours.length > 0}
	<section class="related" aria-label="Related projects">
		<h2 class="related__heading">Connections</h2>

		<NeighbourhoodGraph
			centre={{ name: project.name, status: project.status }}
			neighbours={neighbours.map((n) => ({
				slug: n.project.slug,
				name: n.project.name,
				status: n.project.status,
				kind: n.kind,
				direction: n.direction
			}))}
		/>

		<ul class="related__list">
			{#each neighbours as neighbour (neighbour.project.slug)}
				<li class="related__item">
					<span class="related__kind">{label(neighbour.kind, neighbour.direction)}</span>
					<a href={projectHref(base, neighbour.project.slug)} class="related__link">
						{neighbour.project.name}
					</a>
					{#if neighbour.note}
						<span class="related__note">{neighbour.note}</span>
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
