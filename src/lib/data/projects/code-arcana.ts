import type { Project } from '../types.js';

export const codeArcana: Project = {
	slug: 'code-arcana',
	name: 'Code Arcana',
	tagline:
		'A tarot-based programming philosophy website: all 78 cards written as full essays, with a navigable 250-edge connection graph across suits and arcana.',
	description:
		'A programming philosophy read through tarot archetypes rather than Taoist ones, with a British aesthetic and a neurodivergent-friendly, anti-authoritarian framing throughout. All 78 cards are written and integrated: 22 Major Arcana and 56 Minor Arcana across the four suits of Cups, Wands, Swords, and Pentacles. Each card carries a full essay, keywords, a one-line coding insight, and links to related cards, and the 250-edge connection graph between them is rendered as a navigable diagram. It is built with SvelteKit on Deno and deployed via Deno Deploy.',
	kind: 'website',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/code-arcana',
	highlights: [
		'All 78 cards written: 22 Major Arcana and 56 Minor Arcana across four suits (Cups/Wands/Swords/Pentacles).',
		'Every card has a full essay, keywords, a one-line coding insight, and connections to related cards.',
		'250-edge connection graph rendered as a navigable diagram.',
		'Built with SvelteKit on Deno, deployed via Deno Deploy.',
		'British aesthetic, neurodivergent-friendly and anti-authoritarian framing throughout.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Deno', kind: 'runtime' },
		{ label: 'Graph / D3', kind: 'tool' }
	],
	lastCommit: '2026-06-11',
	metrics: {
		commits: 2
	}
};
