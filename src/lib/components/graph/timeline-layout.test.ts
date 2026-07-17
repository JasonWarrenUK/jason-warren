/**
 * Tests for the density-banded timeline layout: the packing algorithm's
 * correctness (leftmost-fit, no overlap), the month-banded scale's
 * monotonicity and density-proportionality, year-tick generation, and
 * determinism. Mirrors `adoption-layout.test.ts`'s structure — real registry
 * data for invariant checks, synthetic fixtures for edge cases.
 *
 * The scale is deliberately NOT strictly linear-proportional to duration —
 * see "computeTimelineLayout — proportionality" below for the trade-off this
 * makes and why (the same trade-off `adoption-layout.ts`'s density-sized year
 * columns already made and documented as "ordered time, not to scale").
 *
 * Tests 8, 9, 12, 13, 14 and 16 (still-live collision reservation, undated
 * parking, density-sweep peak-count, lineage branch anchor, note carry-
 * through, and zoom/expand) are deferred to later build steps per the plan
 * and are not included here.
 */

import { describe, expect, it } from 'vitest';
import {
	computeMonthBands,
	computeTimelineLayout,
	computeYearTicks,
	dayDiff,
	dayValue,
	type PlacedRail,
	type TimelineGeometry,
	type TimelineLineage,
	type TimelineRail
} from './timeline-layout.js';
import { getTimelineProjects } from '$lib/data/queries.js';

const NOW = '2026-07-14';

const GEO: TimelineGeometry = {
	width: 900,
	leftGutter: 90,
	rightPad: 140,
	topPad: 32,
	bottomPad: 32,
	columnWidth: 60,
	laneGap: 10,
	minRailHeight: 8,
	nodeRadius: 5,
	hubRingOffset: 7,
	stillLiveFade: 40
};

function rail(
	slug: string,
	firstCommit: string | null,
	lastCommit: string | null,
	overrides: Partial<TimelineRail> = {}
): TimelineRail {
	return {
		slug,
		name: overrides.name ?? slug,
		track: overrides.track ?? 'product',
		progress: overrides.progress ?? 'in-progress',
		archived: overrides.archived ?? false,
		deployed: overrides.deployed ?? false,
		stageProvisional: overrides.stageProvisional ?? false,
		tagline: overrides.tagline ?? '',
		role: overrides.role ?? 'solo',
		firstCommit,
		lastCommit,
		durationDays: firstCommit && lastCommit ? dayDiff(firstCommit, lastCommit) : null,
		stillLive: overrides.stillLive ?? false,
		labelled: overrides.labelled ?? false
	};
}

/** Real timeline rails, built from the actual project registry via
 *  `getTimelineProjects`, for the invariant tests that should hold against
 *  live data (not just synthetic fixtures). */
function realRails(): TimelineRail[] {
	return getTimelineProjects().map((p) =>
		rail(p.slug, p.firstCommit ?? null, p.lastCommit ?? null, {
			name: p.name,
			track: p.track,
			progress: p.progress,
			archived: p.archived,
			deployed: p.deployed,
			tagline: p.tagline,
			role: p.contribution.role
		})
	);
}

describe('dayValue / dayDiff', () => {
	it('dayDiff is positive when the second date is later', () => {
		expect(dayDiff('2026-01-01', '2026-01-11')).toBe(10);
	});

	it('dayValue increases monotonically with calendar date', () => {
		expect(dayValue('2026-07-14')).toBeGreaterThan(dayValue('2026-07-13'));
		expect(dayValue('2027-01-01')).toBeGreaterThan(dayValue('2026-12-31'));
	});
});

describe('computeTimelineLayout — empty input', () => {
	it('returns placed:[], ticks:[], height at the floor for no rails', () => {
		const result = computeTimelineLayout([], [], NOW, GEO);
		expect(result.placed).toEqual([]);
		expect(result.ticks).toEqual([]);
		expect(result.height).toBe(GEO.topPad + GEO.bottomPad);
	});
});

