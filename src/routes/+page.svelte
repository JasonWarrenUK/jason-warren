<script lang="ts">
	import HeroBreadth from '$lib/components/hero/HeroBreadth.svelte';
	import FlagshipDeepDive from '$lib/components/hero/FlagshipDeepDive.svelte';
	import EngineThread from '$lib/components/thread/EngineThread.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';
	import { AUTHOR, SITE_URL, GITHUB_URL, BLUESKY_URL, DEFAULT_DESCRIPTION } from '$lib/config.js';

	let { data } = $props();

	const personLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Person',
		name: AUTHOR,
		url: SITE_URL,
		jobTitle: 'Full-stack developer',
		sameAs: [GITHUB_URL, BLUESKY_URL]
	});
</script>

<Seo title="Jason Warren, Developer" description={DEFAULT_DESCRIPTION} />

<svelte:head>
	{@html `<script type="application/ld+json">${personLd}</script>`}
</svelte:head>

<div class="page">
	<header class="page__intro">
		<h1 class="page__name">Jason Warren</h1>
		<p class="page__role">Full-stack developer</p>
		<p class="page__bio">
			I build things across the stack: terminal tools in Go, native desktop apps in Tauri,
			graph-native data models in Neo4j, interactive fiction engines in TypeScript. The range is
			deliberate. Different problems call for different tools.
		</p>
	</header>

	<HeroBreadth />

	<FlagshipDeepDive projects={data.flagships} />

	{#if data.engineThreads.length > 0}
		<EngineThread threads={data.engineThreads} />
	{/if}
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
		font-size: var(--text-5xl);
		font-weight: 700;
		line-height: 1.05;
		color: var(--color-text);
		letter-spacing: -0.02em;
	}

	.page__role {
		font-size: var(--text-xl);
		color: var(--color-primary-text);
		font-weight: 600;
		margin: 0;
	}

	.page__bio {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		line-height: 1.7;
		max-width: 56rem;
		margin: var(--space-2) 0 0;
	}
</style>
