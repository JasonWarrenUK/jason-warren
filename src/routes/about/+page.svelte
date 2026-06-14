<script lang="ts">
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>About — Jason Warren</title>
	<meta
		name="description"
		content="Jason Warren is a full-stack developer at Founders and Coders, building tools across Go, TypeScript, Rust, and Svelte."
	/>
</svelte:head>

<div class="page">
	<header class="page__header">
		<h1 class="page__title">About</h1>
	</header>

	<div class="page__body">
		<main class="page__main">
			<section class="section">
				<h2 class="section__heading">Who I am</h2>
				<div class="section__prose">
					<p>
						I'm Jason Warren, a full-stack developer at Founders and Coders. I work across the whole
						stack — from terminal tools in Go to native desktop apps in Tauri, from graph databases
						in Neo4j to reactive UIs in Svelte 5. The breadth is deliberate: different problems
						deserve different tools.
					</p>
					<p>
						My background is not a conventional computer science path. I came to software through
						curiosity, apprenticeship, and a lot of side projects. That history shapes how I work: I
						care about learning in the open, about building things that actually run, and about
						writing code that someone else (including future me) can read.
					</p>
				</div>
			</section>

			<section class="section">
				<h2 class="section__heading">How I work</h2>
				<div class="section__prose">
					<p>
						I prefer working close to the problem. That means I often reach for small, focused tools
						over large frameworks, and I am happy spending time on the parts of a project that most
						people skip — the data model, the test harness, the git history.
					</p>
					<p>
						On team projects, I tend to work at the intersection of architecture and delivery: I
						build the features, but I also care about the shape of the system those features live in.
						My work on the Lead Pool segmentation feature in fac-cra and the response-state
						architecture in Workwise are both examples of that.
					</p>
					<p>
						On solo projects, I push harder on craft. Iris reached v5.0.0 across 666 commits with
						close to 1:1 source-to-test mapping. Wyrd has 68.5% statement coverage across 150 Go
						files because I wanted to understand what rigour actually felt like.
					</p>
				</div>
			</section>

			<section class="section">
				<h2 class="section__heading">The toolkit</h2>
				<div class="section__prose">
					<p>
						TypeScript is my primary language for anything touching the browser or Node. Go is my
						choice for terminal tools, CLIs, and anything where performance and binary distribution
						matter. I have written enough Rust to build a Tauri desktop app; I understand the
						ownership model and the tradeoffs.
					</p>
					<p>
						On the frontend, Svelte (especially Svelte 5 with runes) is my strong preference. For
						data, I reach for PostgreSQL with row-level security, Neo4j when the relationships are
						the model, and Supabase when I want both quickly. I test with Vitest, and I have written
						Playwright end-to-end suites for production applications.
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
						<a
							href="https://github.com/JasonWarrenUK"
							class="link"
							target="_blank"
							rel="noopener noreferrer"
						>
							GitHub
						</a>
						where most of this work lives.
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
						<a
							href="https://github.com/JasonWarrenUK"
							class="link"
							target="_blank"
							rel="noopener noreferrer"
						>
							GitHub
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
	}

	.page__title {
		font-size: var(--text-4xl);
		font-weight: 700;
		line-height: 1.1;
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
		font-size: var(--text-xl);
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
