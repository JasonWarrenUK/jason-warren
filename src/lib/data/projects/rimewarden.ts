import type { Project } from '../types.js';

export const rimewarden: Project = {
	slug: 'rimewarden',
	name: 'Rimewarden',
	tagline:
		'A Svelte 5 campaign tracker for Frosthaven that renders your scenario-progression graph as a generated D2 diagram.',
	description:
		"A personal prototype for tracking a Frosthaven board-game campaign: town resources, party composition, and scenario unlocks. Built with SvelteKit and Svelte 5 runes, it uses a class-based CampaignManager store with localStorage persistence and JSON import/export over a strongly-typed domain model covering resources, building costs, scenario links, and party composition. The standout feature generates a D2 diagram of the campaign's scenario-progression graph directly from saved state, styling completed, pending, and unknown nodes, and deterministic logic such as the affordableBuildings derivation checks resource sufficiency without server involvement. The data model and core logic are in place; this remains an early prototype rather than a finished product.",
	kind: 'tool',
	contribution: { role: 'solo' },
	status: 'prototype',
	repoUrl: 'https://github.com/JasonWarrenUK/rimewarden',
	highlights: [
		'Svelte 5 runes class-based CampaignManager store ($state/$derived) with localStorage persistence and JSON import/export.',
		'D2 diagram generation from campaign data: programmatically builds a styled scenario-progression graph with completed/pending/unknown node classes.',
		'Strongly-typed board-game domain model covering resources, building costs, scenario links, and party composition.',
		'Deterministic game logic: an affordableBuildings derivation checks resource sufficiency against building costs without server involvement.',
		'Tabbed single-page architecture with reactive tab switching via a runes store, configured with svelte-adapter-bun.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'D2', kind: 'tool' },
		{ label: 'Tailwind CSS', kind: 'framework' }
	],
	lastCommit: '2026-01-24',
	metrics: {
		commits: 2
	}
};
