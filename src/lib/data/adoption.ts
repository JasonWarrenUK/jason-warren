/**
 * Toolkit adoption: when each technology first entered the work.
 *
 * Pure derivation over the project registry, in the style of queries.ts and
 * graph.ts. For every tag, finds the earliest project that uses it (by
 * commitAnyRoot) and reads that as the adoption date. Deterministic: ties break
 * on date then slug, so prerender output never drifts between builds.
 *
 * Adoption dates ride on project.commitAnyRoot, which is seeded provisionally in
 * sources.json until `scripts/check-drift.js --update` writes the true root
 * dates. The provisional flag is surfaced to the UI by the route loader.
 */

import { projects } from './index.js';
import { techRelationships } from './tech-relationships.js';
import { techOverlays, hiddenTechLabels, SURFACE_KINDS } from './tech-overlays.js';
import type { ProjectSlug, TagKind } from './types.js';

export interface TechAdoption {
	/** Tag label, e.g. "TypeScript". */
	label: string;
	/** Tag kind of the introducing project, used for colour mapping. */
	kind: TagKind;
	/** Adoption year (YYYY): the earliest of the curated floor and the derived date. */
	firstYear: number;
	/** ISO date (YYYY-MM-DD) of adoption: the earliest of the curated floor and the derived date. */
	firstDate: string;
	/** The earliest project carrying this tag (deterministic tiebreak). */
	firstProjectSlug: ProjectSlug;
	/** The earliest project's display name. */
	firstProjectName: string;
	/** How many projects use this tag (drives dot weight). */
	projectCount: number;
	/** 'derived' when repo evidence anchors the date; 'curated' when the authored floor predates any repo. */
	dateSource: 'curated' | 'derived';
}

/**
 * Authored first-used floor dates, derived from the tech overlays (the single
 * authoring surface for per-tech data; see tech-overlays.ts for the entries
 * and their rationale). A curated entry records history that predates any
 * tracked repo; it acts as a floor, not a trump. When a project carrying the
 * tag has a commitAnyRoot earlier than or equal to the curated date, the
 * derived date wins so drift keeps the timeline honest as repos sync.
 */
export const CURATED_FIRST_USED: Record<string, string> = Object.fromEntries(
	techOverlays
		.filter((overlay) => overlay.firstUsed !== undefined)
		.map((overlay) => [overlay.label, overlay.firstUsed as string])
);

/**
 * The kinds that read as a "toolkit" timeline: declared once in
 * `SURFACE_KINDS` (tech-overlays.ts) alongside the map's, so the two surfaces'
 * scopes can be compared in one place rather than inferred from two modules
 * (4QU.8). Callers can still widen this per call.
 */
const DEFAULT_KINDS: readonly TagKind[] = SURFACE_KINDS.toolkit;

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
 * included only when at least one project carrying it has a commitAnyRoot; tags
 * with no dated project are omitted rather than faked.
 */
