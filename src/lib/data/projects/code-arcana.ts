import type { AuthoredProject } from '../types.js';

export const codeArcana: AuthoredProject = {
	slug: 'code-arcana',
	tagline:
		'A tarot-based programming philosophy website: all 78 cards written as full essays, with a navigable 328-edge connection graph across suits and arcana.',
	blurb: 'A tarot-based programming philosophy, 78 essays in a connection graph.',
	description:
		'A programming philosophy read through tarot archetypes rather than Taoist ones: dry, plainspoken prose and a framing that treats expertise as permission to question received wisdom rather than as a credential to defer to. All 78 cards are written and integrated: 22 Major Arcana and 56 Minor Arcana across the four suits of Cups, Wands, Swords and Pentacles. Each card carries a full essay, keywords, a one-line coding insight and links to related cards, and the 328-edge connection graph between them is rendered as a navigable diagram. It is built with SvelteKit on Deno and deployed via Deno Deploy.',
	kind: 'website',
	track: 'product',
	highlights: [
		'All 78 cards written: 22 Major Arcana and 56 Minor Arcana across four suits (Cups/Wands/Swords/Pentacles).',
		'Every card has a full essay, keywords, a one-line coding insight, and connections to related cards.',
		'328-edge connection graph rendered as a navigable diagram.',
		'Built with SvelteKit on Deno, deployed via Deno Deploy.',
		'Tone throughout: dry British register, plain explanations that build from first principles, and an explicit position that programming orthodoxy is provisional.'
	],
	relationships: [],
	tags: [
		{ label: 'Graph / D3', kind: 'tool' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
