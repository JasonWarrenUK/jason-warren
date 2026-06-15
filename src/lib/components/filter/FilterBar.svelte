<script lang="ts">
	import type { ProjectKind, ProjectRole, ProjectStatus, TagKind } from '$lib/data/types.js';
	import FilterChip from './FilterChip.svelte';

	interface Props {
		/** All ProjectKind values present in the registry. */
		kinds: ProjectKind[];
		/** Currently active kind filter, or null. */
		activeKind: ProjectKind | null;
		onkind: (kind: ProjectKind | null) => void;
		/** All ProjectStatus values present in the registry. */
		statuses: ProjectStatus[];
		/** Currently active status filter, or null. */
		activeStatus: ProjectStatus | null;
		onstatus: (status: ProjectStatus | null) => void;
		/** Tag labels grouped by TagKind. */
		tagsByKind: Record<TagKind, string[]>;
		/** Currently active tag filter, or null. */
		activeTag: string | null;
		/** Currently active role filter, or null. */
		activeRole: ProjectRole | null;
		ontag: (tag: string | null) => void;
		onrole: (role: ProjectRole | null) => void;
	}

	let {
		kinds,
		activeKind,
		onkind,
		statuses,
		activeStatus,
		onstatus,
		tagsByKind,
		activeTag,
		activeRole,
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
		tui: 'TUI'
	};

	/** Unified status labels — matches StatusBadge exactly. */
	const statusLabels: Record<ProjectStatus, string> = {
		live: 'Live',
		wip: 'Active',
		finished: 'Complete',
		prototype: 'Prototype',
		archived: 'Archived'
	};

	/** Display order for status chips. */
	const statusOrder: ProjectStatus[] = ['live', 'wip', 'finished', 'prototype', 'archived'];

	const tagKindLabels: Record<TagKind, string> = {
		language: 'Language',
		framework: 'Framework',
		domain: 'Domain',
		runtime: 'Runtime'
	};

	const tagKindOrder: TagKind[] = ['language', 'framework', 'domain', 'runtime'];
</script>

<div class="filter-bar" role="group" aria-label="Filter projects">
	<div class="filter-group">
		<span class="filter-group__label">Role</span>
		<div class="filter-group__chips">
			{#each roles as role (role)}
				<FilterChip
					label={roleLabels[role]}
					active={activeRole === role}
					onclick={() => onrole(activeRole === role ? null : role)}
				/>
			{/each}
		</div>
	</div>

	{#if kinds.length > 0}
		<div class="filter-group">
			<span class="filter-group__label">Type</span>
			<div class="filter-group__chips">
				{#each kinds.sort((a, b) => kindLabels[a].localeCompare(kindLabels[b])) as kind (kind)}
					<FilterChip
						label={kindLabels[kind]}
						active={activeKind === kind}
						onclick={() => onkind(activeKind === kind ? null : kind)}
					/>
				{/each}
			</div>
		</div>
	{/if}

	{#if statuses.length > 0}
		<div class="filter-group">
			<span class="filter-group__label">Status</span>
			<div class="filter-group__chips">
				{#each statusOrder.filter((s) => statuses.includes(s)) as s (s)}
					<FilterChip
						label={statusLabels[s]}
						active={activeStatus === s}
						onclick={() => onstatus(activeStatus === s ? null : s)}
					/>
				{/each}
			</div>
		</div>
	{/if}

	{#each tagKindOrder as kind (kind)}
		{@const tags = tagsByKind[kind]}
		{#if tags.length > 0}
			<div class="filter-group">
				<span class="filter-group__label">{tagKindLabels[kind]}</span>
				<div class="filter-group__chips">
					{#each tags as tag (tag)}
						<FilterChip
							label={tag}
							active={activeTag === tag}
							onclick={() => ontag(activeTag === tag ? null : tag)}
						/>
					{/each}
				</div>
			</div>
		{/if}
	{/each}
</div>

<style>
	.filter-bar {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.filter-group {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.filter-group__label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		min-width: 6rem;
		flex-shrink: 0;
	}

	.filter-group__chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
