<script lang="ts">
	import type { Project } from '$lib/data/types.js';
	import { stagePhrase, trackLabel } from '$lib/components/graph/graph-style.js';

	interface Props {
		project: Pick<
			Project,
			'track' | 'trackAuthored' | 'progress' | 'released' | 'retired' | 'deployed'
		>;
	}

	let { project }: Props = $props();

	// Exploration announces its track (`Spike · Dormant`) — an honest label for
	// a finished experiment. Product is the default register and just states the
	// stage phrase, which folds in whether the work was released.
	const label = $derived(
		project.track === 'exploration'
			? `${trackLabel[project.track]} · ${stagePhrase(project.progress, project.released)}`
			: stagePhrase(project.progress, project.released)
	);

	// Heuristic values draw with the dotted-provisional convention: the
	// reader can always tell surveyed ground from conjecture.
	//
	// Scoped to what this badge actually prints. `progress` is a pure
	// observation, never authored, so it can never be provisional. `track` only
	// reaches the label on exploration projects: marking a product badge
	// estimated for an inferred track read an authored "Released · Settled" as
	// a guess, when release status is authored-only and never estimated.
	const provisional = $derived(project.track === 'exploration' && !project.trackAuthored);
</script>

<span class="stage" role="group" aria-label="Stage">
	<span
		class="stage-badge stage-badge--{project.released ? 'released' : project.progress}"
		class:stage-badge--outline={project.track === 'exploration'}
		class:stage-badge--provisional={provisional}
		aria-label="Stage: {label}{provisional ? ' (estimated)' : ''}"
	>
		{label}
	</span>
	{#if project.retired}
		<span class="stage-badge stage-badge--retired" aria-label="Retired">Retired</span>
	{/if}
	{#if project.deployed}
		<span class="stage-badge stage-badge--deployed" aria-label="Deployed">Deployed</span>
	{/if}
</span>

<style>
	.stage {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.stage-badge {
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

	.stage-badge--in-progress {
		color: var(--progress-in-progress-text);
		background-color: var(--progress-in-progress-bg);
	}

	.stage-badge--dormant {
		color: var(--progress-dormant-text);
		background-color: var(--progress-dormant-bg);
	}

	/* Released work reads on the settled end of the ramp whether or not it is
	   still being maintained; the phrase carries that distinction in words. */
	.stage-badge--released {
		color: var(--progress-complete-text);
		background-color: var(--progress-complete-bg);
	}

	/* Exploration track: hollow pill, the mark convention carried into type.
	   The progress ink moves to the border; the tint background goes. */
	.stage-badge--outline {
		background-color: transparent;
		border: 1px solid currentColor;
	}

	/* Heuristic stage: the unsurveyed convention, dotted where authored is
	   solid. */
	.stage-badge--provisional {
		border: 1px dashed currentColor;
		background-color: transparent;
	}

	/* Retired rides as its own neutral flag pill: the shade-shift convention
	   belongs to marks, where 3:1 suffices; badge text holds 4.5:1, so here
	   the word does the work on paper neutrals. */
	.stage-badge--retired {
		color: var(--color-text-subtle);
		background-color: transparent;
		border: 1px solid var(--color-border-strong);
	}

	/* Deployed: tinted from the complete-progress ink, the same family the
	   live-site link uses. Running somewhere is a property of finished work. */
	.stage-badge--deployed {
		color: var(--progress-complete-text);
		background-color: var(--progress-complete-bg);
	}
</style>
