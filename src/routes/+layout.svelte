<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import '../app.css';
	import '@fontsource-variable/source-serif-4';
	import '@fontsource/ibm-plex-sans/400.css';
	import '@fontsource/ibm-plex-sans/500.css';
	import '@fontsource/ibm-plex-sans/600.css';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '@fontsource/jetbrains-mono/600.css';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { navLinks } from '$lib/nav.js';
	import { BLUESKY_URL, GITHUB_REPO_URL } from '$lib/config.js';

	let { children } = $props();

	// Active nav item: the current route's top-level segment matches a
	// link's path (e.g. /projects/iris still marks "Projects" active).
	// $page.url.pathname is always absolute regardless of deployment base,
	// so links.path (also absolute, e.g. '/map') compares directly — no
	// need to prepend `base`, which SvelteKit may render as a relative '.'
	// rather than an absolute prefix.
	const activePath = $derived(
		navLinks.find((link) => $page.url.pathname.startsWith(link.path))?.path ?? null
	);

	// Progressive enhancement: close the mobile menu after client-side navigation.
	// Without JS the menu stays open until the user closes it — acceptable no-JS fallback.
	let menuDetails = $state<HTMLDetailsElement | null>(null);

	function closeMenu(): void {
		if (menuDetails) menuDetails.open = false;
	}
</script>

<svelte:head>
	<link rel="icon" href="{base}/favicon.png" />
	<meta name="author" content="Jason Warren" />
	<meta property="og:site_name" content="Jason Warren" />
	<link rel="me" href={BLUESKY_URL} />
</svelte:head>

<a href="#main-content" class="skip-link">Skip to content</a>

