/**
 * Tests for the derived hero stack groups.
 *
 * Structural guarantees: every item is a real tag label carried by at least
 * one project, groups are ordered by project count then label, per-group
 * caps are respected, and output is deterministic.
 */

import { describe, it, expect } from 'vitest';
import { getStackGroups } from './stack.js';
import { projects } from './index.js';

describe('getStackGroups', () => {
	const groups = getStackGroups();
	const allLabels = new Set(projects.flatMap((p) => p.tags.map((t) => t.label)));

	it('returns at least one group', () => {
		expect(groups.length).toBeGreaterThan(0);
	});

	it('every item is a real tag label carried by at least one project', () => {
		for (const group of groups) {
			for (const item of group.items) {
				expect(allLabels.has(item), `${item} in "${group.label}" is not a real tag label`).toBe(
					true
				);
			}
		}
	});

	it('every group has at least one item (empty groups are omitted)', () => {
		for (const group of groups) {
			expect(group.items.length).toBeGreaterThan(0);
		}
	});

	it('orders items within a group by project count descending, then label', () => {
		function countOf(label: string): number {
			return projects.filter((p) => p.tags.some((t) => t.label === label)).length;
		}
		for (const group of groups) {
			for (let i = 1; i < group.items.length; i++) {
				const prevCount = countOf(group.items[i - 1]);
				const currCount = countOf(group.items[i]);
				expect(prevCount).toBeGreaterThanOrEqual(currCount);
				if (prevCount === currCount) {
					expect(group.items[i - 1].localeCompare(group.items[i])).toBeLessThanOrEqual(0);
				}
			}
		}
	});

	it('respects the perGroup cap', () => {
		const capped = getStackGroups({ perGroup: 2 });
		for (const group of capped) {
			expect(group.items.length).toBeLessThanOrEqual(2);
		}
	});

	it('is deterministic across repeated calls', () => {
		expect(getStackGroups()).toEqual(groups);
	});

	it('the hero strapline names real, currently-used tags', () => {
		// HeroBreadth.svelte's strapline names these techs in prose; if none of
		// them are live tags any more, the claim has gone stale.
		const named = ['Go', 'Tauri', 'Neo4j', 'FastAPI'];
		for (const label of named) {
			expect(allLabels.has(label), `${label} named in the hero strapline is no longer a tag`).toBe(
				true
			);
		}
	});
});
