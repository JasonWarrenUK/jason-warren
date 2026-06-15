import type { Project } from '../types.js';

export const riffle: Project = {
	slug: 'riffle',
	name: 'Riffle',
	tagline:
		'A reactive DendryNexus game engine for SvelteKit: cards, decks, difficulty checks, quality systems, and arena topology, all built on Svelte 5 runes.',
	description:
		'Extracted from Flyt once the DendryNexus engine became a separable concern, this is a reactive game engine for SvelteKit built on Svelte 5 runes with no Svelte UI dependencies of its own. It implements the full StoryNexus-style card, deck, and hand system (draw, play, and discard across multiple hands with pinned cards and per-hand state), a quality system of named attributes with typed display modes and min/max clamping, and broad and narrow difficulty checks with configurable scalers and human-readable labels from almost impossible to straightforward. A concentric-circle arena topology adds spatial structure across inner, middle, and outer rings (13 zones) with adjacency relationships, and content rendering covers quality interpolation, conditional text, and markdown-style formatting.',
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
		{ label: 'Node.js', kind: 'runtime' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'DendryNexus', kind: 'tool' },
		{ label: 'Interactive Fiction', kind: 'concept' },
		{ label: 'No persistence', kind: 'data' }
	],
	lastCommit: '2026-03-12',
	metrics: {
		commits: 2
	}
};
