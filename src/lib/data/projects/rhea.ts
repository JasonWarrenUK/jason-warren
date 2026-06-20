import type { Project } from '../types.js';

export const rhea: Project = {
	slug: 'rhea',
	name: 'Rhea',
	tagline:
		'An AI curriculum generator for peer-led learning cohorts. Produces multi-week course structures via Claude, with optional live research so output reflects current industry practice.',
	blurb: 'An AI curriculum generator for peer-led learning cohorts.',
	description:
		'Peer-led learning cohorts need multi-week course structures, and this generates them through Claude with optional live research so output reflects current industry practice. Named sub-workflows (Themis for courses, Metis for modules, Theia for import and export) share a common generation engine backed by the Anthropic SDK and LangChain, keeping each workflow independently maintainable. A provenance cascade gives every generated module a changelog, a high, medium, or low confidence score, and auto-cited research sources, so reviewers know exactly what to trust, while Zod enforces the output contract with automatic retry up to three attempts on failed generations. Built across 356 commits as a prototype, it deploys via Deno Deploy and spans 31 Svelte components and 66 TypeScript files.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'prototype',
	repoUrl: 'https://github.com/JasonWarrenUK/rhea',
	highlights: [
		'Named sub-workflows (Themis/Metis/Theia) share a common generation engine with the Anthropic SDK and LangChain, making each workflow independently maintainable.',
		'Provenance/cascade pattern: every generated module carries a changelog, confidence score (high/medium/low), and auto-cited research sources.',
		'Schema validation with automatic retry (up to 3 attempts) on failed generations; Zod enforces the output contract.',
		'Configurable research domain allowlists, hierarchical course→arc→module config inheritance, agent client + prompt factory abstraction.',
		'Deploys via Deno Deploy with the @deno/svelte-adapter; configurable research domain allowlists and hierarchical course→arc→module config inheritance keep generation scope controllable.'
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
		{ label: 'Deno', kind: 'runtime' },
		{ label: 'Document / JSON', kind: 'data' }
	],
	lastCommit: '2026-03-25',
	metrics: {
		commits: 356,
		linesAdded: 6000
	}
};