export function getTechAdoption(opts?: { kinds?: TagKind[] }): TechAdoption[] {
	const kinds = new Set<TagKind>(opts?.kinds ?? DEFAULT_KINDS);
	const byLabel = new Map<string, AdoptionAccumulator>();
	// Techs authored as hidden from the toolkit never accumulate, so their
	// projects' counts and dates leave no trace on the timeline.
	const hidden = hiddenTechLabels('toolkit');

	for (const project of projects) {
		// Dedupe labels within a project so a tag listed under two in-scope kinds
		// (e.g. both language and framework) counts the project once.
		const seenInProject = new Set<string>();
		for (const tag of project.tags) {
			if (!kinds.has(tag.kind)) continue;
			if (hidden.has(tag.label)) continue;
			if (seenInProject.has(tag.label)) continue;
			seenInProject.add(tag.label);

			// Prefer the tag's own introduction date over the repo's inception —
			// a tech can enter a long-lived repo years after the repo started
			// (e.g. migrating to Svelte 5 partway through a project's life), and
			// dating every tag to the repo's birth silently back-dates it.
			const date = project.detectedTechFirstSeen?.[tag.label] ?? project.commitAnyRoot;

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
		// The curated date is a floor: it survives only when it predates any repo
		// evidence. Derived evidence (earliest commitAnyRoot among carrying projects)
		// wins whenever it is earlier than or equal to the floor, so synced repos
		// keep the timeline honest without hand-editing. ISO strings compare
		// correctly with <=.
		const curated = CURATED_FIRST_USED[entry.label];
		const derived = entry.firstDate || undefined; // '' means no dated project
		if (curated === undefined && derived === undefined) continue;
		const useDerived = derived !== undefined && (curated === undefined || derived <= curated);
		const firstDate = useDerived ? derived : (curated as string);
		adoption.push({
			label: entry.label,
			kind: entry.kind,
			firstYear: Number(firstDate.slice(0, 4)),
			firstDate,
			firstProjectSlug: entry.firstProjectSlug,
			firstProjectName: entry.firstProjectName,
			projectCount: entry.projectCount,
			dateSource: useDerived ? 'derived' : 'curated'
		});
	}

	return sortAdoption(adoption);
}

/**
 * A directed lineage edge as a lookup key. The NUL separator cannot occur
 * inside a tag label, so the key can never collide with a label that happens
 * to contain the separator text.
 */
function lineageKey(source: string, target: string): string {
	return `${source}\0${target}`;
}

/**
 * A same-date pair directly linked by lineage (e.g. HTML and CSS, both floored
 * to the same curated date) must still order parent before child — otherwise
 * a downstream consumer that reads this array as "processed in order" (the
 * adoption-timeline layout's lane assignment) can place the parent after its
 * own child, since nothing else in this flat list encodes the edge direction.
 *
 * A Set of directed edges, not a target→parent Map: a child with several
 * authored parents (CSS follows both HTML and Ink) would otherwise keep only
 * whichever edge appears last, silently un-ordering the pair the earlier edge
 * links.
 */
const directLineage = new Set<string>(
	techRelationships.map((rel) => lineageKey(rel.source, rel.target))
);

/**
 * Ties are resolved by a topological pass within each date group rather than by
 * a pairwise comparator. A comparator cannot express this: with three same-date
 * techs in a chain (C# → .NET 8 → ASP.NET Core all land on 2024-11-12) the
 * relation is non-transitive, so the result depended on the order Array.sort
 * happened to visit the pairs, and an unrelated change to list membership could
 * silently flip it.
 *
 * Within a date group a label is emitted once every same-date lineage parent it
 * has is already emitted, with alphabetical order breaking the remaining ties.
 * A cycle among same-date labels cannot deadlock the pass: when no candidate is
 * ready, the alphabetically-first remaining label is emitted anyway.
 */
function sortAdoption(adoption: TechAdoption[]): TechAdoption[] {
	const byDate = new Map<string, TechAdoption[]>();
	for (const entry of adoption) {
		const group = byDate.get(entry.firstDate);
		if (group) group.push(entry);
		else byDate.set(entry.firstDate, [entry]);
	}

	const sorted: TechAdoption[] = [];
	for (const date of [...byDate.keys()].sort()) {
		// `remaining` stays alphabetically sorted, so the first ready candidate is
		// also the alphabetically-first one.
		const remaining = (byDate.get(date) as TechAdoption[]).sort((a, b) =>
			a.label.localeCompare(b.label)
		);

		while (remaining.length > 0) {
			let index = remaining.findIndex(
				(candidate) =>
					!remaining.some(
						(other) =>
							other !== candidate && directLineage.has(lineageKey(other.label, candidate.label))
					)
			);
			// Cycle among same-date labels: emit alphabetically rather than hang.
			if (index === -1) index = 0;
			sorted.push(remaining.splice(index, 1)[0]);
		}
	}

	return sorted;
}
