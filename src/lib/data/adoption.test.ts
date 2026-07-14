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

	/**
	 * The date a project would contribute for a given tag label: its own
	 * introduction date (techFirstSeen) when known, else the project's repo
	 * inception (firstCommit). Mirrors adoption.ts's per-tag read exactly.
	 */
	function projectDateFor(project: (typeof projects)[number], label: string): string | undefined {
		return project.techFirstSeen?.[label] ?? project.firstCommit;
	}

	it('derived entries use the earliest per-tag date across projects carrying the tag', () => {
		for (const item of adoption) {
			if (item.dateSource !== 'derived') continue;
			const dates = projects
				.filter((p) => p.tags.some((t) => t.label === item.label))
				.map((p) => projectDateFor(p, item.label))
				.filter((d): d is string => d !== undefined);
			const earliest = [...dates].sort()[0];
			expect(item.firstDate).toBe(earliest);
		}
	});

	/** Earliest per-tag date among projects carrying the label, or undefined. */
	function earliestDerived(label: string): string | undefined {
		const dates = projects
			.filter((p) => p.tags.some((t) => t.label === label))
			.map((p) => projectDateFor(p, label))
			.filter((d): d is string => d !== undefined)
			.sort();
		return dates[0];
	}

	it('curated entries use the floor date, which predates every carrying project', () => {
		let checked = 0;
		for (const item of adoption) {
			if (item.dateSource !== 'curated') continue;
			expect(item.firstDate).toBe(CURATED_FIRST_USED[item.label]);
			const derived = earliestDerived(item.label);
			if (derived !== undefined) {
				expect(item.firstDate < derived).toBe(true);
			}
			checked++;
		}
		expect(checked).toBeGreaterThan(0);
	});

	it('applies the floor rule: derived wins when repo evidence is at or before the floor', () => {
		for (const item of adoption) {
			const curated = CURATED_FIRST_USED[item.label];
			const derived = earliestDerived(item.label);
			if (curated === undefined) {
				expect(item.dateSource).toBe('derived');
				continue;
			}
			const useDerived = derived !== undefined && derived <= curated;
			expect(item.dateSource).toBe(useDerived ? 'derived' : 'curated');
			expect(item.firstDate).toBe(useDerived ? derived : curated);
		}
	});

	it('pre-repo floors surface on the timeline (Ink, HTML, CSS)', () => {
		const byLabel = new Map(adoption.map((item) => [item.label, item]));
		for (const label of ['Ink', 'HTML', 'CSS']) {
			const item = byLabel.get(label);
			expect(item, `${label} missing from adoption timeline`).toBeDefined();
			expect(item?.dateSource).toBe('curated');
			expect(item?.firstDate).toBe(CURATED_FIRST_USED[label]);
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
				// A derived date is per-tag: it comes from the tag's own
				// introduction date (techFirstSeen) when the project has one for
				// this label, and only falls back to the project's repo-inception
				// date (firstCommit) otherwise. The two legitimately differ when a
				// tech entered a long-lived repo well after the repo started.
				const expected = project?.techFirstSeen?.[item.label] ?? project?.firstCommit;
				expect(expected).toBe(item.firstDate);
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
