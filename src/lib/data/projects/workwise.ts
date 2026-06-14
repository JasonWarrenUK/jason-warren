import type { Project } from '../types.js';

export const workwise: Project = {
	slug: 'workwise',
	name: 'WorkWise',
	tagline:
		'A digital workplace passport that helps neurodivergent employees document their needs and share them with line managers — built for Founders and Coders and the LIFT programme.',
	description:
		'[Placeholder] WorkWise is a real social-impact product. Employees use it to document the accommodations that help them work best; managers use it to understand and act on those needs. The engineering challenge is matching the care of the product\'s purpose: RLS-enforced data isolation, magic-link authentication, and a form system that handles the emotional weight of self-disclosure.',
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
		'State-based response handling with creation-date versioning — answers are versioned, not overwritten (PR #28).',
		'Database-driven status indicators: live config, no hardcoded states (PR #36).',
		'Local Supabase-in-Docker dev loop with two-tier seeding (real questions vs fake test data) and generated TypeScript types from the DB schema.',
		'Row-Level Security enforces data isolation between employees and managers.'
	],
	relationships: [],
	featured: true,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Supabase', kind: 'domain' },
		{ label: 'PostgreSQL', kind: 'domain' },
		{ label: 'Tailwind CSS', kind: 'framework' },
		{ label: 'Accessibility', kind: 'domain' }
	],
	metrics: {
		commits: 182,
		mergedPrs: 24,
		linesAdded: 16600,
		linesRemoved: 9000
	}
};
