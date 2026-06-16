import type { Project } from '../types.js';

export const redot: Project = {
	slug: 'redot',
	name: 'ReDoT',
	tagline:
		'A GitHub Action that uses Claude to automatically generate and update JSDoc and a central DOC.MD whenever a pull request modifies JavaScript or TypeScript functions.',
	blurb: 'A GitHub Action that keeps JSDoc current using Claude.',
	description:
		'Documentation drifts because nobody updates it by hand, so this action does it on every pull request. It analyses only the functions actually changed in a PR rather than scanning the whole codebase, then updates their JSDoc and the central documentation file in context, recognising the full range of JS/TS function forms (arrow, async, generators, class methods, getters and setters, constructors). Across six merged PRs to the FAC-31 cohort project, the standout work was replacing the LangChain dependency with the Anthropic SDK directly for a simpler, more maintainable build, alongside XML-structured prompts with batch processing for more consistent Claude output. It ships as a reusable, AGPLv3-licensed GitHub Action with a full action.yml input schema.',
	kind: 'tool',
	contribution: {
		role: 'collaborator',
		contributionNote:
			'6 merged PRs. Replaced the LangChain dependency with the Anthropic SDK directly (PR #6); improved prompts with XML structure and batch processing (PR #12); prepared the action for public distribution (PR #5). Also added documentation and PR banner.',
		team: 'FAC-31 cohort'
	},
	status: 'finished',
	repoUrl: 'https://github.com/fac-31/ReDoT',
	highlights: [
		'Analyses only functions modified in the current PR: context-aware, not a full codebase scan.',
		'Recognises the full range of JS/TS function forms: arrow, async, generators, class methods, getters/setters, constructors.',
		'XML-structured prompts with batch processing improve Claude output consistency.',
		'Replaced LangChain with the Anthropic SDK directly. Simpler, more maintainable dependency.',
		'Packaged as a reusable GitHub Action with full action.yml input schema; AGPLv3 licensed.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'JavaScript', kind: 'language' },
		{ label: 'Node.js', kind: 'runtime' },
		{ label: 'Anthropic SDK', kind: 'ai' },
		{ label: 'GitHub Actions', kind: 'tool' },
		{ label: 'No persistence', kind: 'data' }
	],
	lastCommit: '2025-10-13',
	metrics: {
		commits: 28,
		mergedPrs: 6,
		linesAdded: 2386,
		linesRemoved: 1091
	}
};