describe('computeTimelineLayout — placement completeness', () => {
	it('places every rail exactly once, keyed by slug', () => {
		const rails = realRails();
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		expect(result.placed).toHaveLength(rails.length);
		const slugs = result.placed.map((p) => p.slug).sort();
		expect(slugs).toEqual(rails.map((r) => r.slug).sort());
	});
});

describe('computeTimelineLayout — time monotonicity', () => {
	it('an earlier firstCommit always yields a larger (older, lower) yTop', () => {
		const rails: TimelineRail[] = [
			rail('early', '2023-01-01', '2023-06-01'),
			rail('mid', '2024-06-01', '2024-06-01'),
			rail('late', '2026-06-01', '2026-07-01')
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.slug, p]));
		expect(byLabel.get('early')!.yTop).toBeGreaterThan(byLabel.get('mid')!.yTop);
		expect(byLabel.get('mid')!.yTop).toBeGreaterThan(byLabel.get('late')!.yTop);
	});

	it('holds across the real registry: yBottom (inception end) orders the reverse of firstCommit, within the minRailHeight floor', () => {
		// yBottom is driven by firstCommit (a rail's inception, the chart's
		// "older" end), so ITS ordering is the reverse of firstCommit ordering.
		// yTop is driven by lastCommit (most recent activity) instead, and the
		// real registry has pairs whose firstCommit and lastCommit orderings
		// disagree (e.g. the-work vs flyt both start ~2023-03 but the-work is
		// still active while flyt's last commit is months earlier) — so yTop
		// alone is not guaranteed to track firstCommit order across all pairs.
		//
		// The minRailHeight floor can push a very-short rail's yBottom past a
		// neighbour's un-floored yBottom (e.g. code-arcana, zero-length, floored
		// past chirpdb's naturally-computed yBottom despite starting three days
		// later) — a real, intended effect of the floor, not a packing bug — so
		// the tolerance matches that floor rather than asserting strict order.
		const rails = realRails().filter((r) => r.firstCommit !== null);
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.slug, p]));
		const sortedByFirstCommit = [...rails].sort((a, b) =>
			(a.firstCommit ?? '').localeCompare(b.firstCommit ?? '')
		);
		for (let i = 1; i < sortedByFirstCommit.length; i++) {
			const prev = byLabel.get(sortedByFirstCommit[i - 1].slug)!;
			const curr = byLabel.get(sortedByFirstCommit[i].slug)!;
			if (sortedByFirstCommit[i - 1].firstCommit! < sortedByFirstCommit[i].firstCommit!) {
				expect(prev.yBottom).toBeGreaterThanOrEqual(curr.yBottom - GEO.minRailHeight);
			}
		}
	});
});

describe('computeTimelineLayout — proportionality', () => {
	// The vertical scale is density-banded (see computeMonthBands), not
	// strictly linear: a month with more concurrently-active rails gets a
	// taller pixel band than a quiet month, by design (that's the whole point
	// of this module — see the file header). So global day-to-pixel
	// proportionality across DIFFERENT months no longer holds in general — the
	// same trade-off adoption-layout.ts's density-sized year columns already
	// made, documented there as "ordered time, not to scale". These two tests
	// used to assert strict proportionality across rails placed in different
	// years; they're rewritten below to assert the WEAKER, still-meaningful
	// invariant that survives banding: proportionality holds WITHIN a single
	// month band, where every day-fraction maps through the same linear
	// interpolation (see makeMonthBandedY). Cross-band proportionality is
	// covered instead by the new density tests further down, which assert the
	// actual point of this change (dense months get taller bands).
	it('two equal-duration rails entirely within the SAME month band get equal pixel spans', () => {
		const rails: TimelineRail[] = [
			rail('a', '2026-06-01', '2026-06-11'), // 10 days, June 2026
			rail('b', '2026-06-05', '2026-06-15') // 10 days, June 2026
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.slug, p]));
		const spanA = byLabel.get('a')!.yBottom - byLabel.get('a')!.yTop;
		const spanB = byLabel.get('b')!.yBottom - byLabel.get('b')!.yTop;
		expect(spanA).toBeCloseTo(spanB, 5);
	});

	it('within the same month band, a rail twice as long spans (approximately) twice the pixels', () => {
		const rails: TimelineRail[] = [
			rail('short', '2026-06-01', '2026-06-06'), // 5 days, June 2026
			rail('long', '2026-06-01', '2026-06-11') // 10 days, June 2026
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.slug, p]));
		const spanShort = byLabel.get('short')!.yBottom - byLabel.get('short')!.yTop;
		const spanLong = byLabel.get('long')!.yBottom - byLabel.get('long')!.yTop;
		expect(spanLong / spanShort).toBeCloseTo(2, 1);
	});
});

