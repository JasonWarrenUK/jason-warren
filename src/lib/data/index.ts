/**
 * Central project registry.
 *
 * The manifest (sources.json) is the source of WHICH projects exist: every
 * non-excluded entry in sources.json.sources appears on the public site.
 * Authored .ts files (src/lib/data/projects/*.ts) are optional overlays,
 * keyed by slug. The registry inversion means:
 *
 *   git -> sources.json -> manifest-derived Project (defaults.ts)
 *                       + optional .ts overlay (mergeAuthored)
 *                       + live metrics/dates (withSyncedMetrics)
 *
 * To add a project to the public site: add it to sources.json via drift sync.
 * To exclude a repo: use `drift hide <slug>` (writes to excluded.json).
 * To author rich content: create src/lib/data/projects/<slug>.ts, or run
 * `drift author <slug>` to scaffold it.
 *
 * WRITE-ISOLATION CONTRACT (enforced by check-drift.js):
 *   drift sync             -> writes ONLY sources.json
 *   drift keep/keep-all    -> writes ONLY overrides.json
 *   drift hide             -> writes ONLY excluded.json
 *   drift author/flag/tag/relate project
 *                           -> writes ONLY projects/<slug>.ts, by inserting
 *                              or flipping named properties (TS-compiler
 *                              splice); no verb rewrites editorial content
 */

import sourcesManifest from './sources.json';
import overridesManifest from './overrides.json';
import excludedManifest from './excluded.json';
import inProgressManifest from './in-progress.json';
import { defaultProjectFromManifest, mergeAuthored, inferTechFirstSeen } from './defaults.js';
import { getTechKindOverrides } from './tech-overlays.js';
import type {
	Project,
	AuthoredProject,
	ProjectMetrics,
	InProgressEntry,
	SyncedSource
} from './types.js';

export type { Project };
export * from './types.js';

// SyncedSource now lives in types.ts alongside the rest of the data model, so
// ProjectMetrics can derive its synced half from it. Re-exported by the
// `export * from './types.js'` above, keeping every existing import path valid.

const sources = sourcesManifest.sources as Record<string, SyncedSource>;

/**
 * One manual override entry for a single field. Carries the pinned value alongside
 * the synced baseline at the time the override was authored, so the drift report
 * can flag when the ground truth has moved without silently overwriting the pin.
 */
interface FieldOverride<T = number> {
	value: T;
	syncedWhenSet: T | null;
	syncedField?: string;
	_setNote?: string;
}

/**
 * All manual overrides for one project slug. Keys mirror ProjectMetrics fields
 * plus the two top-level date fields. The `_note` key is for human annotation only.
 *
 * `commitsHeadlineScope` is excluded: it is not a measurement but a record of
 * which scope the gate picked, so overriding it would let a pin claim a figure
 * came from a scope it did not.
 */
type SlugOverrides = Partial<
	Record<Exclude<keyof ProjectMetrics, 'commitsHeadlineScope'>, FieldOverride>
> & {
	commitAnyLast?: FieldOverride<string>;
	commitAnyRoot?: FieldOverride<string>;
	_note?: string;
};

const overrides = overridesManifest.overrides as Record<string, SlugOverrides>;

// ---------------------------------------------------------------------------
// Provisional lookup: public-only in-progress values
//
// Entries with visibility: 'local' are CLI-only and never surface on the site.
// The precedence contract in withSyncedMetrics: override > synced > provisional.
// Once a branch lands and `drift sync` picks up the real numbers, synced naturally
// shadows the provisional value, making promotion self-healing (no stale value leaks).
// ---------------------------------------------------------------------------

const provisionalBySlug: Record<string, InProgressEntry> = Object.fromEntries(
	Object.entries(inProgressManifest.inProgress as Record<string, InProgressEntry>).filter(
		([, entry]) => entry.visibility === 'public'
	)
);

// ---------------------------------------------------------------------------
// Authored overlay discovery via import.meta.glob
//
// Discovers every src/lib/data/projects/*.ts module at build time (Vite).
// Each module contains exactly one named export (a Project or AuthoredProject
// literal). We key the overlay by its own .slug field, NOT by the camelCase
// export binding, so the slug is always canonical.
//
// Build-time guards catch:
//   - a module with zero or multiple named exports
//   - a module whose export lacks a .slug field
//   - two modules claiming the same slug
// ---------------------------------------------------------------------------

const authoredModules = import.meta.glob(
	['./projects/*.ts', '!./projects/*-test.ts', '!./projects/*.test.ts'],
	{ eager: true }
);

