<script lang="ts">
	import Seo from '$lib/components/seo/Seo.svelte';
	import FlipCard from '$lib/components/ui/FlipCard.svelte';
	import ScrollStage from '$lib/components/ui/ScrollStage.svelte';
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
			detail: 'Commit counts, churn and dates, synced by the Drift engine.'
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

	// The Drift architecture layers, as data. Mirrors the pipeline pattern so
	// the diagram and the prose describing each layer cannot drift apart.
	const driftLayers = [
		{
			id: 'engine',
			label: 'Core engine',
			path: 'scripts/check-drift.js',
			detail:
				'Framework-agnostic. Fingerprints repos, owns the data files, knows nothing about Svelte.'
		},
		{
			id: 'contract',
			label: 'Schema contract',
			path: 'scripts/sources.schema.json',
			detail:
				'JSON Schema draft-07, additionalProperties: false. The engine validates every record before writing.'
		},
		{
			id: 'integration',
			label: 'Integration layer',
			path: 'src/lib/data/',
			detail:
				'Build-time registry. Reads files as static JSON, assembles typed Project objects for the site.'
		}
	];

	// Verb table, as data. write: null = read-only verb.
	const driftVerbs: { verb: string; does: string; write: string | null }[] = [
		{
			verb: 'report',
			does: 'Field-level drift for repos whose HEAD moved. --full diffs all; --check exits non-zero; --json for scripts.',
			write: null
		},
		{
			verb: 'snapshot',
			does: 'Every current metric for every repo, one card per project.',
			write: null
		},
		{
			verb: 'sync',
			does: 'The one sanctioned write to the manifest. Backfills all resolvable repos, bypasses the cache, schema-gated.',
			write: 'sources.json'
		},
		{
			verb: 'keep / keep-all',
			does: 'Refresh the baseline behind a manual override without discarding the override value.',
			write: 'overrides.json'
		},
		{
			verb: 'hide',
			does: 'Drop a repo from the public site.',
			write: 'excluded.json'
		},
		{
			verb: 'promote',
			does: 'Graduate in-flight work off an unmerged branch into the staging pipeline.',
			write: 'in-progress.json'
		},
		{
			verb: 'author',
			does: 'Scaffold projects/<slug>.ts from a commented template if absent, then open in $EDITOR.',
			write: 'projects/<slug>.ts'
		},
		{
			verb: 'flag',
			does: 'flag <slug> --pin | --hide. Set a curation flag in the overlay via TypeScript compiler-API splice.',
			write: 'projects/<slug>.ts'
		},
		{
			verb: 'audit',
			does: 'Editorial-depth scoring (Full / Partial / Thin) across all overlays. Recomputes from live files.',
			write: null
		},
		{
			verb: 'init',
			does: 'Scaffold the per-machine config files. Interactive prompts when a TTY is present.',
			write: 'config files'
		},
		{
			verb: 'help',
			does: 'Per-verb help, rendered in gum-formatted markdown.',
			write: null
		}
	];
</script>

<Seo
	title="Drift Engine | Jason Warren"
	description="The bespoke CLI that keeps this portfolio honest: how Drift measures real git history, validates every figure against a JSON Schema contract and feeds the site without a database or a server."
/>

