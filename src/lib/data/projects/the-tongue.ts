import type { AuthoredProject } from '../types.js';

export const theTongue: AuthoredProject = {
	slug: 'the-tongue',
	tagline:
		'A language-evolution simulator: generate a proto-language from a seed, steer its sound changes, and watch it fracture into a family of daughter languages as geography divides it.',
	blurb: 'A simulator that evolves a proto-language into a family of tongues.',
	plainBlurb:
		'A game that invents a language from nothing: sounds, words, a small map of where people live. Push the speakers apart with mountains and rivers and watch one language become several, until neighbours can no longer understand each other. Every change follows rules linguists have watched happen in real languages.',
	description:
		'Pick a numeric seed and the game procedurally generates a proto-language: a phoneme inventory, syllable templates, a 32-word core lexicon, and a 4x3 terrain map. From there you steer its evolution, applying sound changes and holding off weighted autonomous drift in which cross-linguistically common rules are weighted higher. As geography divides the territory, communities split by impassable terrain diverge into independent daughter languages, and a mutual intelligibility matrix tracks how far apart the family has grown using normalised edit distance across the shared concept list. Deployed live at the-tongue.vercel.app.',
	kind: 'game',
	track: 'product',
	liveUrl: 'https://the-tongue.vercel.app',
	highlights: [
		'Procedural language generation from a numeric seed: phoneme inventory, syllable templates, 32-word core lexicon, 4x3 terrain map.',
		'Sound-change system with weighted autonomous drift and player-steered changes; cross-linguistically common rules weighted higher in drift.',
		'Mutual intelligibility matrix uses normalised edit distance across the shared concept list to track family divergence.',
		'Geographic fracture mechanic: communities split by impassable terrain diverge into independent daughter languages.',
		'Deployed live at the-tongue.vercel.app; built with Svelte 5 runes and Tailwind CSS v4.'
	],
	relationships: [],
	tags: [
		{ label: 'Procedural Generation', kind: 'concept' },
		{ label: 'Vercel', kind: 'tool' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
