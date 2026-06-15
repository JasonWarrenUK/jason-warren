import type { Project } from '../types.js';

export const thingsWeDo: Project = {
	slug: 'things-we-do',
	name: 'Things We Do',
	tagline:
		'An installable PWA for managing tasks and emotional wellbeing through mood tracking and personalised coping-strategy toolkits.',
	description:
		'[Placeholder] Things We Do is an offline-first PWA: RxDB handles local-first storage with background sync, and Serwist makes it installable. The 3D mood visualisation (Plotly) was my contribution along with the next-actions and category systems.',
	kind: 'app',
	contribution: {
		role: 'collaborator',
		contributionNote:
			'21 merged PRs. Built the next-actions feature end-to-end (creation, immediate selection, view, deletion); designed the insights charts including the 3D Plotly visualisation; implemented ephemeral categories with modal confirmations; initialised the RxDB offline-first storage layer. +6,700 / −3,000 lines.',
		team: 'FAC-30 cohort'
	},
	status: 'archived',
	repoUrl: 'https://github.com/fac30/things-we-do',
	highlights: [
		'Next-actions feature end-to-end: creation, immediate selection, view, and deletion (PRs #84, #95, #102).',
		'3D mood visualisation via Plotly.js: interactive, animated wellbeing data (PR #74).',
		'Ephemeral categories with modal confirmations (PR #65).',
		'RxDB offline-first storage initialisation with schema design (PR #6).',
		'Offline-first installable PWA via Serwist service worker and RxDB local storage.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'React', kind: 'framework' },
		{ label: 'Next.js', kind: 'framework' },
		{ label: 'RxDB', kind: 'database' },
		{ label: 'Plotly.js', kind: 'tool' },
		{ label: 'PWA', kind: 'concept' },
		{ label: 'Tailwind CSS', kind: 'framework' }
	],
	lastCommit: '2024-12-19',
	metrics: {
		commits: 183,
		mergedPrs: 21,
		linesAdded: 6700,
		linesRemoved: 3000
	}
};
