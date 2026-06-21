import type { AuthoredProject } from '../types.js';

export const theWork: AuthoredProject = {
	slug: 'the-work',
	name: 'The Work',
	tagline:
		'A narrative game where a poverty-stricken Writer must compose and defend a thesis in one overnight session, by examining objects in a bedsit and turning observations into defensible academic ideas.',
	blurb: 'A narrative game about defending a thesis in one overnight session.',
	description:
		'A narrative game built in Ink and SvelteKit where a poverty-stricken Writer has one overnight session to compose and defend a thesis, examining objects in a bedsit and turning observations into defensible academic ideas. The Ink engine drives branching dialogue across 15 per-hour chapter files (around 2,560 lines of authored Ink), and the idea system runs six levels of progression across seven domains and 21 disciplines (every domain pairing), with per-idea orthodoxy scoring from -100 to +100. A structured corpus of 67 observations, 201 domain readings, and 40 inklings feeds the recipe system that develops observations into ideas. The generic Ink and Svelte runtime was extracted into the standalone Nib library, wired in through a single onInit callback with zero game-specific imports.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/the-work',
	highlights: [
		'Ink narrative engine (via Nib) drives branching dialogue across 15 per-hour chapter files; ~2,560 lines of authored Ink.',
		'Six-level idea progression, 7 domains, 21 disciplines (every domain pairing), per-idea orthodoxy scoring (−100 to +100).',
		'67 observations with 201 domain readings and 40 inklings catalogued in structured data.',
		'Generic Ink+Svelte runtime extracted into the standalone Nib library; the game wires it in via a single onInit callback with zero game-specific imports in the runtime layer.',
		'Detailed design corpus: Ideas, Objects, Recipes, Disciplines, World documents alongside the source.'
	],
	relationships: [
		{
			kind: 'extracted-from',
			target: 'nib',
			note: 'The generic Ink-and-Svelte runtime was lifted out of The Work into the standalone Nib library.'
		}
	],
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Ink / inkjs', kind: 'tool' },
		{ label: 'Interactive Fiction', kind: 'concept' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'Document / JSON', kind: 'data' }
	],
	lastCommit: '2026-05-18',
	metrics: {
		commits: 114
	}
};
