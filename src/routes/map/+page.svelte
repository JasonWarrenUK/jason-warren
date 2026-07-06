<script lang="ts">
	import ProjectMap from '$lib/components/graph/ProjectMap.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();
</script>

<Seo
	title="Project map | Jason Warren"
	description="A map of every project and the connections between them: which libraries were extracted from which applications and how the technology stacks overlap."
/>

<div class="page">
	<header class="page__header">
		<h1>Project map</h1>
		<p class="page__intro">
			Every project, arranged as a force-directed graph. Three views: Relationships traces
			extraction paths and theme links; By stack clusters projects around shared technology;
			Technologies maps the tools themselves, sized by usage and linked by co-occurrence.
			Hover or tap a node to highlight its neighbourhood, or use the legend to filter by type.
		</p>
	</header>

	<ProjectMap
		relationshipsNodes={data.relationshipsNodes}
		stackNodes={data.stackNodes}
		techNodes={data.techNodes}
		edges={data.edges}
		sharedEdges={data.sharedEdges}
		themeEdges={data.themeEdges}
		techCoEdges={data.techCoEdges}
		size={data.size}
	/>
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
