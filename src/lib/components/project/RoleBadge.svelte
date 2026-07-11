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

<span class="role-badge role-badge--{role}" aria-label="Role: {labels[role]}">
	{labels[role]}
</span>

<style>
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
	}

	.role-badge--solo {
		color: var(--color-solo-text);
		background-color: var(--color-solo-bg);
	}

	.role-badge--lead {
		color: var(--color-lead-text);
		background-color: var(--color-lead-bg);
	}

	.role-badge--collaborator {
		color: var(--color-collaborator-text);
		background-color: var(--color-collaborator-bg);
	}
</style>
