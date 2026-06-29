import type { AuthoredProject } from '../types.js';

// Authored overlay for "beacons-test". Every field except `slug` is optional and
// overlays the Drift-derived manifest default. Delete any field you do not author.
// Depth rubric (`drift audit`): description >= 80 words AND >= 4 highlights
// (AND a contributionNote for team projects) earns a Full tier.
export const beaconsTest: AuthoredProject = {
	slug: 'beacons-test',

	// Display name. Defaults to a title-cased slug if omitted.
	name: '',

	// One-sentence summary (meta tags, detail header, map tooltip). High visibility.
	tagline: '',

	// Short card face, roughly 1/3 of the tagline. Shown on collapsed cards.
	blurb: '',

	// Longer case-study body. Name the problem, the architecture or approach, and
	// a verification or outcome signal. Aim for >= 80 words for a Full tier.
	description: '',

	// One of: 'app' | 'game' | 'website' | 'toy' | 'library' | 'tool' | 'tui' | 'repo'
	kind: 'app',

	// For 'solo', no note is needed. For 'lead' | 'collaborator', add a specific
	// contributionNote (PRs, stats, named features) to reach Full tier.
	contribution: { role: 'solo' },

	// One of: 'live' | 'wip' | 'finished' | 'prototype' | 'archived' | 'uncategorised'
	status: 'wip',

	repoUrl: '',

	// 3-5 technically interesting things. Feature or technical detail, not tooling config.
	highlights: [],

	// e.g. { kind: 'extracted-from', target: 'other-slug', note: '...' }
	relationships: [],

	// e.g. { label: 'TypeScript', kind: 'language' }
	tags: []
};
