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
 * Authored first-used floor dates for the core toolkit. A curated entry records
 * history that predates any tracked repo (the earliest manifest firstCommit is
 * 2023); it acts as a floor, not a trump. When a project carrying the tag has a
 * firstCommit earlier than or equal to the curated date, the derived date wins
 * so drift keeps the timeline honest as repos sync. Labels must match the tag
 * labels exactly. Dates are approximate (mid-month).
 */
export const CURATED_FIRST_USED: Record<string, string> = {
	// Languages
	JavaScript: '2021-09-15',
	TypeScript: '2022-09-15',
	Python: '2022-06-15',
	Shell: '2023-06-15',
	'C#': '2024-08-15',
	Rust: '2025-08-15',
	Go: '2025-12-15',
	// Markup & styling (pre-repo history: first used years before any tracked repo)
	HTML: '2020-06-15',
	CSS: '2020-06-15',
	// Runtimes
	'Node.js': '2021-09-15',
	CPython: '2022-06-15',
	'POSIX shell': '2023-06-15',
	Bun: '2024-05-15',
	'.NET 8': '2024-08-15',
	Deno: '2025-07-15',
	// Frameworks
	React: '2022-09-15',
	Express: '2022-11-15',
	'Next.js': '2023-03-15',
	'Tailwind CSS': '2023-06-15',
	Vite: '2024-02-15',
	SvelteKit: '2024-04-15',
	FastAPI: '2024-06-15',
	'ASP.NET Core': '2024-08-15',
	'Svelte 5': '2024-10-15',
	'Tailwind CSS v4': '2025-01-15',
	Oak: '2025-07-15',
	Tauri: '2025-09-15',
	OpenTUI: '2025-10-15',
	'Bubble Tea': '2025-12-15',
	'Ink / inkjs': '2019-06-15'
};

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
		// The curated date is a floor: it survives only when it predates any repo
		// evidence. Derived evidence (earliest firstCommit among carrying projects)
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

	return adoption.sort(
		(a, b) => a.firstDate.localeCompare(b.firstDate) || a.label.localeCompare(b.label)
	);
}
