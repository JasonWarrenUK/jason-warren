/**
 * Tests for the toolkit-adoption derivation.
 *
 * Structural and ordering guarantees: adoption dates are the earliest across a
 * tag's projects, ordering is deterministic, and undated tags are dropped
 * rather than faked.
 */

import { describe, it, expect } from 'vitest';
import { getTechAdoption, CURATED_FIRST_USED } from './adoption.js';
import { projects } from './index.js';

describe('getTechAdoption', () => {
	const adoption = getTechAdoption();

	it('returns at least one technology', () => {
		expect(adoption.length).toBeGreaterThan(0);
	});

	it('orders by adoption date ascending, then label', () => {
		for (let i = 1; i < adoption.length; i++) {
			const prev = adoption[i - 1];
			const curr = adoption[i];
			const byDate = prev.firstDate.localeCompare(curr.firstDate);
			expect(byDate).toBeLessThanOrEqual(0);
			if (byDate === 0) {
				expect(prev.label.localeCompare(curr.label)).toBeLessThanOrEqual(0);
			}
		}
	});

	it('firstYear matches the year slice of firstDate', () => {
		for (const item of adoption) {
			expect(item.firstYear).toBe(Number(item.firstDate.slice(0, 4)));
		}
	});

	it('derived entries use the earliest firstCommit across projects carrying the tag', () => {
		for (const item of adoption) {
			if (item.dateSource !== 'derived') continue;
			const dates = projects
				.filter((p) => p.tags.some((t) => t.label === item.label))
				.map((p) => p.firstCommit)
				.filter((d): d is string => d !== undefined);
			const earliest = [...dates].sort()[0];
			expect(item.firstDate).toBe(earliest);
		}
	});

	it('curated entries use their authored date', () => {
		let checked = 0;
		for (const item of adoption) {
			if (item.dateSource !== 'curated') continue;
			expect(item.firstDate).toBe(CURATED_FIRST_USED[item.label]);
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});

	it('marks a label curated exactly when it is in the curated map', () => {
		for (const item of adoption) {
			const expected = item.label in CURATED_FIRST_USED ? 'curated' : 'derived';
			expect(item.dateSource).toBe(expected);
		}
	});

	it('projectCount matches the number of projects using the tag (within scope)', () => {
		const kinds = new Set(['language', 'framework', 'runtime']);
		for (const item of adoption) {
			const count = projects.filter((p) =>
				p.tags.some((t) => t.label === item.label && kinds.has(t.kind))
			).length;
			expect(item.projectCount).toBe(count);
		}
	});

	it('the introducing project carries the tag (and its firstDate when derived)', () => {
		for (const item of adoption) {
			const project = projects.find((p) => p.slug === item.firstProjectSlug);
			expect(project).toBeDefined();
			expect(project?.tags.some((t) => t.label === item.label)).toBe(true);
			if (item.dateSource === 'derived') {
				expect(project?.firstCommit).toBe(item.firstDate);
			}
		}
	});

	it('respects an explicit kinds filter', () => {
		const aiOnly = getTechAdoption({ kinds: ['ai'] });
		for (const item of aiOnly) {
			expect(item.kind).toBe('ai');
		}
	});

	it('is deterministic across repeated calls', () => {
		expect(getTechAdoption()).toEqual(adoption);
	});
});
