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
		archived: 'Archived',
		uncategorised: 'Uncategorised'
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
		font-family: var(--font-mono);
		font-size: var(--text-apparatus);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: var(--space-badge);
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

	.status-badge--uncategorised {
		color: var(--color-uncategorised-text);
		background-color: var(--color-uncategorised-bg);
	}
</style>
