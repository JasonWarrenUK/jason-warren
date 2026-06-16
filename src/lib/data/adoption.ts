/**
 * Toolkit adoption: when each technology first entered the work.
 *
 * Pure derivation over the project registry, in the style of queries.ts and
 * graph.ts. For every tag, finds the earliest project that uses it (by
 * firstCommit) and reads that as the adoption date. Deterministic: ties break
 * on date then slug, so prerender output never drifts between builds.
 *
 * Adoption dates ride on project.firstCommit, which is seeded provisionally in
 * sources.json until `scripts/check-drift.js --update` writes the true root
 * dates. The provisional flag is surfaced to the UI by the route loader.
 */

import { projects } from './index.js';
import type { ProjectSlug, TagKind } from './types.js';

export interface TechAdoption {
	/** Tag label, e.g. "TypeScript". */
	label: string;
	/** Tag kind of the introducing project, used for colour mapping. */
	kind: TagKind;
	/** Earliest year (YYYY) any project carrying this tag was started. */
	firstYear: number;
	/** ISO date (YYYY-MM-DD) of that earliest first commit. */
	firstDate: string;
	/** The project that introduced this technology (deterministic tiebreak). */
	firstProjectSlug: ProjectSlug;
	/** The introducing project's display name. */
	firstProjectName: string;
	/** How many projects use this tag (drives dot weight). */
	projectCount: number;
}

/**
 * The kinds that read as a "toolkit" timeline by default: the languages,
 * frameworks, and runtimes a developer reaches for. Callers can widen this.
 */
const DEFAULT_KINDS: TagKind[] = ['language', 'framework', 'runtime'];

interface AdoptionAccumulator {
	label: string;
	kind: TagKind;
	firstDate: string;
	firstProjectSlug: ProjectSlug;
	firstProjectName: string;
	projectCount: number;
}

/**
 * Technologies ordered by adoption date (earliest first), then label. A tag is
 * included only when at least one project carrying it has a firstCommit; tags
 * with no dated project are omitted rather than faked.
 */
export function getTechAdoption(opts?: { kinds?: TagKind[] }): TechAdoption[] {
	const kinds = new Set<TagKind>(opts?.kinds ?? DEFAULT_KINDS);
	const byLabel = new Map<string, AdoptionAccumulator>();

	for (const project of projects) {
		const date = project.firstCommit;
		// Dedupe labels within a project so a tag listed under two in-scope kinds
		// (e.g. both language and framework) counts the project once.
		const seenInProject = new Set<string>();
		for (const tag of project.tags) {
			if (!kinds.has(tag.kind)) continue;
			if (seenInProject.has(tag.label)) continue;
			seenInProject.add(tag.label);

			const existing = byLabel.get(tag.label);
			if (existing) {
				existing.projectCount += 1;
				// Earlier date wins; equal dates break on slug for stable ordering.
				if (
					date !== undefined &&
					(date < existing.firstDate ||
						(date === existing.firstDate && project.slug < existing.firstProjectSlug))
				) {
					existing.firstDate = date;
					existing.firstProjectSlug = project.slug;
					existing.firstProjectName = project.name;
					existing.kind = tag.kind;
				}
				continue;
			}

			byLabel.set(tag.label, {
				label: tag.label,
				kind: tag.kind,
				// Undated projects seed the accumulator but cannot anchor a date;
				// an empty string sorts before any ISO date, so a later dated
				// project will always overwrite it.
				firstDate: date ?? '',
				firstProjectSlug: project.slug,
				firstProjectName: project.name,
				projectCount: 1
			});
		}
	}

	const adoption: TechAdoption[] = [];
	for (const entry of byLabel.values()) {
		if (entry.firstDate === '') continue; // no dated project carries this tag
		adoption.push({
			label: entry.label,
			kind: entry.kind,
			firstYear: Number(entry.firstDate.slice(0, 4)),
			firstDate: entry.firstDate,
			firstProjectSlug: entry.firstProjectSlug,
			firstProjectName: entry.firstProjectName,
			projectCount: entry.projectCount
		});
	}

	return adoption.sort(
		(a, b) => a.firstDate.localeCompare(b.firstDate) || a.label.localeCompare(b.label)
	);
}
