<script lang="ts">
	import { base } from '$app/paths';
	import type { Project } from '$lib/data/types.js';
	import StatusBadge from '$lib/components/project/StatusBadge.svelte';
	import TechTagList from '$lib/components/project/TechTagList.svelte';
	import ExpandableCard from '$lib/components/project/ExpandableCard.svelte';

	interface Props {
		pool: Project[];
		count: number;
	}

	let { pool, count }: Props = $props();

	// Start at index 0 so SSR and hydration render the same slice (no flash).
	let start = $state(0);

	// The currently visible slice: wraps around the pool so every project surfaces.
	const visible = $derived.by(() =>
		pool.length <= count
			? pool
			: Array.from({ length: count }, (_, i) => pool[(start + i) % pool.length])
	);

	// Only show the rotation control when there is more to show.
	const canDeal = $derived(pool.length > count);

	// Advance the window by one full count, wrapping.
	function dealAnother(): void {
		start = (start + count) % pool.length;
	}

	// Screen-reader status: "Showing projects 1–3 of 29"
	const statusText = $derived.by(() => {
		if (!canDeal) return '';
		const from = start + 1;
		const to = Math.min(start + count, pool.length);
		return `Showing projects ${from}–${to} of ${pool.length}`;
	});
</script>

<section class="hero-rotation" aria-label="Recent projects">
	<header class="hero-rotation__header">
		<div class="hero-rotation__heading-row">
			<h2 class="hero-rotation__title">Lately</h2>
			{#if canDeal}
				<button
					type="button"
					class="hero-rotation__deal"
					onclick={dealAnother}
					aria-label="Show another set of projects"
				>
					Show another set
				</button>
			{/if}
		</div>
		<p class="hero-rotation__strapline">
			What's had the most attention recently. Rotate through to see the rest of the active work.
		</p>
	</header>

	<!-- Visually hidden live region so screen readers announce set changes. -->
	<p class="hero-rotation__sr-status" aria-live="polite" aria-atomic="true">
		{statusText}
	</p>

	<div class="hero-rotation__grid">
		{#each visible as project (project.slug)}
			<ExpandableCard slug={project.slug} name={project.name} blurb={project.blurb}>
				{#snippet expanded()}
					<!-- Text region navigates to the case study; the tech-tag footer sits outside it. -->
					<a
						href="{base}/projects/{project.slug}"
						class="hero-rotation__body"
						aria-label={project.name}
					>
						<div class="hero-rotation__card-header">
							<div class="hero-rotation__card-meta">
								<StatusBadge status={project.status} />
							</div>
							<h3 class="hero-rotation__card-name">{project.name}</h3>
							<p class="hero-rotation__card-tagline">{project.tagline}</p>
						</div>

						<ul class="hero-rotation__highlights" aria-label="Key highlights">
							{#each project.highlights.slice(0, 3) as highlight}
								<li class="hero-rotation__highlight">{highlight}</li>
							{/each}
						</ul>

						{#if project.metrics}
							<dl class="hero-rotation__metrics">
								{#if project.metrics.commits != null}
									<div class="hero-rotation__metric">
										<dd class="hero-rotation__metric-value">
											{project.metrics.commits.toLocaleString()}
										</dd>
										<dt class="hero-rotation__metric-label">commits</dt>
									</div>
								{/if}
								{#if project.metrics.testCoverage != null}
									<div class="hero-rotation__metric">
										<dd class="hero-rotation__metric-value">{project.metrics.testCoverage}%</dd>
										<dt class="hero-rotation__metric-label">test coverage</dt>
									</div>
								{/if}
								{#if project.metrics.linesAdded != null}
									<div class="hero-rotation__metric">
										<dd class="hero-rotation__metric-value">
											+{project.metrics.linesAdded.toLocaleString()}
										</dd>
										<dt class="hero-rotation__metric-label">lines added</dt>
									</div>
								{/if}
							</dl>
						{/if}

						<span class="hero-rotation__cta">Read case study →</span>
					</a>

					<footer class="hero-rotation__card-footer">
						<TechTagList tags={project.tags} limit={4} />
					</footer>
				{/snippet}
			</ExpandableCard>
		{/each}
	</div>
</section>

<style>
	.hero-rotation {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		padding: var(--space-12) 0;
		border-top: 1px solid var(--color-border);
	}

	.hero-rotation__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.hero-rotation__heading-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-6);
	}

	.hero-rotation__title {
		font-size: var(--text-3xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.hero-rotation__deal {
		flex-shrink: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary-text);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: opacity var(--transition-fast);
	}

	.hero-rotation__deal:hover {
		opacity: 0.75;
	}

	.hero-rotation__strapline {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		max-width: 52rem;
		margin: 0;
	}

	/* Visually hidden but announced to screen readers. */
	.hero-rotation__sr-status {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	.hero-rotation__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 32rem), 1fr));
		gap: var(--space-6);
	}

	.hero-rotation__body {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-7);
		text-decoration: none;
	}

	.hero-rotation__card-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.hero-rotation__card-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.hero-rotation__card-name {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
		transition: color var(--transition-fast);
	}

	.hero-rotation__body:hover .hero-rotation__card-name {
		color: var(--color-primary-text);
	}

	.hero-rotation__card-tagline {
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		line-height: 1.6;
		margin: 0;
	}

	.hero-rotation__highlights {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 0;
		list-style: none;
	}

	.hero-rotation__highlight {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.6;
		padding-left: var(--space-4);
		position: relative;
	}

	.hero-rotation__highlight::before {
		content: '→';
		position: absolute;
		left: 0;
		color: var(--color-primary-text);
		font-weight: 600;
	}

	.hero-rotation__metrics {
		display: flex;
		gap: var(--space-6);
		padding: var(--space-4) var(--space-5);
		background-color: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.hero-rotation__metric {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}

	.hero-rotation__metric-value {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-primary-text);
		font-variant-numeric: tabular-nums;
	}

	.hero-rotation__metric-label {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.hero-rotation__cta {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary-text);
		white-space: nowrap;
	}

	.hero-rotation__card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding: var(--space-4) var(--space-7) var(--space-7);
	}
</style>
