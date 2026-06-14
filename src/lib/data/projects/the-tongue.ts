import type { Project } from '../types.js';

export const theTongue: Project = {
	slug: 'the-tongue',
	name: 'The Tongue',
	tagline:
		'A language-evolution simulator: generate a proto-language from a seed, steer its sound changes, and watch it fracture into a family of daughter languages as geography divides it.',
	description:
		'[Placeholder] The Tongue is the most immediately playable thing I have shipped. You pick a numeric seed and get a procedurally generated proto-language — phoneme inventory, syllable template, a 32-word core lexicon, a 4x3 terrain map. Then you spend influence points to apply sound changes, expand territory, and hold off autonomous drift. Over generations, geographically separated communities diverge; the mutual intelligibility matrix tracks how far apart the family has grown.',
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
		{ label: 'Procedural Generation', kind: 'domain' },
		{ label: 'Vercel', kind: 'runtime' }
	],
	metrics: {
		commits: 7
	}
};
