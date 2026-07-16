/**
 * Query helpers for the project registry.
 * All functions are pure and take the projects array as input
 * so they can be tested and composed freely.
 */

import type {
	Project,
	ProjectRole,
	ProjectSlug,
	ProjectStatus,
	ProjectKind,
	TagKind
} from './types.js';
import { projects } from './index.js';
import { heroScore, HERO_COUNT } from './scoring.js';

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getBySlug(slug: ProjectSlug): Project | undefined {
	return projects.find((p) => p.slug === slug);
}

/**
 * Returns the full eligible pool sorted by active-substance score (descending),
 * ready for the home-page hero to slice and rotate.
 *
 * Eligible = not archived, not uncategorised, not manually hidden.
 * Sort: pinned projects float to the top (above score), then by heroScore desc,
 * then by slug ascending as a stable tiebreaker (deterministic prerender).
 *
 * @param now - Unix timestamp (ms) for recency decay reference.
 *              Pass `Date.parse(sources.lastSyncedAt)` at build time for a
 *              byte-stable prerender that is identical across re-runs.
 * @param projectList - Override the default registry (for testing).
 */
export function getHeroPool(now: number, projectList: Project[] = projects): Project[] {
	const eligible = projectList.filter(
		(p) => p.status !== 'archived' && p.status !== 'uncategorised' && !p.hide
	);

	return [...eligible].sort((a, b) => {
		// Pinned projects always float first.
		const pinDiff = (b.pin ? 1 : 0) - (a.pin ? 1 : 0);
		if (pinDiff !== 0) return pinDiff;

		// Primary: heroScore descending.
		const scoreDiff = heroScore(b, now) - heroScore(a, now);
		if (scoreDiff !== 0) return scoreDiff;

		// Tiebreaker: slug ascending (stable, deterministic).
		return a.slug.localeCompare(b.slug);
	});
}

export { HERO_COUNT };

export function getAllProjects(): Project[] {
	return projects;
}

/** Projects sorted by most recent commit date, newest first. Projects with no date sort last. */
export function getAllProjectsByRecency(): Project[] {
	return [...projects].sort((a, b) => (b.lastCommit ?? '').localeCompare(a.lastCommit ?? ''));
}

/**
 * Projects sorted by inception, most recently started first. Falls back to
 * lastCommit, then empty, so projects without a firstCommit still place
 * deterministically.
 */
export function getAllProjectsByInception(): Project[] {
	const inception = (p: Project): string => p.firstCommit ?? p.lastCommit ?? '';
	return [...projects].sort((a, b) => inception(b).localeCompare(inception(a)));
}

/**
 * Projects eligible for the /timeline view: manually-hidden projects only are
 * excluded. Deliberately DIVERGES from `getHeroPool`, which also drops
 * archived and uncategorised projects — a timeline is a historical record,
 * and a finished/archived project is exactly what a lifespan chart wants to
 * show, so archived/uncategorised are kept here.
 *
 * Sort: inception (firstCommit, falling back to lastCommit, then empty)
 * descending — newest-started first — with slug ascending as a stable
 * tiebreaker for deterministic prerender, matching `getAllProjectsByInception`
 * and `getHeroPool`'s own tiebreak discipline.
 *
 * @param list - Override the default registry (for testing).
 */
export function getTimelineProjects(list: Project[] = projects): Project[] {
	const inception = (p: Project): string => p.firstCommit ?? p.lastCommit ?? '';
	return [...list]
		.filter((p) => !p.hide)
		.sort((a, b) => inception(b).localeCompare(inception(a)) || a.slug.localeCompare(b.slug));
}

// ---------------------------------------------------------------------------
// Filters — designed to be composable via the filterable index
// ---------------------------------------------------------------------------

export interface ProjectFilters {
	roles?: Set<ProjectRole>;
	statuses?: Set<ProjectStatus>;
	kinds?: Set<ProjectKind>;
	tags?: Set<string>;
	query?: string;
}

/**
 * Filter projects by up to four dimensions.
 *
 * Logic: AND across dimensions, OR within a dimension (a project must satisfy
 * every non-empty filter set, but matching any one value in a set is
 * sufficient). An absent or empty set means "no constraint on this dimension".
 * Tag matching is exact and case-sensitive (labels come from the curated
 * taxonomy, so free-text fuzzy matching is not needed).
 */
export function filterProjects(filters: ProjectFilters): Project[] {
	return projects.filter((p) => {
		if (filters.roles?.size) {
			if (!filters.roles.has(p.contribution.role)) return false;
		}
		if (filters.statuses?.size) {
			if (!filters.statuses.has(p.status)) return false;
		}
		if (filters.kinds?.size) {
			if (!filters.kinds.has(p.kind)) return false;
		}
		if (filters.tags?.size) {
			const projectLabels = new Set(p.tags.map((t) => t.label));
			if (![...filters.tags].some((tag) => projectLabels.has(tag))) return false;
		}
		if (filters.query) {
			const needle = filters.query.toLowerCase();
			const haystack = [p.name, p.tagline, p.blurb, p.description, ...p.tags.map((t) => t.label)]
				.join(' ')
				.toLowerCase();
			if (!haystack.includes(needle)) return false;
		}
		return true;
	});
}

// ---------------------------------------------------------------------------
// Aggregated metadata for the filter UI
// ---------------------------------------------------------------------------

/** All unique tag labels across the project registry, sorted alphabetically. */
export function getAllTags(): string[] {
	const tags = new Set<string>();
	for (const project of projects) {
		for (const tag of project.tags) {
			tags.add(tag.label);
		}
	}
	return [...tags].sort();
}

/**
 * All unique tag labels grouped by TagKind, each group sorted alphabetically.
 * Key order: language → framework → data → ai → concept → tool → runtime.
 */
export function getTagsByKind(): Record<TagKind, string[]> {
	const buckets: Record<TagKind, Set<string>> = {
		language: new Set(),
		framework: new Set(),
		data: new Set(),
		ai: new Set(),
		concept: new Set(),
		tool: new Set(),
		runtime: new Set()
	};
	for (const project of projects) {
		for (const tag of project.tags) {
			buckets[tag.kind].add(tag.label);
		}
	}
	return {
		language: [...buckets.language].sort(),
		framework: [...buckets.framework].sort(),
		data: [...buckets.data].sort(),
		ai: [...buckets.ai].sort(),
		concept: [...buckets.concept].sort(),
		tool: [...buckets.tool].sort(),
		runtime: [...buckets.runtime].sort()
	};
}

/** All unique ProjectKind values present in the registry. */
export function getAllKinds(): ProjectKind[] {
	const kinds = new Set<ProjectKind>();
	for (const project of projects) {
		kinds.add(project.kind);
	}
	return [...kinds];
}

/** All unique roles present in the registry. */
export function getAllRoles(): ProjectRole[] {
	const roles = new Set<ProjectRole>();
	for (const project of projects) {
		roles.add(project.contribution.role);
	}
	return [...roles];
}

/** All unique statuses present in the registry. */
export function getAllStatuses(): ProjectStatus[] {
	const statuses = new Set<ProjectStatus>();
	for (const project of projects) {
		statuses.add(project.status);
	}
	return [...statuses];
}
