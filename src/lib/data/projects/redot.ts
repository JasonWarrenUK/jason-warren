import type { AuthoredProject } from '../types.js';

export const redot: AuthoredProject = {
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
		collaboration: { team: 'FAC-31 cohort', employer: 'Founders and Coders' },
		contributionNote:
			'Replaced LangChain with the Anthropic SDK directly on a FAC-31 cohort GitHub Action, cutting abstraction layers and the transitive dependency surface; improved prompts with XML structure and batch processing; prepared the action for public distribution with a full action.yml input schema.'
	},
	status: 'finished',
	track: 'product',
	progress: 'complete',
	highlights: [
		'Analyses only functions modified in the current PR: context-aware, not a full codebase scan.',
		'Recognises the full range of JS/TS function forms: arrow, async, generators, class methods, getters/setters, constructors.',
		'XML-structured prompts with batch processing improve Claude output consistency.',
		'Replaced LangChain with the Anthropic SDK directly: fewer abstraction layers, a stable typed interface, and no transitive dependency surface.',
		'Packaged as a reusable GitHub Action with full action.yml input schema; AGPLv3 licensed.'
	],
	relationships: [],
	tags: [
		{ label: 'Anthropic SDK', kind: 'ai' },
		{ label: 'GitHub Actions', kind: 'tool' },
		{ label: 'No persistence', kind: 'data' }
	]
};
