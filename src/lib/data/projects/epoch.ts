import type { AuthoredProject } from '../types.js';

export const epoch: AuthoredProject = {
	slug: 'epoch',
	tagline:
		'Create a fictional character and see history through their eyes: a personal Wikipedia-sourced timeline of every real event they would have lived through.',
	blurb: "See history through a fictional character's eyes, sourced from Wikipedia.",
	description:
		'Give it a name, a birth year, a death year and a place, and it queries the Wikipedia API to build a collapsible timeline of the real historical events that person would have lived through. A significance-ranking pipeline scores events using Wikidata sitelink counts, entity-type detection, named-event prefixes and link density, while aggressive filtering strips sports results, malformed markup, and citation fragments, and a 24-hour TTL cache with batched requests respects Wikipedia rate limits without stalling the UI. The two-level decade-to-year-to-event timeline highlights milestones and generates an "oral history" of the stories that were current when the character was 15. Deployed to Vercel; a Vitest suite covers the event-filtering pipeline.',
	kind: 'app',
	track: 'product',
	highlights: [
		'Significance-ranking pipeline scores events using Wikidata sitelink counts, entity-type detection, named-event prefixes, and link density.',
		'Aggressive content filtering strips sports results, malformed markup, and citation fragments before events are shown.',
		'24-hour TTL API cache with batched requests respects Wikipedia rate limits without stalling the UI.',
		'Two-level collapsible decade→year→event timeline with milestone highlighting and generated "oral history" (stories heard at age 15).',
		'Deployed to Vercel; has a Vitest test suite for the event-filtering pipeline.'
	],
	relationships: [],
	tags: [
		{ label: 'Wikipedia API', kind: 'tool' },
		{ label: 'Vitest', kind: 'tool' },
		{ label: 'Vercel', kind: 'tool' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
