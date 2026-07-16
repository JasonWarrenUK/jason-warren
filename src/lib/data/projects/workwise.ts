import type { AuthoredProject } from '../types.js';

export const workwise: AuthoredProject = {
	slug: 'workwise',
	name: 'WorkWise',
	tagline:
		'A digital workplace passport that helps neurodivergent employees document their needs and share them with line managers, built for Founders and Coders and the LIFT programme.',
	blurb: 'A workplace passport for neurodivergent employees to document their needs.',
	description:
		'A digital workplace passport, built for Founders and Coders and the LIFT programme, that helps neurodivergent employees document their needs and share them with line managers. Employees record the accommodations that help them work best; managers use it to understand and act on those needs, with Row-Level Security enforcing data isolation between the two. I led the response-state architecture, where answers are versioned by creation date rather than overwritten, and built the tile-based dashboard layout, database-driven status indicators with no hardcoded states and a consolidated CSS architecture. The developer loop runs on a local Supabase-in-Docker setup with two-tier seeding and TypeScript types generated from the database schema.',
	kind: 'app',
	contribution: {
		role: 'lead',
		collaboration: { team: 'Founders and Coders', employer: 'Founders and Coders', client: 'LIFT' },
		contributionNote:
			'Drove the response-state architecture (creation-date versioning, answers versioned not overwritten), the tile-based dashboard layout and database-driven status indicators on a SvelteKit 2 workforce platform built for LIFT. Local dev loop runs on Supabase-in-Docker with RLS-enforced data isolation.'
	},
	status: 'wip',
	highlights: [
		'Tile-based dashboard layout with responsive grid and collapsible sections.',
		'State-based response handling with creation-date versioning: answers are versioned, not overwritten.',
		'Database-driven status indicators: live config, no hardcoded states.',
		'Local Supabase-in-Docker dev loop with two-tier seeding (real questions vs fake test data) and generated TypeScript types from the DB schema.',
		'Row-Level Security enforces data isolation between employees and managers.'
	],
	relationships: [],
	tags: [{ label: 'Accessibility', kind: 'concept' }]
};
