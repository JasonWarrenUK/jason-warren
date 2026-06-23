<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import type { ThemeWithProjects } from '$lib/data/themes.js';
	import { writeParam } from '$lib/url-write.js';
	import SelectionModal from '$lib/components/ui/SelectionModal.svelte';
	import { validatePin, nextPinValue, projectHref } from '$lib/selection.js';

	interface Props {
		themes: ThemeWithProjects[];
		/** 'full' = cards with project chips + cross-highlight; 'compact' = teaser. */
		variant?: 'full' | 'compact';
	}

	let { themes, variant = 'full' }: Props = $props();

	// The project the reader is pointing at. Highlighting it in every territory it
	// belongs to is the payoff: it shows how much the work overlaps across themes.
	let activeSlug = $state<string | null>(null);

	// How many territories each project appears in, so multi-theme projects can be
	// marked as the connective tissue they are. Its keys also serve as the set of
	// slugs present, used to validate the pin below.
	const themeCountBySlug = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const theme of themes) {
			for (const project of theme.projects) {
				counts.set(project.slug, (counts.get(project.slug) ?? 0) + 1);
			}
		}
		return counts;
	});

	// URL search params are only readable in the browser; during prerender we
	// show the full view so the prerendered HTML is always complete.
	// Only the full variant participates: the compact home teaser stays inert.
	const pinnedParam = $derived(
		browser && variant === 'full' ? $page.url.searchParams.get('project') : null
	);
	// Validate the pin via the shared helper: stale / absent / compact variant → null
	// so a dead link never dims the whole view with nothing highlighted.
	const pinnedSlug = $derived(
		validatePin(pinnedParam, (slug) => themeCountBySlug.has(slug))
	);
	// Hover overrides the pin; releasing the pointer/focus falls back to it.
	const effectiveSlug = $derived(activeSlug ?? pinnedSlug);

	// Modal state: the project chip the user clicked (full variant only).
	let selected = $state<{ slug: string; name: string } | null>(null);

	function openModal(slug: string, name: string): void {
		selected = { slug, name };
	}

	function pinSelected(): void {
		if (!selected) return;
		writeParam('project', nextPinValue(pinnedSlug, selected.slug));
		selected = null;
	}
</script>

{#if variant === 'compact'}
	<section class="themes-teaser" aria-label="Themes across the work">
		<header class="themes-teaser__header">
			<h2 class="themes-teaser__title">Themes the work returns to</h2>
			<p class="themes-teaser__strapline">
				The same {themes.length} territories come up again and again, regardless of what I think I am
				sitting down to build: narrative engines, graph-native data, tools shaped around how people actually
				think.
			</p>
		</header>

		<ul class="themes-teaser__list" role="list">
			{#each themes as theme (theme.id)}
				<li class="themes-teaser__item">
					<span class="themes-teaser__name">{theme.name}</span>
					<span class="themes-teaser__count">{theme.projects.length}</span>
				</li>
			{/each}
		</ul>

		<a href="{base}/toolkit" class="themes-teaser__cta">Explore the toolkit →</a>
	</section>
{:else}
	<section class="themes" aria-label="Theme territories">
		<div class="themes__grid">
			{#each themes as theme (theme.id)}
				<article class="themes__card">
					<h3 class="themes__name">{theme.name}</h3>
					<p class="themes__blurb">{theme.blurb}</p>

					<ul class="themes__chips" role="list">
						{#each theme.projects as project (project.slug)}
							{@const spans = (themeCountBySlug.get(project.slug) ?? 1) > 1}
							<li>
								<a
									href="{base}/projects/{project.slug}"
									class="themes__chip"
									class:themes__chip--active={effectiveSlug === project.slug}
									class:themes__chip--pinned={pinnedSlug === project.slug}
									class:themes__chip--spanning={spans}
									class:themes__chip--dimmed={effectiveSlug !== null &&
										effectiveSlug !== project.slug}
									onclick={(e) => { e.preventDefault(); openModal(project.slug, project.name); }}
									onpointerenter={() => (activeSlug = project.slug)}
									onpointerleave={() => (activeSlug = null)}
									onfocus={() => (activeSlug = project.slug)}
									onblur={() => (activeSlug = null)}
								>
									{project.name}
									{#if spans}
										<span class="themes__chip-mark" aria-hidden="true">◆</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</article>
			{/each}
		</div>

		<p class="themes__note">
			<span class="themes__note-mark" aria-hidden="true">◆</span>
			Diamonds mark projects that span more than one territory. Hover a project to trace it across themes.
		</p>
	</section>

	{#if selected !== null}
		{@const isPinned = pinnedSlug === selected.slug}
		<SelectionModal
			open={true}
			title={selected.name}
			onclose={() => (selected = null)}
		>
			<button
				type="button"
				class="modal-action modal-action--primary"
				onclick={pinSelected}
			>
				{isPinned ? 'Unpin' : 'Pin this project'}
			</button>
			<a
				href={projectHref(base, selected.slug)}
				class="modal-action modal-action--secondary"
			>
				Go to project
			</a>
		</SelectionModal>
	{/if}
{/if}

<style>
	/* --- Full variant ---------------------------------------------------- */
	.themes {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.themes__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		gap: var(--space-5);
	}

	.themes__card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-6);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.themes__name {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.25;
	}

	.themes__blurb {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.6;
		margin: 0;
	}

	.themes__chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: auto;
		padding: 0;
	}

	.themes__chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-subtle);
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		text-decoration: none;
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			opacity var(--transition-fast);
	}

	.themes__chip:hover,
	.themes__chip--active {
		color: var(--color-primary-text);
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary-light);
	}

	.themes__chip--dimmed {
		opacity: 0.32;
	}

	.themes__chip-mark {
		font-size: 0.6em;
		color: var(--color-primary);
	}

	.themes__chip--spanning {
		border-color: var(--color-border-strong);
	}

	/* Pinned chip: stays highlighted after hover leaves */
	.themes__chip--pinned {
		color: var(--color-primary-text);
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary);
	}

	.themes__chip:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* Modal action buttons */
	.modal-action {
		display: block;
		width: 100%;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.modal-action:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	.modal-action--primary {
		background-color: var(--color-primary-bg);
		border: 1px solid var(--color-primary);
		color: var(--color-primary-text);
	}

	.modal-action--primary:hover {
		background-color: var(--color-primary);
		color: var(--color-surface);
	}

	.modal-action--secondary {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text-subtle);
	}

	.modal-action--secondary:hover {
		border-color: var(--color-border-strong);
		color: var(--color-text);
	}

	.themes__note {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.themes__note-mark {
		color: var(--color-primary);
	}

	/* --- Compact teaser variant ------------------------------------------ */
	.themes-teaser {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-12) 0;
		border-top: 1px solid var(--color-border);
	}

	.themes-teaser__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.themes-teaser__title {
		font-size: var(--text-3xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.themes-teaser__strapline {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		max-width: 52rem;
		margin: 0;
	}

	.themes-teaser__list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
		gap: var(--space-3);
		padding: 0;
	}

	.themes-teaser__item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.themes-teaser__name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
	}

	.themes-teaser__count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.6rem;
		height: 1.6rem;
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-primary-text);
		background-color: var(--color-primary-bg);
		border-radius: var(--radius-full);
	}

	.themes-teaser__cta {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary-text);
		text-decoration: none;
		transition: color var(--transition-fast);
		align-self: flex-start;
	}

	.themes-teaser__cta:hover {
		color: var(--color-primary);
	}
</style>
