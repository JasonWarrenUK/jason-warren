import type { Project } from '../types.js';

export const topGirls: Project = {
	slug: 'top-girls',
	name: 'Top Girls',
	tagline:
		'A Top Trumps card game for 32 Gilmore Girls characters, with a play loop against the CPU and a sortable gallery. Built with Svelte 5 runes and Atropos card-tilt effects.',
	description:
		'[Placeholder] Top Girls is a self-contained browser card game: 32 Gilmore Girls characters, each with six stat scores. You play against a CPU that picks its own highest stat; the round winner chooses the next stat. The gallery mode is sortable by any stat. Generated SVG avatars mean nothing ever 404s.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/top-girls',
	highlights: [
		'Idiomatic Svelte 5 runes throughout: $state, $derived. No redundant lifecycle flags.',
		'Atropos 3D card-tilt effect integrated and documented to its four-div DOM structure requirement.',
		'Generated SVG avatars (initials + colour + decorative detail) so nothing ever 404s; real art can be dropped in via character slugs.',
		'CPU strategy selects its own highest stat; round winner chooses next stat. Simple, balanced game loop.',
		'Fully self-contained: all 32 characters, their stats, and game logic in a single-page Svelte SPA.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Vite', kind: 'runtime' },
		{ label: 'Bun', kind: 'runtime' }
	],
	metrics: {
		commits: 16
	}
};
