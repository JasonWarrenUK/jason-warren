<script lang="ts">
	import type { TechTag } from '$lib/data/types.js';

	interface Props {
		tags: TechTag[];
		/** Maximum tags to show before truncating. 0 = show all. */
		limit?: number;
	}

	let { tags, limit = 0 }: Props = $props();

	// De-duplicate by label so a language and a runtime that share a name
	// (e.g. Go) render as a single chip. This also keeps the keyed {#each}
	// key unique: a duplicate key throws during hydration in Svelte 5.
	const unique = $derived(
		tags.filter((tag, index) => tags.findIndex((other) => other.label === tag.label) === index)
	);

	const visible = $derived(limit > 0 ? unique.slice(0, limit) : unique);
	const hidden = $derived(limit > 0 ? unique.length - limit : 0);
</script>

<ul class="tag-list" aria-label="Technologies">
	{#each visible as tag (`${tag.kind}:${tag.label}`)}
		<li class="tag tag--{tag.kind}">{tag.label}</li>
	{/each}
	{#if hidden > 0}
		<li class="tag tag--overflow" aria-label="{hidden} more technologies">+{hidden}</li>
	{/if}
</ul>

<style>
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.tag {
		display: inline-flex;
		align-items: center;
		font-size: var(--text-xs);
		font-weight: 500;
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		white-space: nowrap;
	}

	/* Tag kind colours — language is primary, others are subtler */
	.tag--language {
		color: var(--color-primary-text);
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary-light);
	}

	.tag--framework {
		color: var(--color-accent-text);
		background-color: var(--color-accent-bg);
		border-color: var(--color-accent-light);
	}

	.tag--domain {
		color: var(--color-text-subtle);
		background-color: var(--color-surface-sunken);
		border-color: var(--color-border);
	}

	.tag--runtime {
		color: var(--color-text-subtle);
		background-color: var(--color-surface-sunken);
		border-color: var(--color-border);
	}

	.tag--overflow {
		color: var(--color-text-muted);
		background-color: transparent;
		border-color: transparent;
	}
</style>
