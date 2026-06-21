import type { Project } from '../types.js';

export const thoseWhoCameBefore: Project = {
	slug: 'those-who-came-before',
	name: 'Those Who Came Before',
	tagline:
		'A browser game of archaeological interpretation: procedurally generated artefacts, an Interpretive Lens that bends what you see toward what you already believe, and error as the engine.',
	blurb: 'A browser game of archaeological interpretation where wrong readings compound.',
	description:
		'The core loop is: inspect a procedurally generated artefact, form an interpretation, record it, then meet new artefacts whose presentation is filtered through what you already believe. Wrong readings do not fail; they compound. The Interpretive Lens reorders observation salience, primes classification suggestions, and introduces omission blindness without ever fabricating or revealing occluded truth. It cannot lie to you; it just makes you more likely to confirm yourself. The procedural generator is the technical centrepiece: a bottom-up, intent-free context-free grammar over geometric primitives (elongated, cylindrical, flat-broad, ring-form and others). The grammar never branches by function; it produces physical structures and has no concept of what a sword or pot is. Culture biases weighted selection with a floor so no output is ever impossible. A plausibility checker re-rolls implausible forms. Per-component material assignment draws on geological availability and cultural affinity. A separate recursive decorative grammar can layer decoration on decoration, implying rework across cultures. The generator and lens are specified in depth across thirteen design documents; the v3 build is underway on a reset branch.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'prototype',
	repoUrl: 'https://github.com/JasonWarrenUK/those-who-came-before',
	highlights: [
		'Intent-free geometric-primitive grammar: produces physical structures, never item types; classification is entirely downstream.',
		'Culture-biased weighted selection with a probability floor plus a plausibility checker that re-rolls invalid forms.',
		'Interpretive Lens: player beliefs mechanically filter observation salience, classification priming, and cross-reference without revealing ground truth.',
		'Recursive decorative grammar: decoration-on-decoration implies rework across cultures, creating temporal depth the system never flags.',
		'Runs SvelteKit through Deno via @deno/svelte-adapter; thirteen design documents specify the full generator and career/publication system.'
	],
	relationships: [],
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Deno', kind: 'runtime' },
		{ label: 'Tailwind CSS v4', kind: 'framework' },
		{ label: 'Procedural Generation', kind: 'concept' },
		{ label: 'Ephemeral / in-memory', kind: 'data' }
	],
	lastCommit: '2026-02-16',
	metrics: {
		commits: 75
	}
};