describe('computeMonthBands — density proportionality', () => {
	it('a month with more overlapping rails gets a taller band than a month with fewer', () => {
		const rails: TimelineRail[] = [
			// January 2026: one rail overlapping.
			rail('quiet', '2026-01-01', '2026-01-31'),
			// March 2026: five rails overlapping.
			rail('busy-1', '2026-03-01', '2026-03-31'),
			rail('busy-2', '2026-03-02', '2026-03-20'),
			rail('busy-3', '2026-03-05', '2026-03-25'),
			rail('busy-4', '2026-03-10', '2026-03-15'),
			rail('busy-5', '2026-03-12', '2026-03-18')
		];
		const minDay = dayValue('2026-01-01');
		const nowDay = dayValue(NOW);
		const bands = computeMonthBands(rails, minDay, nowDay, GEO.topPad);

		const january = bands.get(2026 * 12 + 0)!;
		const march = bands.get(2026 * 12 + 2)!;
		const januaryHeight = january.yBottom - january.yTop;
		const marchHeight = march.yBottom - march.yTop;
		expect(marchHeight).toBeGreaterThan(januaryHeight);
	});

	it('a long-running rail is counted in EVERY month it spans, not just its start month', () => {
		// A long-running rail spanning Jan-Apr 2026, plus a couple of short
		// rails also inside that span, should make each of Jan-Apr denser than
		// a fifth month (May) the long-runner doesn't touch at all — the
		// "present for its whole interval" overlap semantics this module
		// requires, as opposed to counting only a rail's start month. (A lone
		// rail alone would push every spanned month's raw height to the same
		// MONTH_MIN_HEIGHT floor as the untouched month, masking the effect —
		// the extra short rails lift the spanned months' density enough to
		// clear the floor and make the comparison meaningful.)
		const rails: TimelineRail[] = [
			rail('long-runner', '2026-01-01', '2026-04-30'),
			rail('extra-1', '2026-01-10', '2026-01-20'),
			rail('extra-2', '2026-02-10', '2026-02-20'),
			rail('extra-3', '2026-03-10', '2026-03-20'),
			rail('extra-4', '2026-04-10', '2026-04-20')
		];
		const minDay = dayValue('2026-01-01');
		const nowDay = dayValue('2026-05-31');
		const bands = computeMonthBands(rails, minDay, nowDay, GEO.topPad);

		const jan = bands.get(2026 * 12 + 0)!;
		const feb = bands.get(2026 * 12 + 1)!;
		const mar = bands.get(2026 * 12 + 2)!;
		const apr = bands.get(2026 * 12 + 3)!;
		const may = bands.get(2026 * 12 + 4)!;

		const heightOf = (b: typeof jan): number => b.yBottom - b.yTop;
		// All four spanned months get the same (elevated) height...
		expect(heightOf(jan)).toBeCloseTo(heightOf(feb), 5);
		expect(heightOf(feb)).toBeCloseTo(heightOf(mar), 5);
		expect(heightOf(mar)).toBeCloseTo(heightOf(apr), 5);
		// ...and every one of them is taller than the untouched month.
		expect(heightOf(apr)).toBeGreaterThan(heightOf(may));
	});
});

