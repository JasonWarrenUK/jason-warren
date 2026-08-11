import type { AuthoredProject } from '../types.js';

export const riffle: AuthoredProject = {
	slug: 'riffle',
	tagline:
		'A reactive DendryNexus game engine for SvelteKit: cards, decks, difficulty checks, quality systems, and arena topology, all built on Svelte 5 runes.',
	blurb: 'A reactive DendryNexus card-game engine for SvelteKit.',
	description:
		'The reactive DendryNexus engine outgrew the Norse duel it was written for and became Riffle: a reactive game engine for SvelteKit built on Svelte 5 runes with no Svelte UI dependencies of its own. It implements the full StoryNexus-style card, deck, and hand system (draw, play, and discard across multiple hands with pinned cards and per-hand state), a quality system of named attributes with typed display modes and min/max clamping, and broad and narrow difficulty checks with configurable scalers and human-readable labels from almost impossible to straightforward. A concentric-circle arena topology adds spatial structure across inner, middle, and outer rings (13 zones) with adjacency relationships, and content rendering covers quality interpolation, conditional text, and markdown-style formatting.',
	kind: 'library',
	track: 'product',
	progress: 'in-progress',
	highlights: [
		'Card/deck/hand system: draw, play, discard across multiple hands with pinned cards, max hand sizes, and per-hand state.',
		'Difficulty checks: broad and narrow curves with configurable scalers, human-readable labels (almost impossible → straightforward), roll tracking.',
		'Quality system: named attributes with typed display (integer, fudge, on/off, word scale, raw) and min/max clamping.',
		'Arena topology: concentric-circle spatial system (inner/middle/outer rings, 13 zones) with adjacency relationships.',
		'Content rendering: quality interpolation, conditional text, markdown-style formatting.'
	],
	relationships: [
		{
			kind: 'powers',
			target: 'flyt',
			note: 'The reactive card engine outgrew the duel it was written for, so it became Riffle: the same StoryNexus mechanics with no Svelte UI of its own.'
		}
	],
	tags: [
		{ label: 'DendryNexus', kind: 'tool' },
		{ label: 'Interactive Fiction', kind: 'concept' },
		{ label: 'No persistence', kind: 'data' }
	]
};
