<script lang="ts">
	import type { Project } from '$lib/data/types.js';
	import ProjectCard from './ProjectCard.svelte';

	interface Props {
		projects: Project[];
	}

	let { projects }: Props = $props();
</script>

{#if projects.length === 0}
	<p class="empty-state">No projects match the current filters.</p>
{:else}
	<ul class="project-grid" aria-label="Projects">
		{#each projects as project (project.slug)}
			<li>
				<ProjectCard {project} />
			</li>
		{/each}
	</ul>
{/if}

<style>
	.project-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		gap: var(--layout-gap);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--space-12) 0;
		font-size: var(--text-lg);
	}
</style>
