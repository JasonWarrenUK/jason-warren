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
export function getHeroPool(
	now: number,
	projectList: Project[] = projects
): Project[] {
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

// ---------------------------------------------------------------------------
// Filters — designed to be composable via the filterable index
// ---------------------------------------------------------------------------

export interface ProjectFilters {
	role?: ProjectRole;
	status?: ProjectStatus;
	kind?: ProjectKind;
	tag?: string;
}

export function filterProjects(filters: ProjectFilters): Project[] {
	return projects.filter((p) => {
		if (filters.role !== undefined) {
			if (p.contribution.role !== filters.role) return false;
		}
		if (filters.status !== undefined) {
			if (p.status !== filters.status) return false;
		}
		if (filters.kind !== undefined) {
			if (p.kind !== filters.kind) return false;
		}
		if (filters.tag !== undefined) {
			const match = filters.tag.toLowerCase();
			if (!p.tags.some((t) => t.label.toLowerCase().includes(match))) return false;
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
