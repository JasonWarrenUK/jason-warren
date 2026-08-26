<script lang="ts">
	import { base } from '$app/paths';
	import { EMAIL } from '$lib/config.js';
	import type { PlainProject } from '$lib/data/queries.js';

	interface Props {
		pool: PlainProject[];
	}

	let { pool }: Props = $props();

	const HAND_SIZE = 3;

	// The site's pages in plain words. Paths are the nav's own, so a renamed
	// route breaks here at build time rather than silently 404ing.
	interface PageEntry {
		path: string;
		label: string;
		what: string;
		more?: string;
	}

	const pages: PageEntry[] = [
		{
			path: '/projects',
			label: 'Projects',
			what: 'Every project, with the numbers behind it: how much work went in and when.'
		},
		{
			path: '/map',
			label: 'Map',
			what: 'All the projects drawn as a web.',
			more: 'Lines show which projects grew out of which, and which ones share the same tools. Drag things around; hover to see how a project connects to the rest.'
		},
		{
			path: '/timeline',
			label: 'Timeline',
			what: 'Each project as a bar from when it started to the last time I worked on it.',
			more: 'The bars are to scale, so you can see what was live at the same time and which projects I keep returning to years later.'
		},
		{
			path: '/toolkit',
			label: 'Toolkit',
			what: 'The order I picked up each tool, and the subjects the projects keep returning to.'
		},
		{
			path: '/about',
			label: 'About',
			what: 'Who I am, how I work and where I came from.'
		},
		{
			path: '/hire',
			label: 'Hire',
			what: 'The kinds of work I take on and how to get in touch.'
		},
		{
			path: '/drift-engine',
			label: 'Drift Engine',
			what: 'How the numbers on this site are gathered.',
			more: 'Every figure is measured from the real history of each project by a small program I wrote, checked against a set of rules and only then shown here. Nothing is typed in by hand, so the site cannot quietly go out of date.'
		}
	];

	// The deal order. Prerender and first paint use registry order so server
	// and client markup agree; the pool is shuffled once after mount, and again
	// each time a full pass through it completes, so the hand is random and no
	// project repeats until every other one has been shown.
	let shuffled = $state<PlainProject[] | null>(null);
	let start = $state(0);
	const order = $derived(shuffled ?? pool);

	$effect(() => {
		shuffled = shuffle(pool);
	});

	function shuffle(items: PlainProject[]): PlainProject[] {
		const copy = [...items];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	const hand = $derived(order.slice(start, start + HAND_SIZE));
	const canDeal = $derived(pool.length > HAND_SIZE);

	function dealAnother(): void {
		const next = start + HAND_SIZE;
		if (next + HAND_SIZE > order.length) {
			// Reshuffle, but keep the current hand out of the top so the next
			// deal never repeats a card the reader is still looking at.
			const current = new Set(hand.map((p) => p.slug));
			const rest = shuffle(order.filter((p) => !current.has(p.slug)));
			shuffled = [...rest, ...hand];
			start = 0;
		} else {
			start = next;
		}
	}
</script>

<div class="plain">
	<section class="plain__section" aria-labelledby="plain-what">
		<h2 id="plain-what" class="plain__title">What I actually do</h2>
		<div class="plain__prose">
			<p>
				Most of my work is the part you never see: deciding how the information inside a program is
				organised, so that everything built on top of it stays simple.
			</p>
		</div>
		<div class="plain__details-row">
			<details class="plain__details">
				<summary class="plain__summary">
					<span>
						Before a program can do anything, someone has to decide what counts as a "thing" in it
						and how those things connect.
					</span>
					<span class="plain__summary-cue" aria-hidden="true">Explain?</span>
				</summary>
				<p>
					Take a recipe app. Is an ingredient part of a recipe, the way a line is part of a shopping
					list? Or is it a thing in its own right, which many recipes happen to share? Both feel
					reasonable. But ask "what can I cook with what's in the fridge?" and the first choice
					makes that question nearly impossible to answer, while the second makes it easy.
				</p>
			</details>
			<details class="plain__details">
				<summary class="plain__summary">
					<span>That decision is called data modelling.</span>
					<span class="plain__summary-cue" aria-hidden="true">Explain?</span>
				</summary>
				<p>
					Get it right and features that come later are simple to add. Get it wrong and every new
					feature fights the ones already there. My job is getting it right, usually for problems
					where nobody has yet agreed what the things are.
				</p>
			</details>
		</div>
	</section>

	<section class="plain__section" aria-labelledby="plain-made">
		<div class="plain__heading-row">
			<h2 id="plain-made" class="plain__title">Some things I've made</h2>
			{#if canDeal}
				<button
					type="button"
					class="plain__deal"
					onclick={dealAnother}
					aria-label="Show three more projects"
				>
					Show three more
				</button>
			{/if}
		</div>
		<p class="plain__explainer">
			Three at random from the {pool.length} projects here. <strong>Read more</strong> opens the
			full write-up; <strong>Try it</strong> appears when there is a finished thing you can use in your
			browser.
		</p>
		<ul class="plain__cards" role="list">
			{#each hand as project (project.slug)}
				<li class="plain__card">
					<span class="plain__card-context">{project.context}</span>
					<span class="plain__card-name">{project.name}</span>
					<p class="plain__card-what">{project.what}</p>
					<div class="plain__card-links">
						{#if project.liveUrl}
							<a
								href={project.liveUrl}
								class="plain__card-link plain__card-link--live"
								target="_blank"
								rel="noopener noreferrer"
							>
								Try it
							</a>
						{/if}
						<a href="{base}/projects/{project.slug}" class="plain__card-link">Read more →</a>
					</div>
				</li>
			{/each}
		</ul>
		<a href="{base}/projects" class="plain__cta">See everything I've built →</a>
	</section>

	<section class="plain__section" aria-labelledby="plain-pages">
		<h2 id="plain-pages" class="plain__title">Where to go next</h2>
		<ul class="plain__pages" role="list">
			{#each pages as entry (entry.path)}
				<li class="plain__page">
					<a href="{base}{entry.path}" class="plain__page-name">{entry.label}</a>
					<div class="plain__page-body">
						<p class="plain__page-what">{entry.what}</p>
						{#if entry.more}
							<details class="plain__page-more">
								<summary class="plain__page-summary">A bit more</summary>
								<p>{entry.more}</p>
							</details>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<div class="plain__row">
		<section class="plain__section" aria-labelledby="plain-before">
			<h2 id="plain-before" class="plain__title">Before this</h2>
			<div class="plain__prose">
				<p>
					I was a theatre director. I wrote a book about interactive theatre, ran courses at drama
					schools and spent years working out how to design experiences where the audience makes the
					choices. During lockdown I started writing interactive stories on a computer, then the
					tools to make them, and kept going.
				</p>
				<p>
					It turns out the two jobs have the same core skill: understanding a situation well enough
					to build something that behaves sensibly whatever people do with it.
				</p>
			</div>
		</section>

		<section class="plain__section" aria-labelledby="plain-talk">
			<h2 id="plain-talk" class="plain__title">Want to talk?</h2>
			<div class="plain__prose">
				<p>
					If you have a problem that might need software and you're not sure where to start, email
					me at <a href={`mailto:${EMAIL}`} class="plain__link">{EMAIL}</a>. There's more on the
					<a href="{base}/hire" class="plain__link">hire page</a> about the kinds of work I take on.
				</p>
			</div>
		</section>
	</div>
</div>

<style>
	.plain {
		display: flex;
		flex-direction: column;
	}

	.plain__section {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-12) 0;
		border-top: 1px solid var(--color-border);
	}

	.plain__title {
		font-size: var(--text-3xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.plain__prose {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-width: var(--measure);
	}

	.plain__prose p {
		font-size: var(--text-lg);
		line-height: 1.7;
		color: var(--color-text-subtle);
		margin: 0;
	}

	.plain__heading-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-4);
	}

	.plain__deal {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-subtle);
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-raised);
		cursor: pointer;
		transition:
			color var(--dur-micro) var(--ease-standard),
			border-color var(--dur-micro) var(--ease-standard);
	}

	.plain__deal:hover {
		color: var(--color-text);
		border-color: var(--color-border-strong);
	}

	.plain__deal:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.plain__cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
	}

	.plain__card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background-color: var(--color-surface-raised);
	}

	.plain__card-context {
		font-family: var(--font-mono);
		font-size: var(--text-apparatus-lg);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-muted);
	}

	.plain__card-name {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.plain__card-what {
		font-size: var(--text-body-tight);
		line-height: 1.6;
		color: var(--color-text-subtle);
		margin: 0;
		flex: 1;
	}

	.plain__card-links {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.plain__card-link {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary-text);
		text-decoration: none;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-primary-light);
		border-radius: var(--radius-md);
		background-color: var(--color-primary-bg);
		transition:
			background-color var(--dur-micro) var(--ease-standard),
			border-color var(--dur-micro) var(--ease-standard);
	}

	.plain__card-link:hover {
		background-color: var(--color-primary-light);
		border-color: var(--color-primary);
	}

	.plain__card-link--live {
		color: var(--color-text-subtle);
		border-color: var(--color-border);
		background-color: transparent;
	}

	.plain__card-link--live:hover {
		color: var(--color-text);
		border-color: var(--color-border-strong);
		background-color: var(--color-surface);
	}

	.plain__details-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		align-items: stretch;
	}

	/* A quotation-shaped card: serif display face and a primary-coloured
	   left rule, so the claim reads as a pull-quote rather than a form
	   control. Flex column so the "Explain?" cue sits on the bottom edge
	   at the same height in every sibling. */
	.plain__details {
		flex: 1 1 20rem;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--color-primary);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-raised);
	}

	.plain__summary {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-style: italic;
		line-height: 1.5;
		color: var(--color-text);
		cursor: pointer;
		list-style: none;
		user-select: none;
	}

	.plain__summary::-webkit-details-marker {
		display: none;
	}

	/* The claim fills the space above the cue and centres within it, so a
	   one-line claim sits level with a three-line neighbour. */
	.plain__summary > span:first-child {
		flex: 1;
		display: flex;
		align-items: center;
	}

	.plain__summary-cue {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		align-self: flex-end;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-style: normal;
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.plain__summary-cue::after {
		content: '';
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		margin-bottom: 0.2rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg);
		transition: transform var(--dur-micro) var(--ease-standard);
	}

	.plain__details[open] .plain__summary-cue::after {
		transform: rotate(-135deg);
		margin-bottom: 0;
		margin-top: 0.2rem;
	}

	.plain__explainer {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text-muted);
		max-width: var(--measure);
		margin: 0;
	}

	.plain__pages {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
	}

	.plain__page {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-1) var(--space-6);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--color-border);
	}

	@media (min-width: 40rem) {
		.plain__page {
			grid-template-columns: 9rem 1fr;
		}
	}

	.plain__page-name {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--color-primary-text);
		text-decoration: none;
		align-self: start;
	}

	.plain__page-name:hover {
		text-decoration: underline;
	}

	.plain__page-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: var(--measure);
	}

	.plain__page-what {
		font-size: var(--text-base);
		line-height: 1.6;
		color: var(--color-text-subtle);
		margin: 0;
	}

	.plain__page-summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		list-style: none;
		user-select: none;
	}

	.plain__page-summary::-webkit-details-marker {
		display: none;
	}

	.plain__page-summary::after {
		content: '';
		display: inline-block;
		width: 0.4rem;
		height: 0.4rem;
		margin-bottom: 0.15rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg);
		transition: transform var(--dur-micro) var(--ease-standard);
	}

	.plain__page-more[open] .plain__page-summary::after {
		transform: rotate(-135deg);
		margin-bottom: 0;
		margin-top: 0.15rem;
	}

	.plain__page-summary:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.plain__page-more > p {
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--color-text-subtle);
		margin: var(--space-2) 0 0;
	}

	.plain__row {
		display: grid;
		grid-template-columns: 1fr;
		column-gap: var(--space-10);
	}

	@media (min-width: 48rem) {
		.plain__row {
			grid-template-columns: 1fr 1fr;
		}
	}

	.plain__summary:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.plain__details > p {
		padding: 0 var(--space-5) var(--space-5);
	}

	.plain__link {
		color: var(--color-primary-text);
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}

	.plain__cta {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-primary-text);
		text-decoration: none;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-primary-light);
		border-radius: var(--radius-md);
		background-color: var(--color-primary-bg);
		transition:
			background-color var(--dur-micro) var(--ease-standard),
			border-color var(--dur-micro) var(--ease-standard);
	}

	.plain__cta:hover {
		background-color: var(--color-primary-light);
		border-color: var(--color-primary);
	}
</style>
