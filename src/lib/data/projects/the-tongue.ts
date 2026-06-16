import type { Project } from '../types.js';

export const theTongue: Project = {
	slug: 'the-tongue',
	name: 'The Tongue',
	tagline:
		'A language-evolution simulator: generate a proto-language from a seed, steer its sound changes, and watch it fracture into a family of daughter languages as geography divides it.',
	blurb: 'A simulator that evolves a proto-language into a family of tongues.',
	description:
		'Pick a numeric seed and the game procedurally generates a proto-language: a phoneme inventory, syllable templates, a 32-word core lexicon, and a 4x3 terrain map. From there you steer its evolution, applying sound changes and holding off weighted autonomous drift in which cross-linguistically common rules are weighted higher. As geography divides the territory, communities split by impassable terrain diverge into independent daughter languages, and a mutual intelligibility matrix tracks how far apart the family has grown using normalised edit distance across the shared concept list. Built with Svelte 5 runes and Tailwind CSS v4, it is deployed live at the-tongue.vercel.app.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'live',
	repoUrl: 'https://github.com/JasonWarrenUK/the-tongue',
	liveUrl: 'https://the-tongue.vercel.app',
	highlights: [
		'Procedural language generation from a numeric seed: phoneme inventory, syllable templates, 32-word core lexicon, 4x3 terrain map.',
		'Sound-change system with weighted autonomous drift and player-steered changes; cross-linguistically common rules weighted higher in drift.',
		'Mutual intelligibility matrix uses normalised edit distance across the shared concept list to track family divergence.',
		'Geographic fracture mechanic: communities split by impassable terrain diverge into independent daughter languages.',
		'Deployed live at the-tongue.vercel.app; built with Svelte 5 runes and Tailwind CSS v4.'
	],
	relationships: [],
	featured: true,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Tailwind CSS v4', kind: 'framework' },
		{ label: 'Procedural Generation', kind: 'concept' },
		{ label: 'Vercel', kind: 'tool' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'Document / JSON', kind: 'data' }
	],
	lastCommit: '2026-06-14',
	metrics: {
		commits: 7
	}
};
