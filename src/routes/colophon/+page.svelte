<script lang="ts">
	import { base } from '$app/paths';
	import Seo from '$lib/components/seo/Seo.svelte';

	// Code excerpts are held as plain strings so the literal braces and angle
	// brackets render as text, not as Svelte markup. They are trimmed copies of
	// the real source; the file paths beside each one are where they actually live.
	const contributionSnippet = `interface SoloContribution {
	role: 'solo';
}

interface TeamContribution {
	role: 'lead' | 'collaborator';
	/** Specific verified contributions. Required. */
	contributionNote: string;
}

export type Contribution = SoloContribution | TeamContribution;`;

	const slugSnippet = `export type ProjectSlug =
	| 'iris'
	| 'wyrd-tui'
	| 'nib'
	// ...every project, listed by hand

export interface ProjectRelationship {
	kind: 'extracted-from' | 'powers' | 'related';
	target: ProjectSlug; // a typo here will not compile
}`;

	const threadsSnippet = `for (const project of projects) {
	for (const rel of project.relationships) {
		if (rel.kind !== 'powers') continue;

		const consumer = projectBySlug.get(rel.target);
		if (!consumer) continue;

		threads.push({ library: project, consumer, note: rel.note });
	}
}`;

	const sourcesSnippet = `"chirpdb": {
	"head": "cd95e42",
	"commits": 309,
	"lastCommit": "2026-06-12",
	"firstCommit": "2025-12-08"
}`;

	// The pipeline, as data, so the diagram and the prose can never disagree.
	const pipeline = [
		{
			label: 'Source repos',
			detail: 'Real git history across every project I have shipped.'
		},
		{
			label: 'sources.json',
			detail: 'Commit counts, churn and dates, synced by check-drift.js.'
		},
		{
			label: 'projects/*.ts',
			detail: 'Hand-authored typed objects, with the live metrics merged in.'
		},
		{
			label: 'queries.ts',
			detail: 'A pure query and filter layer over the registry.'
		},
		{
			label: 'Derived views',
			detail: 'graph, threads, adoption and themes, all computed at build time.'
		},
		{
			label: 'Prerendered HTML',
			detail: 'Static routes, OG cards and the sitemap. No server at runtime.'
		}
	];
</script>

<Seo
	title="Colophon | Jason Warren"
	description="How this portfolio is built: SvelteKit 2, Svelte 5 runes, a hand-authored TypeScript dataset, derived visualisations, build-time git metrics, and a fully prerendered output."
/>

