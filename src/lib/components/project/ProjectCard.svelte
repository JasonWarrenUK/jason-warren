<script lang="ts">
	import { base } from '$app/paths';
	import type { Project } from '$lib/data/types.js';
	import StageBadge from './StageBadge.svelte';
	import RoleBadge from './RoleBadge.svelte';
	import TechTagList from './TechTagList.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import ExpandableCard from './ExpandableCard.svelte';

	interface Props {
		project: Project;
	}

	let { project }: Props = $props();
</script>

<ExpandableCard slug={project.slug} name={project.name} blurb={project.blurb}>
	{#snippet expanded()}
		<!-- Text region navigates to the case study; the footer controls stay outside it. -->
		<a href="{base}/projects/{project.slug}" class="project-card__link" aria-label={project.name}>
			<div class="project-card__body">
				<header class="project-card__header">
					<h3 class="project-card__name">{project.name}</h3>
					<div class="project-card__badges">
						<StageBadge {project} />
						<RoleBadge role={project.contribution.role} />
					</div>
				</header>

				<p class="project-card__tagline">{project.tagline}</p>
			</div>
		</a>

		<footer class="project-card__footer">
			<TechTagList tags={project.tags} limit={4} />

			<div class="project-card__links">
				<ExternalLink href={project.repoUrl} label="Repo" variant="repo" />
				{#if project.liveUrl}
					<ExternalLink href={project.liveUrl} label="Live" variant="live" />
				{/if}
			</div>
		</footer>
	{/snippet}
</ExpandableCard>

<style>
	.project-card__link {
		display: flex;
		flex-direction: column;
		padding: 0;
		text-decoration: none;
		flex: 1;
	}

	.project-card__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		flex: 1;
	}

	.project-card__link:hover .project-card__name {
		color: var(--color-primary-text);
	}

	.project-card__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.project-card__name {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--color-text);
		line-height: 1.3;
		transition: color var(--transition-fast);
	}

	.project-card__badges {
		display: flex;
		gap: var(--space-1);
		flex-shrink: 0;
	}

	.project-card__tagline {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.5;
		margin: 0;
	}

	.project-card__footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-5);
		border-top: 1px solid var(--color-border);
		background-color: var(--color-surface);
	}

	.project-card__links {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}
</style>
