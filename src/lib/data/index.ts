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
 * To add a project to the public site: add it to sources.json via drift update.
 * To exclude a repo: use `drift exclude <slug>` (writes to excluded.json).
 * To author rich content: create src/lib/data/projects/<slug>.ts.
 *
 * WRITE-ISOLATION CONTRACT (enforced by check-drift.js):
 *   drift update          -> writes ONLY sources.json
 *   drift accept/accept-all -> writes ONLY overrides.json
 *   drift exclude         -> writes ONLY excluded.json
 *   NOTHING auto-writes   -> projects/*.ts
 */

import sourcesManifest from './sources.json';
import overridesManifest from './overrides.json';
import excludedManifest from './excluded.json';
import inProgressManifest from './in-progress.json';
import { defaultProjectFromManifest, mergeAuthored } from './defaults.js';
import type { Project, AuthoredProject, ProjectMetrics, InProgressEntry } from './types.js';

export type { Project };
export * from './types.js';

/**
 * One synced fingerprint from the drift manifest. Every field is optional: the
 * manifest is populated incrementally by `drift sync`, so a freshly added repo
 * may only carry a subset of fields until the next full sync.
 *
 * Canonical contract: `scripts/sources.schema.json` (`$defs/SyncedSource`).
 * The engine validates every record against that schema before writing sources.json.
 * Any new field must be added to the schema first — the validation gate enforces this.
 *
 * Field naming mirrors ProjectMetrics exactly; `commitsAll` is omitted here
 * because it is produced by the curation gate, not stored in the manifest.
 */
export interface SyncedSource {
	head?: string;
	// Ref the fingerprint was measured against (resolved default branch, or 'HEAD' fallback).
	// Metadata only; excluded from drift comparison and used for the HEAD-fallback advisory.
	measuredRef?: string;
	// Commit grid
	commits?: number;
	commitsRecentAll?: number;
	commitsMine?: number;
	commitsRecent?: number;
	// Dates
	lastCommit?: string;
	firstCommit?: string;
	// Languages (advisory; not overlaid onto tags but now also fed to inferTags)
	languages?: string[];
	// Codebase size
	linesOfCode?: number;
	// Churn grid (Jason-only / all-authors × lifetime / recent × added/removed)
	linesAdded?: number;
	linesRemoved?: number;
	linesAddedAll?: number;
	linesRemovedAll?: number;
	linesAddedRecent?: number;
	linesRemovedRecent?: number;
	linesAddedRecentAll?: number;
	linesRemovedRecentAll?: number;
	// Repo identity and dependency-manifest fields (Phase 2 / Phase 6)
	remote?: string;
	runtime?: string[];
	database?: string[];
	framework?: string[];
}

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
 */
type SlugOverrides = Partial<Record<keyof ProjectMetrics, FieldOverride>> & {
	lastCommit?: FieldOverride<string>;
	firstCommit?: FieldOverride<string>;
	_note?: string;
};

const overrides = overridesManifest.overrides as Record<string, SlugOverrides>;

// ---------------------------------------------------------------------------
// Provisional lookup: public-only in-progress values
//
// Entries with visibility: 'local' are CLI-only and never surface on the site.
// The precedence contract in withSyncedMetrics: override > synced > provisional > authored.
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
 * Precedence: override > synced > base (authored or default).
 *
 * ### Curation gate — commit headline
 *
 * - solo: headline = all-authors lifetime count (synced.commits). No commitsAll context.
 * - lead / collaborator: headline = Jason's count (synced.commitsMine). All-authors total
 *   exposed as commitsAll for "N mine of M total" UI.
 */
