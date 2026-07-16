/**
 * Time-ordered lifespan-chart layout for /timeline.
 *
 * The vertical axis is real time: `now` sits at the top, older dates run
 * downward. Unlike a truly linear scale, the day-to-pixel rate is NOT
 * constant — the axis is density-banded, one pixel-band per calendar month,
 * sized by how many rails were concurrently active that month (see
 * `computeMonthBands` below). This is the vertical analogue of
 * `adoption-layout.ts`'s density-sized year columns: "ordered time, not to
 * scale" — dates stay monotonic and month boundaries still land on real
 * calendar points, but a month's pixel height reflects its density rather
 * than a fixed calendar span. The real registry is heavily front-loaded (most
 * projects cluster in recent months), and a fixed linear rate crushed that
 * cluster into an unreadable pile at the top of the chart while wasting
 * hundreds of px on quiet older months; banding gives the crush proportional
 * room without letting quiet months balloon.
 *
 * The horizontal axis carries no semantic meaning at all — it exists purely
 * for collision avoidance. Each project becomes a vertical RAIL running from
 * its `lastCommit` (top/newer end, its most recent activity) to its
 * `firstCommit` (bottom/older end, its inception); rails are packed into the
 * leftmost column that doesn't overlap an already-placed rail, a swapped-axis
 * greedy first-fit analogous in spirit to `adoption-layout.ts`'s strip packer
 * but far simpler — this module deliberately does NOT attempt that module's
 * crossing-minimisation or lane-refinement passes. A timeline's x-axis has no
 * meaning to refine toward; first-fit is the whole story.
 *
 * This is a NEW, SIMPLER module than `adoption-layout.ts`. It reuses that
 * module's byte-stable `dayValue` idiom (string slicing, never `new
 * Date`/`Intl`, so SSR and the first client render agree) and its
 * determinism discipline: no clock reads (`now` is always a parameter), no
 * `Math.random`, every sort keyed by a total order with a slug tiebreak, and
 * every Map/array built by iterating input order rather than relying on
 * incidental array order. Identical inputs must produce byte-identical
 * output on every call.
 */

import type { ProjectRole, ProjectStatus } from '$lib/data/types.js';

// ---------------------------------------------------------------------------
// Date helpers — single-sourced here; +page.ts imports these.
// ---------------------------------------------------------------------------

/**
 * Converts an ISO `YYYY-MM-DD` date into an integer day index (days since the
 * Unix epoch, UTC). String-sliced, never `new Date(iso)` or `Intl`, so the
 * result is byte-identical between the Node prerender and the browser —
 * matches the idiom in `adoption-layout.ts:137-140` and `format-date.ts`.
 */