const authoredBySlug: Record<string, AuthoredProject> = {};

for (const [filePath, mod] of Object.entries(authoredModules)) {
	const exports = Object.values(mod as Record<string, unknown>).filter(
		(v) => v !== null && typeof v === 'object'
	);

	if (exports.length === 0) {
		throw new Error(
			`[registry] ${filePath} has no named exports. ` +
				`Every project file must export exactly one AuthoredProject object.`
		);
	}
	if (exports.length > 1) {
		throw new Error(
			`[registry] ${filePath} has ${exports.length} named exports. ` +
				`Only one export per file is allowed.`
		);
	}

	const overlay = exports[0] as Record<string, unknown>;
	const slug = overlay['slug'];

	if (typeof slug !== 'string' || !slug) {
		throw new Error(
			`[registry] ${filePath}: exported object is missing a string 'slug' field. ` +
				`Add slug: '...' to the exported object.`
		);
	}

	if (authoredBySlug[slug]) {
		throw new Error(
			`[registry] Duplicate slug '${slug}' in ${filePath}. ` +
				`Each slug must appear in exactly one project file.`
		);
	}

	authoredBySlug[slug] = overlay as unknown as AuthoredProject;
}

// ---------------------------------------------------------------------------
// Exclusion
// ---------------------------------------------------------------------------

const excludedSlugs = new Set<string>(excludedManifest.slugs);

// ---------------------------------------------------------------------------
// withSyncedMetrics — overlays live metrics and dates onto a merged project
// ---------------------------------------------------------------------------

/**
 * Overlays synced git metrics from sources.json onto a project object. The
 * base project is now manifest-derived (not authored), so synced data is always
 * present for every registry entry; the early-return path is only reached for
 * slugs in sources.json that somehow lack a synced entry (should not occur after
 * a full drift update but is handled gracefully).
 *
 * Precedence: override > synced > provisional. Overlays never carry metrics or
 * dates, so there is no authored tier.
 *
 * ### Curation gate — commit headline
 *
 * `commitsAny` and `commitsMe` are pure scoped facts: each always means exactly
 * what its name says, whatever the project's role. The role-keyed *display*
 * value lives in `commitsHeadline`, with `commitsHeadlineScope` recording which
 * scope was chosen:
 *
 * - solo: headline = all-authors lifetime count, scope 'any'. Jason is all
 *   authors, so there is no "of N total" context to show.
 * - lead / collaborator: headline = Jason's count, scope 'me'. `commitsAny`
 *   carries the all-authors total for the "N mine of M total" UI.
 *
 * Previously the headline was written into `commitsAny` itself, so that field
 * silently held Jason-only data on team projects. Consumers reading it for a
 * scoped fact (map node sizing) were comparing all-authors totals on solo
 * projects against Jason-only totals on team ones.
 */