function withSyncedMetrics(project: Project): Project {
	const synced = sources[project.slug];
	const ov = overrides[project.slug];
	const provisional = provisionalBySlug[project.slug];

	// Return unchanged only when synced data, manual overrides, and provisional values are all absent.
	if (!synced && !ov && !provisional) return project;

	// The base project's metrics come from the authored overlay (or are absent for
	// manifest-only projects). withSyncedMetrics adds the synced numbers on top.
	const authored = project.metrics;
	const isSolo = project.contribution.role === 'solo';

	// Role-keyed commit headline
	const headlineCommits = isSolo
		? (synced?.commits ?? authored?.commits)
		: (synced?.commitsMine ?? authored?.commits);
	const contextCommits = isSolo ? undefined : (synced?.commits ?? undefined);

	// Provisional field accessor: returns the in-progress tracked value for a metric
	// field, or undefined when no provisional entry exists. Precedence: override > synced > provisional > authored.
	const prov = (field: keyof ProjectMetrics): number | undefined =>
		provisional?.tracked?.[field]?.value;

	const merged: ProjectMetrics = {
		...authored,
		commits: ov?.commits?.value ?? headlineCommits,
		commitsAll: ov?.commitsAll?.value ?? contextCommits,
		commitsRecentAll:
			ov?.commitsRecentAll?.value ??
			synced?.commitsRecentAll ??
			prov('commitsRecentAll') ??
			authored?.commitsRecentAll,
		commitsMine:
			ov?.commitsMine?.value ?? synced?.commitsMine ?? prov('commitsMine') ?? authored?.commitsMine,
		commitsRecent:
			ov?.commitsRecent?.value ??
			synced?.commitsRecent ??
			prov('commitsRecent') ??
			authored?.commitsRecent,
		linesOfCode:
			ov?.linesOfCode?.value ?? synced?.linesOfCode ?? prov('linesOfCode') ?? authored?.linesOfCode,
		linesAdded:
			ov?.linesAdded?.value ?? synced?.linesAdded ?? prov('linesAdded') ?? authored?.linesAdded,
		linesRemoved:
			ov?.linesRemoved?.value ??
			synced?.linesRemoved ??
			prov('linesRemoved') ??
			authored?.linesRemoved,
		linesAddedAll:
			ov?.linesAddedAll?.value ??
			synced?.linesAddedAll ??
			prov('linesAddedAll') ??
			authored?.linesAddedAll,
		linesRemovedAll:
			ov?.linesRemovedAll?.value ??
			synced?.linesRemovedAll ??
			prov('linesRemovedAll') ??
			authored?.linesRemovedAll,
		linesAddedRecent:
			ov?.linesAddedRecent?.value ??
			synced?.linesAddedRecent ??
			prov('linesAddedRecent') ??
			authored?.linesAddedRecent,
		linesRemovedRecent:
			ov?.linesRemovedRecent?.value ??
			synced?.linesRemovedRecent ??
			prov('linesRemovedRecent') ??
			authored?.linesRemovedRecent,
		linesAddedRecentAll:
			ov?.linesAddedRecentAll?.value ??
			synced?.linesAddedRecentAll ??
			prov('linesAddedRecentAll') ??
			authored?.linesAddedRecentAll,
		linesRemovedRecentAll:
			ov?.linesRemovedRecentAll?.value ??
			synced?.linesRemovedRecentAll ??
			prov('linesRemovedRecentAll') ??
			authored?.linesRemovedRecentAll,
		testCoverage: ov?.testCoverage?.value ?? authored?.testCoverage,
		mergedPrs: ov?.mergedPrs?.value ?? authored?.mergedPrs
	};

	for (const key of Object.keys(merged) as (keyof ProjectMetrics)[]) {
		if (merged[key] === undefined) delete merged[key];
	}

	return {
		...project,
		// Date overlay: override > synced > base default (empty string for manifest-only)
		lastCommit: ov?.lastCommit?.value ?? synced?.lastCommit ?? project.lastCommit,
		firstCommit: ov?.firstCommit?.value ?? synced?.firstCommit ?? project.firstCommit,
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

export const projects: Project[] = Object.keys(sources)
	.filter((slug) => !excludedSlugs.has(slug))
	.map((slug) =>
		withSyncedMetrics(
			mergeAuthored(defaultProjectFromManifest(slug, sources[slug]), authoredBySlug[slug])
		)
	);
