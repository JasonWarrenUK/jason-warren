import type { Project } from '../types.js';

export const grumble: Project = {
	slug: 'grumble',
	name: 'Grumble',
	tagline:
		'A Gin Rummy scorer with hand-by-hand deadwood calculation, running totals, line and game bonuses, and multi-game match history.',
	description:
		'[Placeholder] Grumble follows a strict separation between pure scoring logic (fully tested, framework-free) and the SvelteKit presentation layer. The scoring rules cover the full Gin Rummy ruleset: deadwood, gin bonuses, big gin, undercut, line bonuses, and game bonuses across multi-game matches.',
	kind: 'tool',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/grumble',
	highlights: [
		'Pure, framework-free scoring library in src/lib/scoring/ with comprehensive unit tests via bun:test.',
		'Full Gin Rummy ruleset: deadwood calculation, gin/big-gin/undercut bonuses, line bonuses, game bonuses, multi-game match history.',
		'Clean architecture: scoring logic has zero Svelte dependencies and can be tested in isolation.',
		'Built with SvelteKit and Svelte 5 runes.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Bun', kind: 'runtime' }
	],
	lastCommit: '2026-06-14',
	metrics: {
		commits: 11
	}
};