<header class="site-header">
	<nav class="site-nav" aria-label="Site navigation">
		<a href="{base}/" class="site-nav__home" aria-label="Jason Warren, home">
			<span class="site-nav__initials" aria-hidden="true">JW</span>
			<span class="site-nav__name">Jason Warren</span>
		</a>

		<!-- Desktop row: visible above the breakpoint -->
		<ul class="site-nav__links" role="list">
			{#each navLinks as link (link.path)}
				<li>
					<a
						href="{base}{link.path}"
						class="site-nav__link"
						class:site-nav__link--active={activePath === link.path}
						aria-current={activePath === link.path ? 'page' : undefined}
					>
						{link.label}
					</a>
				</li>
			{/each}
			<li>
				<ThemeToggle />
			</li>
		</ul>

		<!-- Mobile bar: ThemeToggle always visible + hamburger toggle -->
		<div class="site-nav__mobile-bar">
			<ThemeToggle />
			<details class="site-nav__menu" bind:this={menuDetails}>
				<summary class="site-nav__toggle" aria-label="Menu">
					<!-- Hamburger icon: 18×18, stroke-width 2, matching ThemeToggle SVG style -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						class="site-nav__hamburger-icon"
					>
						<line x1="3" y1="6" x2="21" y2="6" />
						<line x1="3" y1="12" x2="21" y2="12" />
						<line x1="3" y1="18" x2="21" y2="18" />
					</svg>
					<!-- Close (×) icon shown when open, via CSS -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						class="site-nav__close-icon"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</summary>

				<div class="site-nav__panel">
					<ul class="site-nav__panel-links" role="list">
						{#each navLinks as link (link.path)}
							<li>
								<a href="{base}{link.path}" class="site-nav__panel-link" onclick={closeMenu}
									>{link.label}</a
								>
							</li>
						{/each}
					</ul>
				</div>
			</details>
		</div>
	</nav>
</header>

<main id="main-content">
	{@render children()}
</main>

<footer class="site-footer">
	<div class="site-footer__inner">
		<p class="site-footer__text">
			Built with
			<a href="{base}/drift-engine" class="site-footer__link">SvelteKit 2 and Svelte 5</a>. Source
			on
			<a href={GITHUB_REPO_URL} class="site-footer__link" target="_blank" rel="noopener noreferrer">
				GitHub
			</a>. Find me on
			<a href={BLUESKY_URL} class="site-footer__link" target="_blank" rel="noopener noreferrer me">
				Bluesky
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
		color: var(--color-on-primary);
		font-size: var(--text-sm);
		font-weight: 600;
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: top var(--dur-micro) var(--ease-standard);
	}

	.skip-link:focus {
		top: var(--space-4);
	}

	.site-header {
		border-bottom: 1px solid var(--color-border);
		background-color: color-mix(in srgb, var(--color-surface-raised) 88%, transparent);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
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
	}

	.site-nav__initials {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-sm);
		background-color: var(--color-primary);
		color: var(--color-surface-raised);
		font-family: var(--font-display);
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.site-nav__name {
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 500;
	}

	/* ── Desktop nav row ── */

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
			color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
	}

	.site-nav__link:hover {
		color: var(--color-text);
		background-color: var(--color-surface);
	}

	.site-nav__link--active {
		color: var(--color-text);
		box-shadow: inset 0 -2px 0 var(--color-accent);
	}

	.site-nav__link--active:hover {
		background-color: transparent;
	}

	.site-nav__link:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* ── Mobile bar + hamburger: hidden above breakpoint ── */

	.site-nav__mobile-bar {
		display: none;
		align-items: center;
		gap: var(--space-2);
	}

	/* ── Hamburger: <details>/<summary> ── */

	/* Remove native disclosure triangle */
	.site-nav__toggle {
		list-style: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-subtle);
		cursor: pointer;
		transition:
			color var(--dur-micro) var(--ease-standard),
			border-color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
	}

	.site-nav__toggle::-webkit-details-marker {
		display: none;
	}

	.site-nav__toggle::marker {
		display: none;
	}

	.site-nav__toggle:hover {
		color: var(--color-text);
		border-color: var(--color-border-strong);
		background-color: var(--color-surface-raised);
	}

	.site-nav__toggle:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* Show hamburger when closed, × when open */
	.site-nav__close-icon {
		display: none;
	}

	.site-nav__menu[open] .site-nav__hamburger-icon {
		display: none;
	}

	.site-nav__menu[open] .site-nav__close-icon {
		display: block;
	}

	/* ── Drop-down panel ── */

	.site-nav__panel {
		position: absolute;
		top: 3.5rem; /* flush with the bottom of the sticky header */
		left: 0;
		right: 0;
		z-index: 99; /* below the sticky header (100) but above page content */
		background-color: var(--color-surface-raised);
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-3) var(--layout-padding);
		max-height: calc(100svh - 3.5rem);
		overflow-y: auto;
	}

	.site-nav__panel-links {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0;
		list-style: none;
	}

	.site-nav__panel-link {
		display: block;
		padding: var(--space-3) var(--space-2);
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--color-text-subtle);
		text-decoration: none;
		border-radius: var(--radius-md);
		border-bottom: 1px solid var(--color-border);
		transition:
			color var(--dur-micro) var(--ease-standard),
			background-color var(--dur-micro) var(--ease-standard);
	}

	.site-nav__panel-links li:last-child .site-nav__panel-link {
		border-bottom: none;
	}

	.site-nav__panel-link:hover {
		color: var(--color-text);
		background-color: var(--color-surface);
	}

	.site-nav__panel-link:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
	}

	/* ── Breakpoint: collapse nav to hamburger below 48rem ── */

	@media (max-width: 48rem) {
		.site-nav {
			gap: var(--space-2);
			padding: 0 var(--space-4);
		}

		.site-nav__name {
			display: none;
		}

		.site-nav__links {
			display: none;
		}

		.site-nav__mobile-bar {
			display: flex;
		}
	}

	.site-nav__home:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
		border-radius: var(--radius-md);
	}

	/* ── Footer ── */

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
		transition: color var(--dur-micro) var(--ease-standard);
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
