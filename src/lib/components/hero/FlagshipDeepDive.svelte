<script lang="ts">
	import { base } from '$app/paths';
	import type { Project } from '$lib/data/types.js';
	import StatusBadge from '$lib/components/project/StatusBadge.svelte';
	import TechTagList from '$lib/components/project/TechTagList.svelte';

	interface Props {
		projects: Project[];
	}

	let { projects }: Props = $props();
</script>

<section class="flagship" aria-label="Flagship projects">
	<header class="flagship__header">
		<h2 class="flagship__title">Built end-to-end</h2>
		<p class="flagship__strapline">
			A few projects where depth is the point: complex problems, real constraints, shipped code.
		</p>
	</header>

	<div class="flagship__grid">
		{#each projects as project (project.slug)}
			<article class="flagship__card">
				<a
					href="{base}/projects/{project.slug}"
					class="flagship__thumb"
					tabindex="-1"
					aria-hidden="true"
				>
					<img
						src="{base}/og/{project.slug}.png"
						alt="{project.name} social card"
						width="1200"
						height="630"
						loading="lazy"
						class="flagship__thumb-img"
					/>
				</a>

				<div class="flagship__card-header">
					<div class="flagship__card-meta">
						<StatusBadge status={project.status} />
					</div>
					<h3 class="flagship__card-name">{project.name}</h3>
					<p class="flagship__card-tagline">{project.tagline}</p>
				</div>

				<ul class="flagship__highlights" aria-label="Key highlights">
					{#each project.highlights.slice(0, 3) as highlight}
						<li class="flagship__highlight">{highlight}</li>
					{/each}
				</ul>

				{#if project.metrics}
					<dl class="flagship__metrics">
						{#if project.metrics.commits != null}
							<div class="flagship__metric">
								<dd class="flagship__metric-value">{project.metrics.commits.toLocaleString()}</dd>
								<dt class="flagship__metric-label">commits</dt>
							</div>
						{/if}
						{#if project.metrics.testCoverage != null}
							<div class="flagship__metric">
								<dd class="flagship__metric-value">{project.metrics.testCoverage}%</dd>
								<dt class="flagship__metric-label">test coverage</dt>
							</div>
						{/if}
						{#if project.metrics.linesAdded != null}
							<div class="flagship__metric">
								<dd class="flagship__metric-value">
									+{project.metrics.linesAdded.toLocaleString()}
								</dd>
								<dt class="flagship__metric-label">lines added</dt>
							</div>
						{/if}
					</dl>
				{/if}

				<div class="flagship__card-footer">
					<TechTagList tags={project.tags} limit={4} />
					<a href="{base}/projects/{project.slug}" class="flagship__cta"> Read case study → </a>
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
	.flagship {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		padding: var(--space-12) 0;
		border-top: 1px solid var(--color-border);
	}

	.flagship__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.flagship__title {
		font-size: var(--text-3xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.flagship__strapline {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		max-width: 52rem;
		margin: 0;
	}

	.flagship__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 32rem), 1fr));
		gap: var(--space-6);
	}

	.flagship__card {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-7);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		transition: border-color var(--transition-fast);
	}

	.flagship__card:hover {
		border-color: var(--color-primary-light);
	}

	/* Pull the thumbnail flush to the card edges, above the padded content. */
	.flagship__thumb {
		display: block;
		margin: calc(-1 * var(--space-7)) calc(-1 * var(--space-7)) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.flagship__thumb-img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1200 / 630;
		object-fit: cover;
	}

	.flagship__card-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.flagship__card-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.flagship__card-name {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
	}

	.flagship__card-tagline {
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		line-height: 1.6;
		margin: 0;
	}

	.flagship__highlights {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 0;
		list-style: none;
	}

	.flagship__highlight {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.6;
		padding-left: var(--space-4);
		position: relative;
	}

	.flagship__highlight::before {
		content: '→';
		position: absolute;
		left: 0;
		color: var(--color-primary-text);
		font-weight: 600;
	}

	.flagship__metrics {
		display: flex;
		gap: var(--space-6);
		padding: var(--space-4) var(--space-5);
		background-color: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.flagship__metric {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}

	.flagship__metric-value {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-primary-text);
		font-variant-numeric: tabular-nums;
	}

	.flagship__metric-label {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.flagship__card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-top: auto;
	}

	.flagship__cta {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary-text);
		text-decoration: none;
		white-space: nowrap;
		transition: color var(--transition-fast);
		flex-shrink: 0;
	}

	.flagship__cta:hover {
		color: var(--color-primary);
	}
</style>
