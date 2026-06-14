import type { Project } from '../types.js';

export const lyraRose: Project = {
	slug: 'lyra-rose',
	name: 'Lyra Rose',
	tagline:
		'An animation-heavy personal piece built with GSAP and Supabase on Svelte 5 — under construction.',
	description: '[Placeholder] A personal creative project. Details to follow.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/lyra-rose',
	highlights: [
		'Svelte 5.55, Vite 8, TypeScript 6 — bleeding-edge stack.',
		'GSAP for animation paired with a Supabase backend.',
		'Targeted for Vercel deployment via @sveltejs/adapter-vercel.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'GSAP', kind: 'domain' },
		{ label: 'Supabase', kind: 'domain' },
		{ label: 'Vercel', kind: 'runtime' }
	],
	metrics: {
		commits: 26
	}
};
