import type { AuthoredProject } from '../types.js';

export const thingsWeDo: AuthoredProject = {
	slug: 'things-we-do',
	name: 'Things We Do',
	tagline:
		'An installable PWA for managing tasks and emotional wellbeing through mood tracking and personalised coping-strategy toolkits.',
	blurb: 'A PWA for managing tasks and wellbeing through mood tracking.',
	description:
		'An installable, offline-first PWA for managing tasks and emotional wellbeing through mood tracking and personalised coping-strategy toolkits, built by the FAC-30 cohort. Offline support comes from a Serwist service worker over RxDB local storage, which I initialised including the schema design. I built the next-actions feature end-to-end (creation, immediate selection, view, and deletion), designed the insights charts including a 3D mood visualisation in Plotly.js, and implemented ephemeral categories with modal confirmations. The project is now archived.',
	kind: 'app',
	contribution: {
		role: 'collaborator',
		collaboration: { team: 'FAC-30 cohort', employer: 'Founders and Coders' },
		contributionNote:
			'Built the next-actions feature end-to-end on a FAC-30 cohort mental-health tracker; designed the insights charts including the 3D Plotly wellbeing visualisation; implemented ephemeral categories with modal confirmations; initialised the RxDB offline-first storage layer.'
	},
	status: 'archived',
	repoUrl: 'https://github.com/fac30/things-we-do',
	highlights: [
		'Next-actions feature end-to-end: creation, immediate selection, view, and deletion.',
		'3D mood visualisation via Plotly.js: interactive, animated wellbeing data.',
		'Ephemeral categories with modal confirmations.',
		'RxDB offline-first storage initialisation with schema design.',
		'Serwist service worker with background sync and offline caching; installable as a PWA.'
	],
	relationships: [],
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'React', kind: 'framework' },
		{ label: 'Next.js', kind: 'framework' },
		{ label: 'RxDB', kind: 'data' },
		{ label: 'Plotly.js', kind: 'tool' },
		{ label: 'PWA', kind: 'concept' },
		{ label: 'Tailwind CSS', kind: 'framework' }
	]
};
