<script lang="ts">
	import HeroBreadth from '$lib/components/hero/HeroBreadth.svelte';
	import HeroRotation from '$lib/components/hero/HeroRotation.svelte';
	import EngineThread from '$lib/components/thread/EngineThread.svelte';
	import ThemeTerritories from '$lib/components/toolkit/ThemeTerritories.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';
	import {
		AUTHOR,
		SITE_URL,
		GITHUB_PROFILE_URL,
		BLUESKY_URL,
		DEFAULT_DESCRIPTION
	} from '$lib/config.js';

	let { data } = $props();

	const personLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Person',
		name: AUTHOR,
		url: SITE_URL,
		jobTitle: 'Developer',
		sameAs: [GITHUB_PROFILE_URL, BLUESKY_URL]
	});
</script>

<Seo title="Jason Warren, Developer" description={DEFAULT_DESCRIPTION} />

<svelte:head>
	{@html `<script type="application/ld+json">${personLd}</script>`}
</svelte:head>

<div class="page">
	<header class="page__intro">
		<h1 class="page__name">Jason Warren</h1>
		<p class="page__bio">
			I build data models that make complex things easy to use. The hard part is finding the
			representation that's faithful to the world and tractable for the application on top of it.
		</p>
	</header>

	<HeroBreadth />

	<HeroRotation pool={data.heroPool} count={data.heroCount} />

	{#if data.engineThreads.length > 0}
		<EngineThread threads={data.engineThreads} />
	{/if}

	<ThemeTerritories themes={data.themes} variant="compact" />
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-16) var(--layout-padding) var(--space-20);
		display: flex;
		flex-direction: column;
	}

	.page__intro {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-bottom: var(--space-12);
	}

	.page__name {
		font-size: clamp(38px, 5.5vw, 58px);
		font-weight: 600;
		line-height: 1.05;
		color: var(--color-text);
		letter-spacing: -0.015em;
	}

	.page__bio {
		font-size: clamp(16px, 2vw, 19px);
		color: var(--color-text-subtle);
		line-height: 1.7;
		max-width: 56rem;
		margin: var(--space-2) 0 0;
	}
</style>
