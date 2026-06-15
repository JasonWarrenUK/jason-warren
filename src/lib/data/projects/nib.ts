import type { Project } from '../types.js';

export const nib: Project = {
	slug: 'nib',
	name: 'Nib',
	tagline:
		'A minimal, copy-paste Ink runtime for SvelteKit. Drop it into any project and write an onInit function to wire in your game logic.',
	description:
		'[Placeholder] Nib was extracted from The Work when it became clear the Ink+Svelte runtime was generically useful. It provides reactive Ink story state via Svelte 5 runes, tag parsing (CLEAR, mood, class), and a clean API surface. The design principle is zero game-specific imports: all customisation is injected via a single onInit callback, so Nib can power any Ink-based SvelteKit project.',
	kind: 'library',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/nib',
	highlights: [
		'Zero game-specific code: game logic injected via a single onInit callback.',
		'Reactive Ink story state via Svelte 5 runes ($state, $derived): automatic UI updates.',
		'Tag parsing for structured metadata (CLEAR, mood:x, class:x) into typed objects.',
		'Copy-paste distribution: drop the directory into any SvelteKit project.'
	],
	relationships: [
		{
			kind: 'powers',
			target: 'the-work',
			note: 'Nib powers the Ink narrative runtime in The Work.'
		}
	],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Ink / inkjs', kind: 'tool' }
	],
	lastCommit: '2026-03-11',
	metrics: {
		commits: 1
	}
};
