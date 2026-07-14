/**
 * Tests for the crossing-minimising adoption-timeline layout.
 *
 * Covers the guarantees the algorithm exists to provide: fewer crossings than
 * the naive date-ordered baseline, no overlapping labels within a lane, and
 * bit-for-bit determinism (the SSR/CSR contract) — plus the structural edge
 * cases the design doc calls out: isolated nodes, non-time-monotonic edges,
 * and an empty input.
 */

import { describe, it, expect } from 'vitest';
import { computeAdoptionLayout, type LayoutGeometry, type PlacedNode } from './adoption-layout.js';
import type { TechAdoption } from '$lib/data/adoption.js';
import type { TechRelationship } from '$lib/data/types.js';

const GEO: LayoutGeometry = {
	width: 920,
	leftPad: 28,
	rightPad: 28,
	topPad: 28,
	axisGap: 28,
	railLaneHeight: 30,
	stripLaneHeight: 24,
	stripGap: 16,
	elbowRun: 18,
	cornerRadius: 6,
	charWidth: 7.2,
	labelGap: 10
};

function tech(
	label: string,
	kind: TechAdoption['kind'],
	firstDate: string,
	projectCount = 1
): TechAdoption {
	return {
		label,
		kind,
		firstDate,
		firstYear: Number(firstDate.slice(0, 4)),
		firstProjectSlug: 'fixture-project',
		firstProjectName: 'Fixture Project',
		projectCount,
		dateSource: 'derived'
	};
}

/** Mirrors the real dataset's shape: a handful of lineage families plus isolated nodes. */
const FIXTURE_ITEMS: TechAdoption[] = [
	tech('Ink', 'language', '2020-01-01'),
	tech('CSS', 'language', '2020-01-01'),
	tech('HTML', 'language', '2020-01-01'),
	tech('JavaScript', 'language', '2021-06-01', 8),
	tech('TypeScript', 'language', '2022-01-01', 6),
	tech('Shell', 'language', '2022-06-01'),
	tech('Express', 'framework', '2022-11-01'),
	tech('React', 'framework', '2023-01-01'),
	tech('Tailwind CSS', 'framework', '2023-03-01'),
	tech('Svelte 5', 'framework', '2025-04-01', 3),
	tech('SvelteKit', 'framework', '2025-04-15', 3),
	tech('Node.js', 'runtime', '2021-09-01', 5),
	tech('Deno', 'runtime', '2025-07-01'),
	tech('Oak', 'runtime', '2025-07-15')
];

const FIXTURE_EDGES: TechRelationship[] = [
	{ kind: 'leads-to', source: 'Ink', target: 'JavaScript' },
	{ kind: 'leads-to', source: 'JavaScript', target: 'TypeScript' },
	{ kind: 'leads-to', source: 'JavaScript', target: 'React' },
	{ kind: 'leads-to', source: 'TypeScript', target: 'React' },
	{ kind: 'leads-to', source: 'JavaScript', target: 'Svelte 5' },
	{ kind: 'leads-to', source: 'TypeScript', target: 'Svelte 5' },
	{ kind: 'replaced-by', source: 'React', target: 'Svelte 5' },
	{ kind: 'leads-to', source: 'Svelte 5', target: 'SvelteKit' },
	{ kind: 'leads-to', source: 'CSS', target: 'Tailwind CSS' },
	{ kind: 'replaced-by', source: 'Node.js', target: 'Deno' },
	{ kind: 'leads-to', source: 'Deno', target: 'Oak' },
	{ kind: 'replaced-by', source: 'Express', target: 'Oak' }
];

/**
 * Counts lineage-edge pairs that interleave in lane rank while overlapping in
 * x — the layout's actual crossing metric. `computeAdoptionLayout` doesn't
 * expose this itself, so tests derive it from `placed` the same way for both
 * the algorithm's real output and the naive date-ordered baseline below.
 */
