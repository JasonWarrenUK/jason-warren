import type { Project } from '../types.js';

export const facCra: Project = {
	slug: 'fac-cra',
	name: 'FAC CRA',
	tagline:
		'The Founders and Coders apprenticeship platform — a large, mature TypeScript monorepo with a GraphQL API, a distribution pipeline, and a learner dashboard.',
	description:
		'[Placeholder] FAC CRA is a long-running platform built and maintained by the wider Founders and Coders team. My contributions are self-contained features and careful fixes shipped into an established codebase: the Lead Pool segmentation system, the distribution pipeline improvements, the learner dashboard restructure, and a Playwright E2E test suite.',
	kind: 'app',
	contribution: {
		role: 'collaborator',
		contributionNote:
			'320 commits, shipping whole features and well-scoped fixes into a large, established platform. Headliners: Lead Pool multi-axis candidate segmentation (6 axes, query functions, hydration orchestrator, pattern-based strength classification, PR #144); distribution pipeline (saved-query folder system, workshop runsheet queries, batch lead-scoring, markdown email composer, lead-pool widget); learner dashboard (collapsible tiles + health metrics + responsive layout, Article Stats tab, admin view PR #72); full Playwright E2E suite; security/a11y audit pass removing 17 unused packages; KaTeX bundling fix and a run of precise distribution fixes (PRs #211–218). +31,500 / −28,600 lines.',
		team: 'Founders and Coders'
	},
	status: 'wip',
	repoUrl: 'https://github.com/izaakrogan/fac-cra',
	highlights: [
		'Lead Pool multi-axis candidate segmentation: 6 segmentation axes, composable signal groups, hydration orchestrator, pattern-based strength classification (PR #144).',
		'Full Playwright E2E suite for the learn app — first automated browser tests on the project.',
		'Learner dashboard restructure: collapsible tiles, health metrics, responsive layout, Article Stats tab (PRs #72, #209, #1298 LOC).',
		'Distribution pipeline extensions: saved-query folder system, workshop runsheets, batch lead-scoring, markdown email composer.',
		'Non-invasive audit pass: security hardening, a11y fixes, dead-code removal, 17 unused packages removed.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'GraphQL', kind: 'domain' },
		{ label: 'PostgreSQL', kind: 'domain' },
		{ label: 'Playwright', kind: 'domain' },
		{ label: 'Monorepo', kind: 'domain' },
		{ label: 'Node.js', kind: 'runtime' }
	],
	metrics: {
		commits: 320,
		linesAdded: 31500,
		linesRemoved: 28600
	}
};
