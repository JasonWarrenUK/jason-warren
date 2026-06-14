import type { Project } from '../types.js';

export const theWork: Project = {
	slug: 'the-work',
	name: 'The Work',
	tagline:
		'A narrative game where a poverty-stricken Writer must compose and defend a thesis in one overnight session, by examining objects in a bedsit and turning observations into defensible academic ideas.',
	description:
		'[Placeholder] The Work is an interactive fiction game built in Ink and SvelteKit. You play a Writer with one night to produce something worth defending. The architecture separates the Ink runtime (extracted into the Nib library) from the game logic, so the same engine can be reused in future projects. The idea system has six levels of progression, seven academic domains, and 21 disciplines (every combination of two domains). Written observations develop into ideas through a recipe system.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/the-work',
	highlights: [
		'Ink narrative engine (via Nib) drives branching dialogue across 15 per-hour chapter files; ~2,560 lines of authored Ink.',
		'Six-level idea progression, 7 domains, 21 disciplines (every domain pairing), per-idea orthodoxy scoring (−100 to +100).',
		'67 observations with 201 domain readings and 40 inklings catalogued in structured data.',
		'Generic Ink+Svelte runtime extracted into the standalone Nib library. Zero game-specific imports, wired in via a single onInit callback.',
		'Detailed design corpus: Ideas, Objects, Recipes, Disciplines, World documents alongside the source.'
	],
	relationships: [
		{
			kind: 'extracted-from',
			target: 'nib',
			note: 'The Ink runtime was extracted from this project into the standalone Nib library.'
		}
	],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Ink / inkjs', kind: 'domain' },
		{ label: 'Interactive Fiction', kind: 'domain' },
		{ label: 'Bun', kind: 'runtime' }
	],
	metrics: {
		commits: 114
	}
};