describe('computeTimelineLayout — no vertical overlap within a column', () => {
	function expectNoOverlapWithinColumns(placed: PlacedRail[]): void {
		const byColumn = new Map<number, PlacedRail[]>();
		for (const p of placed.filter((p) => !p.undated)) {
			const list = byColumn.get(p.column) ?? [];
			list.push(p);
			byColumn.set(p.column, list);
		}
		for (const rails of byColumn.values()) {
			const sorted = [...rails].sort((a, b) => a.yTop - b.yTop);
			for (let i = 1; i < sorted.length; i++) {
				expect(sorted[i].yTop).toBeGreaterThanOrEqual(sorted[i - 1].yBottom);
			}
		}
	}

	it('holds for a synthetic overlapping cluster', () => {
		const rails: TimelineRail[] = [
			rail('a', '2026-01-01', '2026-06-01'),
			rail('b', '2026-01-15', '2026-05-01'),
			rail('c', '2026-02-01', '2026-04-01'),
			rail('d', '2026-01-01', '2026-06-30'),
			rail('e', '2025-12-01', '2026-01-10')
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		expectNoOverlapWithinColumns(result.placed);
	});

	it('holds for the real registry (including the front-loaded 2026 cluster)', () => {
		const result = computeTimelineLayout(realRails(), [], NOW, GEO);
		expectNoOverlapWithinColumns(result.placed);
	});
});

describe('computeTimelineLayout — greedy leftmost (first-fit correctness)', () => {
	it('places a rail in the lowest-index column that fits, not a later one', () => {
		// a and b overlap (must differ in column); c starts after both end, so it
		// must reuse column 0 rather than opening a third column.
		const rails: TimelineRail[] = [
			rail('a', '2026-01-01', '2026-03-01'),
			rail('b', '2026-01-15', '2026-02-15'),
			rail('c', '2025-01-01', '2025-02-01')
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.slug, p]));
		expect(byLabel.get('a')!.column).not.toBe(byLabel.get('b')!.column);
		// c is chronologically earlier (lower yTop is later in time; c has the
		// largest yTop of the three) and non-overlapping with whichever of a/b
		// occupies column 0, so it must land in column 0.
		expect(byLabel.get('c')!.column).toBe(0);
	});

	it('never opens a new column when an earlier one has room', () => {
		// Three sequential, non-overlapping rails must all pack into column 0.
		const rails: TimelineRail[] = [
			rail('first', '2026-01-01', '2026-01-05'),
			rail('second', '2025-01-01', '2025-01-05'),
			rail('third', '2024-01-01', '2024-01-05')
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		expect(result.columnCount).toBe(1);
		expect(result.placed.every((p) => p.column === 0)).toBe(true);
	});
});

