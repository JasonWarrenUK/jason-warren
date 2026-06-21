import type { AuthoredProject } from '../types.js';

export const facCra: AuthoredProject = {
	slug: 'fac-cra',
	name: 'FAC CRA',
	tagline:
		'The Founders and Coders apprenticeship platform: a large, mature TypeScript monorepo with a GraphQL API, a distribution pipeline, and a learner dashboard.',
	blurb: 'The Founders and Coders apprenticeship platform: a mature TypeScript monorepo.',
	description:
		'Maintained by the wider Founders and Coders team, this is a large, mature TypeScript monorepo behind the apprenticeship platform: a GraphQL API, a distribution pipeline, and a learner dashboard. Jason contributed 320 commits of self-contained features and well-scoped fixes into the established codebase. The headliners are the Lead Pool multi-axis candidate segmentation (six axes, composable signal groups, a hydration orchestrator, and pattern-based strength classification), distribution pipeline extensions (saved-query folders, workshop runsheets, batch lead-scoring, a markdown email composer), a learner dashboard restructure with collapsible tiles and health metrics, and the first automated browser tests on the project via a full Playwright E2E suite. A non-invasive audit pass added security hardening and accessibility fixes and removed 17 unused packages.',
	kind: 'app',
	contribution: {
		role: 'collaborator',
		contributionNote:
			'320 commits, shipping whole features and well-scoped fixes into a large, established platform. Headliners: Lead Pool multi-axis candidate segmentation (6 axes, query functions, hydration orchestrator, pattern-based strength classification, PR #144); distribution pipeline (saved-query folder system, workshop runsheet queries, batch lead-scoring, markdown email composer, lead-pool widget); learner dashboard (collapsible tiles + health metrics + responsive layout, Article Stats tab, admin view PR #72); full Playwright E2E suite; security/a11y audit pass removing 17 unused packages; KaTeX bundling fix and a run of precise distribution fixes (PRs #211–218). +31,500 / −28,600 lines.',
	},
	status: 'wip',
	repoUrl: 'https://github.com/izaakrogan/fac-cra',
	highlights: [
		'Lead Pool multi-axis candidate segmentation: 6 segmentation axes, composable signal groups, hydration orchestrator, pattern-based strength classification.',
		'Full Playwright E2E suite for the learn app. First automated browser tests on the project.',
		'Learner dashboard restructure: collapsible tiles, health metrics, responsive layout, and an Article Stats tab.',
		'Distribution pipeline extensions: saved-query folder system, workshop runsheets, batch lead-scoring, markdown email composer.',
		'Non-invasive audit pass: security hardening, a11y fixes, dead-code removal, 17 unused packages removed.'
	],
	relationships: [],
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'GraphQL', kind: 'data' },
		{ label: 'PostgreSQL', kind: 'data' },
		{ label: 'Playwright', kind: 'tool' },
		{ label: 'Monorepo', kind: 'tool' },
		{ label: 'Node.js', kind: 'runtime' }
	],
	lastCommit: '2026-04-02',
	metrics: {
		commits: 320,
		linesAdded: 31500,
		linesRemoved: 28600
	}
};
