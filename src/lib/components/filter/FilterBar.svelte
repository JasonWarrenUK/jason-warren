<script lang="ts">
	import type { ProjectRole } from '$lib/data/types.js';
	import FilterChip from './FilterChip.svelte';

	interface Props {
		/** All tags available across the full project list. */
		allTags: string[];
		/** Currently active tag filter, or null. */
		activeTag: string | null;
		/** Currently active role filter, or null. */
		activeRole: ProjectRole | null;
		ontag: (tag: string | null) => void;
		onrole: (role: ProjectRole | null) => void;
	}

	let { allTags, activeTag, activeRole, ontag, onrole }: Props = $props();

	const roles: ProjectRole[] = ['solo', 'lead', 'collaborator'];

	const roleLabels: Record<ProjectRole, string> = {
		solo: 'Solo',
		lead: 'Lead',
		collaborator: 'Collaborator'
	};
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

	<div class="filter-group">
		<span class="filter-group__label">Technology</span>
		<div class="filter-group__chips">
			{#each allTags as tag (tag)}
				<FilterChip
					label={tag}
					active={activeTag === tag}
					onclick={() => ontag(activeTag === tag ? null : tag)}
				/>
			{/each}
		</div>
	</div>
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
