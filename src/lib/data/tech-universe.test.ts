/**
 * Precedence tests for resolveTechKind (5DR.32 review fix).
 *
 * The three sources it consults can genuinely disagree: Go and Shell are
 * tabled under both `language` and `runtime` in the taxonomy, but the
 * registry only ever carries either of them as `language` today. Preferring
 * the carried kind over the taxonomy is the whole point of the fix, so this
 * pins the order rather than leaving it to whichever caller happens to
 * notice a regression first.
 */

import { describe, it, expect } from 'vitest';
import { resolveTechKind } from './tech-universe.js';

describe('resolveTechKind precedence', () => {
	it('an overlay kind override wins outright', () => {
		// Go carries a tech-overlays.ts kind override to 'language', so this
		// never reaches either fallback.
		expect(resolveTechKind('Go')).toBe('language');
	});

	it('a carried kind wins over a taxonomy-ambiguous entry', () => {
		// Shell is tabled as both 'language' and 'runtime' in the taxonomy, but
		// every project that carries it carries it as 'language'. Before this
		// fix, the taxonomy's table order picked first and got the right answer
		// by coincidence; this asserts it comes from the registry, not luck.
		expect(resolveTechKind('Shell')).toBe('language');
	});

	it('falls back to the taxonomy for a label nothing carries', () => {
		// Svelte 4 is retired (5DR.32): no project carries it any more, so the
		// carried-kind map has no entry and resolution must fall through.
		expect(resolveTechKind('Svelte 4')).toBe('framework');
	});

	it('is undefined for a label with no override, no carrier and no taxonomy entry', () => {
		// POSIX shell is overlay-declared but has neither a kind override nor a
		// taxonomy entry, and nothing carries it. adoption.ts's kind gate
		// already skips a label this resolves to undefined for.
		expect(resolveTechKind('POSIX shell')).toBeUndefined();
	});
});
