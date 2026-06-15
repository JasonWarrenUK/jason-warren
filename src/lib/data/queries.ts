/**
 * Query helpers for the project registry.
 * All functions are pure and take the projects array as input
 * so they can be tested and composed freely.
 */

import type { Project, ProjectRole, ProjectSlug, ProjectStatus, ProjectKind, TagKind } from './types.js';
import { projects } from './index.js';

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getBySlug(slug: ProjectSlug): Project | undefined {
	return projects.find((p) => p.slug === slug);
}

export function getFlagships(): Project[] {
	return projects.filter((p) => p.flagship === true);
}

export function getFeatured(): Project[] {
	return projects.filter((p) => p.featured);
}

export function getAllProjects(): Project[] {
	return projects;
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
 * Key order: language → framework → domain → runtime.
 */
export function getTagsByKind(): Record<TagKind, string[]> {
	const buckets: Record<TagKind, Set<string>> = {
		language: new Set(),
		framework: new Set(),
		domain: new Set(),
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
		domain: [...buckets.domain].sort(),
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