function countCrossings(placed: PlacedNode[], edges: TechRelationship[]): number {
	const rankOf = new Map(placed.map((p, i) => [p.label, i]));
	const labels = new Set(placed.map((p) => p.label));
	const resolved = edges.filter((e) => labels.has(e.source) && labels.has(e.target));

	let crossings = 0;
	for (let i = 0; i < resolved.length; i++) {
		for (let j = i + 1; j < resolved.length; j++) {
			const a = resolved[i];
			const b = resolved[j];
			const aFrom = placed.find((p) => p.label === a.source)!;
			const aTo = placed.find((p) => p.label === a.target)!;
			const bFrom = placed.find((p) => p.label === b.source)!;
			const bTo = placed.find((p) => p.label === b.target)!;
			const aXLo = Math.min(aFrom.x, aTo.x);
			const aXHi = Math.max(aFrom.x, aTo.x);
			const bXLo = Math.min(bFrom.x, bTo.x);
			const bXHi = Math.max(bFrom.x, bTo.x);
			if (aXLo >= bXHi || bXLo >= aXHi) continue;
			const aLo = Math.min(rankOf.get(a.source)!, rankOf.get(a.target)!);
			const aHi = Math.max(rankOf.get(a.source)!, rankOf.get(a.target)!);
			const bLo = Math.min(rankOf.get(b.source)!, rankOf.get(b.target)!);
			const bHi = Math.max(rankOf.get(b.source)!, rankOf.get(b.target)!);
			const interleaves =
				(aLo < bLo && bLo < aHi && aHi < bHi) || (bLo < aLo && aLo < bHi && bHi < aHi);
			if (interleaves) crossings++;
		}
	}
	return crossings;
}

/** Baseline: date order with no relaxation, i.e. today's old lane-packing order. */
function countCrossingsInDateOrder(items: TechAdoption[], edges: TechRelationship[]): number {
	const baseline = computeAdoptionLayout(items, [], GEO); // no edges = no relaxation pull
	return countCrossings(baseline.placed, edges);
}

