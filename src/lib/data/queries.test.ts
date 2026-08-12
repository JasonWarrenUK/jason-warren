/**
 * Tests for getHeroPool: eligible filter, pin/hide, ordering,
 * stable tiebreaker, and pool completeness.
 */

import { describe, expect, it } from 'vitest';
import {
	getHeroPool,
	HERO_COUNT,
	filterProjects,
	getTimelineProjects,
	type ProjectFlag
} from './queries.js';
import { heroScore } from './scoring.js';
import type {
	Project,
	ProjectKind,
	ProjectProgress,
	ProjectRole,
	ProjectTrack,
	TechTag
} from './types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const BASE_NOW = Date.parse('2026-06-18');

function makeProject(
	slug: string,
	overrides: {
		track?: ProjectTrack;
		trackAuthored?: boolean;
		progress?: ProjectProgress;
		deployed?: boolean;
		retired?: boolean;
		commits?: number;
		commitAnyLast?: string;
		pin?: boolean;
		hide?: boolean;
		name?: string;
		tagline?: string;
		blurb?: string;
		description?: string;
		released?: boolean;
		tags?: TechTag[];
	} = {}
): Project {
	return {
		slug,
		name: overrides.name ?? slug,
		tagline: overrides.tagline ?? '',
		blurb: overrides.blurb ?? '',
		description: overrides.description ?? '',
		kind: 'repo',
		contribution: { role: 'solo', commitShare: 1 },
		tags: overrides.tags ?? [],
		track: overrides.track ?? 'product',
		trackAuthored: overrides.trackAuthored ?? true,
		progress: overrides.progress ?? 'in-progress',
		released: overrides.released ?? false,
		deployed: overrides.deployed ?? false,
		retired: overrides.retired ?? false,
		repoUrl: `https://github.com/JasonWarrenUK/${slug}`,
		highlights: [],
		relationships: [],
		commitAnyLast: overrides.commitAnyLast ?? '2026-06-18',
		metrics: overrides.commits !== undefined ? { commits: overrides.commits } : { commits: 100 },
		pin: overrides.pin,
		hide: overrides.hide
	} as unknown as Project;
}

// ---------------------------------------------------------------------------
// Eligible filter
// ---------------------------------------------------------------------------

