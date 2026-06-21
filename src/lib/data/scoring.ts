/**
 * Metric-derived project scoring.
 *
 * Two signals, two surfaces:
 *
 * - heroScore: recency × substance — foregrounds work that is recent AND substantial.
 *   Used to rank the home-page hero pool. Neither a huge dormant project nor a fresh
 *   one-commit toy scores high; the winner has both mass and momentum.
 *
 * - substanceScore: effort + size, log-damped — measures how much project is here,
 *   independent of recency. Used to derive the map hub set (p85 floor) so foundational
 *   projects stay prominent even when dormant.
 *
 * No manual flags. The only escape hatches are `pin` (force-foreground) and
 * `hide` (force-exclude) on individual AuthoredProject entries.
 */

import type { Project } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Half-life for the recency decay: a project last touched this many days ago
 *  scores 0.5 × its substance (i.e. loses half its hero weight). Tune by
 *  eyeballing the hero pool after a rebuild — decrease to favour freshness
 *  more aggressively; increase to keep large older projects visible longer. */
export const HERO_HALF_LIFE_DAYS = 30;

/** Number of projects shown in the hero section at once. */
export const HERO_COUNT = 3;

/** Percentile used for the map hub floor: projects at or above this substance
 *  percentile get an enlarged minimum radius AND are always labelled. */
export const HUB_PERCENTILE = 0.85;

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/**
 * How much project is here: lifetime effort + codebase size, log-damped.
 *
 * `commitsMine` is preferred over `commits` so the score reflects your own
 * work rather than collaborator volume. Falls back gracefully when either
 * metric is absent.
 *
 * Log-damping prevents a 10× commit delta from producing a 10× score
 * difference — large projects score proportionally higher, not astronomically.
 */
export function substanceScore(p: Project): number {
	const commits = p.metrics?.commitsMine ?? p.metrics?.commits ?? 0;
	const loc = p.metrics?.linesOfCode ?? 0;
	return Math.log1p(commits) + Math.log1p(loc / 50);
}

/**
 * Recency decay: 1.0 if last touched today, halving every HERO_HALF_LIFE_DAYS.
 * Returns 0 when `lastCommit` is absent (missing date → treated as unreachable).
 *
 * @param lastCommit - ISO date string (YYYY-MM-DD) or undefined
 * @param now        - Unix timestamp (ms) for the reference point. Pass
 *                     `Date.parse(sources.lastSyncedAt)` at build time so the
 *                     output is byte-stable across re-runs of the same build.
 */
export function recencyDecay(lastCommit: string | undefined, now: number): number {
	if (!lastCommit) return 0;
	const days = Math.max(0, (now - Date.parse(lastCommit)) / 86_400_000);
	return Math.exp((-Math.LN2 / HERO_HALF_LIFE_DAYS) * days);
}

/**
 * Hero foreground signal: recent AND substantial.
 * A project must have both momentum and mass to score well.
 */
export function heroScore(p: Project, now: number): number {
	return recencyDecay(p.lastCommit, now) * substanceScore(p);
}

/**
 * The substance value at HUB_PERCENTILE across the given project list.
 * Projects whose substanceScore meets or exceeds this threshold are map hubs:
 * they receive an enlarged minimum node radius AND are always labelled.
 *
 * Returns Infinity when all projects have zero substance (no metrics available),
 * so that no project is classified as a hub in that degenerate case.
 */
export function hubThreshold(list: Project[]): number {
	if (list.length === 0) return Infinity;
	const scores = list.map(substanceScore).sort((a, b) => a - b);
	// If the entire list is zeros (no metrics at all), treat as no-hub.
	if (scores[scores.length - 1] === 0) return Infinity;
	// Nearest-rank percentile: index is the first position at or above the
	// target fraction of the sorted list. Clamped to the last valid index.
	const index = Math.min(scores.length - 1, Math.floor(HUB_PERCENTILE * scores.length));
	return scores[index];
}
