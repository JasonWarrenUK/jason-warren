import type { Project } from '../types.js';

export const workwise: Project = {
	slug: 'workwise',
	name: 'WorkWise',
	tagline:
		'A digital workplace passport that helps neurodivergent employees document their needs and share them with line managers, built for Founders and Coders and the LIFT programme.',
	description:
		'A digital workplace passport, built for Founders and Coders and the LIFT programme, that helps neurodivergent employees document their needs and share them with line managers. Employees record the accommodations that help them work best; managers use it to understand and act on those needs, with Row-Level Security enforcing data isolation between the two. Jason led the response-state architecture, where answers are versioned by creation date rather than overwritten, and built the tile-based dashboard layout, database-driven status indicators with no hardcoded states, and a consolidated CSS architecture across 24 merged PRs. The developer loop runs on a local Supabase-in-Docker setup with two-tier seeding and TypeScript types generated from the database schema.',
	kind: 'app',
	contribution: {
		role: 'lead',
		contributionNote:
			'24 merged PRs. Led the response-state architecture with creation-date versioning; built the tile-based dashboard layout; implemented database-driven status indicators; consolidated the CSS architecture. +16,600 / −9,000 lines.',
		team: 'Founders and Coders / LIFT02'
	},
	status: 'wip',
	repoUrl: 'https://github.com/foundersandcoders/workwise',
	highlights: [
		'Tile-based dashboard layout with responsive grid and collapsible sections (PR #41).',
		'State-based response handling with creation-date versioning: answers are versioned, not overwritten (PR #28).',
		'Database-driven status indicators: live config, no hardcoded states (PR #36).',
		'Local Supabase-in-Docker dev loop with two-tier seeding (real questions vs fake test data) and generated TypeScript types from the DB schema.',
		'Row-Level Security enforces data isolation between employees and managers.'
	],
	relationships: [],
	featured: true,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Supabase', kind: 'data' },
		{ label: 'PostgreSQL', kind: 'data' },
		{ label: 'Tailwind CSS', kind: 'framework' },
		{ label: 'Accessibility', kind: 'concept' }
	],
	lastCommit: '2025-11-01',
	metrics: {
		commits: 182,
		mergedPrs: 24,
		linesAdded: 16600,
		linesRemoved: 9000
	}
};
