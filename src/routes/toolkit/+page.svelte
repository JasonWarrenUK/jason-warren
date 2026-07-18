<script lang="ts">
	import AdoptionTimeline from '$lib/components/toolkit/AdoptionTimeline.svelte';
	import ThemeTerritories from '$lib/components/toolkit/ThemeTerritories.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();
</script>

<Seo
	title="Toolkit | Jason Warren"
	description="How the toolkit grew and the themes the work returns to: a timeline of when each language, framework and runtime first entered the work, and the territories the projects cluster into."
/>

<div class="page">
	<header class="page__header">
		<h1>Toolkit</h1>
		<p class="page__intro">
			Two views of the same body of work. First, the order each tool actually arrived in, which is
			messier and more opportunistic than any tidy strategy would suggest. Then the themes the work
			keeps returning to, and how often a single project sits in more than one at once.
		</p>
	</header>

	<section class="page__section" aria-labelledby="adoption-heading">
		<header class="page__section-header">
			<h2 id="adoption-heading">When each tool arrived</h2>
			<p>
				Every language, framework and runtime, placed at the moment it first appeared in a project.
				Earliest on the left.
			</p>
		</header>
		<AdoptionTimeline items={data.adoption} provisional={data.provisional} />
	</section>

	<section class="page__section" aria-labelledby="themes-heading">
		<header class="page__section-header">
			<h2 id="themes-heading">Themes the work returns to</h2>
			<p>
				{data.themes.length} territories the projects cluster into. Plenty of them turn up in several
				at once, and that overlap tends to be where the work gets genuinely interesting.
			</p>
		</header>
		<ThemeTerritories themes={data.themes} variant="full" />
	</section>
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-12) var(--layout-padding) var(--space-20);
		display: flex;
		flex-direction: column;
		gap: var(--space-16);
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

	.page__section {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	.page__section-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.page__section-header h2 {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.page__section-header p {
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		line-height: 1.65;
		max-width: var(--measure);
		margin: 0;
	}
</style>
