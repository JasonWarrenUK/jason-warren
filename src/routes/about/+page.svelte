<script lang="ts">
	import Seo from '$lib/components/seo/Seo.svelte';
	import {
		AUTHOR,
		SITE_URL,
		EMAIL,
		GITHUB_PROFILE_URL,
		BLUESKY_URL,
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
			I build systems so I can build tools. I can't build a good tool without first understanding
			the problem it models.
		</p>
	</header>

	<main class="page__main">
		<section class="section">
			<h2 class="section__heading">What I build</h2>
			<div class="section__prose">
				<p>
					I have an intolerance for half-measures. A Go TUI for a productivity system I actually
					use; a Tauri desktop app where the real problem was making XSD validation semantically
					aware rather than structural; a Neo4j-backed fiction engine where the relationships
					between characters are the data model.
				</p>
				<p>
					In fac-cra, I turned a blunt approval queue into a set of configurable segments with their
					own independent logic. In Workwise, I replaced a tangle of loading booleans with a
					discriminated-union state machine.
				</p>
			</div>
		</section>

		<section class="section">
			<h2 class="section__heading">How I work</h2>
			<div class="section__prose">
				<p>
					I was a theatre director. I wrote a book on interactive theatre ("Creating Worlds", Nick
					Hern Books, 2017), and ran courses at drama schools. During lockdown I started learning
					ink, Inkle's scripting language for interactive narrative, and kept going from there.
				</p>
				<p>
					Left to my own devices, I take things further than anyone asked. Iris is built on a single
					TypeScript core driving three completely different interfaces: an OpenTUI terminal UI,
					direct CLI commands, and a Tauri desktop app in Rust. Wyrd has its own Cypher-subset
					parser and a binary merge driver for conflict resolution, because I wanted a proper graph
					query language over JSON files rather than a workaround. This portfolio tracks itself
					through a bespoke git-metrics CLI with a typed JSON Schema contract, because I have ADHD
					and it is genuinely easier for me to build the infrastructure to automate the maintenance
					than to do the maintenance.
				</p>
				<p>On team projects I tend to land between architecture and delivery.</p>
			</div>
		</section>

		<section class="section">
			<h2 class="section__heading">The toolkit</h2>
			<div class="section__prose">
				<p>
					TypeScript for anything where state needs to be modelled explicitly: discriminated unions,
					exhaustive type narrowing, no runtime surprises from a function that lies about what it
					returns. Go when the output should be a binary. Svelte 5 with runes on the frontend;
					PostgreSQL when the relationships are incidental, Neo4j when they are the model. I have
					written enough Rust to ship a Tauri desktop app and know when to stop.
				</p>
			</div>
		</section>

		<section class="section">
			<h2 class="section__heading">Get in touch</h2>
			<p class="contact-links">
				<a href={`mailto:${EMAIL}`} class="link">{EMAIL}</a>
				&bull;
				<a href={GITHUB_PROFILE_URL} class="link" target="_blank" rel="noopener noreferrer"
					>GitHub</a
				>
				&bull;
				<a href={BLUESKY_URL} class="link" target="_blank" rel="noopener noreferrer me">Bluesky</a>
			</p>
		</section>
	</main>
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

	.contact-links {
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		display: flex;
		align-items: center;
		gap: var(--space-3);
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
