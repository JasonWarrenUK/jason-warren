import type { Project } from '../types.js';

export const thoseWhoCameBefore: Project = {
	slug: 'those-who-came-before',
	name: 'Those Who Came Before',
	tagline:
		'A browser game where players discover procedurally generated archaeological artefacts, track them on a discovery timeline, and complete mission-based tasks.',
	blurb: 'A browser game of procedurally generated archaeological discovery.',
	description:
		'A browser game where players discover procedurally generated archaeological artefacts, track them on a discovery timeline, and complete mission-based tasks. It runs SvelteKit through Deno rather than Node, deployed to Deno Deploy via @deno/svelte-adapter, using Svelte 5 runes throughout with Tailwind CSS v4 and DaisyUI v5. A grammar-based procedural artefact generator with typed definitions for item parts, conditions, and materials sits staged for integration into the core loop. The discovery loop itself is complete, with persistence, save/load, and auth on the roadmap, and the architecture decisions are documented in docs/.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'prototype',
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
		{ label: 'Procedural Generation', kind: 'concept' },
		{ label: 'Ephemeral / in-memory', kind: 'data' }
	],
	lastCommit: '2026-02-16',
	metrics: {
		commits: 75
	}
};
