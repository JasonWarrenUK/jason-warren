<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	const status = $derived($page.status);
	const message = $derived($page.error?.message ?? 'Something went wrong.');
	const isNotFound = $derived(status === 404);
</script>

<svelte:head>
	<title>{status} | Jason Warren</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="error">
	<p class="error__status">{status}</p>
	<h1 class="error__title">
		{isNotFound ? 'There is nothing at this address.' : 'That did not go to plan.'}
	</h1>
	<p class="error__message">
		{#if isNotFound}
			The page you were after has moved or never existed. The work is all still here, though.
		{:else}
			{message}
		{/if}
	</p>
	<div class="error__links">
		<a href="{base}/" class="error__link error__link--primary">Home</a>
		<a href="{base}/projects" class="error__link">All projects</a>
		<a href="{base}/map" class="error__link">Project map</a>
	</div>
</div>

<style>
	.error {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-24) var(--layout-padding);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		align-items: flex-start;
	}

	.error__status {
		font-size: var(--text-5xl);
		font-weight: 800;
		line-height: 1;
		color: var(--color-primary-text);
		margin: 0;
	}

	.error__title {
		font-size: var(--text-3xl);
		font-weight: 700;
		line-height: 1.15;
		margin: 0;
	}

	.error__message {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		line-height: 1.6;
		max-width: 48rem;
		margin: 0;
	}

	.error__links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}

	.error__link {
		display: inline-flex;
		align-items: center;
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
		font-weight: 600;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		text-decoration: none;
		transition:
			border-color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
	}

	.error__link:hover {
		border-color: var(--color-primary);
	}

	.error__link--primary {
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary-light);
		color: var(--color-primary-text);
	}
</style>