function withSyncedMetrics(project: Project): Project {
	const synced = sources[project.slug];
	const ov = overrides[project.slug];
	const provisional = provisionalBySlug[project.slug];

	// Return unchanged only when synced data, manual overrides, and provisional values are all absent.
	if (!synced && !ov && !provisional) return project;

	const isSolo = project.contribution.role === 'solo';

	// Provisional field accessor: returns the in-progress tracked value for a metric
	// field, or undefined when no provisional entry exists. Precedence: override > synced > provisional.
	const prov = (field: keyof ProjectMetrics): number | undefined =>
		provisional?.tracked?.[field]?.value;

	const merged: ProjectMetrics = {
		commitsAny: ov?.commitsAny?.value ?? synced?.commitsAny ?? prov('commitsAny'),
		commitsHeadline:
			ov?.commitsHeadline?.value ??
			(isSolo
				? (ov?.commitsAny?.value ?? synced?.commitsAny ?? prov('commitsAny'))
				: (ov?.commitsMe?.value ?? synced?.commitsMe ?? prov('commitsMe'))),
		commitsHeadlineScope: isSolo ? 'any' : 'me',
		commitsAnyRecent:
			ov?.commitsAnyRecent?.value ?? synced?.commitsAnyRecent ?? prov('commitsAnyRecent'),
		commitsMe: ov?.commitsMe?.value ?? synced?.commitsMe ?? prov('commitsMe'),
		commitsMeRecent:
			ov?.commitsMeRecent?.value ?? synced?.commitsMeRecent ?? prov('commitsMeRecent'),
		linesAny: ov?.linesAny?.value ?? synced?.linesAny ?? prov('linesAny'),
		linesMeAdded: ov?.linesMeAdded?.value ?? synced?.linesMeAdded ?? prov('linesMeAdded'),
		linesMeRemoved: ov?.linesMeRemoved?.value ?? synced?.linesMeRemoved ?? prov('linesMeRemoved'),
		linesAnyAdded: ov?.linesAnyAdded?.value ?? synced?.linesAnyAdded ?? prov('linesAnyAdded'),
		linesAnyRemoved:
			ov?.linesAnyRemoved?.value ?? synced?.linesAnyRemoved ?? prov('linesAnyRemoved'),
		linesMeAddedRecent:
			ov?.linesMeAddedRecent?.value ?? synced?.linesMeAddedRecent ?? prov('linesMeAddedRecent'),
		linesMeRemovedRecent:
			ov?.linesMeRemovedRecent?.value ??
			synced?.linesMeRemovedRecent ??
			prov('linesMeRemovedRecent'),
		linesAnyAddedRecent:
			ov?.linesAnyAddedRecent?.value ?? synced?.linesAnyAddedRecent ?? prov('linesAnyAddedRecent'),
		linesAnyRemovedRecent:
			ov?.linesAnyRemovedRecent?.value ??
			synced?.linesAnyRemovedRecent ??
			prov('linesAnyRemovedRecent')
	};

	for (const key of Object.keys(merged) as (keyof ProjectMetrics)[]) {
		if (merged[key] === undefined) delete merged[key];
	}

	// The scope describes a headline, so it must not outlive one. Left unconditional
	// it would claim a figure came from 'any' or 'me' when there is no figure, and
	// would keep `merged` permanently non-empty — handing consumers a metrics object
	// whose only key is the scope of a value that isn't there.
	if (merged.commitsHeadline === undefined) delete merged.commitsHeadlineScope;

	// Re-key the manifest's identity-keyed detectedTechFirstSeen (e.g. 'svelte-5') to
	// the tag-label-keyed form adoption.ts reads (e.g. 'Svelte 5'), via the
	// same taxonomy lookups inferTags uses. No per-label override shape exists
	// in SlugOverrides yet — this seam is deliberately ready for one (mirroring
	// commitAnyLast/commitAnyRoot above) rather than a gap; add override precedence
	// here if that's ever built.
	const detectedTechFirstSeen = synced ? inferTechFirstSeen(synced) : project.detectedTechFirstSeen;

	return {
		...project,
		// Date overlay: override > synced > base default (empty string for manifest-only)
		commitAnyLast: ov?.commitAnyLast?.value ?? synced?.commitAnyLast ?? project.commitAnyLast,
		commitAnyRoot: ov?.commitAnyRoot?.value ?? synced?.commitAnyRoot ?? project.commitAnyRoot,
		detectedTechFirstSeen,
		metrics: Object.keys(merged).length > 0 ? merged : undefined
	};
}

// ---------------------------------------------------------------------------
// The registry
//
// Object.keys(sources) order = insertion order in sources.json (deterministic).
// Site ordering comes from query sorters (getAllProjectsByInception, etc.) and
// the force-layout ring; registry order only affects the map ring seed and
// tie-breaks. This is a deliberate one-time shift vs the prior curatedProjects
// order — document it so the map diff is expected.
// ---------------------------------------------------------------------------

/**
 * Applies authored per-tech kind overrides (tech-overlays.ts) to a project's
 * merged tags. This is the SINGLE application point — running here, between
 * mergeAuthored and withSyncedMetrics, means every consumer of `projects`
 * (adoption, tech graph, stack, queries, cards) sees the same kind. An
 * override can collapse a former two-kind pair (e.g. language + runtime)
 * into one, so the result re-dedupes by (kind, label).
 */
function applyTechKindOverrides(project: Project): Project {
	const overrides = getTechKindOverrides();
	if (overrides.size === 0) return project;
	const seen = new Set<string>();
	const tags = project.tags
		.map((tag) => {
			const kind = overrides.get(tag.label) ?? tag.kind;
			return kind === tag.kind ? tag : { ...tag, kind };
		})
		.filter((tag) => {
			const key = `${tag.kind}:${tag.label}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	return { ...project, tags };
}

export const projects: Project[] = Object.keys(sources)
	.filter((slug) => !excludedSlugs.has(slug))
	.map((slug) =>
		withSyncedMetrics(
			applyTechKindOverrides(
				mergeAuthored(defaultProjectFromManifest(slug, sources[slug]), authoredBySlug[slug])
			)
		)
	);
