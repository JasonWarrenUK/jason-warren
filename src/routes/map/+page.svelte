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
			Every project, grouped by kind: app, tool, library, TUI, game, website or toy. The solid
			lines trace engine extraction: a library pulled out of an application and then reused. The
			faint lines link projects that share a technology stack. Hover or focus a project to isolate
			its neighbourhood, or filter by type.
		</p>
	</header>

	<ProjectMap
		nodes={data.nodes}
		edges={data.edges}
		sharedEdges={data.sharedEdges}
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
