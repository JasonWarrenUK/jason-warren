<script lang="ts">
	import type { Audience } from '$lib/audience.js';

	interface Props {
		audience: Audience;
		onchange: (next: Audience) => void;
	}

	let { audience, onchange }: Props = $props();

	const options: { value: Audience; label: string }[] = [
		{ value: 'developer', label: 'For developers' },
		{ value: 'everyone', label: 'For everyone else' }
	];
</script>

<div class="audience-toggle" role="group" aria-label="Choose which version of this page to read">
	{#each options as option (option.value)}
		<button
			type="button"
			class="audience-toggle__option"
			class:audience-toggle__option--active={audience === option.value}
			aria-pressed={audience === option.value}
			onclick={() => onchange(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.audience-toggle {
		display: inline-flex;
		align-self: flex-start;
		padding: var(--space-1);
		gap: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		background-color: var(--color-surface-raised);
	}

	.audience-toggle__option {
		padding: var(--space-2) var(--space-4);
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-subtle);
		cursor: pointer;
		transition:
			color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
	}

	.audience-toggle__option:hover {
		color: var(--color-text);
	}

	.audience-toggle__option--active {
		color: var(--color-primary-text);
		background-color: var(--color-primary-bg);
	}

	.audience-toggle__option:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
