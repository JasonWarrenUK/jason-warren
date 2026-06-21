/**
 * Tests for getHeroPool: eligible filter, pin/hide, ordering,
 * stable tiebreaker, and a soft snapshot of the default top-N slugs.
 */

import { describe, expect, it } from 'vitest';
import { getHeroPool, HERO_COUNT } from './queries.js';
import { heroScore } from './scoring.js';
import type { Project, ProjectStatus } from './types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const BASE_NOW = Date.parse('2026-06-18');

function makeProject(
	slug: string,
	overrides: {
		status?: ProjectStatus;
		commits?: number;
		lastCommit?: string;
		pin?: boolean;
		hide?: boolean;
	} = {}
): Project {
	return {
		slug,
		name: slug,
		tagline: '',
		blurb: '',
		description: '',
		kind: 'repo',
		contribution: { role: 'solo', commitShare: 1 },
		tags: [],
		status: overrides.status ?? 'live',
		repoUrl: `https://github.com/JasonWarrenUK/${slug}`,
		highlights: [],
		relationships: [],
		lastCommit: overrides.lastCommit ?? '2026-06-18',
		metrics:
			overrides.commits !== undefined
				? { commits: overrides.commits }
				: { commits: 100 },
		pin: overrides.pin,
		hide: overrides.hide
	} as unknown as Project;
}

// ---------------------------------------------------------------------------
// Eligible filter
// ---------------------------------------------------------------------------

describe('getHeroPool — eligible filter', () => {
	it('excludes archived projects', () => {
		const projects = [
			makeProject('active', { commits: 200, lastCommit: '2026-06-18' }),
			makeProject('dead', { status: 'archived', commits: 500, lastCommit: '2026-06-17' })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		expect(pool.map((p) => p.slug)).not.toContain('dead');
		expect(pool.map((p) => p.slug)).toContain('active');
	});

	it('excludes uncategorised projects', () => {
		const projects = [
			makeProject('known', { commits: 200 }),
			makeProject('unknown', { status: 'uncategorised', commits: 500 })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		expect(pool.map((p) => p.slug)).not.toContain('unknown');
	});

	it('excludes hidden projects', () => {
		const projects = [
			makeProject('visible', { commits: 200 }),
			makeProject('hidden', { commits: 500, hide: true })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		expect(pool.map((p) => p.slug)).not.toContain('hidden');
	});
});

// ---------------------------------------------------------------------------
// Pin / hide
// ---------------------------------------------------------------------------

describe('getHeroPool — pin floats above score', () => {
	it('a low-scoring pinned project precedes a high-scoring unpinned one', () => {
		const projects = [
			makeProject('high-score', { commits: 1000, lastCommit: '2026-06-18' }),
			makeProject('pinned-small', { commits: 5, lastCommit: '2026-06-01', pin: true })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		expect(pool[0].slug).toBe('pinned-small');
		expect(pool[1].slug).toBe('high-score');
	});
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe('getHeroPool — ordering', () => {
	it('orders by heroScore descending', () => {
		const projects = [
			makeProject('low', { commits: 10, lastCommit: '2025-01-01' }),
			makeProject('mid', { commits: 100, lastCommit: '2026-03-01' }),
			makeProject('high', { commits: 300, lastCommit: '2026-06-18' })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		// Scores should be strictly decreasing.
		for (let i = 1; i < pool.length; i++) {
			expect(heroScore(pool[i - 1], BASE_NOW)).toBeGreaterThanOrEqual(
				heroScore(pool[i], BASE_NOW)
			);
		}
		expect(pool[0].slug).toBe('high');
	});

	it('breaks ties by slug ascending (stable tiebreaker)', () => {
		// Same commits, same lastCommit → identical heroScore.
		const projects = [
			makeProject('zebra', { commits: 100, lastCommit: '2026-06-18' }),
			makeProject('apple', { commits: 100, lastCommit: '2026-06-18' }),
			makeProject('mango', { commits: 100, lastCommit: '2026-06-18' })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		const slugs = pool.map((p) => p.slug);
		expect(slugs).toEqual(['apple', 'mango', 'zebra']);
	});
});

// ---------------------------------------------------------------------------
// Pool completeness
// ---------------------------------------------------------------------------

describe('getHeroPool — pool completeness', () => {
	it('pool length exceeds HERO_COUNT for a real-sized registry', () => {
		// Confirm the rotation has something to rotate through.
		const pool = getHeroPool(BASE_NOW);
		expect(pool.length).toBeGreaterThan(HERO_COUNT);
	});

	it('returns all eligible projects, not just the top N', () => {
		const projects = Array.from({ length: 10 }, (_, i) =>
			makeProject(`p${i}`, { commits: (i + 1) * 10 })
		);
		const pool = getHeroPool(BASE_NOW, projects);
		expect(pool.length).toBe(10);
	});
});

// ---------------------------------------------------------------------------
// Soft snapshot — default top-3 slugs
// This snapshot is intentional: a metric shift that changes which projects are
// foregrounded should be a reviewed diff, not a silent regression.
// Update this test deliberately if the scoring model changes.
// ---------------------------------------------------------------------------

describe('getHeroPool — default top-3 snapshot', () => {
	it('defaults to iris, wyrd-tui, guardrails (verified 2026-06-18)', () => {
		const pool = getHeroPool(BASE_NOW);
		const top3 = pool.slice(0, HERO_COUNT).map((p) => p.slug);
		expect(top3).toEqual(['iris', 'wyrd-tui', 'guardrails']);
	});
});
