import type { Project } from '../types.js';

export const babyNames: Project = {
	slug: 'baby-names',
	name: 'Baby Names',
	tagline: 'A small Svelte app for browsing and shortlisting baby names.',
	description:
		'A small, well-built SvelteKit app for browsing and shortlisting baby names. It is built with Svelte 5 runes and lucide-svelte over a standard SvelteKit project structure, with ESLint and Prettier configured.',
	kind: 'toy',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/baby-names',
	highlights: [
		'Built with SvelteKit, Svelte 5 runes, and lucide-svelte.',
		'ESLint and Prettier configured; standard SvelteKit project structure.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Bun', kind: 'runtime' }
	],
	lastCommit: '2026-03-14',
	metrics: {
		commits: 5
	}
};
