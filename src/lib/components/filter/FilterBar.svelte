<script lang="ts">
	import type {
		ProjectKind,
		ProjectProgress,
		ProjectRole,
		ProjectTrack,
		TagKind
	} from '$lib/data/types.js';
	import type { ProjectFlag } from '$lib/data/queries.js';
	import {
		trackLabel,
		trackOrder,
		progressLabel,
		progressOrder
	} from '$lib/components/graph/graph-style.js';
	import FilterChip from './FilterChip.svelte';

	let open = $state(false);
	/* $effect(() => { // Expanded on desktop
		// Collapsed on mobile, expanded on desktop. Default closed so there is no
		// flash of a long list on small screens; desktop expands on mount.
		const mediaQuery = window.matchMedia('(min-width: 48rem)');

		const apply = (): void => { open = mediaQuery.matches };
		apply();

		mediaQuery.addEventListener('change', apply);

		return () => mediaQuery.removeEventListener('change', apply);
	}); */

	interface Props {
		/** All ProjectKind values present in the registry. */
		kinds: ProjectKind[];
		/** Currently active kind filters. */
		activeKinds: Set<ProjectKind>;
		onkind: (kind: ProjectKind) => void;
		/** Which boolean stage flags the registry can actually match. */
		presentFlags: Record<ProjectFlag, boolean>;
		activeTracks: Set<ProjectTrack>;
		ontrack: (track: ProjectTrack) => void;
		activeProgresses: Set<ProjectProgress>;
		onprogress: (progress: ProjectProgress) => void;
		activeFlags: Set<ProjectFlag>;
		onflag: (flag: ProjectFlag) => void;
		/** Tag labels grouped by TagKind. */
		tagsByKind: Record<TagKind, string[]>;
		/** Currently active tag filters. */
		activeTags: Set<string>;
		/** Currently active role filters. */
		activeRoles: Set<ProjectRole>;
		ontag: (tag: string) => void;
		onrole: (role: ProjectRole) => void;
	}

	let {
		kinds,
		activeKinds,
		onkind,
		presentFlags,
		activeTracks,
		ontrack,
		activeProgresses,
		onprogress,
		activeFlags,
		onflag,
		tagsByKind,
		activeTags,
		activeRoles,
		ontag,
		onrole
	}: Props = $props();

	const roles: ProjectRole[] = ['solo', 'lead', 'collaborator'];

	const roleLabels: Record<ProjectRole, string> = {
		solo: 'Solo',
		lead: 'Lead',
		collaborator: 'Collaborator'
	};

	const kindLabels: Record<ProjectKind, string> = {
		app: 'App',
		game: 'Game',
		website: 'Website',
		toy: 'Toy',
		library: 'Library',
		tool: 'Tool',
		tui: 'TUI',
		repo: 'Repo'
	};

	/** Flag chip labels; the flags themselves come from queries.ProjectFlag. */
	const flagLabels: Record<ProjectFlag, string> = {
		deployed: 'Deployed',
		archived: 'Archived'
	};

	const flagOrder: ProjectFlag[] = ['deployed', 'archived'];

	const tagKindLabels: Record<TagKind, string> = {
		language: 'Language',
		framework: 'Framework',
		data: 'Data',
		ai: 'AI / ML',
		concept: 'Concept',
		tool: 'Tool',
		runtime: 'Runtime'
	};

	const tagKindOrder: TagKind[] = [
		'language',
		'framework',
		'data',
		'ai',
		'concept',
		'tool',
		'runtime'
	];
</script>