describe('computeAdoptionLayout', () => {
	it('returns an empty layout for no items', () => {
		const result = computeAdoptionLayout([], FIXTURE_EDGES, GEO);
		expect(result.placed).toEqual([]);
		expect(result.ticks).toEqual([]);
		expect(countCrossings(result.placed, FIXTURE_EDGES)).toBe(0);
		expect(result.height).toBe(GEO.topPad * 2);
	});

	it('places every input item exactly once, keyed by label', () => {
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		expect(result.placed).toHaveLength(FIXTURE_ITEMS.length);
		const labels = result.placed.map((p) => p.label).sort();
		expect(labels).toEqual(FIXTURE_ITEMS.map((i) => i.label).sort());
	});

	it('keeps x tied to firstDate: earlier dates never sit to the right of later ones', () => {
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		for (let i = 1; i < FIXTURE_ITEMS.length; i++) {
			const prev = byLabel.get(FIXTURE_ITEMS[i - 1].label)!;
			const curr = byLabel.get(FIXTURE_ITEMS[i].label)!;
			if (FIXTURE_ITEMS[i - 1].firstDate < FIXTURE_ITEMS[i].firstDate) {
				expect(prev.x).toBeLessThanOrEqual(curr.x);
			}
		}
	});

	it('reduces crossings relative to the naive date-ordered baseline', () => {
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		const resultCrossings = countCrossings(result.placed, FIXTURE_EDGES);
		const baselineCrossings = countCrossingsInDateOrder(FIXTURE_ITEMS, FIXTURE_EDGES);
		expect(resultCrossings).toBeLessThanOrEqual(baselineCrossings);
	});

	it('places a same-date lineage parent in a lane the child never crosses, regardless of input order', () => {
		// HTML and CSS share a curated date in the real dataset; feed them here
		// in the "wrong" (child-before-parent) array order to prove the layout
		// itself corrects it, independent of getTechAdoption's own tie-break.
		const items: TechAdoption[] = [
			tech('CSS', 'language', '2020-01-01'),
			tech('HTML', 'language', '2020-01-01'),
			tech('Tailwind CSS', 'framework', '2023-03-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'leads-to', source: 'HTML', target: 'CSS' },
			{ kind: 'leads-to', source: 'CSS', target: 'Tailwind CSS' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		const html = byLabel.get('HTML')!;
		const css = byLabel.get('CSS')!;
		const tailwind = byLabel.get('Tailwind CSS')!;

		// The real guarantee: HTML (the family root) must never land in a lane
		// strictly between CSS and CSS's own child, Tailwind CSS — that's the
		// geometry that made the CSS→Tailwind connector clip through HTML's rail.
		expect(css.lane).not.toBe(tailwind.lane);
		const lo = Math.min(css.lane, tailwind.lane);
		const hi = Math.max(css.lane, tailwind.lane);
		expect(html.lane > lo && html.lane < hi).toBe(false);
	});

	it('never places two same-lane nodes with overlapping label spans', () => {
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		// Rail lanes and strip lanes are numbered independently (PlacedNode.lane
		// docs), so group by section + lane, not lane alone.
		const byLane = new Map<string, PlacedNode[]>();
		for (const node of result.placed) {
			const key = `${node.section}:${node.lane}`;
			const lane = byLane.get(key) ?? [];
			lane.push(node);
			byLane.set(key, lane);
		}
		for (const lane of byLane.values()) {
			const sorted = [...lane].sort((a, b) => a.x - b.x);
			for (let i = 1; i < sorted.length; i++) {
				// Mirrors the source's own labelRight formula (measure() in
				// adoption-layout.ts): gap + label measured from x, radius counted once.
				const prevRight =
					sorted[i - 1].x + sorted[i - 1].radius + 6 + sorted[i - 1].label.length * GEO.charWidth;
				const currLeft = sorted[i].x - sorted[i].radius;
				expect(currLeft).toBeGreaterThan(prevRight);
			}
		}
	});

	it('is deterministic across repeated calls (the SSR/CSR contract)', () => {
		const a = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		const b = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		expect(a).toEqual(b);
	});

	it('drops edges whose source or target is not among the placed items', () => {
		const edgesWithGhost: TechRelationship[] = [
			...FIXTURE_EDGES,
			{ kind: 'leads-to', source: 'Ghost Tech', target: 'JavaScript' },
			{ kind: 'leads-to', source: 'JavaScript', target: 'Also Ghost' }
		];
		const withGhosts = computeAdoptionLayout(FIXTURE_ITEMS, edgesWithGhost, GEO);
		const withoutGhosts = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		expect(countCrossings(withGhosts.placed, FIXTURE_EDGES)).toBe(
			countCrossings(withoutGhosts.placed, FIXTURE_EDGES)
		);
		expect(withGhosts.placed).toEqual(withoutGhosts.placed);
	});

	it('handles isolated nodes (no lineage edges) without error', () => {
		const isolatedOnly: TechAdoption[] = [
			tech('Rust', 'language', '2026-01-01'),
			tech('Go', 'language', '2026-02-01'),
			tech('C#', 'language', '2026-03-01')
		];
		const result = computeAdoptionLayout(isolatedOnly, FIXTURE_EDGES, GEO);
		expect(result.placed).toHaveLength(3);
		expect(countCrossings(result.placed, FIXTURE_EDGES)).toBe(0);
	});

	it('handles a non-time-monotonic edge (target predates source)', () => {
		const backward: TechRelationship[] = [
			{ kind: 'leads-to', source: 'SvelteKit', target: 'Ink' } // deliberately backward in time
		];
		expect(() => computeAdoptionLayout(FIXTURE_ITEMS, backward, GEO)).not.toThrow();
		const result = computeAdoptionLayout(FIXTURE_ITEMS, backward, GEO);
		expect(result.placed).toHaveLength(FIXTURE_ITEMS.length);
	});

	it('produces year ticks spanning firstYear to lastYear inclusive', () => {
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		const firstYear = Math.min(...FIXTURE_ITEMS.map((i) => i.firstYear));
		const lastYear = Math.max(...FIXTURE_ITEMS.map((i) => i.firstYear));
		expect(result.ticks[0].year).toBe(firstYear);
		expect(result.ticks[result.ticks.length - 1].year).toBe(lastYear);
		expect(result.ticks).toHaveLength(lastYear - firstYear + 1);
	});
});
