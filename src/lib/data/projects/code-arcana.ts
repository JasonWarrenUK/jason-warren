import type { Project } from '../types.js';

export const codeArcana: Project = {
	slug: 'code-arcana',
	name: 'Code Arcana',
	tagline:
		'A tarot-based programming philosophy website: all 78 cards written as full essays, with a navigable 250-edge connection graph across suits and arcana.',
	description:
		'[Placeholder] Code Arcana is an alternative to "The Tao of Programming", filtered through tarot archetypes rather than Taoist philosophy, with a British aesthetic and a neurodivergent-friendly, anti-authoritarian lens. All 22 major arcana and 56 minor arcana are written and integrated. The 250-edge connection graph between cards is rendered as a navigable diagram.',
	kind: 'app',
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
		{ label: 'Graph / D3', kind: 'domain' }
	],
	metrics: {
		commits: 2
	}
};
