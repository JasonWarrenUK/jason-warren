import type { AuthoredProject } from '../types.js';

export const facCra: AuthoredProject = {
	slug: 'fac-cra',
	tagline:
		'The Founders and Coders apprenticeship platform: a large, mature TypeScript monorepo with a GraphQL API, a distribution pipeline, and a learner dashboard.',
	blurb: 'The Founders and Coders apprenticeship platform: a mature TypeScript monorepo.',
	description:
		'Maintained by the wider Founders and Coders team, this is a large, mature TypeScript monorepo behind the apprenticeship platform: a GraphQL API, a distribution pipeline, and a learner dashboard. I contributed self-contained features and well-scoped fixes into the established codebase. The headliners are the Lead Pool multi-axis candidate segmentation (six axes, composable signal groups, a hydration orchestrator, and pattern-based strength classification), distribution pipeline extensions (saved-query folders, workshop runsheets, batch lead-scoring, a markdown email composer), a learner dashboard restructure with collapsible tiles and health metrics, and the first automated browser tests on the project via a full Playwright E2E suite. A non-invasive audit pass added security hardening and accessibility fixes and stripped out dead dependencies.',
	kind: 'app',
	released: true,
	contribution: {
		role: 'collaborator',
		collaboration: { team: 'Founders and Coders', employer: 'Founders and Coders' },
		contributionNote:
			'Lead Pool candidate segmentation (6 axes, composable signal groups, hydration orchestrator); learner dashboard restructure (collapsible tiles, health metrics, Article Stats tab); the first automated browser tests on the project via a full Playwright E2E suite; distribution pipeline extensions; security and a11y audit pass stripping dead code and unused dependencies.'
	},
	highlights: [
		'Lead Pool multi-axis candidate segmentation: 6 segmentation axes, composable signal groups, hydration orchestrator, pattern-based strength classification.',
		'Full Playwright E2E suite for the learn app. First automated browser tests on the project.',
		'Learner dashboard restructure: collapsible tiles, health metrics, responsive layout, and an Article Stats tab.',
		'Distribution pipeline extensions: saved-query folder system, workshop runsheets, batch lead-scoring, markdown email composer.',
		'Non-invasive audit pass: security hardening, a11y fixes, dead-code and unused-dependency removal.'
	],
	relationships: [],
	tags: [
		{ label: 'Playwright', kind: 'tool' },
		{ label: 'Monorepo', kind: 'tool' }
	]
};