<div class="page">
	<!-- ── Page header ──────────────────────────────────────────────────── -->
	<header class="page__header">
		<h1>Drift Engine</h1>
		<p class="page__intro">
			Every commit count, churn figure and timeline date on this site is measured by a bespoke CLI,
			validated against a schema and written to a manifest the build reads. None of it is typed by
			hand.
		</p>
	</header>

	<!-- ── Hero stat strip: the stack at a glance ───────────────────────── -->
	<section class="hero" aria-labelledby="stack-heading">
		<div class="hero__head">
			<span class="hero__eyebrow">the build, in depth</span>
			<h2 id="stack-heading">The stack, briefly</h2>
			<p class="hero__lede">For anyone who wants the headline before the internals.</p>
		</div>
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
					Drift: a decoupled git-metrics engine with a JSON Schema output contract, running on Bun.
				</dd>
			</div>
			<div class="spec__row">
				<dt>Colour</dt>
				<dd>Reasonable Colors, behind semantic tokens, with a no-flash dark theme.</dd>
			</div>
		</dl>
	</section>

	<!-- ── Gallery wall: masonry of flip cards + flow tile ──────────────── -->
	<section class="gallery" aria-label="How this portfolio is built">
		<!-- Flip card 1: the content is code ─────────────────────────────── -->
		<FlipCard label="The content is code">
			{#snippet front()}
				<div class="flip-front">
					<h3 class="flip-front__title">The content is code, not a database</h3>
					<p class="flip-front__lede">
						Every project is a typed object. The type system refuses to let me describe the work
						incorrectly.
					</p>
					<p class="flip-front__body">
						A team project that does not say what I actually did fails the build. The
						<code>Contribution</code> type discriminates on role, so any team-project entry must
						carry either <code>'lead'</code> or <code>'collaborator'</code> before it will compile.
					</p>
					<span class="flip-front__hint" aria-hidden="true">Flip for the code →</span>
				</div>
			{/snippet}
			{#snippet back()}
				<div class="flip-back">
					<p class="flip-back__intro">
						Once the shape is enforced at the type level, I write the editorial content myself.
						Cross-links are checked at build time: the prerender throws on dangling slugs and the
						test suite asserts every target resolves before the build runs.
					</p>
					<figure class="code">
						{@html data.snippets.contribution}
						<figcaption>src/lib/data/types.ts: Contribution discriminated union</figcaption>
					</figure>
					<figure class="code">
						{@html data.snippets.slug}
						<figcaption>src/lib/data/types.ts: ProjectSlug and cross-link safety</figcaption>
					</figure>
				</div>
			{/snippet}
		</FlipCard>

		<!-- Flip card 2: everything is derived ───────────────────────────── -->
		<FlipCard label="Everything is derived">
			{#snippet front()}
				<div class="flip-front">
					<h3 class="flip-front__title">Almost everything else is derived</h3>
					<p class="flip-front__lede">
						The map, the timeline, the engine threads and the adoption chart are all computed from
						one registry at build time.
					</p>
					<p class="flip-front__body">
						The "libraries from the inside out" thread on the home page is a clear example. Nothing
						declares those pairings by hand. A library says it <code>powers</code> an application; the
						derivation walks the graph and finds every such pair, so the story stays true to the data
						rather than to my memory of it.
					</p>
					<span class="flip-front__hint" aria-hidden="true">Flip for the code →</span>
				</div>
			{/snippet}
			{#snippet back()}
				<div class="flip-back">
					<p class="flip-back__intro">
						One dataset in, every page out. The whole derivation runs at build time, so there is
						nothing to hydrate and no runtime to fall over.
					</p>
					<figure class="code">
						{@html data.snippets.threads}
						<figcaption>src/lib/data/threads.ts: engine-thread derivation</figcaption>
					</figure>
				</div>
			{/snippet}
		</FlipCard>

		<!-- Pipeline flow tile ───────────────────────────────────────────── -->
		<details class="tile tile--flow page__section--collapsible" aria-labelledby="flow-heading">
			<summary class="page__summary">
				<h3 id="flow-heading" class="tile--flow__title">One dataset in, every page out</h3>
				<p class="page__summary-lede">
					The whole build pipeline, from real git history to prerendered HTML.
				</p>
				<span class="page__chevron" aria-hidden="true"></span>
			</summary>

			<figure class="flow">
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
				<figcaption>
					One dataset in, every page out. The whole pipeline runs at build time.
				</figcaption>
			</figure>
		</details>

		<!-- Fact callout tile: static + deterministic ────────────────────── -->
		<article class="tile tile--callout-accent" aria-label="Build characteristics">
			<h3 class="tile--callout__title">Static, deterministic, dependency-light</h3>
			<p class="tile--callout__body">
				The project map is laid out with a force simulation, but a deterministic one: identical
				input gives identical output, so the prerendered SVG never drifts between builds. Each
				social card is procedurally generated from four project dimensions: the kind sets the colour
				scheme, the curated language tags drive a row of branded glyphs, the runtime selects a
				background geometry tiled across the canvas, and the data model picks the typeface for the
				project name. Satori lays it out as SVG; resvg rasterises it to PNG at build time. Identical
				inputs produce an identical card, so the prerendered result never drifts between builds. The
				syntax highlighting is baked in at build time by Shiki; the browser receives finished HTML.
				A page either built correctly or it did not.
			</p>
		</article>
	</section>

	<!-- ══════════════════════════════════════════════════════════════════════
	     Drift — centrepiece feature
	     ══════════════════════════════════════════════════════════════════════ -->
	<section class="drift" aria-labelledby="drift-heading">
		<header class="drift__header">
			<div class="drift__title-row">
				<h2 id="drift-heading">Drift</h2>
				<span class="drift__tag">bespoke tooling</span>
			</div>
			<p class="drift__lede">
				Commit counts and churn figures are the easiest things on a portfolio to quietly inflate. So
				I do not write them. A bespoke CLI measures them against a schema that decides what it is
				allowed to say.
			</p>
		</header>

		<!-- ══ Scrollytelling: five stations replace five accordions ══════════
		     SSR truth: all prose + figures always in-flow (readable with no JS).
		     JS enhancement: sticky stage-col cross-fades schematics as you scroll.
		     ══════════════════════════════════════════════════════════════════ -->

		<!--
			Station snippets — the SSR truth. Each contains the station's real
			heading, prose, and figure(s). These are always rendered in-flow.
		-->
		{#snippet stationSplit()}
			<h3 id="drift-split-heading">The split</h3>
			<p class="drift__station-lede">
				Two things with a contract between them. The engine measures; the integration layer
				presents.
			</p>
			<p class="prose">
				Drift started as a single script that did everything: walked the repos, measured them, wrote
				the manifest and understood how the site would render every figure. Measurement was tangled
				with presentation, so neither could move without the other.
			</p>
			<p class="prose">
				It is now two things with a contract between them. The engine (<code
					>scripts/check-drift.js</code
				>) is a framework-agnostic Bun script: it fingerprints repos, owns the four data files, and
				knows nothing about Svelte. The integration layer (<code>src/lib/data/</code>) is build-time
				SvelteKit code: it reads those files as static JSON imports and assembles the typed
				<code>Project</code> objects the site is built from. The engine could be lifted out as a standalone
				package and nothing on the site would notice.
			</p>
			<figure
				class="drift__arch"
				aria-label="Architecture: engine, schema contract, integration layer"
			>
				<div class="arch__layers">
					{#each driftLayers as layer, i (layer.id)}
						<div class="arch__layer arch__layer--{layer.id}">
							<span class="arch__layer-label">{layer.label}</span>
							<code class="arch__layer-path">{layer.path}</code>
							<span class="arch__layer-detail">{layer.detail}</span>
						</div>
						{#if i < driftLayers.length - 1}
							<div class="arch__connector" aria-hidden="true">
								<span class="arch__arrow">→</span>
							</div>
						{/if}
					{/each}
				</div>
				<figcaption>
					The engine owns measurement; the integration layer owns presentation. The schema is the
					seam.
				</figcaption>
			</figure>
			<figure class="drift__split-visual" aria-label="Before and after the decoupling">
				<div class="split__before">
					<span class="split__label">Before</span>
					<div class="split__box split__box--mono">
						<span class="split__box-title">check-drift.js</span>
						<ul class="split__box-items" role="list">
							<li>fingerprint repos</li>
							<li>write manifest</li>
							<li>render output</li>
							<li>know the site's data shape</li>
						</ul>
					</div>
				</div>
				<div class="split__arrow" aria-hidden="true">→</div>
				<div class="split__after">
					<span class="split__label">After</span>
					<div class="split__boxes">
						<div class="split__box split__box--engine">
							<span class="split__box-title">engine</span>
							<ul class="split__box-items" role="list">
								<li>fingerprint repos</li>
								<li>write manifest</li>
							</ul>
						</div>
						<div class="split__schema" aria-hidden="true">
							<span class="split__schema-label">schema</span>
						</div>
						<div class="split__box split__box--integration">
							<span class="split__box-title">integration</span>
							<ul class="split__box-items" role="list">
								<li>assemble Projects</li>
								<li>render output</li>
							</ul>
						</div>
					</div>
				</div>
			</figure>
		{/snippet}

		{#snippet stationContract()}
			<h3 id="drift-contract-heading">The contract</h3>
			<p class="drift__station-lede">
				JSON Schema draft-07 with <code>additionalProperties: false</code>. A violation throws and
				writes nothing.
			</p>
			<p class="prose">
				Between the engine and the integration layer sits <code>sources.schema.json</code>: a JSON
				Schema draft-07 definition with <code>additionalProperties: false</code>. The engine
				validates every assembled record against it before writing anything. A violation is a
				programming error in the engine, not a user-data problem, so the response is blunt: throw,
				write nothing. A half-correct manifest never reaches disk.
			</p>
			<p class="prose">
				This makes adding a new metric a deliberate three-step act. Declare the property in the
				schema. Add it to the <code>SyncedSource</code> interface in <code>index.ts</code>. Return
				it from <code>getFingerprint</code> in the engine. Miss one and the build tells you, either
				at <code>bun run check</code> or when the engine throws on its next sync. The boundary is not
				a convention I am trusting myself to respect; it is enforced.
			</p>
			<figure class="code">
				{@html data.snippets.drift}
				<figcaption>scripts/check-drift.js: validation gate</figcaption>
			</figure>
			<aside class="callout">
				<strong>Fail-closed invariant:</strong> the engine throws and writes nothing on a schema violation.
				The Svelte integration layer never sees a partial or off-contract manifest.
			</aside>
		{/snippet}

		{#snippet stationMeasure()}
			<h3 id="drift-measurement-heading">Measurement</h3>
			<p class="drift__station-lede">
				Every figure is measured against the canonical commit, not the working tree, via a bounded
				concurrent worker pool.
			</p>
			<p class="prose">
				For each repo, <code>getFingerprint</code> fans a set of independent git calls out via
				<code>Promise.all</code> against the resolved default branch, not whatever happens to be
				checked out locally. <code>defaultBranch</code> resolves <code>origin/HEAD</code>, then
				<code>main</code>, then <code>master</code>, falling back to bare <code>HEAD</code> only
				when none of those exist. The resolved ref is recorded as <code>measuredRef</code> in the
				manifest, excluded from drift comparisons via <code>DRIFT_SKIP_FIELDS</code>, so a branch
				rename never registers as drift.
			</p>
			<p class="prose">
				Lines of code and languages are read straight from git blobs via
				<code>git cat-file --batch</code>, not the working tree, so the measurement is always
				against the canonical commit. Repos run concurrently across a bounded worker pool (<code
					>cpus().length</code
				>
				slots). A HEAD-plus-TTL cache, keyed on the measured commit's SHA and gitignored, means an unchanged
				repo is not re-scanned. <code>drift sync</code>
				and <code>--no-cache</code> bypass it.
			</p>
			<p class="prose">
				Per repo, the fingerprint covers: commit counts on two axes (mine versus all authors,
				lifetime versus trailing four weeks); line churn on the same axes; lines of code; languages
				by file count; first and last commit dates; and the runtime, framework and database inferred
				from manifest files.
			</p>
			<figure class="code">
				{@html data.snippets.sources}
				<figcaption>src/lib/data/sources.json: one entry, every field a measurement</figcaption>
			</figure>
		{/snippet}

		{#snippet stationStaging()}
			<h3 id="drift-staging-heading">The staging pipeline</h3>
			<p class="drift__station-lede">
				In-flight work surfaces on the site before it merges, via a self-healing three-tier
				precedence chain.
			</p>
			<p class="prose">
				Work that is still on an unmerged branch has no entry in <code>sources.json</code> yet, but
				it can still surface on the site. A committed <code>in-progress.json</code> holds
				provisional metrics for in-flight projects: the branch name, a promotion pipeline (ordered
				merge targets), a visibility flag (<code>'public'</code> surfaces on the site;
				<code>'local'</code> stays in the CLI), and per-field tracked values with their
				<code>baseOnMain</code> counterpart for context.
			</p>
			<p class="prose">
				The integration layer's <code>withSyncedMetrics</code> applies a three-tier precedence
				across every metric field. Manual overrides win; real synced figures come next; provisional
				values from <code>in-progress.json</code> are the floor. Once a branch lands and
				<code>drift sync</code> picks up real numbers, the synced value naturally shadows the provisional
				one. Promotion is self-healing: no stale figures leak through.
			</p>
			<figure class="code">
				{@html data.snippets.precedence}
				<figcaption>src/lib/data/index.ts: metric precedence chain</figcaption>
			</figure>
		{/snippet}

		{#snippet stationVerbs()}
			<h3 id="drift-verbs-heading">The verbs</h3>
			<p class="drift__station-lede">
				Each write verb touches exactly one file. Read-only verbs touch nothing at all.
			</p>
			<div class="drift__table-wrap">
				<table class="verb-table">
					<thead>
						<tr>
							<th scope="col">Verb</th>
							<th scope="col">Does</th>
							<th scope="col">Writes</th>
						</tr>
					</thead>
					<tbody>
						{#each driftVerbs as row (row.verb)}
							<tr>
								<td><code>{row.verb}</code></td>
								<td>{row.does}</td>
								<td>
									{#if row.write}
										<code class="verb-table__write">{row.write}</code>
									{:else}
										<span class="verb-table__none">nothing</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/snippet}

		<!--
			Stage panel snippets — JS-only decorative schematics shown in the
			sticky column. Each receives the station index (unused; kept for
			the Snippet<[number]> interface). These are aria-hidden companions,
			never the content truth.
		-->
		{#snippet stageSplit(_i: number)}
			<div class="stage-arch">
				<p class="drift__stage-caption">Architecture</p>
				<div class="stage-arch__layers">
					{#each driftLayers as layer, i (layer.id)}
						<div class="stage-arch__layer stage-arch__layer--{layer.id}">
							<span class="stage-arch__label">{layer.label}</span>
							<code class="stage-arch__path">{layer.path}</code>
							<span class="stage-arch__detail">{layer.detail}</span>
						</div>
						{#if i < driftLayers.length - 1}
							<div class="stage-arch__arrow" aria-hidden="true">↓</div>
						{/if}
					{/each}
				</div>
			</div>
		{/snippet}

		{#snippet stageContract(_i: number)}
			<div class="stage-gate">
				<p class="drift__stage-caption">Fail-closed gate</p>
				<div class="stage-gate__node stage-gate__node--schema">
					<span class="stage-gate__label">sources.schema.json</span>
					<span class="stage-gate__detail">JSON Schema draft-07, additionalProperties: false</span>
				</div>
				<div class="stage-gate__arrow" aria-hidden="true">↓ validate</div>
				<div class="stage-gate__node stage-gate__node--pass">
					<span class="stage-gate__label">✓ write manifest</span>
					<span class="stage-gate__detail">All records valid: single sanctioned write</span>
				</div>
				<div class="stage-gate__arrow" aria-hidden="true">↓ or</div>
				<div class="stage-gate__node stage-gate__node--fail">
					<span class="stage-gate__label">✕ throw, write nothing</span>
					<span class="stage-gate__detail">Any violation: manifest stays untouched</span>
				</div>
			</div>
		{/snippet}

		{#snippet stageMeasure(_i: number)}
			<div class="stage-pool">
				<p class="drift__stage-caption">Worker pool</p>
				<div class="stage-pool__source">origin/HEAD → canonical commit</div>
				<div class="stage-pool__arrow" aria-hidden="true">↓ Promise.all</div>
				<div class="stage-pool__workers">
					<span class="stage-pool__worker">commits</span>
					<span class="stage-pool__worker">churn</span>
					<span class="stage-pool__worker">languages</span>
					<span class="stage-pool__worker">linesOfCode</span>
					<span class="stage-pool__worker">dates</span>
					<span class="stage-pool__worker">runtime</span>
				</div>
				<div class="stage-pool__arrow" aria-hidden="true">↓ fingerprint</div>
				<div class="stage-pool__result">SyncedSource record</div>
			</div>
		{/snippet}

		{#snippet stageStaging(_i: number)}
			<div class="stage-tiers">
				<p class="drift__stage-caption">Metric precedence</p>
				<div class="stage-tiers__tier stage-tiers__tier--active">
					<span class="stage-tiers__name">override</span>
					<span class="stage-tiers__note">manual, always wins</span>
				</div>
				<div class="stage-tiers__tier">
					<span class="stage-tiers__name">synced</span>
					<span class="stage-tiers__note">real git figure</span>
				</div>
				<div class="stage-tiers__tier">
					<span class="stage-tiers__name">provisional</span>
					<span class="stage-tiers__note">in-progress.json</span>
				</div>
				<div class="stage-tiers__tier">
					<span class="stage-tiers__name">authored</span>
					<span class="stage-tiers__note">floor / default</span>
				</div>
			</div>
		{/snippet}

		{#snippet stageVerbs(_i: number)}
			<div class="stage-verbs">
				<p class="drift__stage-caption">CLI verbs</p>
				<div class="stage-verbs__chips">
					{#each driftVerbs as row (row.verb)}
						<span class="stage-verbs__chip" class:stage-verbs__chip--write={!!row.write}>
							{row.verb.split(' ')[0]}
						</span>
					{/each}
				</div>
			</div>
		{/snippet}

		<ScrollStage
			label="How Drift is built, in five stages"
			stations={[stationSplit, stationContract, stationMeasure, stationStaging, stationVerbs]}
			stagePanels={[stageSplit, stageContract, stageMeasure, stageStaging, stageVerbs]}
		/>

		<!-- ── Closing ────────────────────────────────────────────────────── -->
		<p class="drift__closing">
			Every figure you see on this site is a measurement from that manifest, validated against a
			schema.
		</p>
	</section>

	<!-- ── Outro ────────────────────────────────────────────────────────── -->
	<section class="outro" aria-labelledby="credits-heading">
		<h2 id="credits-heading" class="sr-only">Credits</h2>
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
					<a href={GITHUB_REPO_URL} class="link" target="_blank" rel="noopener noreferrer">GitHub</a
					>, including this page.
				</dd>
			</div>
		</dl>
	</section>
</div>

<style>
	/* ── Page shell ──────────────────────────────────────────────────────── */

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

	/* ── Hero stat strip ────────────────────────────────────────────────── */

	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-8);
		background-color: var(--color-primary-bg);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-xl);
	}

	.hero__head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.hero__eyebrow {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-primary-text);
	}

	.hero__head h2 {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.hero__lede {
		font-size: var(--text-base);
		color: var(--color-text-subtle);
		line-height: 1.6;
		margin: 0;
	}

	/* ── Gallery masonry wall ───────────────────────────────────────────── */

	.gallery {
		columns: 24rem;
		column-gap: var(--layout-gap);
	}

	.gallery > :global(*) {
		break-inside: avoid;
		margin-bottom: var(--layout-gap);
		width: 100%;
	}

	/* ── Flip card inner content ────────────────────────────────────────── */

	.flip-front,
	.flip-back {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-top: var(--space-2); /* breathing room below the flip toggle */
	}

	.flip-front__title {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
		margin: 0;
		padding-right: var(--space-16); /* avoid overlap with toggle button */
	}

	.flip-front__lede {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--color-text-subtle);
		line-height: 1.5;
		margin: 0;
	}

	.flip-front__body {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.7;
		margin: 0;
	}

	.flip-front__hint {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-primary-text);
		margin-top: auto;
	}

	.flip-back__intro {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.7;
		margin: 0;
		padding-right: var(--space-16); /* avoid overlap with toggle button */
	}

	/* ── Flow tile (pipeline diagram inside a toggle) ───────────────────── */

	.tile--flow {
		gap: 0;
	}

	.tile--flow__title {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
		margin: 0;
	}

	/* ── Accent callout tile ────────────────────────────────────────────── */

	.tile--callout-accent {
		padding: var(--space-6);
		border-left: 3px solid var(--color-accent);
		background-color: var(--color-accent-bg);
		border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
	}

	.tile--callout__title {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--color-accent-text);
		margin: 0 0 var(--space-3);
	}

	.tile--callout__body {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.7;
		margin: 0;
	}

	/* ── Collapsible sections (<details>) ───────────────────────────────── */

	.page__section--collapsible {
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

	.page__summary::-webkit-details-marker {
		display: none;
	}

	.page__summary::marker {
		content: '';
	}

	.page__summary h3 {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.2;
		grid-column: 1;
		grid-row: 1;
		margin: 0;
	}

	.page__summary-lede {
		font-size: var(--text-sm);
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

	.page__summary:hover h3 {
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

	/* ── Prose ──────────────────────────────────────────────────────────── */

	.prose {
		font-size: var(--text-base);
		line-height: 1.7;
		color: var(--color-text-subtle);
		max-width: 64ch;
		margin: 0;
	}

	.prose code,
	.flip-front__body code,
	.flip-back__intro code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0.1em 0.35em;
		border-radius: var(--radius-sm);
		background-color: var(--color-surface-sunken);
		color: var(--color-text);
	}

	/* ── Specification lists ─────────────────────────────────────────────── */

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

	/* ── Code excerpts ───────────────────────────────────────────────────── */

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

	/* ── Data-flow diagram ───────────────────────────────────────────────── */

	.flow {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4) 0 var(--space-2);
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
		flex: 1 1 10rem;
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

	/* ── Links ──────────────────────────────────────────────────────────── */

	.link {
		color: var(--color-primary-text);
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color var(--transition-fast);
	}

	.link:hover {
		color: var(--color-primary);
	}

	/* ══════════════════════════════════════════════════════════════════════
	   Drift centrepiece
	   ══════════════════════════════════════════════════════════════════════ */

	.drift {
		display: flex;
		flex-direction: column;
		gap: 0;
		border-top: 2px solid var(--color-primary);
	}

	.drift__header {
		padding: var(--space-8) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.drift__title-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
	}

	.drift__title-row h2 {
		font-size: var(--text-4xl);
		font-weight: 700;
		color: var(--color-text);
		line-height: 1.1;
		margin: 0;
		letter-spacing: -0.02em;
	}

	.drift__tag {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-primary-text);
		background-color: var(--color-primary-bg);
		padding: 0.2em 0.6em;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-primary);
		white-space: nowrap;
	}

	.drift__lede {
		font-size: var(--text-xl);
		line-height: 1.6;
		color: var(--color-text-subtle);
		max-width: 60ch;
		margin: 0;
	}

	/* Station heading + lede (in-flow, always visible) */

	.drift__station-lede {
		font-size: var(--text-sm);
		color: var(--color-text-subtle);
		line-height: 1.6;
		margin: 0;
	}

	/* Stage caption (sticky panel label, aria-hidden) */

	.drift__stage-caption {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		margin: 0 0 var(--space-3);
	}

	/* Architecture diagram */

	.drift__arch {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.arch__layers {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: var(--space-3);
	}

	.arch__layer {
		flex: 1 1 14rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-5);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background-color: var(--color-surface-raised);
	}

	.arch__layer--contract {
		background-color: var(--color-primary-bg);
		border-color: var(--color-primary);
	}

	.arch__layer-label {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-text);
	}

	.arch__layer--contract .arch__layer-label {
		color: var(--color-primary-text);
	}

	.arch__layer-path {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		background: none;
	}

	.arch__layer-detail {
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--color-text-subtle);
	}

	.arch__connector {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		align-self: center;
	}

	.arch__arrow {
		color: var(--color-text-muted);
		font-size: var(--text-xl);
	}

	.drift__arch figcaption {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		line-height: 1.6;
	}

	/* Monolith split visual */

	.drift__split-visual {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-6);
	}

	.split__before,
	.split__after {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		flex: 1 1 14rem;
	}

	.split__label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.split__arrow {
		align-self: center;
		color: var(--color-text-muted);
		font-size: var(--text-2xl);
		flex-shrink: 0;
		padding-top: var(--space-6);
	}

	.split__box {
		padding: var(--space-4) var(--space-5);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-raised);
	}

	.split__box--mono {
		border-color: var(--color-text-muted);
		opacity: 0.7;
	}

	.split__box-title {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--color-primary-text);
		margin-bottom: var(--space-3);
	}

	.split__box-items {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.split__box-items li {
		font-size: var(--text-xs);
		color: var(--color-text-subtle);
		line-height: 1.4;
		padding-left: var(--space-3);
		position: relative;
	}

	.split__box-items li::before {
		content: '·';
		position: absolute;
		left: 0;
		color: var(--color-text-muted);
	}

	.split__boxes {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.split__schema {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-2) var(--space-4);
		background-color: var(--color-primary-bg);
		border-left: 1px solid var(--color-primary);
		border-right: 1px solid var(--color-primary);
	}

	.split__schema-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-primary-text);
		letter-spacing: 0.05em;
	}

	.split__box--engine {
		border-bottom: none;
		border-radius: var(--radius-md) var(--radius-md) 0 0;
	}

	.split__box--integration {
		border-top: none;
		border-radius: 0 0 var(--radius-md) var(--radius-md);
	}

	/* Callout */

	.callout {
		padding: var(--space-4) var(--space-5);
		border-left: 3px solid var(--color-primary);
		background-color: var(--color-primary-bg);
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text-subtle);
		max-width: 64ch;
	}

	.callout strong {
		color: var(--color-primary-text);
		font-weight: 600;
	}

	/* Verb table */

	.drift__table-wrap {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	.verb-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.verb-table thead {
		background-color: var(--color-surface-raised);
	}

	.verb-table th {
		text-align: left;
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--color-border);
		white-space: nowrap;
	}

	.verb-table td {
		padding: var(--space-3) var(--space-4);
		color: var(--color-text-subtle);
		line-height: 1.5;
		vertical-align: top;
	}

	.verb-table td:first-child {
		white-space: nowrap;
	}

	.verb-table td code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0.1em 0.35em;
		border-radius: var(--radius-sm);
		background-color: var(--color-surface-sunken);
		color: var(--color-text);
	}

	.verb-table tr + tr td {
		border-top: 1px solid var(--color-border);
	}

	.verb-table__write {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0.1em 0.35em;
		border-radius: var(--radius-sm);
		background-color: var(--color-surface-sunken);
		color: var(--color-text);
	}

	.verb-table__none {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Drift closing line */

	.drift__closing {
		font-size: var(--text-base);
		line-height: 1.7;
		color: var(--color-text-subtle);
		max-width: 64ch;
		margin: 0;
		padding: var(--space-8) 0 var(--space-4);
		border-top: 1px solid var(--color-border);
		font-style: italic;
	}

	/* ── Outro ──────────────────────────────────────────────────────────── */

	.outro {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* ── Screen-reader only ──────────────────────────────────────────────── */

	.sr-only {
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
</style>
