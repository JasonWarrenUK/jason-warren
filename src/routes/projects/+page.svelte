<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { ProjectKind, ProjectProgress, ProjectRole, ProjectTrack } from '$lib/data/types.js';
	import { filterProjects, type ProjectFlag } from '$lib/data/queries.js';
	import ProjectGrid from '$lib/components/project/ProjectGrid.svelte';
	import FilterBar from '$lib/components/filter/FilterBar.svelte';
	import SearchInput from '$lib/components/filter/SearchInput.svelte';
	import Seo from '$lib/components/seo/Seo.svelte';
	import { writeParam } from '$lib/url-write.js';
	import { parseSet, serialiseSet, encodeTagSet, decodeTagSet } from '$lib/url-state.js';

	let { data } = $props();

	// URL search params are only readable in the browser; during prerender we
	// show all projects so the prerendered HTML is always complete.
	const activeTags = $derived(
		browser ? decodeTagSet($page.url.searchParams.get('tags')) : new Set<string>()
	);
	const activeRoles = $derived(
		browser ? parseSet<ProjectRole>($page.url.searchParams.get('roles')) : new Set<ProjectRole>()
	);
	const activeKinds = $derived(
		browser ? parseSet<ProjectKind>($page.url.searchParams.get('types')) : new Set<ProjectKind>()
	);
	const activeTracks = $derived(
		browser ? parseSet<ProjectTrack>($page.url.searchParams.get('track')) : new Set<ProjectTrack>()
	);
	const activeProgresses = $derived(
		browser
			? parseSet<ProjectProgress>($page.url.searchParams.get('progress'))
			: new Set<ProjectProgress>()
	);
	const activeFlags = $derived(
		browser ? parseSet<ProjectFlag>($page.url.searchParams.get('flags')) : new Set<ProjectFlag>()
	);
	const activeQuery = $derived(browser ? ($page.url.searchParams.get('q') ?? '') : '');

	function toggleParam<T extends string>(
		current: Set<T>,
		value: T,
		paramKey: string,
		encode: (s: Set<T>) => string | null = serialiseSet
	): void {
		const next = new Set(current);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		writeParam(paramKey, encode(next));
	}

	const filtered = $derived(
		filterProjects({
			tags: activeTags,
			roles: activeRoles,
			kinds: activeKinds,
			tracks: activeTracks,
			progresses: activeProgresses,
			flags: activeFlags,
			query: activeQuery || undefined
		}).sort((a, b) => (b.commitAnyLast ?? '').localeCompare(a.commitAnyLast ?? ''))
	);

	// Persist filters across navigation: returning from a project (or the
	// in-page breadcrumb) lands on a bare /projects URL, so restore the last
	// query string from sessionStorage. The `restored` flag guards the restore
	// so the save branch cannot clobber the stored value before it is read.
	const FILTERS_KEY = 'projects:filters';
	let restored = false;
	$effect(() => {
		const search = $page.url.search;
		if (!restored) {
			restored = true;
			const saved = sessionStorage.getItem(FILTERS_KEY);
			if (!search && saved) {
				goto(`${base}/projects${saved}`, { replaceState: true, keepFocus: true });
				return;
			}
		}
		sessionStorage.setItem(FILTERS_KEY, search);
	});
</script>

<Seo
	title="Projects | Jason Warren"
	description="Every project with its real git metrics: commit counts, churn and first-to-last dates, measured by Drift and validated against a schema."
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
		<SearchInput value={activeQuery} onchange={(q) => writeParam('q', q)} />

		<FilterBar
			kinds={data.kinds}
			{activeKinds}
			onkind={(kind) => toggleParam(activeKinds, kind, 'types')}
			presentFlags={data.presentFlags}
			{activeTracks}
			ontrack={(track) => toggleParam(activeTracks, track, 'track')}
			{activeProgresses}
			onprogress={(progress) => toggleParam(activeProgresses, progress, 'progress')}
			{activeFlags}
			onflag={(flag) => toggleParam(activeFlags, flag, 'flags')}
			tagsByKind={data.tagsByKind}
			{activeTags}
			{activeRoles}
			ontag={(tag) => toggleParam(activeTags, tag, 'tags', encodeTagSet)}
			onrole={(role) => toggleParam(activeRoles, role, 'roles')}
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
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.page__grid {
		grid-area: grid;
	}
</style>
