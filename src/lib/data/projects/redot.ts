import type { Project } from '../types.js';

export const redot: Project = {
	slug: 'redot',
	name: 'ReDoT',
	tagline:
		'A GitHub Action that uses Claude to automatically generate and update JSDoc and a central DOC.MD whenever a pull request modifies JavaScript or TypeScript functions.',
	description:
		'[Placeholder] ReDoT (Re-Document with Technology) analyses only the functions actually changed in a PR, not the whole codebase, and updates their JSDoc comments and the central documentation file in context. It recognises the full range of JS/TS function forms and preserves existing documentation where no change was made.',
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
		{ label: 'Anthropic SDK', kind: 'domain' },
		{ label: 'GitHub Actions', kind: 'domain' }
	],
	metrics: {
		commits: 28,
		mergedPrs: 6,
		linesAdded: 2386,
		linesRemoved: 1091
	}
};
