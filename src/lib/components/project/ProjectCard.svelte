<script lang="ts">
	import { base } from '$app/paths';
	import type { Project } from '$lib/data/types.js';
	import StatusBadge from './StatusBadge.svelte';
	import RoleBadge from './RoleBadge.svelte';
	import TechTagList from './TechTagList.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';

	interface Props {
		project: Project;
	}

	let { project }: Props = $props();
</script>

<article class="project-card">
	<a href="{base}/projects/{project.slug}" class="project-card__link" aria-label={project.name}>
		<img
			src="{base}/og/{project.slug}.png"
			alt="{project.name} social card"
			width="1200"
			height="630"
			loading="lazy"
			class="project-card__thumb"
		/>

		<div class="project-card__body">
			<header class="project-card__header">
				<h3 class="project-card__name">{project.name}</h3>
				<div class="project-card__badges">
					<StatusBadge status={project.status} />
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
</article>

<style>
	.project-card {
		display: flex;
		flex-direction: column;
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			transform var(--transition-fast);
	}

	.project-card:hover {
		border-color: var(--color-primary-light);
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}

	@media (prefers-reduced-motion: reduce) {
		.project-card:hover {
			transform: none;
		}
	}

	.project-card__link {
		display: flex;
		flex-direction: column;
		padding: 0;
		text-decoration: none;
		flex: 1;
	}

	/* Full-bleed thumbnail: as the link's first child it spans the card, and the
	   card's overflow:hidden + border-radius clip its top corners. */
	.project-card__thumb {
		display: block;
		width: 100%;
		margin: 0;
		aspect-ratio: 1200 / 630;
		object-fit: cover;
		border-bottom: 1px solid var(--color-border);
	}

	.project-card__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		flex: 1;
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