describe('getHeroPool — eligible filter', () => {
	it('keeps retired projects: `retired` is presentational, not a visibility control', () => {
		// `hide` is the one visibility control. The two flags used to share this
		// exclusion, which left neither owning it; the score already sinks ended
		// work without a categorical ban.
		const projects = [
			makeProject('active', { commits: 200, commitAnyLast: '2026-06-18' }),
			makeProject('ended', { retired: true, commits: 500, commitAnyLast: '2026-06-17' })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		expect(pool.map((p) => p.slug)).toContain('ended');
		expect(pool.map((p) => p.slug)).toContain('active');
	});

	it('excludes hidden projects', () => {
		const projects = [
			makeProject('shown', { commits: 200 }),
			makeProject('hidden', { hide: true, commits: 500 })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		expect(pool.map((p) => p.slug)).not.toContain('hidden');
		expect(pool.map((p) => p.slug)).toContain('shown');
	});

	it('excludes untriaged projects (heuristic-only track)', () => {
		const projects = [
			makeProject('known', { commits: 200 }),
			makeProject('unknown', { trackAuthored: false, commits: 500 })
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
			makeProject('high-score', { commits: 1000, commitAnyLast: '2026-06-18' }),
			makeProject('pinned-small', { commits: 5, commitAnyLast: '2026-06-01', pin: true })
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
			makeProject('low', { commits: 10, commitAnyLast: '2025-01-01' }),
			makeProject('mid', { commits: 100, commitAnyLast: '2026-03-01' }),
			makeProject('high', { commits: 300, commitAnyLast: '2026-06-18' })
		];
		const pool = getHeroPool(BASE_NOW, projects);
		// Scores should be strictly decreasing.
		for (let i = 1; i < pool.length; i++) {
			expect(heroScore(pool[i - 1], BASE_NOW)).toBeGreaterThanOrEqual(heroScore(pool[i], BASE_NOW));
		}
		expect(pool[0].slug).toBe('high');
	});

	it('breaks ties by slug ascending (stable tiebreaker)', () => {
		// Same commits, same commitAnyLast → identical heroScore.
		const projects = [
			makeProject('zebra', { commits: 100, commitAnyLast: '2026-06-18' }),
			makeProject('apple', { commits: 100, commitAnyLast: '2026-06-18' }),
			makeProject('mango', { commits: 100, commitAnyLast: '2026-06-18' })
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

	// A slug-pinned snapshot of the real registry's top-N was tried here
	// previously, but the live Drift CLI updates commit counts on every synced
	// repo commit, so any pinned slug list goes stale on the next `drift sync`
	// regardless of whether hero selection actually regressed. The property
	// that matters (deterministic, score-descending output) is what's worth
	// guarding, and it holds for the real registry just as it does for the
	// synthetic fixtures in the "ordering" describe above.
	it('real-registry top-N is deterministic and score-ordered', () => {
		const a = getHeroPool(BASE_NOW)
			.slice(0, HERO_COUNT)
			.map((p) => p.slug);
		const b = getHeroPool(BASE_NOW)
			.slice(0, HERO_COUNT)
			.map((p) => p.slug);
		expect(a).toEqual(b);

		const pool = getHeroPool(BASE_NOW);
		for (let i = 1; i < pool.length; i++) {
			expect(heroScore(pool[i - 1], BASE_NOW)).toBeGreaterThanOrEqual(heroScore(pool[i], BASE_NOW));
		}
	});
});

// ---------------------------------------------------------------------------
// filterProjects — multi-select set filters
// ---------------------------------------------------------------------------

describe('filterProjects — no filters', () => {
	it('returns all projects when all filter sets are empty', () => {
		const all = filterProjects({});
		expect(all.length).toBeGreaterThan(0);
	});
});

describe('filterProjects — single dimension', () => {
	it('filters by a single kind', () => {
		const result = filterProjects({ kinds: new Set<ProjectKind>(['app']) });
		expect(result.every((p) => p.kind === 'app')).toBe(true);
	});

	it('filters by a single track', () => {
		const result = filterProjects({ tracks: new Set<ProjectTrack>(['exploration']) });
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p) => p.track === 'exploration')).toBe(true);
	});

	it('filters by a single progress', () => {
		const result = filterProjects({ progresses: new Set<ProjectProgress>(['in-progress']) });
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p) => p.progress === 'in-progress')).toBe(true);
	});

	it('filters by a stage flag', () => {
		const result = filterProjects({ flags: new Set<ProjectFlag>(['retired']) });
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p) => p.retired)).toBe(true);
	});

	it('filters by a single role', () => {
		const result = filterProjects({ roles: new Set<ProjectRole>(['solo']) });
		expect(result.every((p) => p.contribution.role === 'solo')).toBe(true);
	});
});

describe('filterProjects — multi-value within a dimension (OR)', () => {
	it('matches projects satisfying either kind (OR within dimension)', () => {
		const result = filterProjects({ kinds: new Set<ProjectKind>(['app', 'library']) });
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p) => p.kind === 'app' || p.kind === 'library')).toBe(true);
	});

	it('matches projects satisfying either flag (OR within dimension)', () => {
		const result = filterProjects({ flags: new Set<ProjectFlag>(['deployed', 'retired']) });
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p) => p.deployed || p.retired)).toBe(true);
	});
});

describe('filterProjects — cross-dimension (AND)', () => {
	it('requires both kind and progress to match (AND across dimensions)', () => {
		const result = filterProjects({
			kinds: new Set<ProjectKind>(['app']),
			progresses: new Set<ProjectProgress>(['dormant'])
		});
		expect(result.every((p) => p.kind === 'app' && p.progress === 'dormant')).toBe(true);
	});
});