<div class="page">
	<header class="page__header">
		<h1>Colophon</h1>
		<p class="page__intro">
			A portfolio that keeps insisting the code is the evidence should be willing to show its own
			seams. So here they are. This is how the site you are reading actually works, with the real
			source to back it up.
		</p>
	</header>

	<!-- The stack: skimmable overview ------------------------------------ -->
	<section class="page__section" aria-labelledby="stack-heading">
		<header class="page__section-header">
			<h2 id="stack-heading">The stack, briefly</h2>
			<p>For anyone who just wants the headline before the internals.</p>
		</header>
		<dl class="spec">
			<div class="spec__row">
				<dt>Framework</dt>
				<dd>SvelteKit 2 on Svelte 5, written with runes throughout.</dd>
			</div>
			<div class="spec__row">
				<dt>Language</dt>
				<dd>TypeScript in strict mode. No <code>any</code>; <code>unknown</code> when honest.</dd>
			</div>
			<div class="spec__row">
				<dt>Build</dt>
				<dd>Vite, prerendered to static HTML, deployed on Vercel (nodejs22.x).</dd>
			</div>
			<div class="spec__row">
				<dt>Content</dt>
				<dd>Typed TypeScript objects. No CMS, no markdown, no database.</dd>
			</div>
			<div class="spec__row">
				<dt>Colour</dt>
				<dd>Reasonable Colors, behind semantic tokens, with a no-flash dark theme.</dd>
			</div>
		</dl>
	</section>

	<!-- Content is code -------------------------------------------------- -->
	<section class="page__section" aria-labelledby="content-heading">
		<header class="page__section-header">
			<h2 id="content-heading">The content is code, not a database</h2>
			<p>
				Every project on this site is a typed object in a file. That sounds like a constraint, and
				it is the good kind: the type system refuses to let me describe the work incorrectly.
			</p>
		</header>
		<p class="prose">
			A team project that does not say what I actually did is not a missing field I might notice in
			review. It is a build that fails. The <code>Contribution</code> type discriminates on role, so anything
			that is not solo is forced to carry a verified note before it will compile.
		</p>
		<figure class="code">
			<pre><code>{contributionSnippet}</code></pre>
			<figcaption>src/lib/data/types.ts</figcaption>
		</figure>
		<p class="prose">
			Cross-links between projects are checked the same way. Every slug on the site belongs to one
			hand-written union, so a relationship pointing at a project that does not exist is a typo the
			compiler catches, not a dead link a visitor finds.
		</p>
		<figure class="code">
			<pre><code>{slugSnippet}</code></pre>
			<figcaption>src/lib/data/types.ts</figcaption>
		</figure>
	</section>

	<!-- Everything else is derived --------------------------------------- -->
	<section class="page__section" aria-labelledby="derived-heading">
		<header class="page__section-header">
			<h2 id="derived-heading">Almost everything else is derived</h2>
			<p>
				The map, the timeline, the engine threads and the adoption chart are not separate datasets.
				They are all computed from that one registry of projects when the site builds.
			</p>
		</header>
		<p class="prose">
			The "libraries from the inside out" thread on the home page is a good example. Nothing
			declares those pairings by hand. A library says it <code>powers</code> an application; the derivation
			walks the graph and finds every such pair, so the story stays true to the data rather than to my
			memory of it.
		</p>
		<figure class="code">
			<pre><code>{threadsSnippet}</code></pre>
			<figcaption>src/lib/data/threads.ts</figcaption>
		</figure>

		<figure class="flow" aria-labelledby="flow-caption">
			<ol class="flow__steps" role="list">
				{#each pipeline as step, i (step.label)}
					<li class="flow__step">
						<div class="flow__card">
							<span class="flow__label">{step.label}</span>
							<span class="flow__detail">{step.detail}</span>
						</div>
						{#if i < pipeline.length - 1}
							<span class="flow__arrow" aria-hidden="true">→</span>
						{/if}
					</li>
				{/each}
			</ol>
			<figcaption id="flow-caption">
				One dataset in, every page out. The whole pipeline runs at build time.
			</figcaption>
		</figure>
	</section>

	<!-- Numbers that stay honest ----------------------------------------- -->
	<section class="page__section" aria-labelledby="metrics-heading">
		<header class="page__section-header">
			<h2 id="metrics-heading">The numbers are not typed by hand</h2>
			<p>
				Commit counts, coverage and churn are the easiest things on a portfolio to quietly inflate.
				So I do not write them. A script does.
			</p>
		</header>
		<p class="prose">
			<code>check-drift.js</code> reads the real git history of each source repo and records a
			fingerprint in <code>sources.json</code>. The project objects pick those numbers up at build
			time. When a repo moves on and the site does not, that is drift, and the script is built to
			shout about it. Every figure you see is a measurement, not a claim.
		</p>
		<figure class="code">
			<pre><code>{sourcesSnippet}</code></pre>
			<figcaption>src/lib/data/sources.json</figcaption>
		</figure>
	</section>

	<!-- Static and deterministic ----------------------------------------- -->
	<section class="page__section" aria-labelledby="static-heading">
		<header class="page__section-header">
			<h2 id="static-heading">Static, deterministic, dependency-light</h2>
			<p>The output is plain HTML, and it is the same plain HTML every time.</p>
		</header>
		<p class="prose">
			The project map is laid out with a force simulation, but a deterministic one: identical input
			gives identical output, so the prerendered SVG never drifts between builds. The social cards
			are generated from each project's own metadata with Satori and resvg, then cached forever.
			There is no client-side rendering of content to wait for and no runtime server to fall over. A
			page either built correctly or it did not.
		</p>
	</section>

	<!-- Mini colophon ---------------------------------------------------- -->
	<section class="page__section" aria-labelledby="credits-heading">
		<header class="page__section-header">
			<h2 id="credits-heading">Credits</h2>
		</header>
		<dl class="spec">
			<div class="spec__row">
				<dt>Type</dt>
				<dd>Inter for the interface; JetBrains Mono, Space Grotesk and others for the cards.</dd>
			</div>
			<div class="spec__row">
				<dt>Colour</dt>
				<dd>
					<a
						href="https://www.reasonable.work/colors/"
						class="link"
						target="_blank"
						rel="noopener noreferrer">Reasonable Colors</a
					>, mapped to semantic aliases.
				</dd>
			</div>
			<div class="spec__row">
				<dt>Hosting</dt>
				<dd>Vercel, from a single static build.</dd>
			</div>
			<div class="spec__row">
				<dt>Source</dt>
				<dd>
					All of it is on
					<a
						href="https://github.com/JasonWarrenUK/jason-warren"
						class="link"
						target="_blank"
						rel="noopener noreferrer">GitHub</a
					>, including this page.
				</dd>
			</div>
		</dl>
	</section>
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-12) var(--layout-padding) var(--space-20);
		display: flex;
		flex-direction: column;
		gap: var(--space-16);
	}

	.page__header {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.page__header h1 {
		font-size: var(--text-4xl);
		font-weight: 700;
		line-height: 1.1;
	}

	.page__intro {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		line-height: 1.7;
		max-width: 56rem;
		margin: 0;
	}

	.page__section {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.page__section-header {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.page__section-header h2 {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.page__section-header p {
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		line-height: 1.6;
		max-width: 52rem;
		margin: 0;
	}

	.prose {
		font-size: var(--text-base);
		line-height: 1.7;
		color: var(--color-text-subtle);
		max-width: 64ch;
		margin: 0;
	}

	.prose code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0.1em 0.35em;
		border-radius: var(--radius-sm);
		background-color: var(--color-surface-sunken);
		color: var(--color-text);
	}

	/* Specification lists --------------------------------------------- */
	.spec {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.spec__row {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-1);
		padding: var(--space-4) var(--space-5);
		background-color: var(--color-surface-raised);
	}

	.spec__row + .spec__row {
		border-top: 1px solid var(--color-border);
	}

	@media (min-width: 40rem) {
		.spec__row {
			grid-template-columns: 10rem 1fr;
			gap: var(--space-5);
			align-items: baseline;
		}
	}

	.spec__row dt {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.spec__row dd {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text-subtle);
		margin: 0;
	}

	.spec__row dd code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		color: var(--color-text);
	}

	/* Code excerpts --------------------------------------------------- */
	.code {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
	}

	.code pre {
		margin: 0;
		padding: var(--space-5);
		overflow-x: auto;
		background-color: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.code code {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text);
		white-space: pre;
		tab-size: 2;
	}

	.code figcaption {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		padding-left: var(--space-1);
	}

	/* Data-flow diagram ----------------------------------------------- */
	.flow {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.flow__steps {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: var(--space-3);
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.flow__step {
		display: flex;
		align-items: stretch;
		gap: var(--space-3);
		flex: 1 1 14rem;
	}

	.flow__card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		flex: 1;
		padding: var(--space-4);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.flow__label {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-primary-text);
	}

	.flow__detail {
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--color-text-subtle);
	}

	.flow__arrow {
		align-self: center;
		color: var(--color-text-muted);
		font-size: var(--text-lg);
		flex-shrink: 0;
	}

	.flow figcaption {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		line-height: 1.6;
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
