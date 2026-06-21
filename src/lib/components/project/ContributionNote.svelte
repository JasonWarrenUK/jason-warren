<script lang="ts">
	import type { Contribution } from '$lib/data/types.js';
	import RoleBadge from './RoleBadge.svelte';

	interface Props {
		contribution: Contribution;
	}

	let { contribution }: Props = $props();
</script>

<section class="contribution" aria-label="Contribution details">
	<header class="contribution__header">
		<RoleBadge role={contribution.role} />
		{#if contribution.collaboration.team}
			<span class="contribution__team">
				{contribution.collaboration.team}
				{#if contribution.collaboration.employer && contribution.collaboration.employer !== contribution.collaboration.team}
					<span class="contribution__org">&middot; {contribution.collaboration.employer}</span>
				{/if}
				{#if contribution.collaboration.client}
					<span class="contribution__org">for {contribution.collaboration.client}</span>
				{/if}
			</span>
		{/if}
	</header>

	{#if contribution.role !== 'solo' && contribution.contributionNote}
		<p class="contribution__note">{contribution.contributionNote}</p>
	{:else if contribution.role !== 'solo'}
		<!-- No contribution note yet; project was auto-listed from the manifest. -->
	{:else}
		<p class="contribution__note">
			Solo project: designed, built, and maintained entirely by Jason.
		</p>
	{/if}
</section>

<style>
	.contribution {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--radius-md);
	}

	.contribution__header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.contribution__team {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.contribution__org {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		opacity: 0.75;
	}

	.contribution__note {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.6;
		margin: 0;
	}
</style>
