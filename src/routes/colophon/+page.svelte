<script lang="ts">
	import Seo from '$lib/components/seo/Seo.svelte';
	import { GITHUB_REPO_URL } from '$lib/config.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

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
	description="How this portfolio is built: SvelteKit 2, Svelte 5 runes, a hand-authored TypeScript dataset, Drift (a bespoke git-metrics CLI), derived visualisations, and a fully prerendered output."
/>

<div class="page">
	<header class="page__header">
		<h1>Colophon</h1>
		<p class="page__intro">
			A portfolio that keeps insisting the code is the evidence should be willing to show its own
			seams. Here they are. This is how the site you are reading actually works, from the data model
			to the bespoke tooling that keeps the numbers honest.
		</p>
	</header>

	<!-- The stack: skimmable overview — stays open ————————————————————— -->
	<section class="page__section" aria-labelledby="stack-heading">
		<header class="page__section-header">
			<h2 id="stack-heading">The stack, briefly</h2>
			<p>For anyone who wants the headline before the internals.</p>
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
				<dt>Metrics</dt>
				<dd>
					Drift — a bespoke git-metrics CLI that makes the numbers a measurement, not a claim.
				</dd>
			</div>
			<div class="spec__row">
				<dt>Colour</dt>
				<dd>Reasonable Colors, behind semantic tokens, with a no-flash dark theme.</dd>
			</div>
		</dl>
	</section>

	<!-- Content is code ——————————————————————————————————————————————— -->
	<details class="page__section page__section--collapsible" aria-labelledby="content-heading">
		<summary class="page__summary">
			<h2 id="content-heading">The content is code, not a database</h2>
			<p class="page__summary-lede">
				Every project is a typed object. The type system refuses to let me describe the work
				incorrectly.
			</p>
			<span class="page__chevron" aria-hidden="true"></span>
		</summary>

		<div class="page__section-body">
			<p class="prose">
				A team project that does not say what I actually did is not a missing field I might notice
				in review — it is a build that fails. The <code>Contribution</code> type discriminates on
				role, so any team-project entry must carry either <code>'lead'</code> or
				<code>'collaborator'</code> before it will compile. The <code>contributionNote</code> field is
				optional by design: manifest-derived projects are auto-listed first, then an editorial note is
				authored later. The shape is enforced at the type level; the content is authored at the human
				level.
			</p>
			<figure class="code">
				{@html data.snippets.contribution}
				<figcaption>src/lib/data/types.ts</figcaption>
			</figure>
			<p class="prose">
				Cross-links between projects are checked the same way. <code>ProjectSlug</code> is now a
				plain <code>string</code> — slugs are discovered dynamically at build time from the manifest,
				so a hand-maintained closed union is not sustainable. Type safety is preserved through two other
				mechanisms: the prerender throws when a relationship target is missing from the project registry,
				and the test suite asserts every target resolves before the build ever runs. What is lost is editor
				autocomplete on literal strings. What is kept is a build that fails on real typos.
			</p>
			<figure class="code">
				{@html data.snippets.slug}
				<figcaption>src/lib/data/types.ts</figcaption>
			</figure>
		</div>
	</details>

	<!-- Everything else is derived ————————————————————————————————————— -->
	<details class="page__section page__section--collapsible" aria-labelledby="derived-heading">
		<summary class="page__summary">
			<h2 id="derived-heading">Almost everything else is derived</h2>
			<p class="page__summary-lede">
				The map, the timeline, the engine threads and the adoption chart are not separate datasets —
				they are all computed from one registry at build time.
			</p>
			<span class="page__chevron" aria-hidden="true"></span>
		</summary>

		<div class="page__section-body">
			<p class="prose">
				The "libraries from the inside out" thread on the home page is a clear example. Nothing
				declares those pairings by hand. A library says it <code>powers</code> an application; the derivation
				walks the graph and finds every such pair, so the story stays true to the data rather than to
				my memory of it.
			</p>
			<figure class="code">
				{@html data.snippets.threads}
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
		</div>
	</details>

	<!-- Drift ——————————————————————————————————————————————————————————— -->
	<details class="page__section page__section--collapsible" aria-labelledby="drift-heading">
		<summary class="page__summary">
			<h2 id="drift-heading">Drift: the numbers stay honest</h2>
			<p class="page__summary-lede">
				Commit counts and churn figures are the easiest things on a portfolio to quietly inflate. So
				I do not write them. A bespoke CLI does.
			</p>
			<span class="page__chevron" aria-hidden="true"></span>
		</summary>

		<div class="page__section-body">
			<p class="prose">
				<code>check-drift.js</code> is a ~2.5k-line Node CLI that compares the last-synced
				fingerprints in <code>sources.json</code> against the live git state of every source repo on
				this machine. It also scans <code>~/Code</code> for git repos not yet in the portfolio, so new
				work surfaces automatically rather than waiting to be remembered.
			</p>
			<p class="prose">
				Each repo produces a fingerprint: commit counts broken down by all-authors versus mine, and
				by lifetime versus the trailing four weeks; line churn on the same axes; lines of code;
				languages by file count; first and last commit dates; and runtime, framework and database
				inferred from manifest files. The fingerprint calls all run concurrently in a bounded worker
				pool, with a HEAD-plus-TTL cache so unchanged repos do not re-scan on every run.
			</p>
			<figure class="code">
				{@html data.snippets.drift}
				<figcaption>scripts/check-drift.js (condensed)</figcaption>
			</figure>
			<p class="prose">
				The CLI exposes several verbs. <code>report</code> (the default) shows only the repos whose
				HEAD has moved since the last sync. <code>snapshot</code> shows every current metric for
				every project. <code>update</code> is the one sanctioned write to <code>sources.json</code>;
				it backfills all resolvable repos, not just those that changed.
				<code>accept</code> and <code>accept-all</code> refresh the baseline for manual overrides
				without discarding them. <code>--check</code> exits non-zero when drift is detected, so CI can
				gate on a clean portfolio state.
			</p>
			<figure class="code">
				{@html data.snippets.sources}
				<figcaption>src/lib/data/sources.json (one entry)</figcaption>
			</figure>
			<p class="prose">
				Every figure you see on this site is a measurement from that manifest, not a claim I typed.
				That is the line the whole honesty thesis rests on.
			</p>
		</div>
	</details>

	<!-- Static and deterministic ——————————————————————————————————————— -->
	<details class="page__section page__section--collapsible" aria-labelledby="static-heading">
		<summary class="page__summary">
			<h2 id="static-heading">Static, deterministic, dependency-light</h2>
			<p class="page__summary-lede">
				The output is plain HTML, and it is the same plain HTML every time.
			</p>
			<span class="page__chevron" aria-hidden="true"></span>
		</summary>

		<div class="page__section-body">
			<p class="prose">
				The project map is laid out with a force simulation, but a deterministic one: identical
				input gives identical output, so the prerendered SVG never drifts between builds. The social
				cards are generated from each project's own metadata with Satori and resvg, then cached
				forever. The syntax highlighting on this page is baked in at build time by Shiki — the
				browser receives finished HTML and no highlighter ever runs in the client. There is no
				client-side rendering of content to wait for and no runtime server to fall over. A page
				either built correctly or it did not.
			</p>
		</div>
	</details>

	<!-- Credits — stays open (short) ——————————————————————————————————— -->
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
						href={GITHUB_REPO_URL}
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

	/* Sections ——————————————————————————————————————————————————————————— */

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

	/* Collapsible sections (<details>) —————————————————————————————————— */

	.page__section--collapsible {
		/* <details> is a block element; match the flex column layout of .page__section */
		gap: 0;
	}

	.page__summary {
		list-style: none;
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
		gap: var(--space-1) var(--space-4);
		align-items: start;
		padding: var(--space-5) 0;
		cursor: pointer;
		border-top: 1px solid var(--color-border);
		user-select: none;
	}

	/* Remove the native disclosure triangle in all browsers. */
	.page__summary::-webkit-details-marker {
		display: none;
	}

	.page__summary::marker {
		content: '';
	}

	.page__summary h2 {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
		grid-column: 1;
		grid-row: 1;
		margin: 0;
	}

	.page__summary-lede {
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		line-height: 1.6;
		max-width: 52rem;
		margin: 0;
		grid-column: 1;
		grid-row: 2;
	}

	/* Chevron — rotates when open. */
	.page__chevron {
		grid-column: 2;
		grid-row: 1 / 3;
		align-self: center;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		color: var(--color-text-muted);
		transition: transform var(--transition-base);
		flex-shrink: 0;
	}

	.page__chevron::before {
		content: '';
		display: block;
		width: 0.5rem;
		height: 0.5rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg) translate(-1px, -1px);
		transition: transform var(--transition-base);
	}

	details[open] .page__chevron::before {
		transform: rotate(-135deg) translate(-1px, -1px);
	}

	@media (prefers-reduced-motion: reduce) {
		.page__chevron,
		.page__chevron::before {
			transition: none;
		}
	}

	.page__summary:hover h2 {
		color: var(--color-primary-text);
	}

	.page__summary:hover .page__chevron {
		color: var(--color-primary-text);
	}

	.page__summary:focus-visible {
		outline: 2px solid var(--color-primary-text);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	.page__section-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding-bottom: var(--space-4);
	}

	/* Prose ——————————————————————————————————————————————————————————————— */

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

	/* Specification lists —————————————————————————————————————————————— */

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

	/* Code excerpts —————————————————————————————————————————————————————
	 * .shiki is the <pre> element Shiki emits. Background comes from the
	 * site's own surface token; foreground tokens are driven by the
	 * dual-theme rules in tokens.css via --shiki / --shiki-dark vars.
	 */

	.code {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0;
	}

	.code :global(.shiki) {
		margin: 0;
		padding: var(--space-5);
		overflow-x: auto;
		background-color: var(--color-surface-sunken) !important;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.code :global(.shiki code) {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: 1.6;
		white-space: pre;
		tab-size: 2;
		background: none !important;
	}

	.code figcaption {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		padding-left: var(--space-1);
	}

	/* Data-flow diagram —————————————————————————————————————————————————— */

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

	/* Links ——————————————————————————————————————————————————————————————— */

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