describe('filterProjects — tags', () => {
	it('matches a project carrying the selected tag (exact match)', () => {
		const result = filterProjects({ tags: new Set(['TypeScript']) });
		expect(result.every((p) => p.tags.some((t) => t.label === 'TypeScript'))).toBe(true);
	});

	it('does not match projects that only carry a substring of the selected tag', () => {
		// 'Type' must not match projects tagged 'TypeScript'
		const forTypeScript = filterProjects({ tags: new Set(['TypeScript']) });
		const forType = filterProjects({ tags: new Set(['Type']) });
		// Every 'Type' result must have a tag labelled exactly 'Type', not just TypeScript
		expect(forType.every((p) => p.tags.some((t) => t.label === 'Type'))).toBe(true);
		// 'Type' must return fewer or equal results to 'TypeScript' (it's a stricter filter)
		expect(forType.length).toBeLessThanOrEqual(forTypeScript.length);
	});

	it('matches a project carrying any one of the selected tags (OR within tags)', () => {
		const result = filterProjects({ tags: new Set(['TypeScript', 'Svelte']) });
		expect(
			result.every((p) => p.tags.some((t) => t.label === 'TypeScript' || t.label === 'Svelte'))
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// filterProjects — query search
// ---------------------------------------------------------------------------

function searchHaystack(p: Project): string {
	return [p.name, p.tagline, p.blurb, p.description, ...p.tags.map((t) => t.label)]
		.join(' ')
		.toLowerCase();
}

// ---------------------------------------------------------------------------
// getTimelineProjects — hide-only filter, retired/uncategorised kept
// ---------------------------------------------------------------------------

describe('getTimelineProjects — hide filter', () => {
	it('excludes hidden projects but keeps retired and untriaged', () => {
		const projects = [
			makeProject('visible', { commits: 200, commitAnyLast: '2026-06-18' }),
			makeProject('hidden', { commits: 500, hide: true, commitAnyLast: '2026-06-17' }),
			makeProject('retired-kept', { retired: true, commitAnyLast: '2025-01-01' }),
			makeProject('untriaged-kept', { trackAuthored: false, commitAnyLast: '2025-06-01' })
		];
		const timeline = getTimelineProjects(projects);
		const slugs = timeline.map((p) => p.slug);
		expect(slugs).not.toContain('hidden');
		expect(slugs).toContain('visible');
		expect(slugs).toContain('retired-kept');
		expect(slugs).toContain('untriaged-kept');
	});
});

describe('getTimelineProjects — deterministic ordering', () => {
	it('orders newest inception first, slug ascending as a tiebreak', () => {
		const projects = [
			makeProject('zebra', { commitAnyLast: '2025-01-01' }),
			makeProject('apple', { commitAnyLast: '2025-01-01' }),
			makeProject('newest', { commitAnyLast: '2026-06-18' })
		];
		const timeline = getTimelineProjects(projects);
		expect(timeline.map((p) => p.slug)).toEqual(['newest', 'apple', 'zebra']);
	});

	it('is deterministic across repeated calls and independent of input order', () => {
		const projects = [
			makeProject('gamma', { commitAnyLast: '2025-03-01' }),
			makeProject('alpha', { commitAnyLast: '2026-01-01' }),
			makeProject('beta', { commitAnyLast: '2025-03-01' })
		];
		const a = getTimelineProjects(projects).map((p) => p.slug);
		const b = getTimelineProjects([...projects].reverse()).map((p) => p.slug);
		expect(a).toEqual(b);
	});
});

describe('filterProjects — query search', () => {
	it('returns all projects when query is absent', () => {
		const withoutQuery = filterProjects({});
		const withUndefined = filterProjects({ query: undefined });
		expect(withoutQuery.length).toBeGreaterThan(0);
		expect(withoutQuery.length).toBe(withUndefined.length);
	});

	it('returns all projects when query is an empty string', () => {
		const result = filterProjects({ query: '' });
		const all = filterProjects({});
		expect(result.length).toBe(all.length);
	});

	it('matches on name — "Iris" surfaces the iris project', () => {
		const result = filterProjects({ query: 'Iris' });
		expect(result.some((p) => p.slug === 'iris')).toBe(true);
	});

	it('matches on tagline — every result contains the query in its haystack', () => {
		const result = filterProjects({ query: 'toolkit' });
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p) => searchHaystack(p).includes('toolkit'))).toBe(true);
	});

	it('matches on tag label — "TypeScript" query matches only projects with TypeScript in searchable fields', () => {
		const result = filterProjects({ query: 'TypeScript' });
		expect(result.length).toBeGreaterThan(0);
		expect(result.every((p) => searchHaystack(p).includes('typescript'))).toBe(true);
	});

	it('returns no results when query matches nothing', () => {
		const result = filterProjects({ query: 'zzz-no-project-has-this-xyzzy' });
		expect(result).toHaveLength(0);
	});

	it('is case-insensitive — uppercase and lowercase queries return the same results', () => {
		const lower = filterProjects({ query: 'svelte' });
		const upper = filterProjects({ query: 'SVELTE' });
		expect(lower.length).toBeGreaterThan(0);
		expect(lower.map((p) => p.slug).sort()).toEqual(upper.map((p) => p.slug).sort());
	});

	it('composes with kinds filter — AND relationship holds', () => {
		const result = filterProjects({ query: 'svelte', kinds: new Set<ProjectKind>(['app']) });
		expect(result.every((p) => p.kind === 'app')).toBe(true);
		expect(result.every((p) => searchHaystack(p).includes('svelte'))).toBe(true);
	});
});
