<script lang="ts">
	interface Props {
		label: string;
		active: boolean;
		onclick: () => void;
	}

	let { label, active, onclick }: Props = $props();
</script>

<button
	type="button"
	class="filter-chip"
	class:filter-chip--active={active}
	aria-pressed={active}
	{onclick}
>
	{label}
</button>

<style>
	.filter-chip {
		display: inline-flex;
		align-items: center;
		font-size: var(--text-sm);
		font-weight: 500;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background-color: var(--color-surface);
		color: var(--color-text-subtle);
		cursor: pointer;
		white-space: nowrap;
		transition:
			color var(--dur-micro) var(--ease-standard),
			border-color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
	}

	.filter-chip:hover {
		color: var(--color-primary-text);
		border-color: var(--color-primary-light);
		background-color: var(--color-primary-bg);
	}

	.filter-chip--active {
		color: var(--color-primary-text);
		border-color: var(--color-primary);
		background-color: var(--color-primary-bg);
		font-weight: 600;
	}

	.filter-chip:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
