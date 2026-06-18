<script lang="ts">
	import TimelineChart from '$lib/components/graph/TimelineChart.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();
</script>

<Seo
	title="Timeline | Jason Warren"
	description="Every project ordered by when it started, most recently begun at the top. Extraction lineages are drawn between them: which libraries came out of which applications, and when."
/>

<div class="page">
	<header class="page__header">
		<h1>Timeline</h1>
		<p class="page__intro">
			Projects ordered by their inception date, most recently begun at the top. The curves trace
			extraction lineages: where a library was pulled out of an application, you can see the two
			threads and how far apart in time they sit.
		</p>
	</header>

	<TimelineChart rows={data.rows} connectors={data.connectors} />
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
