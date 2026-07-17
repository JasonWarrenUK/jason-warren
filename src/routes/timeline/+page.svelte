<script lang="ts">
	import TimelineChart from '$lib/components/graph/TimelineChart.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();
</script>

<Seo
	title="Timeline | Jason Warren"
	description="Every project as a lifespan, most recent activity at the top, running proportionally back to its inception."
/>

<div class="page">
	<header class="page__header">
		<h1>Timeline</h1>
		<p class="page__intro">
			Every project as a vertical lifespan: the top end marks its most recent activity, the bottom
			its inception, and the length between is genuinely proportional to time. Most recently active
			work sits at the top; older, quieter projects sink further down. Position left-to-right
			carries no meaning of its own, it's only there so overlapping lifespans don't collide.
		</p>
	</header>

	<TimelineChart rails={data.rails} lineage={data.lineage} now={data.now} />
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

	/* h1 size/weight/line-height come from the global h1 clamp. */

	.page__intro {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		line-height: 1.7;
		max-width: var(--measure-lead);
		margin: 0;
	}
</style>