<details class="filter-bar__all" bind:open>
	<summary class="filter-bar__summary">Filters</summary>
	<div class="filter-bar" role="group" aria-label="Filter projects">
		<details class="filter-group" open={activeRoles.size > 0}>
			<summary class="filter-group__summary">Role</summary>
			<div class="filter-group__chips">
				{#each roles as role (role)}
					<FilterChip
						label={roleLabels[role]}
						active={activeRoles.has(role)}
						onclick={() => onrole(role)}
					/>
				{/each}
			</div>
		</details>

		{#if kinds.length > 0}
			<details class="filter-group" open={activeKinds.size > 0}>
				<summary class="filter-group__summary">Type</summary>
				<div class="filter-group__chips">
					{#each kinds.sort((a, b) => kindLabels[a].localeCompare(kindLabels[b])) as kind (kind)}
						<FilterChip
							label={kindLabels[kind]}
							active={activeKinds.has(kind)}
							onclick={() => onkind(kind)}
						/>
					{/each}
				</div>
			</details>
		{/if}

		<details class="filter-group" open={activeTracks.size > 0}>
			<summary class="filter-group__summary">Track</summary>
			<div class="filter-group__chips">
				{#each trackOrder as track (track)}
					<FilterChip
						label={trackLabel[track]}
						active={activeTracks.has(track)}
						onclick={() => ontrack(track)}
					/>
				{/each}
			</div>
		</details>

		<details class="filter-group" open={activeProgresses.size > 0}>
			<summary class="filter-group__summary">Progress</summary>
			<div class="filter-group__chips">
				{#each progressOrder as progress (progress)}
					<FilterChip
						label={progressLabel[progress]}
						active={activeProgresses.has(progress)}
						onclick={() => onprogress(progress)}
					/>
				{/each}
			</div>
		</details>

		{#if flagOrder.some((flag) => presentFlags[flag])}
			<details class="filter-group" open={activeFlags.size > 0}>
				<summary class="filter-group__summary">Flags</summary>
				<div class="filter-group__chips">
					{#each flagOrder.filter((flag) => presentFlags[flag]) as flag (flag)}
						<FilterChip
							label={flagLabels[flag]}
							active={activeFlags.has(flag)}
							onclick={() => onflag(flag)}
						/>
					{/each}
				</div>
			</details>
		{/if}

		{#each tagKindOrder as kind (kind)}
			{@const tags = tagsByKind[kind]}
			{#if tags.length > 0}
				<details class="filter-group" open={tags.some((t) => activeTags.has(t))}>
					<summary class="filter-group__summary">{tagKindLabels[kind]}</summary>
					<div class="filter-group__chips">
						{#each tags as tag (tag)}
							<FilterChip label={tag} active={activeTags.has(tag)} onclick={() => ontag(tag)} />
						{/each}
					</div>
				</details>
			{/if}
		{/each}
	</div>
</details>

<style>
	.filter-bar__all {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.filter-bar__summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-text);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		list-style: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-raised);
		transition:
			color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
		user-select: none;
	}

	/* Remove default disclosure triangle in WebKit */
	.filter-bar__summary::-webkit-details-marker {
		display: none;
	}

	.filter-bar__summary:hover {
		background-color: var(--color-surface);
	}

	.filter-bar__summary:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* Chevron via pseudo-element */
	.filter-bar__summary::after {
		content: '';
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg);
		transition: transform var(--dur-micro) var(--ease-standard);
		flex-shrink: 0;
	}

	.filter-bar__all[open] .filter-bar__summary::after {
		transform: rotate(-135deg);
	}

	.filter-bar {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.filter-group {
		border-radius: var(--radius-md);
	}

	.filter-group[open] {
		padding-bottom: var(--space-3);
	}

	.filter-group__summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-1);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		list-style: none;
		border-radius: var(--radius-md);
		transition:
			color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
		user-select: none;
	}

	/* Remove default disclosure triangle in WebKit */
	.filter-group__summary::-webkit-details-marker {
		display: none;
	}

	.filter-group__summary:hover {
		color: var(--color-text);
		background-color: var(--color-surface);
	}

	.filter-group__summary:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* Chevron via pseudo-element */
	.filter-group__summary::after {
		content: '';
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg);
		transition: transform var(--dur-micro) var(--ease-standard);
		flex-shrink: 0;
	}

	.filter-group[open] .filter-group__summary::after {
		transform: rotate(-135deg);
	}

	.filter-group__chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-1) 0;
	}
</style>
