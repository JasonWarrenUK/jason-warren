/**
 * The progress ramp's three inks, and which one a project draws on.
 *
 * The ramp exists as an ordinal scale (colour-system.md §2): `in-progress →
 * dormant → released`, walking one direction through the palette's hue order so
 * an adjacent-hue confusion costs one step rather than a category (§8). That
 * argument only holds if all three inks actually reach the surfaces the census
 * books them against, which is what these tests pin.
 *
 * `released` was previously readable on the badge alone: the map and timeline
 * never received the field, so the five released projects drew in the same ink
 * as any other project sharing their `progress` value, and the settled rung was
 * unreachable on rails and rings while the census claimed otherwise.
 */

import { describe, it, expect } from 'vitest';
import {
	progressColour,
	stageInk,
	stageInkColour,
	stageInkLabel,
	stageInkOrder,
	stagePhrase
} from './graph-style.js';
import { projects } from '$lib/data/index.js';

describe('stageInk', () => {
	it('reads released work as settled whatever its activity', () => {
		// Reach outranks activity once earned: a released project that is still
		// being maintained is still released, which is what the reader wants to
		// know about something they could actually use.
		expect(stageInk('in-progress', true)).toBe('released');
		expect(stageInk('dormant', true)).toBe('released');
	});

	it('reads unreleased work by activity alone', () => {
		expect(stageInk('in-progress', false)).toBe('in-progress');
		expect(stageInk('dormant', false)).toBe('dormant');
	});

	it('defaults to unreleased, so an omitted argument cannot claim reach', () => {
		expect(stageInk('dormant')).toBe('dormant');
	});
});

describe('the ramp is three distinct inks', () => {
	it('gives every rung its own token', () => {
		const inks = stageInkOrder.map((ink) => stageInkColour(ink));
		expect(new Set(inks).size).toBe(stageInkOrder.length);
	});

	it('gives every rung its own faded token', () => {
		const faded = stageInkOrder.map((ink) => stageInkColour(ink, true));
		expect(new Set(faded).size).toBe(stageInkOrder.length);
		// The fade is a separate token per rung, never the active ink reused.
		for (const ink of stageInkOrder) {
			expect(stageInkColour(ink, true)).not.toBe(stageInkColour(ink));
		}
	});

	it('labels every rung', () => {
		for (const ink of stageInkOrder) {
			expect(stageInkLabel[ink]).toBeTruthy();
		}
	});
});

describe('progressColour', () => {
	it('draws released work on an ink no unreleased project can reach', () => {
		// The regression this guards: released projects previously collapsed onto
		// whichever ink their `progress` selected, on every surface but the badge.
		const released = progressColour('dormant', false, true);
		expect(released).not.toBe(progressColour('dormant', false, false));
		expect(released).not.toBe(progressColour('in-progress', false, false));
	});

	it('collapses both activity values onto one ink once released', () => {
		expect(progressColour('in-progress', false, true)).toBe(progressColour('dormant', false, true));
	});

	it('applies the end-of-life fade on top of the released ink', () => {
		expect(progressColour('dormant', true, true)).not.toBe(progressColour('dormant', false, true));
	});

	it('agrees with stageInk for every combination', () => {
		for (const progress of ['in-progress', 'dormant'] as const) {
			for (const released of [true, false]) {
				expect(progressColour(progress, false, released)).toBe(
					stageInkColour(stageInk(progress, released))
				);
			}
		}
	});
});

describe('stagePhrase agrees with the ink', () => {
	it('names release in words wherever the settled ink is drawn', () => {
		// Colour is never the only carrier (§8): every value also appears as text.
		for (const progress of ['in-progress', 'dormant'] as const) {
			expect(stagePhrase(progress, true)).toContain('Released');
			expect(stagePhrase(progress, false)).not.toContain('Released');
		}
	});

	it('distinguishes maintained from settled release', () => {
		expect(stagePhrase('in-progress', true)).not.toBe(stagePhrase('dormant', true));
	});
});

describe('the registry exercises the ramp', () => {
	it('has projects on the released rung, so the third ink is not dead weight', () => {
		const released = projects.filter((project) => project.released);
		expect(released.length).toBeGreaterThan(0);
	});

	it('renders every registry project on a declared rung', () => {
		for (const project of projects) {
			expect(stageInkOrder).toContain(stageInk(project.progress, project.released));
		}
	});
});
