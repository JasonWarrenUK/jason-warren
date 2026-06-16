/**
 * Tests for the curated theme territories.
 *
 * Authored data, so the tests guard the human-maintained parts: every slug
 * resolves, no territory is empty, ids are unique, and a healthy share of the
 * registry is covered.
 */

import { describe, it, expect } from 'vitest';
import { themes, getThemes } from './themes.js';
import { projects } from './index.js';

describe('theme territories', () => {
	it('every theme has at least two projects', () => {
		for (const theme of themes) {
			expect(theme.slugs.length, `theme "${theme.id}"`).toBeGreaterThanOrEqual(2);
		}
	});

	it('has unique theme ids', () => {
		const ids = themes.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('lists no project twice within a single theme', () => {
		for (const theme of themes) {
			expect(new Set(theme.slugs).size, `theme "${theme.id}"`).toBe(theme.slugs.length);
		}
	});

	it('every slug resolves to a real project', () => {
		const known = new Set(projects.map((p) => p.slug));
		const broken: string[] = [];
		for (const theme of themes) {
			for (const slug of theme.slugs) {
				if (!known.has(slug)) broken.push(`${theme.id} → ${slug}`);
			}
		}
		expect(broken, `Unknown slugs:\n${broken.join('\n')}`).toHaveLength(0);
	});

	it('covers a healthy share of the registry', () => {
		const covered = new Set(themes.flatMap((t) => t.slugs));
		// At least half the portfolio should sit in at least one territory.
		expect(covered.size).toBeGreaterThanOrEqual(Math.ceil(projects.length / 2));
	});

	it('getThemes resolves slugs to projects in authored order', () => {
		const resolved = getThemes();
		expect(resolved.map((t) => t.id)).toEqual(themes.map((t) => t.id));
		for (const [i, theme] of resolved.entries()) {
			expect(theme.projects.map((p) => p.slug)).toEqual(themes[i].slugs);
		}
	});

	it('getThemes is deterministic across repeated calls', () => {
		expect(getThemes()).toEqual(getThemes());
	});
});
