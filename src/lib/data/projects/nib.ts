import type { AuthoredProject } from '../types.js';

export const nib: AuthoredProject = {
	slug: 'nib',
	tagline:
		'A minimal, copy-paste Ink runtime for SvelteKit: one onInit callback for game-specific wiring, a tick counter to bridge non-reactive inkjs to Svelte 5 runes.',
	blurb: 'A minimal, copy-paste Ink runtime for SvelteKit with a clean injection seam.',
	description:
		'Integrating Ink directly into a SvelteKit project scatters BindExternalFunction calls, game-data registration, and story mechanics through the load/continue/choose plumbing; nothing is reusable and the reactive boundary is hard to reason about. Nib was extracted from The Work once the generic runtime proved separable. The fix is a single injection seam: loadStory() handles BOM stripping, the error handler, and an optional storylet stub, then calls onInit(ink) after story creation but before playback. All game-specific binding lives there and nowhere else. The reactivity problem is handled by a tick counter incremented at the end of every continue(); because the UI reads tick inside a $derived, any getVariable() call re-evaluates whenever the story advances. inkjs is a plain mutable object with no Svelte awareness; the tick counter is the minimal bridge. The full runtime is two files. Drop the directory into any SvelteKit project, write an onInit, and own the code.',
	kind: 'library',
	contribution: { role: 'solo' },
	status: 'finished',
	highlights: [
		'Single onInit injection seam: game-specific BindExternalFunction calls and data registration in one callback, nowhere else.',
		'tick counter bridges non-reactive inkjs to Svelte 5 runes: UI reads tick inside $derived, so getVariable() re-evaluates on every continue().',
		'Reactive story state via $state/$derived: canContinue, currentTags, history update automatically.',
		'Tag parsing for CLEAR, mood:x, and class:x: CLEAR wipes history, mood: writes data-mood for CSS, bare tags become class names.',
		'Copy-paste distribution: two files, no package.json, designed to be owned and edited per project.'
	],
	relationships: [
		{
			kind: 'powers',
			target: 'the-work',
			note: "The Ink runtime was always separable from the game's content; once that was clear it moved into Nib, two files behind a single onInit seam."
		}
	],
	tags: [{ label: 'No persistence', kind: 'data' }]
};
