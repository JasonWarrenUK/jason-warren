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
import { techRelationships } from './tech-relationships.js';
import { SURFACE_KINDS } from './tech-overlays.js';

describe('getTechAdoption', () => {
	const adoption = getTechAdoption();

	it('returns at least one technology', () => {
		expect(adoption.length).toBeGreaterThan(0);
	});

	it('orders by adoption date ascending, then lineage parent before child, then label', () => {
		// A Set of directed edges, matching the source's own structure: a child
		// with several authored parents keeps every edge, not just the last.
		const directLineage = new Set(techRelationships.map((rel) => `${rel.source} ${rel.target}`));
		for (let i = 1; i < adoption.length; i++) {
			const prev = adoption[i - 1];
			const curr = adoption[i];
			const byDate = prev.firstDate.localeCompare(curr.firstDate);
			expect(byDate).toBeLessThanOrEqual(0);
			if (byDate === 0) {
				// A same-date pair directly linked by lineage must order parent
				// before child regardless of label; only unrelated same-date pairs
				// fall back to alphabetical.
				if (directLineage.has(`${prev.label} ${curr.label}`)) continue;
				if (directLineage.has(`${curr.label} ${prev.label}`)) {
					throw new Error(`${curr.label} is ${prev.label}'s lineage parent but sorts after it`);
				}
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
	 * introduction date (detectedTechFirstSeen) when known, else the project's repo
	 * inception (commitAnyRoot). Mirrors adoption.ts's per-tag read exactly.
	 */
	function projectDateFor(project: (typeof projects)[number], label: string): string | undefined {
		return project.detectedTechFirstSeen?.[label] ?? project.commitAnyRoot;
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

	it('orders a lineage parent before its child, including on a same-date tie', () => {
		// HTML leads-to CSS in tech-relationships.ts, so HTML must sort before
		// CSS whatever their dates — lineage order, never the alphabetical
		// fallback ('C' < 'H') — or the adoption-timeline layout can place a
		// child's rail above its own parent's.
		const htmlIndex = adoption.findIndex((item) => item.label === 'HTML');
		const cssIndex = adoption.findIndex((item) => item.label === 'CSS');
		expect(htmlIndex).toBeGreaterThanOrEqual(0);
		expect(cssIndex).toBeGreaterThanOrEqual(0);
		expect(htmlIndex).toBeLessThan(cssIndex);

		// The tie-break specifically: when a lineage-linked pair shares an exact
		// date, the parent still wins over the alphabetical fallback. Assert it
		// on any such live pair so the guarantee holds if the authored dates
		// ever converge again.
		const sameDatePairs = adoption.flatMap((a, i) =>
			adoption.slice(i + 1).map((b) => [a, b] as const)
		);
		for (const [a, b] of sameDatePairs) {
			if (a.firstDate !== b.firstDate) continue;
			const aBeforeB = adoption.indexOf(a) < adoption.indexOf(b);
			// If they are lineage-linked, the source must be the earlier one.
			const link = techRelationships.find(
				(r) =>
					(r.source === a.label && r.target === b.label) ||
					(r.source === b.label && r.target === a.label)
			);
			if (!link) continue;
			const parentFirst = aBeforeB ? link.source === a.label : link.source === b.label;
			expect(parentFirst, `${link.source}→${link.target} same-date pair ordered child-first`).toBe(
				true
			);
		}
	});

	it('projectCount matches the number of projects using the tag (within scope)', () => {
		// Read the surface policy rather than restating it: a hardcoded copy here
		// silently disagreed with the toolkit's real scope once data was admitted.
		const kinds = new Set<string>(SURFACE_KINDS.toolkit);
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
				// introduction date (detectedTechFirstSeen) when the project has one for
				// this label, and only falls back to the project's repo-inception
				// date (commitAnyRoot) otherwise. The two legitimately differ when a
				// tech entered a long-lived repo well after the repo started.
				const expected = project?.detectedTechFirstSeen?.[item.label] ?? project?.commitAnyRoot;
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
