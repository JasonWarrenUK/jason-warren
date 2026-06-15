<script lang="ts">
	import ProjectMap from '$lib/components/graph/ProjectMap.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Project map | Jason Warren</title>
	<meta
		name="description"
		content="A map of every project and the connections between them: which libraries were extracted from which applications, and what relates to what."
	/>
</svelte:head>

<div class="page">
	<header class="page__header">
		<h1>Project map</h1>
		<p class="page__intro">
			Every project, grouped by what it is, with the connections drawn between them. The solid lines
			trace the engine-extraction story: a library pulled out of an application and then reused.
			Hover or focus a project to isolate its neighbourhood, or filter by type.
		</p>
	</header>

	<ProjectMap nodes={data.nodes} edges={data.edges} size={data.size} />
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-12) var(--layout-padding) var(--space-20);
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	.page__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.page__header h1 {
		font-size: var(--text-4xl);
		font-weight: 700;
		line-height: 1.1;
	}

	.page__intro {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		line-height: 1.7;
		max-width: 56rem;
		margin: 0;
	}
</style>
