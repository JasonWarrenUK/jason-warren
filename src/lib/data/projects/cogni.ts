import type { Project } from '../types.js';

export const cogni: Project = {
	slug: 'cogni',
	name: 'Cogni',
	tagline:
		'A developer cognition self-assessment: map your style across 17 two-axis compasses, then see which methodologies (TDD, Shape Up, Kanban…) fit you and why.',
	description:
		'[Placeholder] Cogni came out of noticing that most "what methodology should I use?" advice ignores how the person actually thinks. The 17 compasses cover things like risk tolerance, collaboration style, and abstraction preference. Constraint propagation crosshatches quadrant options that would contradict positions you have already set. The output is a portable Markdown report explaining why each methodology fits or causes friction: useful in 1:1s, job evaluations, and retrospectives.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'prototype',
	repoUrl: 'https://github.com/JasonWarrenUK/cogni',
	highlights: [
		'17 two-axis compasses organised in three tiers; constraint propagation crosshatches quadrants that would contradict already-set positions.',
		'10+ methodology evaluations (TDD, Scrum, Shape Up, Kanban, XP, etc.) with per-methodology friction explanations.',
		'Core logic (constraint propagation, method evaluation, profile synthesis, import/export) covered by Vitest unit tests.',
		'Export as portable Markdown for use in 1:1s, job evaluations, and retrospectives; localStorage persistence between sessions.',
		'v0.6: working but pre-1.0; built with Svelte, Bun, and TypeScript.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'Vitest', kind: 'domain' }
	],
	metrics: {
		commits: 24
	}
};
