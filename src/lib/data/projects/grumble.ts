import type { Project } from '../types.js';

export const grumble: Project = {
	slug: 'grumble',
	name: 'Grumble',
	tagline: 'A Gin Rummy scorer with deadwood calculation, undercut detection, runtime rule presets, and match history across multiple games.',
	blurb: 'A Gin Rummy scorer with deadwood calculation and runtime rule presets.',
	description:
		'A Gin Rummy scorer split cleanly between a pure scoring library and the SvelteKit presentation layer. The scoring code in src/lib/scoring/ has zero Svelte dependencies and is covered by unit tests via bun:test. Threading the full ruleset as a Rules parameter rather than a constant was the key architectural choice: it meant runtime rule customisation (Standard to 100, Quick to 50, fully Custom per-rule) came almost for free from the same pure functions, with tests proving both defaults and overrides. The undercut case required care: when the knocking player\'s deadwood meets or exceeds the opponent\'s, the box flips to the opponent along with an undercut bonus, tracked via a separate boxWinner field so "who scored points" and "who won the line" are always distinct. The full ruleset covers gin, big gin, undercut (including the equal-deadwood edge case), line and game bonuses, and multi-game match history persisted to localStorage.',
	kind: 'tool',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/grumble',
	highlights: [
		'Pure, framework-free scoring library in src/lib/scoring/ with comprehensive unit tests via bun:test.',
		'Full Gin Rummy ruleset: deadwood calculation, gin/big-gin/undercut bonuses, line bonuses, game bonuses, multi-game match history.',
		'Zero Svelte dependencies: scoring logic tested headlessly; UI layer is a thin, swappable shell.',
		'Ruleset threaded as a Rules parameter: runtime presets (Standard, Quick, Custom) and per-rule overrides from the same pure functions, proven by tests.',
		'Undercut modelled with a separate boxWinner field: "who scored" and "who won the box" tracked independently, including the equal-deadwood edge case.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'Ephemeral / in-memory', kind: 'data' }
	],
	lastCommit: '2026-06-14',
	metrics: {
		commits: 11
	}
};
