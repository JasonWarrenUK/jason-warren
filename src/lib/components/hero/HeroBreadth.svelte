<script lang="ts">
	import { base } from '$app/paths';

	// Collapsed on mobile, expanded on desktop. Default closed so there is no
	// flash of a long list on small screens; desktop expands on mount.
	let open = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(min-width: 48rem)');
		const apply = (): void => {
			open = mq.matches;
		};
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	});

	// The polyglot stack claim — curated for breadth and distinctiveness
	const stackGroups = [
		{
			label: 'Languages',
			items: ['TypeScript', 'Go', 'Rust', 'Python', 'JavaScript']
		},
		{
			label: 'Frontend',
			items: ['Svelte 5', 'SvelteKit', 'React', 'Next.js', 'Tailwind CSS']
		},
		{
			label: 'Backend & data',
			items: ['Node.js', 'Bun', 'Deno', 'PostgreSQL', 'Neo4j', 'Supabase']
		},
		{
			label: 'Tooling & platforms',
			items: ['Tauri', 'Vitest', 'Playwright', 'Docker', 'GitHub Actions', 'Vercel']
		}
	];
</script>

<section class="hero-breadth" aria-label="Technology breadth">
	<header class="hero-breadth__header">
		<h2 class="hero-breadth__title">A wide toolkit</h2>
		<p class="hero-breadth__strapline">
			Go TUIs, Tauri desktop apps, Neo4j graph queries, FastAPI microservices. A spread this wide is
			usually a red flag; in my case it is the residue of chasing problems into whatever language
			they happened to live in.
		</p>
	</header>

	<details class="hero-breadth__disclosure" bind:open>
		<summary class="hero-breadth__summary">Languages, frameworks, and tools</summary>
		<dl class="hero-breadth__stack">
			{#each stackGroups as group (group.label)}
				<div class="hero-breadth__group">
					<dt class="hero-breadth__group-label">{group.label}</dt>
					<dd class="hero-breadth__group-items">
						{#each group.items as item (item)}
							<span class="hero-breadth__chip">{item}</span>
						{/each}
					</dd>
				</div>
			{/each}
		</dl>
	</details>

	<a href="{base}/projects" class="hero-breadth__cta"> See all projects → </a>
</section>

<style>
	.hero-breadth {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		padding: var(--space-12) 0;
		border-top: 1px solid var(--color-border);
	}

	.hero-breadth__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.hero-breadth__title {
		font-size: var(--text-3xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.hero-breadth__strapline {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		max-width: 52rem;
		margin: 0;
	}

	.hero-breadth__disclosure {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.hero-breadth__summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-subtle);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		list-style: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-raised);
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
		user-select: none;
	}

	/* Remove default disclosure triangle in WebKit */
	.hero-breadth__summary::-webkit-details-marker {
		display: none;
	}

	.hero-breadth__summary:hover {
		color: var(--color-text);
		background-color: var(--color-surface);
	}

	.hero-breadth__summary:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* Chevron via pseudo-element */
	.hero-breadth__summary::after {
		content: '';
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg);
		transition: transform var(--transition-fast);
		flex-shrink: 0;
	}

	.hero-breadth__disclosure[open] .hero-breadth__summary::after {
		transform: rotate(-135deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-breadth__summary::after {
			transition: none;
		}
	}

	.hero-breadth__stack {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		gap: var(--space-6);
	}

	.hero-breadth__group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.hero-breadth__group-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.hero-breadth__group-items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
	}

	.hero-breadth__chip {
		font-size: var(--text-sm);
		font-weight: 500;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background-color: var(--color-surface-raised);
		color: var(--color-text-subtle);
	}

	.hero-breadth__cta {
		display: inline-flex;
		align-items: center;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary-text);
		text-decoration: none;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-primary-light);
		border-radius: var(--radius-md);
		background-color: var(--color-primary-bg);
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast);
		align-self: flex-start;
	}

	.hero-breadth__cta:hover {
		background-color: var(--color-primary-light);
		border-color: var(--color-primary);
	}
</style>
