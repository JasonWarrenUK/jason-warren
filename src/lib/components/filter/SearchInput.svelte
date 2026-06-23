<script lang="ts">
	interface Props {
		value: string;
		onchange: (query: string | null) => void;
	}

	let { value, onchange }: Props = $props();

	// Mutable local state for the input. Initialised empty; the sync effect
	// below populates it on mount and keeps it aligned with URL changes.
	let inputValue = $state('');

	// Sync inbound URL changes (e.g. browser back/forward) → local state.
	// Guard against a feedback loop: only update when the prop actually differs.
	$effect(() => {
		if (value !== inputValue) inputValue = value;
	});

	// Write the URL param after 300 ms of idle input to avoid flooding history.
	$effect(() => {
		const current = inputValue;
		const timer = setTimeout(() => {
			onchange(current.trim() || null);
		}, 300);
		return () => clearTimeout(timer);
	});
</script>

<div class="search-input">
	<label for="project-search" class="search-input__label">Search projects</label>
	<input
		id="project-search"
		type="search"
		class="search-input__field"
		placeholder="Search by name, tag, or description…"
		bind:value={inputValue}
		autocomplete="off"
		spellcheck={false}
		aria-label="Search projects"
	/>
</div>

<style>
	.search-input {
		position: relative;
	}

	.search-input__label {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.search-input__field {
		display: block;
		width: 100%;
		padding: var(--space-3) var(--space-4);
		font-size: var(--text-sm);
		font-family: inherit;
		color: var(--color-text);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-sizing: border-box;
		appearance: none;
	}

	.search-input__field::placeholder {
		color: var(--color-text-muted);
	}

	.search-input__field:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}
</style>