describe('computeTimelineLayout — zero-length rails', () => {
	it('gets durationDays:0 and a drawn height at least minRailHeight, and still packs without overlap', () => {
		const rails: TimelineRail[] = [
			rail('single-day', '2026-03-14', '2026-03-14'),
			rail('other', '2025-01-01', '2025-06-01')
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		const singleDay = result.placed.find((p) => p.slug === 'single-day')!;
		expect(singleDay.durationDays).toBe(0);
		expect(singleDay.yBottom - singleDay.yTop).toBeGreaterThanOrEqual(GEO.minRailHeight);
	});

	it('holds for the real registry: every zero-length project still gets a visible capsule', () => {
		const rails = realRails();
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		const zeroLength = rails.filter(
			(r) => r.firstCommit !== null && r.firstCommit === r.lastCommit
		);
		expect(zeroLength.length).toBeGreaterThan(0); // sanity: the real data has these
		const byLabel = new Map(result.placed.map((p) => [p.slug, p]));
		for (const r of zeroLength) {
			const placed = byLabel.get(r.slug)!;
			expect(placed.durationDays).toBe(0);
			expect(placed.yBottom - placed.yTop).toBeGreaterThanOrEqual(GEO.minRailHeight);
		}
	});
});

describe('computeTimelineLayout — now-marker', () => {
	it('nowY equals topPad, and the newest rail sits at or below it', () => {
		const rails: TimelineRail[] = [
			rail('newest', '2026-07-14', '2026-07-14'),
			rail('older', '2023-01-01', '2023-06-01')
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		expect(result.nowY).toBe(GEO.topPad);
		const newest = result.placed.find((p) => p.slug === 'newest')!;
		expect(newest.yTop).toBeGreaterThanOrEqual(result.nowY);
	});
});

describe('computeTimelineLayout — year ticks', () => {
	it('produces one tick per year in range, with y decreasing as year increases (closer to now)', () => {
		// Ticks come out year-ascending; since a LATER year is closer to `now`
		// (smaller y, near the top), y must monotonically DECREASE as the loop
		// advances — i.e. y grows monotonically with age, as the doc comment on
		// computeYearTicks states.
		const result = computeTimelineLayout(realRails(), [], NOW, GEO);
		expect(result.ticks.length).toBeGreaterThan(0);
		for (let i = 1; i < result.ticks.length; i++) {
			expect(result.ticks[i].year).toBe(result.ticks[i - 1].year + 1);
			expect(result.ticks[i].y).toBeLessThan(result.ticks[i - 1].y);
		}
	});

	it('computeYearTicks alone: Jan-1 ticks land on the scale, one per year inclusive', () => {
		const minDay = dayValue('2023-06-01');
		const nowDay = dayValue('2026-07-14');
		const y = (day: number): number => 100 - (nowDay - day) * 0.5;
		const ticks = computeYearTicks(minDay, nowDay, y);
		expect(ticks.map((t) => t.year)).toEqual([2023, 2024, 2025, 2026]);
		for (const tick of ticks) {
			expect(tick.y).toBeCloseTo(y(dayValue(`${tick.year}-01-01`)), 6);
		}
	});

	it('stays sane against a synthetic front-loaded dataset shaped like the real crush', () => {
		// A handful of rails piled into one recent month, plus a couple of old
		// sparse ones — the exact shape that made the fixed-linear scale
		// unreadable. Year ticks must still land monotonically further down the
		// chart (larger y) for older years, even though the underlying month
		// bands are wildly uneven in height.
		const rails: TimelineRail[] = [
			rail('old-1', '2023-01-01', '2023-01-05'),
			rail('old-2', '2023-06-01', '2023-06-05'),
			rail('crush-1', '2026-03-01', '2026-03-05'),
			rail('crush-2', '2026-03-02', '2026-03-06'),
			rail('crush-3', '2026-03-03', '2026-03-07'),
			rail('crush-4', '2026-03-04', '2026-03-08'),
			rail('crush-5', '2026-03-05', '2026-03-09')
		];
		const result = computeTimelineLayout(rails, [], NOW, GEO);
		expect(result.ticks.map((t) => t.year)).toEqual([2023, 2024, 2025, 2026]);
		for (let i = 1; i < result.ticks.length; i++) {
			expect(result.ticks[i].y).toBeLessThan(result.ticks[i - 1].y);
		}
	});
});

describe('computeTimelineLayout — determinism', () => {
	it('identical inputs produce byte-identical (deep-equal) output', () => {
		const rails = realRails();
		const lineage: TimelineLineage[] = [];
		const a = computeTimelineLayout(rails, lineage, NOW, GEO);
		const b = computeTimelineLayout(rails, lineage, NOW, GEO);
		expect(a).toEqual(b);
	});

	it('shuffled input rail order yields the same placement result', () => {
		const rails = realRails();
		const shuffled = [...rails].reverse();
		const a = computeTimelineLayout(rails, [], NOW, GEO);
		const b = computeTimelineLayout(shuffled, [], NOW, GEO);

		const normalise = (placed: PlacedRail[]): PlacedRail[] =>
			[...placed].sort((x, y) => x.slug.localeCompare(y.slug));
		expect(normalise(a.placed)).toEqual(normalise(b.placed));
		expect(a.height).toBe(b.height);
		expect(a.columnCount).toBe(b.columnCount);
	});

	it('computeMonthBands alone: identical inputs (including shuffled order) produce byte-identical bands', () => {
		const rails = realRails().filter((r) => r.firstCommit !== null);
		const shuffled = [...rails].reverse();
		const minDay = Math.min(...rails.map((r) => dayValue(r.firstCommit!)));
		const nowDay = dayValue(NOW);

		const a = computeMonthBands(rails, minDay, nowDay, GEO.topPad);
		const b = computeMonthBands(rails, minDay, nowDay, GEO.topPad);
		const c = computeMonthBands(shuffled, minDay, nowDay, GEO.topPad);

		expect(a).toEqual(b);
		expect(a).toEqual(c);
	});
});
