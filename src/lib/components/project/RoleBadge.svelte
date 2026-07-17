<script lang="ts">
	import type { ProjectRole } from '$lib/data/types.js';

	interface Props {
		role: ProjectRole;
	}

	let { role }: Props = $props();

	const labels: Record<ProjectRole, string> = {
		solo: 'Solo',
		lead: 'Lead',
		collaborator: 'Collaborator'
	};
</script>

<span class="role-badge" aria-label="Role: {labels[role]}">
	{labels[role]}
</span>

<style>
	/* Neutral paper pill: the word does the work (colour-system.md §5,
	   roles register). Three hues left the census with this change. */
	.role-badge {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: var(--text-apparatus);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: var(--space-badge);
		border-radius: var(--radius-full);
		white-space: nowrap;
		color: var(--color-text-subtle);
		background-color: transparent;
		border: 1px solid var(--color-border-strong);
	}
</style>
