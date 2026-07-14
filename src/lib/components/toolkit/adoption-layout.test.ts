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
import {
	computeAdoptionLayout,
	computeYearBands,
	type LayoutGeometry,
	type PlacedNode
} from './adoption-layout.js';
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

	it('draws a visible bracket when a same-date parent and child leave no room for an s-curve', () => {
		// Mirrors the real HTML/CSS pair: identical adoption dates put both dots
		// at the same x in adjacent lanes, and high project counts give them
		// radii that swallow the lane pitch — the s-curve between the dots'
		// clearance edges inverts into a sub-pixel path drawn backwards.
		const items: TechAdoption[] = [
			tech('HTML', 'language', '2020-01-01', 24),
			tech('CSS', 'language', '2020-01-01', 22),
			tech('Tailwind CSS', 'framework', '2023-03-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'leads-to', source: 'HTML', target: 'CSS' },
			{ kind: 'leads-to', source: 'CSS', target: 'Tailwind CSS' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const connector = result.connectors.find((c) => c.source === 'HTML' && c.target === 'CSS')!;
		expect(connector.variant).toBe('bracket');

		// The bracket departs the parent dot's left edge rather than vanishing
		// underneath the dots.
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		const html = byLabel.get('HTML')!;
		expect(connector.path.startsWith(`M ${html.x - html.radius - 2} ${html.y}`)).toBe(true);
	});

	// ---- branch-drop routing -------------------------------------------------
	// A "late child" is one adopted after its lineage parent's rail ended (the
	// parent was replaced first). These used to fall back to long dot-to-dot
	// s-curves; they must now route orthogonally.

	it('routes a late child as a branch-drop departing the parent dot', () => {
		const items: TechAdoption[] = [
			tech('Alpha', 'language', '2020-01-01'),
			tech('Beta', 'language', '2021-01-01'),
			tech('Gamma', 'framework', '2024-01-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'replaced-by', source: 'Alpha', target: 'Beta' },
			{ kind: 'leads-to', source: 'Alpha', target: 'Gamma' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		const alpha = byLabel.get('Alpha')!;

		const connector = result.connectors.find((c) => c.target === 'Gamma')!;
		expect(connector.variant).toBe('branch-drop');
		expect(connector.path.startsWith(`M ${alpha.x} ${alpha.y + alpha.radius + 2}`)).toBe(true);
		// Orthogonal by construction: no cubic segment.
		expect(connector.path).not.toContain('C');
	});

	it('never routes a leads-to edge as a merge handover', () => {
		// The handover variant is a merge stub: it draws only the rail's final
		// ~16px into a successor, correct for a replaced-by succession but wrong
		// for a leads-to branch that merely shares its parent's lane (the
		// JavaScript→React bug). No leads-to edge may ever emit 'handover';
		// same-lane leads-to uses the full-width 'same-lane-branch' instead.
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		const bySourceTarget = new Map(
			result.connectors.map((c) => [`${c.source}→${c.target}`, c])
		);
		for (const edge of FIXTURE_EDGES) {
			if (edge.kind !== 'leads-to') continue;
			const connector = bySourceTarget.get(`${edge.source}→${edge.target}`);
			if (!connector) continue; // reduced/dropped edges have no connector
			expect(connector.variant, `${edge.source}→${edge.target}`).not.toBe('handover');
		}
	});

	it('does not park a leaf in a sibling branch’s abandoned lane', () => {
		// Mirrors inkjs: Root leads to two branches. The CSS-like branch retires
		// its early rail (leaving that lane free to the right), and a late leaf
		// (Leaf, anchored on Root) must NOT squat in that freed sibling lane —
		// which would vault a long connector across the CSS branch — but take a
		// lane of its own near Root instead.
		const items: TechAdoption[] = [
			tech('Root', 'language', '2020-01-01'),
			tech('CssA', 'framework', '2020-06-01'),
			tech('CssB', 'framework', '2020-09-01'),
			tech('Leaf', 'runtime', '2024-01-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'leads-to', source: 'Root', target: 'CssA' },
			{ kind: 'replaced-by', source: 'CssA', target: 'CssB' },
			{ kind: 'leads-to', source: 'Root', target: 'Leaf' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		const leaf = byLabel.get('Leaf')!;
		const cssA = byLabel.get('CssA')!;
		const cssB = byLabel.get('CssB')!;
		// Leaf must not reuse the CSS branch's lane (CssA's, which CssB inherits).
		expect(leaf.lane).not.toBe(cssA.lane);
		expect(leaf.lane).not.toBe(cssB.lane);
		// And the Root→Leaf connector should not be a long dot-to-dot curve
		// (the symptom of squatting far from the anchor).
		const conn = result.connectors.find((c) => c.target === 'Leaf')!;
		expect(conn.variant).not.toBe('s-curve');
	});

	it('keeps a same-lane replaced-by as a short handover stub', () => {
		// The succession case the same-lane-branch split must NOT disturb.
		const items: TechAdoption[] = [
			tech('Old', 'runtime', '2020-01-01'),
			tech('New', 'runtime', '2023-01-01')
		];
		const edges: TechRelationship[] = [{ kind: 'replaced-by', source: 'Old', target: 'New' }];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		expect(byLabel.get('Old')!.lane).toBe(byLabel.get('New')!.lane);
		const connector = result.connectors.find((c) => c.target === 'New')!;
		expect(connector.variant).toBe('handover');
		const [, fromX, toX] = connector.path.match(/M ([\d.]+) [\d.]+ H ([\d.]+)/)!;
		expect(Number(toX) - Number(fromX)).toBeLessThanOrEqual(16); // final stub only
	});

	it('bundles two late children of one parent onto the same vertical', () => {
		const items: TechAdoption[] = [
			tech('Alpha', 'language', '2020-01-01'),
			tech('Beta', 'language', '2021-01-01'),
			tech('Gamma', 'framework', '2024-01-01'),
			tech('Delta', 'framework', '2025-01-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'replaced-by', source: 'Alpha', target: 'Beta' },
			{ kind: 'leads-to', source: 'Alpha', target: 'Gamma' },
			{ kind: 'leads-to', source: 'Alpha', target: 'Delta' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		const alpha = byLabel.get('Alpha')!;

		for (const target of ['Gamma', 'Delta']) {
			const connector = result.connectors.find((c) => c.target === target)!;
			expect(connector.variant).toBe('branch-drop');
			expect(connector.path.startsWith(`M ${alpha.x} `)).toBe(true);
		}
	});

	it('never routes a corridor through an intermediate lane dot', () => {
		// The corridor-nudge guarantee, asserted as a layout-wide invariant
		// rather than pinned to one arrangement: however the refinement pass
		// orders lanes, no connector's vertical corridor (branch-drop, elbow,
		// or vertical-arrival) may pass within a dot's exclusion zone in a lane
		// strictly between its endpoints. Uses the realistic fixture so the
		// same-date JavaScript/Node.js collision (the real motivator) is in
		// play. Labels are exempt — the component's halo handles those.
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		const rail = result.placed.filter((p) => p.section === 'rail');
		const byLabel = new Map(rail.map((p) => [p.label, p]));

		const corridorX = (c: (typeof result.connectors)[number]): number | null => {
			if (c.variant === 'elbow') return Number(c.path.match(/Q ([\d.]+)/)![1]);
			if (c.variant === 'branch-drop') return Number(c.path.match(/M ([\d.]+)/)![1]);
			if (c.variant === 'vertical-arrival') return byLabel.get(c.target)!.x;
			return null; // handover / bracket / s-curve / gutter have no straight corridor
		};

		for (const c of result.connectors) {
			const cx = corridorX(c);
			if (cx === null) continue;
			const source = byLabel.get(c.source)!;
			const target = byLabel.get(c.target)!;
			const lo = Math.min(source.lane, target.lane);
			const hi = Math.max(source.lane, target.lane);
			for (const node of rail) {
				if (node.lane <= lo || node.lane >= hi) continue;
				expect(
					Math.abs(cx - node.x) > node.radius + 3,
					`${c.variant} ${c.source}→${c.target} corridor at ${cx} slices ${node.label} (x=${node.x})`
				).toBe(true);
			}
		}
	});

	it('clears an earlier occupant of the child lane before running along it', () => {
		// Gamma reuses Mu's lane (Mu's rail ended at Nu long before Gamma), so
		// the branch's horizontal run along that lane must start right of Mu's
		// label, not plough through it.
		const items: TechAdoption[] = [
			tech('Alpha', 'language', '2020-01-01'),
			tech('Mu', 'framework', '2021-06-01'),
			tech('Nu', 'framework', '2021-08-01'),
			tech('Beta', 'language', '2024-01-01'),
			tech('Gamma', 'framework', '2025-01-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'replaced-by', source: 'Alpha', target: 'Beta' },
			{ kind: 'leads-to', source: 'Alpha', target: 'Mu' },
			{ kind: 'replaced-by', source: 'Mu', target: 'Nu' },
			{ kind: 'leads-to', source: 'Alpha', target: 'Gamma' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		const mu = byLabel.get('Mu')!;
		const gamma = byLabel.get('Gamma')!;
		expect(gamma.lane).toBe(mu.lane);

		const connector = result.connectors.find((c) => c.target === 'Gamma')!;
		expect(connector.variant).toBe('elbow');
		const corridorX = Number(connector.path.match(/Q ([\d.]+)/)![1]);
		const muLabelRight = mu.x + mu.radius + 6 + mu.label.length * GEO.charWidth;
		expect(corridorX).toBeGreaterThan(muLabelRight);
	});

	it('keeps unrelated corridors either 6px apart or vertically disjoint', () => {
		// The de-overlap contract: two vertical corridor runs from different
		// parents must never read as one line — either the layout separates
		// them in x (corridor shift) or they no longer share any vertical
		// extent (lane refinement). Checked over both a deliberately tight
		// fixture (Chi and Psi adopt three days apart, so their raw corridors
		// land within ~2px) and the realistic fixture.
		const tight: TechAdoption[] = [
			tech('Rho', 'language', '2020-01-01'),
			tech('Tau', 'language', '2021-01-01'),
			tech('Chi', 'framework', '2024-01-01'),
			tech('Psi', 'framework', '2024-01-04')
		];
		const tightEdges: TechRelationship[] = [
			{ kind: 'leads-to', source: 'Rho', target: 'Tau' },
			{ kind: 'leads-to', source: 'Rho', target: 'Chi' },
			{ kind: 'leads-to', source: 'Tau', target: 'Psi' }
		];

		const corridorRuns = (
			result: ReturnType<typeof computeAdoptionLayout>
		): { source: string; x: number; yLo: number; yHi: number }[] => {
			const byLabel = new Map(result.placed.map((p) => [p.label, p]));
			const runs: { source: string; x: number; yLo: number; yHi: number }[] = [];
			for (const c of result.connectors) {
				let x: number | null = null;
				if (c.variant === 'elbow') x = Number(c.path.match(/Q ([\d.]+)/)![1]);
				else if (c.variant === 'branch-drop') x = Number(c.path.match(/M ([\d.]+)/)![1]);
				else if (c.variant === 'vertical-arrival') x = byLabel.get(c.target)!.x;
				if (x === null) continue;
				const a = byLabel.get(c.source)!;
				const b = byLabel.get(c.target)!;
				runs.push({ source: c.source, x, yLo: Math.min(a.y, b.y), yHi: Math.max(a.y, b.y) });
			}
			return runs;
		};

		for (const result of [
			computeAdoptionLayout(tight, tightEdges, GEO),
			computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO)
		]) {
			const runs = corridorRuns(result);
			for (let i = 0; i < runs.length; i++) {
				for (let j = i + 1; j < runs.length; j++) {
					const a = runs[i];
					const b = runs[j];
					if (a.source === b.source) continue;
					const coincident = Math.abs(a.x - b.x) < 6;
					const overlap = a.yLo < b.yHi && b.yLo < a.yHi;
					expect(coincident && overlap).toBe(false);
				}
			}
		}
	});

	it('routes a late edge whose lane approach is blocked through the gutter', () => {
		// Alpha's rail ends at Beta long before Gamma arrives, and Gamma
		// reuses Mu's lane, so neither an elbow, a branch-drop nor a rail
		// corridor can host the horizontal approach (Mu's label blocks the
		// lane and the rail is gone). The route must take the gutter above
		// Gamma's lane and drop vertically into its dot.
		const items: TechAdoption[] = [
			tech('Alpha', 'language', '2020-01-01'),
			tech('Beta', 'language', '2021-01-01'),
			tech('Mu', 'framework', '2021-06-01'),
			tech('Nu', 'framework', '2021-08-01'),
			tech('Gamma', 'framework', '2025-01-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'replaced-by', source: 'Alpha', target: 'Beta' },
			{ kind: 'leads-to', source: 'Alpha', target: 'Mu' },
			{ kind: 'replaced-by', source: 'Mu', target: 'Nu' },
			{ kind: 'leads-to', source: 'Alpha', target: 'Gamma' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		const mu = byLabel.get('Mu')!;
		const gamma = byLabel.get('Gamma')!;
		expect(gamma.lane).toBe(mu.lane);

		const connector = result.connectors.find((c) => c.target === 'Gamma')!;
		expect(connector.variant).toBe('gutter-arrival');
		// Arrives vertically at the dot's top edge, not horizontally at its left.
		expect(connector.path.endsWith(`V ${gamma.y - gamma.radius - 2}`)).toBe(true);
		expect(connector.path).not.toContain('C');
	});

	it('keeps a long-labelled succession chain beside its lineage parent', () => {
		// Mirrors the CSS → Tailwind CSS v3 → Tailwind CSS v4 shape: CSSish's
		// SIBLING branches all fade (holding their lanes to the plot edge), a
		// late child of CSSish arrives with a label too long for its successor
		// to inherit the lane, and the successor follows three months later.
		// Without anchor-adjacent lane insertion both late nodes strand at the
		// block's bottom and their connectors vault the sibling rails; sibling
		// branches are NOT part of CSSish's subtree, so insertion must land
		// directly below CSSish, ahead of them.
		const items: TechAdoption[] = [
			tech('Rootish', 'language', '2019-06-01'),
			tech('CSSish', 'language', '2020-01-01'),
			tech('Blocker One', 'framework', '2020-06-01'),
			tech('Blocker Two', 'framework', '2021-01-01'),
			tech('Tailwindish v3', 'framework', '2024-10-01'),
			tech('Tailwindish v4', 'framework', '2025-01-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'leads-to', source: 'Rootish', target: 'CSSish' },
			{ kind: 'leads-to', source: 'Rootish', target: 'Blocker One' },
			{ kind: 'leads-to', source: 'Rootish', target: 'Blocker Two' },
			{ kind: 'leads-to', source: 'CSSish', target: 'Tailwindish v3' },
			{ kind: 'replaced-by', source: 'Tailwindish v3', target: 'Tailwindish v4' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));

		// The late child sits directly below its anchor, and its successor
		// directly below it (succession itself is rejected: the v3 label
		// overlaps the v4 dot at a three-month gap).
		expect(byLabel.get('Tailwindish v3')!.lane).toBe(byLabel.get('CSSish')!.lane + 1);
		expect(byLabel.get('Tailwindish v4')!.lane).toBe(byLabel.get('Tailwindish v3')!.lane + 1);
	});

	it('untangles interleaved parent-child chains within a family', () => {
		// Greedy assignment dates Kid2 before GKid1, so the two chains come
		// out interleaved (Root, Kid1, Kid2, GKid1, GKid2) with each
		// grandchild's connector vaulting over the other chain's rail. The
		// refinement pass must reorder rows so each grandchild sits directly
		// under its own parent.
		const items: TechAdoption[] = [
			tech('Root', 'language', '2020-01-01'),
			tech('Kid1', 'framework', '2020-06-01'),
			tech('Kid2', 'framework', '2020-09-01'),
			tech('GKid1', 'framework', '2023-01-01'),
			tech('GKid2', 'framework', '2023-06-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'leads-to', source: 'Root', target: 'Kid1' },
			{ kind: 'leads-to', source: 'Root', target: 'Kid2' },
			{ kind: 'leads-to', source: 'Kid1', target: 'GKid1' },
			{ kind: 'leads-to', source: 'Kid2', target: 'GKid2' }
		];
		const result = computeAdoptionLayout(items, edges, GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		expect(byLabel.get('GKid1')!.lane).toBe(byLabel.get('Kid1')!.lane + 1);
		expect(byLabel.get('GKid2')!.lane).toBe(byLabel.get('Kid2')!.lane + 1);
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

	// ---- rail colour segments -----------------------------------------------
	// A rail is coloured by the edge to the next node each stretch reaches.

	/** Rail node lookup for the segment tests. */
	const railOf = (result: ReturnType<typeof computeAdoptionLayout>, label: string): PlacedNode =>
		result.placed.find((p) => p.label === label && p.section === 'rail')!;

	it('colours a rail leads-to up to its last leads-to child, then replaced-by into its successor', () => {
		// React-like: a parent that leads to two children (elbow-routed, so they
		// depart interior to the rail) and is then replaced by a successor.
		const items: TechAdoption[] = [
			tech('Core', 'framework', '2020-01-01'),
			tech('ChildA', 'framework', '2021-06-01'),
			tech('ChildB', 'framework', '2022-06-01'),
			tech('Heir', 'framework', '2024-01-01')
		];
		const edges: TechRelationship[] = [
			{ kind: 'leads-to', source: 'Core', target: 'ChildA' },
			{ kind: 'leads-to', source: 'Core', target: 'ChildB' },
			{ kind: 'replaced-by', source: 'Core', target: 'Heir' }
		];
		const core = railOf(computeAdoptionLayout(items, edges, GEO), 'Core');
		const segs = core.railSegments!;
		expect(segs).toHaveLength(2);
		expect(segs[0].kind).toBe('leads-to');
		expect(segs[1].kind).toBe('replaced-by');
		// Contiguous, spanning the whole rail, with the switch at the last
		// leads-to departure.
		expect(segs[0].startX).toBe(core.x);
		expect(segs[0].endX).toBe(segs[1].startX);
		expect(segs[1].endX).toBe(core.railEndX);
	});

	it('colours a pure leaf rail with a single kind-base segment', () => {
		// A later isolated node keeps Leaf off the plot-right edge so its rail
		// has width (a rail flush with the edge is legitimately zero-length).
		const items: TechAdoption[] = [
			tech('Root', 'language', '2020-01-01'),
			tech('Leaf', 'framework', '2021-01-01'),
			tech('Latecomer', 'language', '2025-01-01')
		];
		const edges: TechRelationship[] = [{ kind: 'leads-to', source: 'Root', target: 'Leaf' }];
		const leaf = railOf(computeAdoptionLayout(items, edges, GEO), 'Leaf');
		expect(leaf.railFades).toBe(true);
		expect(leaf.railSegments).toHaveLength(1);
		expect(leaf.railSegments![0].kind).toBeNull();
		expect(leaf.railSegments![0].endX).toBe(leaf.railEndX);
	});

	it('colours a replaced-only rail fully replaced-by (no leads-to prefix)', () => {
		// .NET 8 → .NET 9 shape: a retired rail with no leads-to children.
		const items: TechAdoption[] = [
			tech('V8', 'runtime', '2023-01-01'),
			tech('V9', 'runtime', '2024-06-01')
		];
		const edges: TechRelationship[] = [{ kind: 'replaced-by', source: 'V8', target: 'V9' }];
		const v8 = railOf(computeAdoptionLayout(items, edges, GEO), 'V8');
		expect(v8.railFades).toBe(false);
		expect(v8.railSegments).toHaveLength(1);
		expect(v8.railSegments![0].kind).toBe('replaced-by');
		expect(v8.railSegments![0].startX).toBe(v8.x);
		expect(v8.railSegments![0].endX).toBe(v8.railEndX);
	});

	it('colours a still-in-use rail with leads-to children then a faded kind-base tail', () => {
		const items: TechAdoption[] = [
			tech('Base', 'language', '2020-01-01'),
			tech('Kid', 'framework', '2022-01-01')
		];
		// Base leads to Kid but is never replaced, so it fades at the plot edge.
		const edges: TechRelationship[] = [{ kind: 'leads-to', source: 'Base', target: 'Kid' }];
		const base = railOf(computeAdoptionLayout(items, edges, GEO), 'Base');
		expect(base.railFades).toBe(true);
		const segs = base.railSegments!;
		expect(segs[0].kind).toBe('leads-to');
		expect(segs[segs.length - 1].kind).toBeNull(); // faded kind-base tail
	});

	it('produces canonical segment lists on every rail (contiguous, no zero-width)', () => {
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		for (const node of result.placed) {
			if (node.section !== 'rail') {
				expect(node.railSegments).toBeNull();
				continue;
			}
			const segs = node.railSegments!;
			// A zero-length rail (dot at the plot edge) legitimately has no
			// segments; anything with width spans x → railEndX contiguously.
			if (segs.length === 0) {
				expect(node.railEndX).toBe(node.x);
				continue;
			}
			expect(segs[0].startX).toBe(node.x);
			expect(segs[segs.length - 1].endX).toBe(node.railEndX);
			for (let i = 0; i < segs.length; i++) {
				expect(segs[i].endX).toBeGreaterThan(segs[i].startX); // no zero-width
				if (i > 0) {
					expect(segs[i].startX).toBe(segs[i - 1].endX); // contiguous
					expect(segs[i].kind).not.toBe(segs[i - 1].kind); // no adjacent same-kind
				}
			}
		}
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

	// ---- variable-width year columns ----------------------------------------

	/** One tech per given year, at mid-year so no band-edge coincidences. */
	const yearItems = (spec: [number, number][]): TechAdoption[] =>
		spec.flatMap(([year, count]) =>
			Array.from({ length: count }, (_, i) =>
				tech(`${year}-${i}`, 'language', `${year}-06-${String(i + 1).padStart(2, '0')}`)
			)
		);

	it('gives a denser year a wider column than a sparser one', () => {
		// Two years, one with four techs and one with one; usable plot span is
		// the same, so the busy year must claim the larger band.
		const items = yearItems([
			[2020, 1],
			[2021, 4]
		]);
		const bands = computeYearBands(items, GEO.leftPad, 800);
		const w2020 = bands.get(2020)!.endX - bands.get(2020)!.startX;
		const w2021 = bands.get(2021)!.endX - bands.get(2021)!.startX;
		expect(w2021).toBeGreaterThan(w2020);
	});

	it('lays year bands out contiguously from leftPad to plotRight', () => {
		const items = yearItems([
			[2020, 2],
			[2021, 1],
			[2022, 3]
		]);
		const plotRight = 800;
		const bands = computeYearBands(items, GEO.leftPad, plotRight);
		expect(bands.get(2020)!.startX).toBe(GEO.leftPad);
		expect(bands.get(2020)!.endX).toBe(bands.get(2021)!.startX);
		expect(bands.get(2021)!.endX).toBe(bands.get(2022)!.startX);
		expect(bands.get(2022)!.endX).toBe(plotRight); // snapped exactly
	});

	it('gives an empty gap year a positive-width band (gridline never collapses)', () => {
		// 2021 has no techs but sits between populated years.
		const items = yearItems([
			[2020, 2],
			[2022, 2]
		]);
		const bands = computeYearBands(items, GEO.leftPad, 800);
		const gap = bands.get(2021)!;
		expect(gap.endX - gap.startX).toBeGreaterThan(0);
	});

	it('places each year tick at its band start, first at leftPad', () => {
		const result = computeAdoptionLayout(FIXTURE_ITEMS, FIXTURE_EDGES, GEO);
		expect(result.ticks[0].x).toBeCloseTo(GEO.leftPad, 6);
		// Ticks are strictly increasing (contiguous ascending bands).
		for (let i = 1; i < result.ticks.length; i++) {
			expect(result.ticks[i].x).toBeGreaterThan(result.ticks[i - 1].x);
		}
	});

	it('keeps x monotonic across an uneven multi-year fixture with an empty gap year', () => {
		const items = yearItems([
			[2019, 1],
			[2020, 5],
			[2021, 0],
			[2022, 2]
		]);
		const result = computeAdoptionLayout(items, [], GEO);
		const byLabel = new Map(result.placed.map((p) => [p.label, p]));
		for (let i = 1; i < items.length; i++) {
			const prev = byLabel.get(items[i - 1].label)!;
			const curr = byLabel.get(items[i].label)!;
			if (items[i - 1].firstDate < items[i].firstDate) {
				expect(prev.x).toBeLessThanOrEqual(curr.x);
			}
		}
	});
});
