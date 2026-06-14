import type { Project } from '../types.js';

export const riffle: Project = {
	slug: 'riffle',
	name: 'Riffle',
	tagline:
		'A reactive DendryNexus game engine for SvelteKit — cards, decks, difficulty checks, quality systems, and arena topology, all built on Svelte 5 runes.',
	description:
		'[Placeholder] Riffle was extracted from Flyt when the DendryNexus engine became a separable concern. It implements the full StoryNexus-style card/deck/hand mechanics, a quality system with typed display modes, broad and narrow difficulty checks with configurable curves, and a concentric-circle arena topology. The reactive core is Svelte 5 runes; the engine itself has no Svelte UI dependencies.',
	kind: 'library',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/riffle',
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
			note: 'Riffle powers the DendryNexus narrative engine in Flyt.'
		}
	],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'DendryNexus', kind: 'domain' },
		{ label: 'Interactive Fiction', kind: 'domain' }
	],
	metrics: {
		commits: 2
	}
};
