import type { Project } from '../types.js';

export const epoch: Project = {
	slug: 'epoch',
	name: 'Epoch',
	tagline:
		'Create a fictional character and see history through their eyes: a personal Wikipedia-sourced timeline of every real event they would have lived through.',
	description:
		'[Placeholder] Epoch is the project I return to most often. You give it a name, a birth year, a death year, and a place; it hits the Wikipedia API and builds a collapsible timeline of the real historical events that person would have experienced, filtered, ranked, and deduplicated through a significance-scoring pipeline. The "oral history" feature surfaces stories that were current when your character was 15: what would the elders in their family have talked about?',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/epoch',
	highlights: [
		'Significance-ranking pipeline scores events using Wikidata sitelink counts, entity-type detection, named-event prefixes, and link density.',
		'Aggressive content filtering strips sports results, malformed markup, and citation fragments before events are shown.',
		'24-hour TTL API cache with batched requests respects Wikipedia rate limits without stalling the UI.',
		'Two-level collapsible decade→year→event timeline with milestone highlighting and generated "oral history" (stories heard at age 15).',
		'Deployed to Vercel; has a Vitest test suite for the event-filtering pipeline.'
	],
	relationships: [],
	featured: true,
	tags: [
		{ label: 'JavaScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Tailwind CSS', kind: 'framework' },
		{ label: 'Wikipedia API', kind: 'tool' },
		{ label: 'Vitest', kind: 'tool' },
		{ label: 'Vercel', kind: 'runtime' }
	],
	lastCommit: '2026-06-14',
	metrics: {
		commits: 56
	}
};
