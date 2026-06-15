import type { Project } from '../types.js';

export const rhea: Project = {
	slug: 'rhea',
	name: 'Rhea',
	tagline:
		'An AI curriculum generator for peer-led learning cohorts. Produces multi-week course structures via Claude, with optional live research so output reflects current industry practice.',
	description:
		'[Placeholder] Rhea is the tool that powers curriculum planning at Founders and Coders. It chains together named sub-workflows (Themis for courses, Metis for modules, Theia for import/export) through a shared generation engine backed by the Anthropic SDK and LangChain. Every generated module carries a changelog, confidence scoring, and auto-cited research sources so human reviewers know exactly what to trust.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'prototype',
	repoUrl: 'https://github.com/JasonWarrenUK/rhea',
	highlights: [
		'Named sub-workflows (Themis/Metis/Theia) share a common generation engine with the Anthropic SDK and LangChain, making each workflow independently maintainable.',
		'Provenance/cascade pattern: every generated module carries a changelog, confidence score (high/medium/low), and auto-cited research sources.',
		'Schema validation with automatic retry (up to 3 attempts) on failed generations; Zod enforces the output contract.',
		'Configurable research domain allowlists, hierarchical course→arc→module config inheritance, agent client + prompt factory abstraction.',
		'356 commits; deploys via Deno Deploy with the @deno/svelte-adapter; 31 Svelte components, 66 TypeScript files.'
	],
	relationships: [],
	featured: true,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Anthropic SDK', kind: 'ai' },
		{ label: 'LangChain', kind: 'ai' },
		{ label: 'Zod', kind: 'tool' },
		{ label: 'Deno', kind: 'runtime' }
	],
	lastCommit: '2026-03-25',
	metrics: {
		commits: 356,
		linesAdded: 6000
	}
};
