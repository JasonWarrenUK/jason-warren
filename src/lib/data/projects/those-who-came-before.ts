import type { Project } from '../types.js';

export const thoseWhoCameBefore: Project = {
	slug: 'those-who-came-before',
	name: 'Those Who Came Before',
	tagline:
		'A browser game where players discover procedurally generated archaeological artefacts, track them on a discovery timeline, and complete mission-based tasks.',
	description:
		'[Placeholder] Those Who Came Before runs the full SvelteKit toolchain through Deno rather than Node, deployed to Deno Deploy. The procedural item generator in the backlog uses grammar-based generation with typed definitions for parts, conditions, and materials — a richer system staged for integration into the core game loop.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/those-who-came-before',
	highlights: [
		'Runs SvelteKit through Deno (not Node), deployed to Deno Deploy via @deno/svelte-adapter.',
		'Grammar-based procedural artefact generator with typed definitions for item parts, conditions, and materials.',
		'Svelte 5 runes throughout; Tailwind CSS v4 with DaisyUI v5.',
		'Core discovery loop complete; persistence, save/load, and auth on the roadmap.',
		'Architecture Decisions documented; Getting Started and Technical Overview in docs/.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Deno', kind: 'runtime' },
		{ label: 'Tailwind CSS v4', kind: 'framework' },
		{ label: 'Procedural Generation', kind: 'domain' }
	],
	metrics: {
		commits: 75
	}
};
