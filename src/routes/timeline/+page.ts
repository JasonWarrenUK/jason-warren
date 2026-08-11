import sources from '$lib/data/sources.json';
import { getTimelineProjects } from '$lib/data/queries.js';
import { getProjectGraph, selectLabelledSlugs } from '$lib/data/graph.js';
import { dayDiff } from '$lib/components/graph/timeline-layout.js';
import type { TimelineRail, TimelineLineage } from '$lib/components/graph/timeline-layout.js';
import type { Project } from '$lib/data/types.js';

/**
 * How many rails get a standing (always-visible) label on the timeline. Lower
 * than the map's `MAP_LABEL_COUNT` (10) because the timeline packs rails into
 * a narrower, denser column grid than the map's force layout — see
 * `TimelineChart.svelte`'s `.timeline__label` opacity gating, which mirrors
 * `ProjectMap.svelte`'s `--labelled`/`--pinned`/hover idiom so only a handful
 * of names compete for space at rest and the rest reveal on hover/focus/pin.
 */
const TIMELINE_LABEL_COUNT = 6;

/** A project counts as still-live once its most recent commit falls within this many days of `now`. */
const STILL_LIVE_WINDOW_DAYS = 56;

/**
 * Still-live rule (deterministic, honest — metrics only expose lifetime +
 * trailing-4-week totals, no per-commit histogram): a project reads as
 * still-live when it is unretired and either being built or running
 * somewhere AND its last commit sits within `STILL_LIVE_WINDOW_DAYS` of
 * build-time `now`, OR it has recorded commits in the trailing four weeks
 * (`metrics.commitsRecent`) — the one signal the manifest carries that
 * directly means "touched very recently".
 */
function isStillLive(project: Project, nowIso: string): boolean {
	const stageIsActive =
		!project.retired && (project.progress === 'in-progress' || project.deployed);
	const recentByDate =
		stageIsActive &&
		project.lastCommit !== undefined &&
		dayDiff(project.lastCommit, nowIso) <= STILL_LIVE_WINDOW_DAYS;
	const recentByCommits = (project.metrics?.commitsRecent ?? 0) > 0;
	return recentByDate || recentByCommits;
}

export function load() {
	// Build-time now, from the last sync — byte-stable across re-runs of the
	// same build, matching the pattern in queries.ts / scoring.ts.
	const now = sources.lastSyncedAt;

	const projects = getTimelineProjects();
	const labelledSlugs = selectLabelledSlugs(projects, TIMELINE_LABEL_COUNT);

	const rails: TimelineRail[] = projects.map((project) => {
		const firstCommit = project.firstCommit ?? null;
		const lastCommit = project.lastCommit ?? null;
		return {
			slug: project.slug,
			name: project.name,
			track: project.track,
			progress: project.progress,
			released: project.released,
			retired: project.retired,
			deployed: project.deployed,
			stageProvisional: !project.trackAuthored,
			tagline: project.tagline,
			role: project.contribution.role,
			firstCommit,
			lastCommit,
			durationDays: firstCommit && lastCommit ? dayDiff(firstCommit, lastCommit) : null,
			stillLive: isStillLive(project, now),
			labelled: labelledSlugs.has(project.slug)
		};
	});

	const knownSlugs = new Set(rails.map((r) => r.slug));

	// Extraction lineages, carrying the authored `note` through (previously
	// dropped by the old +page.ts — a real bug flagged in the timeline plan).
	const lineage: TimelineLineage[] = getProjectGraph()
		.edges.filter((edge) => edge.kind === 'extraction')
		.filter((edge) => knownSlugs.has(edge.source) && knownSlugs.has(edge.target))
		.map((edge) => ({
			source: edge.source,
			target: edge.target,
			note: edge.note ?? null
		}));

	return { rails, lineage, now };
}
