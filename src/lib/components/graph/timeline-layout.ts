/**
 * Time-proportional lifespan-chart layout for /timeline.
 *
 * The vertical axis is real time, linear and proportional: `now` sits at the
 * top, older dates run downward. The horizontal axis carries no semantic
 * meaning at all — it exists purely for collision avoidance. Each project
 * becomes a vertical RAIL running from its `lastCommit` (top/newer end, its
 * most recent activity) to its `firstCommit` (bottom/older end, its
 * inception); rails are packed into the leftmost
 * column that doesn't overlap an already-placed rail, a swapped-axis greedy
 * first-fit analogous in spirit to `adoption-layout.ts`'s strip packer but
 * far simpler — this module deliberately does NOT attempt that module's
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
	status: string;
	tagline: string;
	role: string;
	/** ISO `YYYY-MM-DD`, or null when undated. */
	firstCommit: string | null;
	/** ISO `YYYY-MM-DD`, or null when undated. */
	lastCommit: string | null;
	/** Whole days between firstCommit and lastCommit; null when undated. */
	durationDays: number | null;
	stillLive: boolean;
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
	const pxPerDay = pxPerDayFor(nowDay, minDay);

	const y = (day: number): number => geo.topPad + (nowDay - day) * pxPerDay;

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
 * Fixed pixels-per-day: the rate that gives the real registry's domain (2023-
 * 03-23 → today, a little over three years) a total plot height inside the
 * "comfortably tall, scrollable" 1400-1800px range the plan targets. A
 * genuinely linear, proportional scale (the brief's explicit requirement,
 * unlike the adoption chart's density-warped year bands) means this rate is
 * constant regardless of the actual domain span — a day always occupies the
 * same vertical pixels on every render, so shrinking or growing the dated
 * domain (filtering to one year, or the registry ageing another decade)
 * changes the total plot height rather than silently renormalising every
 * rail's apparent pace to fit a fixed box.
 */
const PX_PER_DAY = 1600 / (3.5 * 365);
/** Domain-day bounds: below `MIN_PLOT_DAYS` the fixed rate above is dropped in
 *  favour of stretching to a usable minimum height; above `MAX_PLOT_DAYS` it is
 *  dropped in favour of compressing to a maximum, so a pathological (near-zero
 *  or multi-decade) domain still renders sanely instead of collapsing to a
 *  sliver or growing without bound. */
const MIN_PLOT_DAYS = 14;
const MAX_PLOT_HEIGHT = 6000;

/**
 * Pixels-per-day for a given dated domain: `PX_PER_DAY` in the ordinary case,
 * clamped only at the extremes described above. Kept as a small pure helper
 * (rather than a closure capturing mutable state) so `y()` stays a simple
 * function of `day` alone within `computeTimelineLayout`.
 */
function pxPerDayFor(nowDay: number, minDay: number): number {
	const domainDays = Math.max(1, nowDay - minDay);
	if (domainDays < MIN_PLOT_DAYS) return (MIN_PLOT_DAYS * PX_PER_DAY) / domainDays;
	const rate = PX_PER_DAY;
	return domainDays * rate > MAX_PLOT_HEIGHT ? MAX_PLOT_HEIGHT / domainDays : rate;
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
