<script lang="ts">
	import { base } from '$app/paths';
	import Seo from '$lib/components/seo/Seo.svelte';
	import {
		AUTHOR,
		SITE_URL,
		GITHUB_PROFILE_URL,
		BLUESKY_URL,
		BLUESKY_HANDLE,
		DEFAULT_DESCRIPTION
	} from '$lib/config.js';

	const personLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Person',
		name: AUTHOR,
		url: `${SITE_URL}/about`,
		jobTitle: 'Full-stack developer',
		worksFor: { '@type': 'Organization', name: 'Founders and Coders' },
		sameAs: [GITHUB_PROFILE_URL, BLUESKY_URL]
	});
</script>

<Seo title="About | Jason Warren" description={DEFAULT_DESCRIPTION} />

<svelte:head>
	{@html `<script type="application/ld+json">${personLd}</script>`}
</svelte:head>

<div class="page">
	<header class="page__header">
		<h1 class="page__title">About</h1>
		<p class="page__intro">
			Full-stack developer. Optimising for problems that are awkward, tools that are sharp, and code
			that survives contact with reality.
		</p>
	</header>

	<div class="page__body">
		<main class="page__main">
			<section class="section">
				<h2 class="section__heading">What I build</h2>
				<div class="section__prose">
					<p>
						I build things that run: a Go TUI for productivity, a Tauri 2 desktop app for
						apprenticeship data compliance, an AI curriculum generator, a Neo4j-backed relational
						fiction engine. The spread is wider than is strictly sensible, and I have made peace
						with that. A genuinely new sort of problem is the best excuse I know to learn a
						genuinely new sort of tool.
					</p>
					<p>
						What the projects share is an intolerance for half-measures. The Lead Pool segmentation
						work in fac-cra turns a blunt approval queue into a set of configurable segments; the
						response-state architecture in Workwise replaces a tangle of loading booleans with a
						discriminated-union state machine. The difference in both cases is a system that can be
						reasoned about when things go wrong.
					</p>
				</div>
			</section>

			<section class="section">
				<h2 class="section__heading">How I work</h2>
				<div class="section__prose">
					<p>
						I came into development sideways, through curiosity and apprenticeship rather than a
						computer science degree, and that route still shapes how I work. I am suspicious of
						anything that has never actually run. I write code on the assumption that someone
						(usually a baffled future me) will have to read it later.
					</p>
					<p>
						Left to my own devices, I push the craft further than is strictly justified. Iris
						reached v5.0.0 over 666 commits with close to one test for every source file. Wyrd sits
						at 68.5% statement coverage across 150 Go files, not because anyone asked, but because I
						wanted to find out what real rigour feels like from the inside.
					</p>
					<p>
						On team projects I tend to land between architecture and delivery: building the feature
						in front of me while caring about the shape of the system it has to live in.
					</p>
				</div>
			</section>

			<section class="section">
				<h2 class="section__heading">The toolkit</h2>
				<div class="section__prose">
					<p>
						TypeScript is my default for anything touching the browser or Node. Go is what I reach
						for when something needs to live in the terminal or ship as a single binary. I have
						written enough Rust to wrestle a Tauri desktop app to completion, which is enough to
						respect the ownership model rather than fear it.
					</p>
					<p>
						On the frontend, Svelte 5 with runes is a strong preference. For data: PostgreSQL with
						row-level security, Neo4j when the relationships are the actual model, Supabase when I
						want both in a hurry. I test with Vitest, and I have written Playwright end-to-end
						suites for software that real people depend on.
					</p>
				</div>
			</section>

			<section class="section">
				<h2 class="section__heading">Get in touch</h2>
				<div class="section__prose">
					<p>
						The best way to reach me is by email:
						<a href="mailto:jason@foundersandcoders.com" class="link">
							jason@foundersandcoders.com
						</a>
					</p>
					<p>
						You can also find me on
						<a href={GITHUB_PROFILE_URL} class="link" target="_blank" rel="noopener noreferrer">
							GitHub
						</a>
						where most of this work lives, and on
						<a href={BLUESKY_URL} class="link" target="_blank" rel="noopener noreferrer me">
							Bluesky
						</a>
						at {BLUESKY_HANDLE}.
					</p>
				</div>
			</section>
		</main>

		<aside class="page__aside">
			<div class="aside-card">
				<h2 class="aside-card__heading">Currently</h2>
				<ul class="aside-card__list">
					<li>Developer at Founders and Coders</li>
					<li>Building Wyrd (Go productivity TUI)</li>
					<li>Building Rhea (AI curriculum generator)</li>
				</ul>
			</div>

			<div class="aside-card">
				<h2 class="aside-card__heading">Elsewhere</h2>
				<ul class="aside-card__list">
					<li>
						<a href={GITHUB_PROFILE_URL} class="link" target="_blank" rel="noopener noreferrer">
							GitHub
						</a>
					</li>
					<li>
						<a href={BLUESKY_URL} class="link" target="_blank" rel="noopener noreferrer me">
							Bluesky
						</a>
					</li>
				</ul>
			</div>

			<div class="aside-card">
				<h2 class="aside-card__heading">On this site</h2>
				<ul class="aside-card__list">
					<li>
						<a href="{base}/projects" class="link">All projects</a>
					</li>
					<li>
						<a href="{base}/map" class="link">Project map</a>
					</li>
					<li>
						<a href="{base}/timeline" class="link">Timeline</a>
					</li>
				</ul>
			</div>
		</aside>
	</div>
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-12) var(--layout-padding);
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	.page__header {
		border-bottom: 1px solid var(--color-border);
		padding-bottom: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.page__title {
		font-size: var(--text-4xl);
		font-weight: 700;
		line-height: 1.1;
	}

	.page__intro {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		line-height: 1.6;
		max-width: 60ch;
		margin: 0;
	}

	.page__body {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-10);
	}

	@media (min-width: 56rem) {
		.page__body {
			grid-template-columns: 1fr 18rem;
			align-items: start;
		}
	}

	.page__main {
		display: flex;
		flex-direction: column;
		gap: var(--space-12);
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.section__heading {
		font-size: var(--text-2xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.section__prose {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.section__prose p {
		font-size: var(--text-base);
		line-height: 1.7;
		color: var(--color-text-subtle);
		max-width: 64ch;
		margin: 0;
	}

	.page__aside {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.aside-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.aside-card__heading {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.aside-card__list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 0;
		list-style: none;
	}

	.aside-card__list li {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
	}

	.link {
		color: var(--color-primary-text);
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color var(--transition-fast);
	}

	.link:hover {
		color: var(--color-primary);
	}
</style>
