<script lang="ts">
	import { base } from '$app/paths';
	import Seo from '$lib/components/seo/Seo.svelte';
	import { EMAIL, GITHUB_PROFILE_URL, BLUESKY_URL, BLUESKY_HANDLE } from '$lib/config.js';
</script>

<Seo
	title="Hire | Jason Warren"
	description="Developer at Tandem Creative Dev. Open to the right work: permanent roles, scoped projects and open-source collaboration."
/>

<div class="page">
	<header class="page__header">
		<h1>Hire</h1>
		<p class="page__intro">
			Currently working with Tandem Creative Dev. Open to the right work: permanent roles, scoped
			engagements and open-source collaboration.
		</p>
	</header>

	<section class="page__section" aria-labelledby="engagements-heading">
		<header class="page__section-header">
			<h2 id="engagements-heading">Engagement shapes</h2>
		</header>

		<div class="engagement">
			<h3 class="engagement__heading">Permanent or employed roles</h3>
			<p class="prose">
				I work best in a team that cares about what it is building. The role I tend to land in sits
				between architecture and delivery. I am interested in teams doing technically serious work
				on problems that matter.
			</p>
		</div>

		<div class="engagement">
			<h3 class="engagement__heading">Freelance or contract</h3>
			<p class="prose">
				I take on scoped project work when the brief is precise and the deliverable is well-defined;
				a well-scoped problem with no prescribed solution qualifies. Contract engagements via Tandem
				Creative Dev and Yalla Cooperative. Web applications, TUIs, CLIs, data-layer architecture
				and bespoke TypeScript or Go projects.
			</p>
		</div>

		<div class="engagement">
			<h3 class="engagement__heading">Open-source and collaboration</h3>
			<p class="prose">
				I am interested in building or contributing to tooling and libraries where the interesting
				problem is the data model or the abstraction. Open to conversations about shared work.
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

	/* h1 size/weight/line-height come from the global h1 clamp. */

	.page__intro {
		font-size: var(--text-lg);
		color: var(--color-text-subtle);
		line-height: 1.7;
		max-width: var(--measure-lead);
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
		max-width: var(--measure);
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
