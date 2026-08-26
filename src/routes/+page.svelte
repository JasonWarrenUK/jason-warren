<script lang="ts">
	import { browser } from '$app/environment';
	import AudienceToggle from '$lib/components/hero/AudienceToggle.svelte';
	import HomePlain from '$lib/components/hero/HomePlain.svelte';
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
	import {
		type Audience,
		AUDIENCE_STORAGE_KEY,
		DEFAULT_AUDIENCE,
		parseAudience
	} from '$lib/audience.js';

	let { data } = $props();

	/** Which version of the page to show.
	 * Prerender and first paint use the default;
	 * the stored choice is applied after mount so that:
	 * - server and client markup agree
	 * - hydration has nothing to reconcile
	 */
	let audience = $state<Audience>(DEFAULT_AUDIENCE);

	$effect(() => {
		// audience checker
		if (!browser) return;

		try {
			audience = parseAudience(localStorage.getItem(AUDIENCE_STORAGE_KEY));
		} catch (_) {}
	});

	function chooseAudience(next: Audience): void {
		audience = next;
		try {
			localStorage.setItem(AUDIENCE_STORAGE_KEY, next);
		} catch (_) {}
	}

	const personLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Person',
		name: AUTHOR,
		url: SITE_URL,
		jobTitle: 'Developer',
		sameAs: [GITHUB_PROFILE_URL, BLUESKY_URL]
	});
</script>

<Seo title="Jason Warren • Developer Goblin" description={DEFAULT_DESCRIPTION} />

<svelte:head>
	{@html `<script type="application/ld+json">${personLd}</script>`}
</svelte:head>

<div class="page">
	<header class="page__intro">
		<h1 class="page__name">Jason Warren</h1>
		{#if audience === 'developer'}
			<p class="page__bio">
				I build data models that make complex things easy to use. The hard part is finding the
				representation that's faithful to the world and tractable for the application on top of it.
			</p>
		{:else}
			<p class="page__bio">
				I write software; I'm particularly interested in the part of it that decides how to
				represent the real world in a way that machines can understand.
			</p>
		{/if}

		<AudienceToggle {audience} onchange={chooseAudience} />
	</header>

	{#if audience === 'developer'}
		<HeroBreadth />

		<HeroRotation pool={data.heroPool} count={data.heroCount} />

		{#if data.engineThreads.length > 0}
			<EngineThread threads={data.engineThreads} />
		{/if}

		<ThemeTerritories themes={data.themes} variant="compact" />
	{:else}
		<HomePlain pool={data.plainProjects} />
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

	/* .page__name is the <h1>; size/weight/line-height/tracking come from the
	   global h1 clamp. Only the bio lead keeps a per-block treatment below. */

	.page__bio {
		font-size: clamp(16px, 2vw, 19px);
		color: var(--color-text-subtle);
		line-height: 1.7;
		max-width: var(--measure-lead);
		margin: var(--space-2) 0 var(--space-4);
	}
</style>