export function dayValue(iso: string): number {
	const [y, m, d] = iso.split('-').map(Number);
	return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole days between two ISO dates, `b - a` (positive when `b` is later). */
export function dayDiff(a: string, b: string): number {
	return dayValue(b) - dayValue(a);
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/**
 * How far a still-live rail's hub ring extends beyond its main ring. The
 * component draws the hub ring at `radius + HUB_RING_OFFSET`; matches
 * `AdoptionTimeline`'s own `HUB_RING_OFFSET` so the two views share a visual
 * grammar for "this is firmly plotted / active work".
 */
export const HUB_RING_OFFSET = 7;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TimelineGeometry {
	/** viewBox width. */
	width: number;
	/** Room reserved on the left for year labels and the density gutter. */
	leftGutter: number;
	rightPad: number;
	topPad: number;
	bottomPad: number;
	/** Horizontal pitch between packed columns. */
	columnWidth: number;
	/** Minimum vertical gap enforced between two rails sharing a column. */
	laneGap: number;
	/** Floor so a zero-length (single-day) rail is still a visible capsule. */
	minRailHeight: number;
	/** Survey-mark ring radius. */
	nodeRadius: number;
	hubRingOffset: number;
	/** Px of open-ended fade reserved at the recent (top) end of a still-live rail. */
	stillLiveFade: number;
}

export interface YearTick {
	year: number;
	y: number;
}

/**
 * The data a rail is built from — deliberately a plain data shape (no
 * geometry) so `+page.ts` can construct it without importing anything but
 * this module's types.
 */
export interface TimelineRail {
	slug: string;
	name: string;
	status: ProjectStatus;
	tagline: string;
	role: ProjectRole;
	/** ISO `YYYY-MM-DD`, or null when undated. */
	firstCommit: string | null;
	/** ISO `YYYY-MM-DD`, or null when undated. */
	lastCommit: string | null;
	/** Whole days between firstCommit and lastCommit; null when undated. */
	durationDays: number | null;
	stillLive: boolean;
	/**
	 * True when this rail earns a standing (always-visible) label, mirroring
	 * `ProjectMap`'s `node.labelled` field — see `selectLabelledSlugs` in
	 * `data/graph.ts`. Purely a presentation flag; the layout module never
	 * reads it, it only carries it through `PlacedRail` for the component.
	 */
	labelled: boolean;
}

export interface PlacedRail extends TimelineRail {
	/** Packed column index; 0 = leftmost. Undated rails use columns beyond `columnCount`. */
	column: number;
	x: number;
	/** y of the newer end (lastCommit — most recent activity). */
	yTop: number;
	/** y of the older end (firstCommit — inception). */
	yBottom: number;
	/** True when firstCommit is null — the rail has no place on the time axis. */
	undated: boolean;
}

export interface TimelineLineage {
	/** Library slug (the extraction edge's source). */
	source: string;
	/** Consumer/app slug (the extraction edge's target). */
	target: string;
	note: string | null;
}

export interface LineagePath {
	source: string;
	target: string;
	note: string | null;
	/** Complete SVG 'd' attribute; the component renders it verbatim. */
	path: string;
	/** y of the extraction moment — the library's yTop. */
	branchY: number;
}

export interface DensityBand {
	yTop: number;
	yBottom: number;
	count: number;
}

export interface TimelineLayoutResult {
	placed: PlacedRail[];
	ticks: YearTick[];
	lineagePaths: LineagePath[];
	density: DensityBand[];
	/** y of `now` — the today gridline. Equals `geo.topPad`. */
	nowY: number;
	/** Number of dated (on-axis) columns; undated rails are parked beyond this. */
	columnCount: number;
	width: number;
	height: number;
}

// ---------------------------------------------------------------------------
// Year ticks
// ---------------------------------------------------------------------------

/**
 * One horizontal graticule tick per 1 January in `[firstYear, nowYear]`
 * inclusive, positioned by the supplied scale. Because the axis runs newer
 * (top) to older (bottom), a tick's `y` grows monotonically as `year`
 * decreases — an earlier year sits further down the chart.
 */
export function computeYearTicks(
	minDay: number,
	nowDay: number,
	y: (day: number) => number
): YearTick[] {
	if (!Number.isFinite(minDay) || !Number.isFinite(nowDay)) return [];

	const firstYear = yearOfDayValue(minDay);
	const nowYear = yearOfDayValue(nowDay);

	const ticks: YearTick[] = [];
	for (let year = firstYear; year <= nowYear; year++) {
		ticks.push({ year, y: y(dayValue(`${year}-01-01`)) });
	}
	return ticks;
}

/**
 * Inverse of `dayValue`: the calendar year an epoch-day integer falls in.
 * Pure integer arithmetic on the UTC epoch-day count — never `new
 * Date(...).toISOString()` or `Intl`, keeping this in step with the same
 * determinism contract `dayValue` upholds (SSR/CSR byte-identical output).
 */
function yearOfDayValue(day: number): number {
	// A day index maps to a UTC calendar date via Date.UTC's own inverse
	// (getUTCFullYear on a Date constructed from the same epoch-ms basis
	// dayValue uses); this reads only calendar fields off a fixed UTC
	// instant, never locale/ICU-dependent formatting, so it stays
	// deterministic across Node and browser runtimes.
	return new Date(day * 86_400_000).getUTCFullYear();
}

/**
 * Inverse of `dayValue`, one calendar level finer than `yearOfDayValue`: the
 * `year*12 + (month-1)` index an epoch-day integer falls in, so consecutive
 * months are consecutive integers regardless of year boundaries. Same
 * determinism contract as `yearOfDayValue` — reads only calendar fields off a
 * fixed UTC instant built from the same epoch-ms basis `dayValue` uses, never
 * locale/ICU-dependent formatting.
 */
function monthIndexOfDayValue(day: number): number {
	const date = new Date(day * 86_400_000);
	return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Inverse of `monthIndexOfDayValue`: `{ year, month }` (month 1-12) for a month index. */
function monthIndexToYearMonth(monthIndex: number): { year: number; month: number } {
	const year = Math.floor(monthIndex / 12);
	const month = monthIndex - year * 12 + 1;
	return { year, month };
}

/** First day-of-month, as a `dayValue`, for a `year*12 + (month-1)` index. */
function monthStartDay(monthIndex: number): number {
	const { year, month } = monthIndexToYearMonth(monthIndex);
	return dayValue(`${year}-${String(month).padStart(2, '0')}-01`);
}

// ---------------------------------------------------------------------------
// Month bands (density-proportional vertical scale)
// ---------------------------------------------------------------------------

/** One calendar month's pixel band on the y-axis: [yTop, yBottom), newer at yTop. */
export interface MonthBand {
	year: number;
	month: number;
	/** dayValue of the 1st of this month. */
	dayStart: number;
	/** dayValue of the 1st of the following month (exclusive upper bound). */
	dayEnd: number;
	/** y of the newer (top) edge of this month's band. */
	yTop: number;
	/** y of the older (bottom) edge of this month's band. */
	yBottom: number;
}

// Month-row sizing. A month's height scales with how many rails have their
// [firstCommit, lastCommit] interval overlapping it, so months where lots of
// projects were concurrently active get more vertical room and quiet months
// compress — the direct vertical analogue of computeYearBands's density-sized
// year columns, but bucketed by MONTH (the real registry's crush concentrates
// within a single calendar year, so year granularity would be too coarse to
// resolve it) and keyed on INTERVAL OVERLAP rather than event count (a rail is
// an interval, not a point — a long-running project should make every month
// it spans feel a little busier, not just the month it started in). The axis
// stays "ordered time, not to scale": dates remain monotonic and month
// boundaries still land on real calendar points, but a month's pixel height
// reflects its density rather than a fixed calendar span. Raw heights are
// clamped to shape the ratios, then normalised so the bands sum to a target
// total plot height.
const MONTH_BASE_HEIGHT = 14; // px a month gets regardless of density
const MONTH_HEIGHT_PER_RAIL = 4; // px added per rail overlapping that month
const MONTH_MIN_HEIGHT = 20; // floor: an empty/quiet month still shows a real gap
const MONTH_MAX_HEIGHT = 85; // ceiling: one crushed month cannot dominate the axis
/** Target total plot height after normalisation — retunes the old fixed-rate
 *  scale's ~1600px "comfortably tall, scrollable" target for a banded scale
 *  where total height is a tuning constant rather than domainDays * rate. */
const MONTH_BANDS_TARGET_HEIGHT = 1550;

/**
 * Splits `[minDay, nowDay]` into one contiguous pixel band per calendar month,
 * each sized by how many `dated` rails have their `[firstCommit, lastCommit]`
 * interval overlapping that month (inclusive overlap test on day ranges, not
 * just "starts in"). Bands are returned keyed by `year*12+(month-1)` so
 * lookups are O(1) integer arithmetic; iteration order when building is
 * oldest-to-newest month, cursor running top-down from `topPad` at the NEWEST
 * month (mirrors computeYearBands's left-to-right cursor, just walked in
 * reverse chronological order to match the inverted newest-at-top axis).
 * Deterministic: pure integer month-index arithmetic, no clock or randomness.
 * Exported for testing.
 */
export function computeMonthBands(
	dated: TimelineRail[],
	minDay: number,
	nowDay: number,
	topPad: number
): Map<number, MonthBand> {
	const firstMonth = monthIndexOfDayValue(minDay);
	const lastMonth = monthIndexOfDayValue(nowDay);

	// Count rails overlapping each month, seeding every month in range so a
	// quiet month still earns a (floor-height) band rather than collapsing.
	const overlapByMonth = new Map<number, number>();
	for (let m = firstMonth; m <= lastMonth; m++) overlapByMonth.set(m, 0);
	for (const rail of dated) {
		const startMonth = monthIndexOfDayValue(dayValue(rail.firstCommit!));
		const endMonth = monthIndexOfDayValue(dayValue(rail.lastCommit ?? rail.firstCommit!));
		const lo = Math.max(firstMonth, startMonth);
		const hi = Math.min(lastMonth, endMonth);
		for (let m = lo; m <= hi; m++) overlapByMonth.set(m, overlapByMonth.get(m)! + 1);
	}

	const rawByMonth = new Map<number, number>();
	let rawTotal = 0;
	for (let m = firstMonth; m <= lastMonth; m++) {
		const raw = Math.min(
			MONTH_MAX_HEIGHT,
			Math.max(MONTH_MIN_HEIGHT, MONTH_BASE_HEIGHT + MONTH_HEIGHT_PER_RAIL * overlapByMonth.get(m)!)
		);
		rawByMonth.set(m, raw);
		rawTotal += raw;
	}

	// rawTotal is always > 0 (>= 1 month, each >= MONTH_MIN_HEIGHT), so scale is
	// finite and positive; scaling preserves the relative heights.
	const scale = MONTH_BANDS_TARGET_HEIGHT / rawTotal;
	const bands = new Map<number, MonthBand>();
	let cursor = topPad;
	for (let m = lastMonth; m >= firstMonth; m--) {
		const height = rawByMonth.get(m)! * scale;
		const { year, month } = monthIndexToYearMonth(m);
		bands.set(m, {
			year,
			month,
			dayStart: monthStartDay(m),
			dayEnd: monthStartDay(m + 1),
			yTop: cursor,
			yBottom: cursor + height
		});
		cursor += height;
	}
	return bands;
}

/**
 * Builds a `y(day)` scale from density-sized month bands: locates the band a
 * day falls in, then interpolates linearly within it by day-fraction (the
 * vertical analogue of `adoption-layout.ts`'s `xFor` sub-band interpolation).
 * The axis is inverted (newer = smaller y = top), so within a band a LARGER
 * day value (more recent) must map to a SMALLER y — the fraction of the month
 * elapsed is subtracted from yBottom, not added to yTop, matching the
 * band-builder's cursor direction (bands are laid out newest-first, cursor
 * growing downward as months get older).
 */
function makeMonthBandedY(bands: Map<number, MonthBand>, firstMonth: number, lastMonth: number) {
	return (day: number): number => {
		const monthIndex = Math.min(lastMonth, Math.max(firstMonth, monthIndexOfDayValue(day)));
		const band = bands.get(monthIndex)!;
		const frac = (day - band.dayStart) / (band.dayEnd - band.dayStart);
		// frac 0 = start of month (older, larger y / yBottom); frac 1 = start of
		// next month (newer, smaller y / yTop) — so y decreases as frac grows.
		return band.yBottom - frac * (band.yBottom - band.yTop);
	};
}

// ---------------------------------------------------------------------------
// Density sweep
// ---------------------------------------------------------------------------

/**
 * Sweeps every placed (dated) rail's `[yTop, yBottom]` interval to produce
 * contiguous, non-overlapping y-bands each tagged with how many rails were
 * concurrently "alive" in that band — a classic interval-overlap sweep over
 * start/end events. Undated rails carry no time-axis interval and are
 * excluded. An empty or single-band input still returns a valid (possibly
 * empty) band list.
 */
export function computeDensity(placed: PlacedRail[]): DensityBand[] {
	const dated = placed.filter((p) => !p.undated);
	if (dated.length === 0) return [];

	// Sweep-line events: +1 at a rail's start (yTop), -1 just after its end
	// (yBottom). Sorting all boundary ys gives the contiguous band edges.
	const boundaries = new Set<number>();
	for (const rail of dated) {
		boundaries.add(rail.yTop);
		boundaries.add(rail.yBottom);
	}
	const ys = [...boundaries].sort((a, b) => a - b);

	const bands: DensityBand[] = [];
	for (let i = 0; i < ys.length - 1; i++) {
		const yTop = ys[i];
		const yBottom = ys[i + 1];
		const count = dated.filter((r) => r.yTop <= yTop && r.yBottom >= yBottom).length;
		if (count > 0) bands.push({ yTop, yBottom, count });
	}
	return bands;
}

// ---------------------------------------------------------------------------
// Lineage paths
// ---------------------------------------------------------------------------

/**
 * Builds the extraction-lineage connectors: a quadratic bow from the app
 * rail (still running at the extraction moment) to the library rail's node,
 * anchored at `branchY = yTop(library)` — the library's birth, i.e. the
 * extraction moment. Edges whose source or target isn't among the placed
 * (dated) rails are silently dropped (mirrors `adoption-layout.ts`'s
 * ghost-edge handling).
 */
function buildLineagePaths(
	lineage: TimelineLineage[],
	placedBySlug: Map<string, PlacedRail>
): LineagePath[] {
	const paths: LineagePath[] = [];
	for (const edge of lineage) {
		const library = placedBySlug.get(edge.source);
		const app = placedBySlug.get(edge.target);
		if (!library || !app || library.undated || app.undated) continue;

		const branchY = library.yTop;
		// Clamp the departure point into the app rail's own span so the branch
		// never appears to leave the rail before it existed or after it ended.
		const departY = Math.min(Math.max(branchY, app.yTop), app.yBottom);
		const midX = (app.x + library.x) / 2;
		const path = `M ${app.x} ${departY} Q ${midX} ${branchY} ${library.x} ${branchY}`;

		paths.push({ source: edge.source, target: edge.target, note: edge.note, path, branchY });
	}
	return paths;
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

interface Interval {
	top: number;
	bottom: number;
}

/** Standard interval overlap: y grows downward, so "top" is the smaller number. */
function intervalsOverlap(a: Interval, b: Interval): boolean {
	return a.top < b.bottom && b.top < a.bottom;
}

/**
 * Assigns each dated rail the leftmost column whose occupied (padded)
 * y-intervals don't overlap it — a swapped-axis greedy first-fit. Rails are
 * visited in `[yTop asc, durationDays desc, slug asc]` order so the visually
 * dominant recent cluster lays out first and packs tightly to the left; the
 * slug tiebreak keeps the result deterministic regardless of input order.
 */
function packColumns(rails: PlacedRail[], laneGap: number): void {
	const ordered = [...rails].sort(
		(a, b) =>
			a.yTop - b.yTop ||
			(b.durationDays ?? 0) - (a.durationDays ?? 0) ||
			a.slug.localeCompare(b.slug)
	);

	const columns: Interval[][] = [];
	for (const rail of ordered) {
		const padded: Interval = { top: rail.yTop - laneGap / 2, bottom: rail.yBottom + laneGap / 2 };

		let column = columns.findIndex(
			(occupied) => !occupied.some((iv) => intervalsOverlap(iv, padded))
		);
		if (column === -1) {
			column = columns.length;
			columns.push([]);
		}
		columns[column].push(padded);
		rail.column = column;
		rail.x = 0; // x is resolved by the caller once columnCount is known.
	}
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Computes the full timeline layout: scale, packing, ticks, lineage
 * connectors and density bands. A pure function of its inputs — no clock
 * reads, no randomness, no DOM. Identical `(rails, lineage, now, geo,
 * expand)` always produces byte-identical output, independent of the order
 * `rails` arrives in.
 *
 * `expand` is a client-only affordance (stretches one year's day-band for
 * legibility) wired up in a later build step; accepted here for API shape
 * but not yet implemented — passing it currently has no effect.
 */
export function computeTimelineLayout(
	rails: TimelineRail[],
	lineage: TimelineLineage[],
	now: string,
	geo: TimelineGeometry,
	expand?: { year: number; factor: number }
): TimelineLayoutResult {
	void expand; // wired up in a later build step (zoom/expand); accepted now for API shape only
	const dated = rails.filter((r) => r.firstCommit !== null);
	const undated = rails.filter((r) => r.firstCommit === null);

	const nowDay = dayValue(now);

	if (dated.length === 0) {
		const height = geo.topPad + geo.bottomPad;
		// Undated rails still park off-axis even with no dated rails at all.
		const placedUndated = packUndated(undated, geo, 0);
		return {
			placed: placedUndated,
			ticks: [],
			lineagePaths: [],
			density: [],
			nowY: geo.topPad,
			columnCount: 0,
			width: geo.width,
			height
		};
	}

	const minDay = Math.min(...dated.map((r) => dayValue(r.firstCommit!)));
	const firstMonth = monthIndexOfDayValue(minDay);
	const lastMonth = monthIndexOfDayValue(nowDay);
	const monthBands = computeMonthBands(dated, minDay, nowDay, geo.topPad);
	const y = makeMonthBandedY(monthBands, firstMonth, lastMonth);

	const placed: PlacedRail[] = dated.map((rail) => {
		const firstDay = dayValue(rail.firstCommit!);
		const lastDay = dayValue(rail.lastCommit ?? rail.firstCommit!);
		// firstCommit is a project's inception (chronologically the OLDER date;
		// larger y, further down the chart), lastCommit its most recent activity
		// (chronologically NEWER; smaller y, closer to nowY at the top). y() maps
		// larger day values to smaller y, so yTop (the visually topmost, smaller
		// y edge) is y(lastDay), and yBottom is y(firstDay).
		const yTopRaw = y(lastDay);
		const yBottomRaw = y(firstDay);
		const yBottom = Math.max(yBottomRaw, yTopRaw + geo.minRailHeight);

		return {
			...rail,
			column: 0,
			x: 0,
			yTop: yTopRaw,
			yBottom,
			undated: false
		};
	});

	packColumns(placed, geo.laneGap);

	const columnCount = placed.length === 0 ? 0 : Math.max(...placed.map((p) => p.column)) + 1;
	for (const rail of placed) {
		rail.x = geo.leftGutter + rail.column * geo.columnWidth;
	}

	const placedBySlug = new Map(placed.map((p) => [p.slug, p]));
	const lineagePaths = buildLineagePaths(lineage, placedBySlug);
	const density = computeDensity(placed);
	const ticks = computeYearTicks(minDay, nowDay, y);

	const contentBottom = placed.reduce((max, p) => Math.max(max, p.yBottom), geo.topPad);
	const height = contentBottom + geo.bottomPad;

	const placedUndated = packUndated(undated, geo, columnCount);

	return {
		placed: [...placed, ...placedUndated],
		ticks,
		lineagePaths,
		density,
		nowY: geo.topPad,
		columnCount,
		width: geo.width,
		height
	};
}

/**
 * Parks undated rails off the time axis entirely, in a dedicated set of
 * columns beyond `columnCount`, stacked top-down with the same `minRailHeight`
 * rhythm. Not exercised by current data (every project is dated today), but
 * required by the type and reachable once a `hide`-filtered or newly-authored
 * project lacks commit dates.
 */
function packUndated(
	rails: TimelineRail[],
	geo: TimelineGeometry,
	columnCount: number
): PlacedRail[] {
	const ordered = [...rails].sort((a, b) => a.slug.localeCompare(b.slug));
	return ordered.map((rail, index) => {
		const yTop = geo.topPad + index * (geo.minRailHeight + geo.laneGap);
		const yBottom = yTop + geo.minRailHeight;
		return {
			...rail,
			column: columnCount,
			x: geo.leftGutter + columnCount * geo.columnWidth,
			yTop,
			yBottom,
			undated: true
		};
	});
}
