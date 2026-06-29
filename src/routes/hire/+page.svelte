<script lang="ts">
	import { base } from '$app/paths';
	import Seo from '$lib/components/seo/Seo.svelte';
	import { EMAIL, GITHUB_PROFILE_URL, BLUESKY_URL, BLUESKY_HANDLE } from '$lib/config.js';
</script>

<Seo
	title="Hire | Jason Warren"
	description="Full-stack developer with a deliberately wide toolkit: TypeScript, Go, Rust, SvelteKit 2, Postgres, Neo4j. Currently at Founders and Coders; open to interesting work."
/>

<div class="page">
	<header class="page__header">
		<h1>Hire</h1>
		<p class="page__intro">
			Currently a developer at Founders and Coders. Open to interesting conversations about the
			right work — permanent roles, scoped engagements, and open-source collaboration.
		</p>
	</header>

	<section class="page__section" aria-labelledby="capabilities-heading">
		<header class="page__section-header">
			<h2 id="capabilities-heading">What you can hire me to do</h2>
		</header>
		<p class="prose">
			TypeScript is the default for anything touching the browser or Node; Go when something needs
			to live in the terminal or ship as a single binary. I have written enough Rust to take a Tauri
			2 desktop app from concept to production — enough to know where the ownership model pays off.
		</p>
		<p class="prose">
			On the frontend, Svelte 5 with runes is a strong preference. For data: PostgreSQL with
			row-level security for multi-tenant work, Neo4j when the relationships are the actual model,
			Supabase when the deadline is real. Testing with Vitest for the data layer and Playwright for
			the paths real users depend on.
		</p>
		<p class="prose">
			The spread is wider than is strictly conventional. The reason is that most of the hard
			problems in this list live at the boundary between layers, and understanding both sides is
			what makes the boundary tractable.
		</p>
	</section>

	<section class="page__section" aria-labelledby="engagements-heading">
		<header class="page__section-header">
			<h2 id="engagements-heading">Engagement shapes</h2>
		</header>

		<div class="engagement">
			<h3 class="engagement__heading">Permanent or employed roles</h3>
			<p class="prose">
				I work best in a team that cares about the shape of what it is building, not only the
				shipping of it. The role I tend to land in sits between architecture and delivery: building
				the feature in front of me while keeping the system it has to live in as a whole in view. I
				am interested in teams doing technically serious work on problems that matter.
			</p>
		</div>

		<div class="engagement">
			<h3 class="engagement__heading">Freelance or contract</h3>
			<p class="prose">
				Scoped project work is a good fit when the brief is precise and the deliverable is
				well-defined. The portfolio includes contract engagements via Tandem and Yalla Cooperative;
				that work shaped how I think about delivery timelines and handoff quality. Available for web
				applications, tooling, data-layer architecture, and bespoke TypeScript or Go projects.
			</p>
		</div>

		<div class="engagement">
			<h3 class="engagement__heading">Open-source and collaboration</h3>
			<p class="prose">
				Several of the projects on this site are tools extracted from larger applications: Drift (a
				git-metrics CLI), Schema Forge (an XSD validation library). I am interested in building or
				contributing to tooling and libraries — particularly where the interesting problem is the
				data model or the abstraction, not just the surface. Open to conversations about shared
				work.
			</p>
		</div>
	</section>

	<section class="page__section" aria-labelledby="contact-heading">
		<header class="page__section-header">
			<h2 id="contact-heading">Get in touch</h2>
		</header>
		<p class="prose">
			Email is the best route:
			<a href={`mailto:${EMAIL}`} class="link">{EMAIL}</a>
		</p>
		<p class="prose">
			The full version of who I am and how I work is on the
			<a href="{base}/about" class="link">about page</a>; the evidence is on the
			<a href="{base}/projects" class="link">projects page</a>. You can also find me on
			<a href={GITHUB_PROFILE_URL} class="link" target="_blank" rel="noopener noreferrer">GitHub</a>
			and on
			<a href={BLUESKY_URL} class="link" target="_blank" rel="noopener noreferrer me">Bluesky</a>
			at {BLUESKY_HANDLE}.
		</p>
	</section>
</div>

<style>
	.page {
		max-width: var(--layout-max-width);
		margin: 0 auto;
		padding: var(--space-12) var(--layout-padding);
		display: flex;
		flex-direction: column;
		gap: var(--space-16);
	}

	.page__header {
		border-bottom: 1px solid var(--color-border);
		padding-bottom: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	h1 {
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

	.prose {
		font-size: var(--text-base);
		line-height: 1.7;
		color: var(--color-text-subtle);
		max-width: 64ch;
		margin: 0;
	}

	/* Engagement subsections */

	.engagement {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background-color: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.engagement__heading {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--color-text);
	}

	/* Links */

	.link {
		color: var(--color-primary-text);
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color var(--transition-fast);
	}

	.link:hover {
		color: var(--color-primary);
	}

	@media (prefers-reduced-motion: reduce) {
		.link {
			transition: none;
		}
	}
</style>
