import type { Project } from '../types.js';

export const psyche: Project = {
	slug: 'psyche',
	name: 'Psyche',
	tagline: 'A training project built during the FAC-31 cohort at Founders and Coders.',
	description: '[Placeholder] A training project. Details to follow.',
	kind: 'app',
	contribution: {
		role: 'lead',
		contributionNote: '76 of 82 commits. Effectively the primary author on this training project.',
		team: 'FAC-31 cohort'
	},
	status: 'archived',
	repoUrl: 'https://github.com/fac-31/psyche',
	highlights: ['Primary author (76/82 commits) on a collaborative training project.'],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' }
	],
	metrics: {
		commits: 76
	}
};
