<script lang="ts">
	import { base } from '$app/paths';
	import '../app.css';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="{base}/favicon.png" />
	<meta name="author" content="Jason Warren" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Jason Warren" />
</svelte:head>

<a href="#main-content" class="skip-link">Skip to content</a>

<header class="site-header">
	<nav class="site-nav" aria-label="Site navigation">
		<a href="{base}/" class="site-nav__home" aria-label="Jason Warren, home">
			<span class="site-nav__initials" aria-hidden="true">JW</span>
			<span class="site-nav__name">Jason Warren</span>
		</a>

		<ul class="site-nav__links" role="list">
			<li>
				<a href="{base}/projects" class="site-nav__link">Projects</a>
			</li>
			<li>
				<a href="{base}/about" class="site-nav__link">About</a>
			</li>
			<li>
				<ThemeToggle />
			</li>
		</ul>
	</nav>
</header>

<main id="main-content">
	{@render children()}
</main>

<footer class="site-footer">
	<div class="site-footer__inner">
		<p class="site-footer__text">
			Built with SvelteKit 2 and Svelte 5. Source on
			<a
				href="https://github.com/JasonWarrenUK/jason-warren"
				class="site-footer__link"
				target="_blank"
				rel="noopener noreferrer"
			>
				GitHub
			</a>.
		</p>
	</div>
</footer>

<style>
	.skip-link {
		position: absolute;
		top: -100%;
		left: var(--space-4);
		z-index: 9999;
		padding: var(--space-2) var(--space-4);
		background-color: var(--color-primary-text);
		color: #fff;
		font-size: var(--text-sm);
		font-weight: 600;
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: top var(--transition-fast);
	}

	.skip-link:focus {
		top: var(--space-4);
	}

	.site-header {
		border-bottom: 1px solid var(--color-border);
		background-color: var(--color-surface-raised);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.site-nav {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: 0 var(--layout-padding);
		height: 3.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-6);
	}

	.site-nav__home {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		text-decoration: none;
		color: var(--color-text);
		font-weight: 700;
	}

	.site-nav__initials {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-md);
		background-color: var(--color-primary-text);
		color: #fff;
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.site-nav__name {
		font-size: var(--text-base);
	}

	.site-nav__links {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.site-nav__link {
		display: inline-flex;
		align-items: center;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-subtle);
		text-decoration: none;
		border-radius: var(--radius-md);
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.site-nav__link:hover {
		color: var(--color-text);
		background-color: var(--color-surface);
	}

	.site-nav__link:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	.site-nav__home:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
		border-radius: var(--radius-md);
	}

	.site-footer {
		border-top: 1px solid var(--color-border);
		margin-top: var(--space-16);
	}

	.site-footer__inner {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-8) var(--layout-padding);
	}

	.site-footer__text {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.site-footer__link {
		color: var(--color-primary-text);
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color var(--transition-fast);
	}

	.site-footer__link:hover {
		color: var(--color-primary);
	}

	:global(:focus-visible) {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	:global(:focus:not(:focus-visible)) {
		outline: none;
	}
</style>
