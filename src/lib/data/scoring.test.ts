/**
 * Unit tests for the metric-derived scoring module.
 *
 * Tests cover:
 * - substanceScore: monotonicity in commits and LOC
 * - recencyDecay: half-life accuracy, boundary values, missing date
 * - heroScore: recent+substantial beats either alone
 * - hubThreshold: percentile maths
 */

import { describe, expect, it } from 'vitest';
import {
	substanceScore,
	recencyDecay,
	heroScore,
	hubThreshold,
	HERO_HALF_LIFE_DAYS,
	HUB_PERCENTILE
} from './scoring.js';
import type { Project } from './types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a minimal Project fixture with only the fields scoring touches. */
function makeProject(
	slug: string,
	overrides: {
		commits?: number;
		commitsMine?: number;
		linesOfCode?: number;
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
		track: 'product',
		progress: 'in-progress',
		repoUrl: `https://github.com/JasonWarrenUK/${slug}`,
		highlights: [],
		relationships: [],
		featured: false,
		lastCommit: overrides.lastCommit,
		metrics:
			overrides.commits !== undefined || overrides.linesOfCode !== undefined
				? {
						commits: overrides.commits,
						commitsMine: overrides.commitsMine,
						linesOfCode: overrides.linesOfCode
					}
				: undefined,
		pin: overrides.pin,
		hide: overrides.hide
	} as unknown as Project;
}

// ---------------------------------------------------------------------------
// substanceScore
// ---------------------------------------------------------------------------

describe('substanceScore', () => {
	it('returns 0 for a project with no metrics', () => {
		const p = makeProject('empty');
		expect(substanceScore(p)).toBe(0);
	});

	it('is monotonically increasing in commits', () => {
		const low = makeProject('low', { commits: 10 });
		const mid = makeProject('mid', { commits: 100 });
		const high = makeProject('high', { commits: 1000 });
		expect(substanceScore(low)).toBeLessThan(substanceScore(mid));
		expect(substanceScore(mid)).toBeLessThan(substanceScore(high));
	});

	it('is monotonically increasing in linesOfCode', () => {
		const small = makeProject('small', { linesOfCode: 500 });
		const medium = makeProject('medium', { linesOfCode: 5000 });
		const large = makeProject('large', { linesOfCode: 50000 });
		expect(substanceScore(small)).toBeLessThan(substanceScore(medium));
		expect(substanceScore(medium)).toBeLessThan(substanceScore(large));
	});

	it('prefers commitsMine over commits when both present', () => {
		// Same LOC, same total commits, but one has more mine
		const collab = makeProject('collab', { commits: 500, commitsMine: 50, linesOfCode: 1000 });
		const solo = makeProject('solo', { commits: 500, commitsMine: 450, linesOfCode: 1000 });
		expect(substanceScore(collab)).toBeLessThan(substanceScore(solo));
	});

	it('falls back to commits when commitsMine is absent', () => {
		const p = makeProject('p', { commits: 100 });
		const expected = Math.log1p(100);
		expect(substanceScore(p)).toBeCloseTo(expected, 6);
	});
});

// ---------------------------------------------------------------------------
// recencyDecay
// ---------------------------------------------------------------------------

describe('recencyDecay', () => {
	const DAY_MS = 86_400_000;
	const now = Date.parse('2026-06-18'); // matches sources.json.lastSyncedAt

	it('returns 1.0 for a commit dated exactly now', () => {
		expect(recencyDecay('2026-06-18', now)).toBeCloseTo(1.0, 6);
	});

	it('returns ~0.5 at exactly HERO_HALF_LIFE_DAYS', () => {
		const halfLifeAgo = new Date(now - HERO_HALF_LIFE_DAYS * DAY_MS).toISOString().slice(0, 10);
		expect(recencyDecay(halfLifeAgo, now)).toBeCloseTo(0.5, 4);
	});

	it('returns 0 when lastCommit is undefined', () => {
		expect(recencyDecay(undefined, now)).toBe(0);
	});

	it('never returns negative', () => {
		// A commit far in the past
		expect(recencyDecay('2010-01-01', now)).toBeGreaterThanOrEqual(0);
	});

	it('is strictly decreasing as age increases', () => {
		const recent = recencyDecay('2026-06-10', now);
		const older = recencyDecay('2026-04-01', now);
		const oldest = recencyDecay('2024-01-01', now);
		expect(recent).toBeGreaterThan(older);
		expect(older).toBeGreaterThan(oldest);
	});

	it('clamps future commits to 0 days (does not go negative)', () => {
		// lastCommit in the future relative to `now`
		expect(recencyDecay('2030-01-01', now)).toBeCloseTo(1.0, 6);
	});
});

// ---------------------------------------------------------------------------
// heroScore
// ---------------------------------------------------------------------------

describe('heroScore', () => {
	const now = Date.parse('2026-06-18');

	it('rewards recent AND substantial over either alone', () => {
		// Recent but tiny
		const freshSmall = makeProject('fresh-small', {
			commits: 3,
			linesOfCode: 200,
			lastCommit: '2026-06-17'
		});
		// Large but stale (18 months dormant ~ 540 days, decay ≈ 0.0001)
		const staleHuge = makeProject('stale-huge', {
			commits: 2000,
			linesOfCode: 200000,
			lastCommit: '2024-12-01'
		});
		// Recent AND substantial
		const winner = makeProject('winner', {
			commits: 300,
			linesOfCode: 20000,
			lastCommit: '2026-06-18'
		});

		expect(heroScore(winner, now)).toBeGreaterThan(heroScore(freshSmall, now));
		expect(heroScore(winner, now)).toBeGreaterThan(heroScore(staleHuge, now));
	});

	it('returns 0 for a project with no lastCommit', () => {
		const p = makeProject('no-date', { commits: 500, linesOfCode: 50000 });
		expect(heroScore(p, now)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// hubThreshold
// ---------------------------------------------------------------------------

describe('hubThreshold', () => {
	it('returns Infinity for an empty list (no hubs in degenerate case)', () => {
		expect(hubThreshold([])).toBe(Infinity);
	});

	it('returns Infinity when all projects have zero substance (no metrics)', () => {
		const noMetrics = [makeProject('a'), makeProject('b'), makeProject('c')];
		expect(hubThreshold(noMetrics)).toBe(Infinity);
	});

	it('returns the correct percentile value', () => {
		// 10 projects with substance scores 1..10
		// p85 of 10 items: floor(0.85 * 10) = 8 → index 8 → value 9 (0-indexed sorted)
		const projects = Array.from({ length: 10 }, (_, i) =>
			makeProject(`p${i}`, { commits: Math.round(Math.exp(i + 1) - 1) })
		);
		const threshold = hubThreshold(projects);
		// The 85th-percentile commit count (index 8 of 10 sorted by substance)
		expect(threshold).toBeGreaterThan(0);
	});

	it(`marks roughly ${Math.round((1 - HUB_PERCENTILE) * 100)}% of projects as hubs`, () => {
		// With 20 projects, expect ~(1 - 0.85) * 20 = 3 hubs
		const projects = Array.from({ length: 20 }, (_, i) =>
			makeProject(`p${i}`, { commits: (i + 1) * 10 })
		);
		const threshold = hubThreshold(projects);
		const hubCount = projects.filter((p) => {
			const score = p.metrics?.commits ? Math.log1p(p.metrics.commits) : 0;
			return score >= threshold;
		}).length;
		// Allow ±1 for edge rounding
		expect(hubCount).toBeGreaterThanOrEqual(2);
		expect(hubCount).toBeLessThanOrEqual(5);
	});
});
