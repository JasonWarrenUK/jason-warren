import type { AuthoredProject } from '../types.js';

export const topGirls: AuthoredProject = {
	slug: 'top-girls',
	tagline:
		'A Top Trumps card game for 32 Gilmore Girls characters, with a play loop against the CPU and a sortable gallery. Built with Svelte 5 runes and Atropos card-tilt effects.',
	blurb: 'A Top Trumps card game for 32 Gilmore Girls characters.',
	description:
		'A self-contained Top Trumps card game: 32 Gilmore Girls characters, each with six stat scores, all held with their game logic in a single-page Svelte SPA. The play loop pits you against a CPU that selects its own highest stat, with the round winner choosing the next stat, and the gallery mode sorts by any stat. Built with idiomatic Svelte 5 runes ($state, $derived) and no redundant lifecycle flags, it integrates the Atropos 3D card-tilt effect down to its four-div DOM structure requirement. Generated SVG avatars (initials, colour and a decorative detail) mean nothing ever 404s, and real art can be dropped in via character slugs.',
	kind: 'game',
	track: 'product',
	highlights: [
		'Idiomatic Svelte 5 runes throughout: $state, $derived. No redundant lifecycle flags.',
		'Atropos 3D card-tilt effect integrated and documented to its four-div DOM structure requirement.',
		'Generated SVG avatars (initials + colour + decorative detail) so nothing ever 404s; real art can be dropped in via character slugs.',
		'CPU strategy selects its own highest stat; round winner chooses next stat. Simple, balanced game loop.',
		'Fully self-contained: all 32 characters, their stats, and game logic in a single-page Svelte SPA.'
	],
	relationships: [],
	tags: [
		{ label: 'Vite', kind: 'tool' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
