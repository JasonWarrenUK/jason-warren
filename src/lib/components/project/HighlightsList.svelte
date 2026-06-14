<script lang="ts">
	interface Props {
		highlights: string[];
	}

	let { highlights }: Props = $props();
</script>

{#if highlights.length > 0}
	<section class="highlights">
		<h2 class="highlights__heading">Highlights</h2>
		<ul class="highlights__list">
			{#each highlights as highlight}
				<li class="highlights__item">{highlight}</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.highlights {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.highlights__heading {
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.highlights__list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.highlights__item {
		display: grid;
		grid-template-columns: 1.25rem 1fr;
		gap: var(--space-3);
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		line-height: 1.6;
	}

	.highlights__item::before {
		content: '→';
		color: var(--color-primary);
		font-weight: 600;
		margin-top: 0.1em;
	}
</style>
