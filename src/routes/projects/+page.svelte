<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { ProjectKind, ProjectRole, ProjectStatus } from '$lib/data/types.js';
	import { filterProjects } from '$lib/data/queries.js';
	import ProjectGrid from '$lib/components/project/ProjectGrid.svelte';
	import FilterBar from '$lib/components/filter/FilterBar.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';

	let { data } = $props();

	// URL search params are only readable in the browser; during prerender we
	// show all projects so the prerendered HTML is always complete.
	const activeTag = $derived(browser ? $page.url.searchParams.get('tag') : null);
	const activeRole = $derived(
		browser ? ($page.url.searchParams.get('role') as ProjectRole | null) : null
	);
	const activeKind = $derived(
		browser ? ($page.url.searchParams.get('type') as ProjectKind | null) : null
	);
	const activeStatus = $derived(
		browser ? ($page.url.searchParams.get('status') as ProjectStatus | null) : null
	);

	const filtered = $derived(
		filterProjects({
			tag: activeTag ?? undefined,
			role: activeRole ?? undefined,
			kind: activeKind ?? undefined,
			status: activeStatus ?? undefined
		}).sort((a, b) => (b.lastCommit ?? '').localeCompare(a.lastCommit ?? ''))
	);

	function setParam(key: string, value: string | null): void {
		const url = new URL($page.url);
		if (value === null) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, value);
		}
		goto(url.toString(), { replaceState: true, keepFocus: true });
	}
</script>

<Seo
	title="Projects | Jason Warren"
	description="All projects by Jason Warren: solo builds, team contributions, and the libraries extracted from both."
/>

<div class="page">
	<header class="page__header">
		<h1>Projects</h1>
		<p class="page__count">
			{filtered.length} of {data.projects.length}
			{filtered.length === 1 ? 'project' : 'projects'}
		</p>
	</header>

	<aside class="page__filters">
		<FilterBar
			kinds={data.kinds}
			{activeKind}
			onkind={(kind) => setParam('type', kind)}
			statuses={data.statuses}
			{activeStatus}
			onstatus={(s) => setParam('status', s)}
			tagsByKind={data.tagsByKind}
			{activeTag}
			{activeRole}
			ontag={(tag) => setParam('tag', tag)}
			onrole={(role) => setParam('role', role)}
		/>
	</aside>

	<main class="page__grid">
		<ProjectGrid projects={filtered} />
	</main>
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-12) var(--layout-padding);
		display: grid;
		grid-template-areas:
			'header'
			'filters'
			'grid';
		gap: var(--space-8);
	}

	.page__header {
		grid-area: header;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.page__count {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.page__filters {
		grid-area: filters;
	}

	.page__grid {
		grid-area: grid;
	}
</style>
