<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Whether the modal is open. The parent owns this state. */
		open: boolean;
		/** Accessible label for the dialog (used as aria-label). */
		title: string;
		/** Called when the dialog closes for any reason (Escape, backdrop, close btn). */
		onclose: () => void;
		children: Snippet;
	}

	let { open, title, onclose, children }: Props = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	// Sync the open prop to the native dialog's open/close methods.
	// showModal() provides focus-trapping and Escape-to-close for free.
	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			dialogEl.showModal();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	// Clicks that land on the <dialog> itself (not its inner content) are
	// backdrop clicks — dismiss the modal.
	function handleDialogClick(event: MouseEvent) {
		if (event.target === dialogEl) onclose();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} class="modal" aria-label={title} {onclose} onclick={handleDialogClick}>
	<div class="modal__inner">
		<div class="modal__header">
			<h2 class="modal__title">{title}</h2>
			<button type="button" class="modal__close" aria-label="Close" onclick={onclose}>
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
					<line
						x1="3"
						y1="3"
						x2="15"
						y2="15"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
					<line
						x1="15"
						y1="3"
						x2="3"
						y2="15"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<div class="modal__body">
			{@render children()}
		</div>
	</div>
</dialog>

<style>
	.modal {
		/* Reset browser dialog defaults */
		margin: auto;
		padding: 0;
		border: none;
		background: transparent;
		max-width: min(26rem, calc(100vw - 2rem));
		width: 100%;

		/* Sit above everything including the 9999 skip link */
		z-index: 10000;
	}

	.modal__inner {
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.modal__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.modal__title {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.3;
		margin: 0;
	}

	.modal__close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		flex-shrink: 0;
		padding: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.modal__close:hover {
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.modal__close:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	.modal__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.modal::backdrop {
		background: rgb(0 0 0 / 0.45);
	}

	@media (prefers-reduced-motion: reduce) {
		.modal,
		.modal__inner,
		.modal__close {
			transition: none;
		}
	}
</style>
