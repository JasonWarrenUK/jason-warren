/**
 * Data integrity tests for the authored tech overlays.
 *
 * Structural, like tech-relationships.test.ts: every overlay must point at a
 * real tag label (drift writes this file via AST splices, so the compiler
 * never sees a typo), labels must be unique, and every field must hold a
 * value its consumers can act on.
 */

import { describe, it, expect } from 'vitest';
import { techOverlays, hiddenTechLabels, getTechKindOverrides } from './tech-overlays.js';
import { CURATED_FIRST_USED, getTechAdoption } from './adoption.js';
import { projects } from './index.js';
import type { TagKind, TechSurface } from './types.js';

const allLabels = new Set(projects.flatMap((p) => p.tags.map((t) => t.label)));
const VALID_SURFACES: TechSurface[] = ['toolkit', 'map', 'stack', 'relate'];
const VALID_KINDS: TagKind[] = ['language', 'framework', 'data', 'ai', 'concept', 'tool', 'runtime'];

describe('tech overlays', () => {
	it('every overlay label is a real tag label', () => {
		const offenders = techOverlays
			.map((o) => o.label)
			.filter((label) => !allLabels.has(label))
			// Curated floors may legitimately predate any tracked repo carrying
			// the tag today (Ink-era labels); those still surface via adoption.
			.filter((label) => CURATED_FIRST_USED[label] === undefined);
		expect(offenders, `Unknown tech labels:\n${offenders.join('\n')}`).toHaveLength(0);
	});

	it('labels are unique', () => {
		const labels = techOverlays.map((o) => o.label);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it('firstUsed dates are ISO YYYY-MM-DD with a real month', () => {
		for (const overlay of techOverlays) {
			if (overlay.firstUsed === undefined) continue;
			expect(overlay.firstUsed, overlay.label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			const month = Number(overlay.firstUsed.slice(5, 7));
			expect(month, overlay.label).toBeGreaterThanOrEqual(1);
			expect(month, overlay.label).toBeLessThanOrEqual(12);
		}
	});

	it('hiddenFrom values are valid surfaces, kinds are valid TagKinds', () => {
		for (const overlay of techOverlays) {
			for (const surface of overlay.hiddenFrom ?? []) {
				expect(VALID_SURFACES, `${overlay.label}: ${surface}`).toContain(surface);
			}
			if (overlay.kind !== undefined) {
				expect(VALID_KINDS, overlay.label).toContain(overlay.kind);
			}
		}
	});

	it('CURATED_FIRST_USED derives exactly from overlays with firstUsed', () => {
		const expected = techOverlays.filter((o) => o.firstUsed !== undefined);
		expect(Object.keys(CURATED_FIRST_USED)).toHaveLength(expected.length);
		for (const overlay of expected) {
			expect(CURATED_FIRST_USED[overlay.label]).toBe(overlay.firstUsed);
		}
	});

	it('no toolkit-hidden label ever reaches the adoption timeline', () => {
		const hidden = hiddenTechLabels('toolkit');
		for (const item of getTechAdoption()) {
			expect(hidden.has(item.label), item.label).toBe(false);
		}
	});

	it('kind overrides map only labels with an authored kind', () => {
		const overrides = getTechKindOverrides();
		for (const overlay of techOverlays) {
			if (overlay.kind !== undefined) {
				expect(overrides.get(overlay.label)).toBe(overlay.kind);
			} else {
				expect(overrides.has(overlay.label)).toBe(false);
			}
		}
	});
});
