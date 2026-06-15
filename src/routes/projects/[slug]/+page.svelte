<script lang="ts">
	import { base } from '$app/paths';
	import StatusBadge from '$lib/components/project/StatusBadge.svelte';
	import RoleBadge from '$lib/components/project/RoleBadge.svelte';
	import TechTagList from '$lib/components/project/TechTagList.svelte';
	import HighlightsList from '$lib/components/project/HighlightsList.svelte';
	import MetricsPanel from '$lib/components/project/MetricsPanel.svelte';
	import ContributionNote from '$lib/components/project/ContributionNote.svelte';
	import RelatedProjects from '$lib/components/project/RelatedProjects.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.project.name} | Jason Warren</title>
	<meta name="description" content={data.project.tagline} />
</svelte:head>

<div class="page">
	<nav class="page__breadcrumb" aria-label="Breadcrumb">
		<a href="{base}/projects">← All projects</a>
	</nav>

	<header class="page__header">
		<div class="page__header-top">
			<h1 class="page__title">{data.project.name}</h1>
			<div class="page__badges">
				<StatusBadge status={data.project.status} />
				<RoleBadge role={data.project.contribution.role} />
			</div>
		</div>

		<p class="page__tagline">{data.project.tagline}</p>

		<div class="page__links">
			<ExternalLink href={data.project.repoUrl} label="Repository" variant="repo" />
			{#if data.project.secondaryRepoUrl}
				<ExternalLink href={data.project.secondaryRepoUrl} label="Companion repo" variant="repo" />
			{/if}
			{#if data.project.liveUrl}
				<ExternalLink href={data.project.liveUrl} label="Live site" variant="live" />
			{/if}
		</div>

		<TechTagList tags={data.project.tags} />
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

			{#if data.project.relationships.length > 0}
				<RelatedProjects relationships={data.project.relationships} />
			{/if}
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

	.page__title {
		font-size: var(--text-4xl);
		font-weight: 700;
		line-height: 1.1;
	}

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
		max-width: 56rem;
	}

	.page__links {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
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
		max-width: 64ch;
	}
</style>
