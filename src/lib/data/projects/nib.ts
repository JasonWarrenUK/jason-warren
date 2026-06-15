import type { Project } from '../types.js';

export const nib: Project = {
	slug: 'nib',
	name: 'Nib',
	tagline:
		'A minimal, copy-paste Ink runtime for SvelteKit. Drop it into any project and write an onInit function to wire in your game logic.',
	description:
		'Extracted from The Work once the Ink and Svelte runtime proved generically useful, this is a minimal, copy-paste runtime: drop the directory into any SvelteKit project and write an onInit function to wire in your game logic. Reactive Ink story state runs on Svelte 5 runes ($state, $derived) so the UI updates automatically, and tag parsing turns structured metadata (CLEAR, mood:x, class:x) into typed objects. The governing principle is zero game-specific code, with all customisation injected through a single onInit callback, which lets it power any Ink-based SvelteKit project.',
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
		{ label: 'Node.js', kind: 'runtime' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Ink / inkjs', kind: 'tool' },
		{ label: 'No persistence', kind: 'data' }
	],
	lastCommit: '2026-03-11',
	metrics: {
		commits: 1
	}
};
