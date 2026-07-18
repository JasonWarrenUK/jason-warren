<script lang="ts">
	import { base } from '$app/paths';
	import StageBadge from '$lib/components/project/StageBadge.svelte';
	import RoleBadge from '$lib/components/project/RoleBadge.svelte';
	import TechTagList from '$lib/components/project/TechTagList.svelte';
	import HighlightsList from '$lib/components/project/HighlightsList.svelte';
	import MetricsPanel from '$lib/components/project/MetricsPanel.svelte';
	import ContributionNote from '$lib/components/project/ContributionNote.svelte';
	import RelatedProjects from '$lib/components/project/RelatedProjects.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';
	import { AUTHOR, SITE_URL } from '$lib/config.js';
	import { viewHref } from '$lib/selection.js';

	let { data } = $props();

	const projectLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'SoftwareSourceCode',
			name: data.project.name,
			description: data.project.tagline,
			codeRepository: data.project.repoUrl,
			url: `${SITE_URL}/projects/${data.project.slug}`,
			author: { '@type': 'Person', name: AUTHOR },
			programmingLanguage: data.project.tags
				.filter((tag) => tag.kind === 'language')
				.map((tag) => tag.label)
		})
	);
</script>

<Seo
	title="{data.project.name} | Jason Warren"
	description={data.project.tagline}
	image="{SITE_URL}/og/{data.project.slug}.png"
	type="article"
/>

<svelte:head>
	{@html `<script type="application/ld+json">${projectLd}</script>`}
</svelte:head>

<div class="page">
	<nav class="page__breadcrumb" aria-label="Breadcrumb">
		<a href="{base}/projects">← All projects</a>
	</nav>

	<div class="page__banner">
		<img
			src="{base}/og/{data.project.slug}.png"
			alt="{data.project.name} social card"
			width="1200"
			height="630"
			loading="eager"
		/>
	</div>

	<header class="page__header">
		<div class="page__header-top">
			<h1 class="page__title">{data.project.name}</h1>
			<div class="page__badges">
				<StageBadge project={data.project} />
				<RoleBadge role={data.project.contribution.role} />
			</div>
		</div>

		<p class="page__tagline">{data.project.tagline}</p>

		<div class="page__links">
			<ExternalLink href={data.project.repoUrl} label="Repository" variant="repo" />
			{#each data.project.companionRepoUrls as companionRepoUrl, index}
				<ExternalLink
					href={companionRepoUrl}
					label={index === 0 ? 'Companion repo' : `Companion repo ${index + 1}`}
					variant="repo"
				/>
			{/each}
			{#if data.project.liveUrl}
				<ExternalLink href={data.project.liveUrl} label="Live site" variant="live" />
			{/if}
		</div>

		<TechTagList tags={data.project.tags} />

		<nav class="page__crossviews" aria-label="See this project in other views">
			<a href={viewHref(base, 'map', data.project.slug)} class="page__view-link">View in map</a>
			<a href={viewHref(base, 'timeline', data.project.slug)} class="page__view-link"
				>View in timeline</a
			>
			<a href={viewHref(base, 'toolkit', data.project.slug)} class="page__view-link"
				>View in toolkit</a
			>
		</nav>
	</header>

	<div class="page__body">
		<main class="page__main">
			{#if data.project.description}
				<section class="page__description">
					<h2>About</h2>
					<p>{data.project.description}</p>
				</section>
			{/if}

			<HighlightsList highlights={data.project.highlights} />

			{#if data.project.metrics}
				<MetricsPanel metrics={data.project.metrics} />
			{/if}
		</main>

		<aside class="page__aside">
			<ContributionNote contribution={data.project.contribution} />

			<RelatedProjects slug={data.project.slug} />
		</aside>
	</div>
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-12) var(--layout-padding);
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	/* Pin the breadcrumb just below the sticky site header (3.5rem tall) so it
	   stays reachable while a long case study scrolls underneath. */
	.page__breadcrumb {
		position: sticky;
		top: 3.5rem;
		z-index: 50;
		margin: calc(-1 * var(--space-3)) calc(-1 * var(--layout-padding));
		padding: var(--space-3) var(--layout-padding);
		background-color: var(--color-surface);
	}

	.page__breadcrumb a {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		transition: color var(--transition-fast);
	}

	.page__breadcrumb a:hover {
		color: var(--color-primary-text);
	}

	/* The wrapper owns the aspect ratio (reliable across WebViews); the image
	   fills it, so the banner never crops to a tall sliver. */
	.page__banner {
		display: block;
		width: 100%;
		aspect-ratio: 1200 / 630;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.page__banner img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.page__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.page__header-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	/* .page__title is the <h1>; size/weight/line-height come from the global
	   h1 clamp. */

	.page__badges {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.page__tagline {
		font-size: var(--text-xl);
		color: var(--color-text-subtle);
		line-height: 1.5;
		margin: 0;
		max-width: var(--measure-lead);
	}

	.page__links {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.page__crossviews {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding-top: var(--space-1);
	}

	.page__view-link {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		text-decoration: none;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.page__view-link:hover {
		color: var(--color-primary-text);
		border-color: var(--color-primary-text);
	}

	.page__body {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-10);
	}

	@media (min-width: 56rem) {
		.page__body {
			grid-template-columns: 1fr 20rem;
			align-items: start;
		}
	}

	.page__main {
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	.page__aside {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.page__description {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.page__description h2 {
		font-size: var(--text-xl);
		font-weight: 600;
	}

	.page__description p {
		font-size: var(--text-base);
		line-height: 1.7;
		color: var(--color-text-subtle);
		max-width: var(--measure);
	}
</style>
