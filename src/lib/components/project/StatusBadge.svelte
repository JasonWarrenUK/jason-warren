<script lang="ts">
	import type { ProjectStatus } from '$lib/data/types.js';

	interface Props {
		status: ProjectStatus;
	}

	let { status }: Props = $props();

	/** Unified label vocabulary — matches filter chip labels exactly. */
	const labels: Record<ProjectStatus, string> = {
		live: 'Live',
		wip: 'Active',
		finished: 'Complete',
		prototype: 'Prototype',
		archived: 'Archived'
	};
</script>

<span class="status-badge status-badge--{status}" aria-label="Status: {labels[status]}">
	{labels[status]}
</span>

<style>
	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 2px var(--space-2);
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	.status-badge--live {
		color: var(--color-live-text);
		background-color: var(--color-live-bg);
	}

	.status-badge--wip {
		color: var(--color-wip-text);
		background-color: var(--color-wip-bg);
	}

	.status-badge--finished {
		color: var(--color-finished-text);
		background-color: var(--color-finished-bg);
	}

	.status-badge--prototype {
		color: var(--color-prototype-text);
		background-color: var(--color-prototype-bg);
	}

	.status-badge--archived {
		color: var(--color-archived-text);
		background-color: var(--color-archived-bg);
	}
</style>
