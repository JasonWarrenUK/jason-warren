/**
 * Core data model for the portfolio.
 *
 * Design principles:
 * - Discriminated unions enforce required fields per variant at compile time.
 * - ProjectSlug is a string-literal union so cross-link targets are type-checked.
 * - RelationshipKind models the engine-extraction story as first-class data.
 */

// ---------------------------------------------------------------------------
// Primitive unions
// ---------------------------------------------------------------------------

export type ProjectRole = 'solo' | 'lead' | 'collaborator';

/**
 * The stage decomposition (docs/design/colour-system.md §3). `status`
 * conflated intent, state, deployment and retirement in one field; these
 * two authored axes carry the first pair, with `deployed` derived from
 * liveUrl and `retired` an authored end-state flag on Project.
 */
export type ProjectTrack = 'exploration' | 'product';

/**
 * Whether work is happening, and nothing else. Purely observable, so it is
 * always inferred and never authored: recent commits mean `in-progress`,
 * silence means `dormant`.
 *
 * This deliberately says nothing about whether a project is finished. A
 * previous `complete` value tried to, and could not: git sees that work
 * stopped, never why. ReDoT shipped as a released GitHub Action and went quiet
 * for 302 days; Cogni simply stopped and went quiet for 147. The histories are
 * identical on that question, so any rule inferring "finished" from silence was
 * asserting something unobservable, on every quiet repo.
 *
 * Whether a project reached the world is carried separately by `released`,
 * which is orthogonal: a released project can still be maintained, and
 * unreleased work can be highly active.
 */
export type ProjectProgress = 'in-progress' | 'dormant';

export type ProjectKind = 'app' | 'game' | 'website' | 'toy' | 'library' | 'tool' | 'tui' | 'repo';

export type TagKind = 'language' | 'framework' | 'data' | 'ai' | 'concept' | 'tool' | 'runtime';

/**
 * Tag categories that seed "shared stack" map edges. `language` is deliberately
 * excluded: nearly every project shares TypeScript, so a language edge would
 * link almost the whole graph into a hairball. Runtime and framework are kept
 * but tamed by a per-category degree cap in `getSharedTechEdges`.
 */
export type EdgeCategory = Exclude<TagKind, 'language'>;

export const EDGE_CATEGORIES: EdgeCategory[] = [
	'runtime',
	'framework',
	'data',
	'ai',
	'concept',
	'tool'
];

// ---------------------------------------------------------------------------
// Tech tags
// ---------------------------------------------------------------------------

export interface TechTag {
	label: string;
	kind: TagKind;
}

// ---------------------------------------------------------------------------
// Synced fingerprint — the drift manifest's per-repo record
// ---------------------------------------------------------------------------

/**
 * One synced fingerprint from the drift manifest. Every field is optional: the
 * manifest is populated incrementally by `drift sync`, so a freshly added repo
 * may only carry a subset of fields until the next full sync.
 *
 * Canonical contract: `scripts/sources.schema.json` (`$defs/SyncedSource`).
 * The engine validates every record against that schema before writing sources.json.
 * Any new field must be added to the schema first — the validation gate enforces this.
 *
 * Scope is explicit in every name: `Any` is all-authors, `Me` is Jason only.
 * `Human` is a filter within the all-authors scope (bots and agents removed),
 * not a third scope.
 *
 * `ProjectMetrics` derives its synced half from this interface via `Pick`, so
 * the two shapes cannot drift apart: adding a metric here and to
 * `SYNCED_METRIC_KEYS` is all it takes to surface it.
 */
export interface SyncedSource {
	commitHead?: string;
	/**
	 * Ref the fingerprint was measured against (resolved default branch, or
	 * 'HEAD' fallback). Metadata only; excluded from drift comparison and used
	 * for the HEAD-fallback advisory.
	 */
	measuredRef?: string;

	// Commit grid
	/** All-authors, lifetime. */
	commitsAny?: number;
	/** All-authors, trailing four weeks. */
	commitsAnyRecent?: number;
	/** Jason only, lifetime. */
	commitsMe?: number;
	/** Jason only, trailing four weeks. */
	commitsMeRecent?: number;

	// ---------------------------------------------------------------------------
	// Inference-only inputs.
	//
	// These never reach `Project`: they are deliberately absent from
	// SYNCED_METRIC_KEYS, so nothing portfolio-facing can read them. Each is
	// consumed at build time in defaults.ts to derive a field that IS surfaced.
	// Promoting one into ProjectMetrics would expose a raw signal the site has
	// no vocabulary for; derive from it instead.
	// ---------------------------------------------------------------------------

	/**
	 * All-authors count with non-human authors (CI bots, AI agents) removed.
	 * The denominator inferContribution divides by: `commitsAny` counts bot
	 * commits as co-authorship, which reads solo work as a team project.
	 */
	commitsHuman?: number;
	/**
	 * Distinct commit authors by identity. `authorsDistinctHuman` collapses all
	 * of Jason's git identities to one, so a value of 1 proves solo work
	 * outright, whatever the commit share says.
	 */
	authorsDistinct?: number;
	authorsDistinctHuman?: number;
	/** Whether Jason authored the root commit: originated the project vs joined it. */
	commitMeRoot?: boolean;
	/**
	 * Jason's most recent commit. Pairs with commitAnyRoot (also author-scoped)
	 * for a span measured in one consistent scope; `commitAnyLast` stays
	 * all-authors. Feeds inferTrack.
	 */
	commitMeLast?: string;
	/** Detected languages. Advisory: feeds inferTags rather than being overlaid onto tags. */
	detectedLanguages?: string[];

	// Dates
	commitAnyLast?: string;
	commitAnyRoot?: string;

	/**
	 * Intra-span activity shape, author-scoped like commitAnyRoot. commitAnyRoot
	 * and commitAnyLast describe only endpoints, so a repo touched once at each
	 * end is indistinguishable from one worked continuously; these make the
	 * difference detectable. spanMonthsActive/spanMonthsAll is the
	 * sustained-vs-bursty ratio, spanGapMaxDays the longest silence inside the span.
	 *
	 * Measured and persisted, but not yet surfaced on the site: absent from
	 * SYNCED_METRIC_KEYS and from every inference function.
	 */
	spanMonthsActive?: number;
	spanMonthsAll?: number;
	spanGapMaxDays?: number;

	// Codebase size
	linesAny?: number;

	// Churn grid (Jason-only / all-authors × lifetime / recent × added/removed)
	linesMeAdded?: number;
	linesMeRemoved?: number;
	linesAnyAdded?: number;
	linesAnyRemoved?: number;
	linesMeAddedRecent?: number;
	linesMeRemovedRecent?: number;
	linesAnyAddedRecent?: number;
	linesAnyRemovedRecent?: number;

	// Repo identity and dependency-manifest fields
	urlRepo?: string;
	urlsRepoCompanion?: string[];
	detectedRuntime?: string[];
	detectedDatabase?: string[];
	detectedFramework?: string[];
	/**
	 * First-introduced date (YYYY-MM-DD) per detected tech identity, keyed by
	 * the same identity strings as detectedRuntime/detectedFramework/detectedDatabase
	 * (e.g. 'svelte-5'). Populated by a git history search, distinct from
	 * commitAnyRoot (repo inception) — a tag on a long-lived repo can enter years
	 * after the repo started. Source-grep-only signals are absent here by design.
	 */
	detectedTechFirstSeen?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Metrics — all optional; fill in what's known
// ---------------------------------------------------------------------------

/**
 * The SyncedSource fields that reach the site as metrics.
 *
 * This list is the single place that decides which measurements are
 * portfolio-facing. Everything absent from it is either an inference-only input
 * or not yet surfaced (see the comments on SyncedSource).
 */
export type SyncedMetricKey =
	| 'commitsAny'
	| 'commitsAnyRecent'
	| 'commitsMe'
	| 'commitsMeRecent'
	| 'linesAny'
	| 'linesMeAdded'
	| 'linesMeRemoved'
	| 'linesAnyAdded'
	| 'linesAnyRemoved'
	| 'linesMeAddedRecent'
	| 'linesMeRemovedRecent'
	| 'linesAnyAddedRecent'
	| 'linesAnyRemovedRecent';

/**
 * Metrics as the site sees them: every synced measurement that is surfaced,
 * plus the gate-produced headline pair.
 *
 * The synced half is derived from SyncedSource rather than restated, so the two
 * cannot fall out of step. Adding a surfaced metric means adding it to
 * SyncedSource and to SyncedMetricKey — the compiler enforces the rest.
 */
export interface ProjectMetrics extends Pick<SyncedSource, SyncedMetricKey> {
	/**
	 * Gate output: the role-keyed commit count to show as the headline figure.
	 * Solo projects take `commitsAny` (Jason is all authors); team projects take
	 * `commitsMe`. Never authored in project .ts files — populated by the
	 * curation gate only.
	 *
	 * This exists so `commitsAny` and `commitsMe` can each stay a pure scoped
	 * fact. Presentation asks for the headline; anything reasoning about
	 * quantity reads the scoped field it actually means.
	 */
	commitsHeadline?: number;
	/**
	 * Which scope `commitsHeadline` was taken from. `'me'` means the headline is
	 * Jason-only and `commitsAny` holds the larger all-authors total worth
	 * showing as "N mine of M total"; `'any'` means the two are the same figure.
	 */
	commitsHeadlineScope?: 'any' | 'me';
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export type RelationshipKind =
	/** This project was extracted from the target (library → app direction). */
	| 'extracted-from'
	/** This project powers the target (library → app direction). */
	| 'powers'
	/** General "see also" cross-link. */
	| 'related';

export interface ProjectRelationship {
	kind: RelationshipKind;
	target: ProjectSlug;
	/** Human-readable description of the relationship. */
	note?: string;
}

export type LineageKind =
	/** The source technology enabled or led to the target (e.g. Express leads-to Oak). */
	| 'leads-to'
	/** The source technology was superseded by the target (e.g. Node.js replaced-by Bun). */
	| 'replaced-by';

export interface TechRelationship {
	kind: LineageKind;
	/** Exact tech tag label, e.g. "React". Validated against real labels by a data test, not the compiler. */
	source: string;
	/** Exact tech tag label, e.g. "Svelte 5". */
	target: string;
	/** Human-readable description of the relationship. */
	note?: string;
}

/** Aggregate surfaces a tech tag can be hidden from (per-project chips are never hidden here). */
export type TechSurface =
	/** The adoption timeline on /toolkit. */
	| 'toolkit'
	/** The tech constellation on the map. */
	| 'map'
	/** The hero stack groups. */
	| 'stack'
	/** drift's relate pickers and label index. */
	| 'relate';

/**
 * Authored per-tech data, keyed by exact tag label (validated against real
 * labels by a data test, like TechRelationship endpoints). Managed by
 * `drift tech`.
 */
export interface TechOverlay {
	/** Exact tech tag label, e.g. "Tailwind CSS v4". */
	label: string;
	/**
	 * First-used floor date (ISO YYYY-MM-DD, mid-month approximation). A floor,
	 * not a trump: a derived date at or before it wins (see adoption.ts).
	 */
	firstUsed?: string;
	/** One authored sentence about the tech, shown in the toolkit modal. */
	note?: string;
	/** Overrides the taxonomy/authored kind everywhere tags are assembled. */
	kind?: TagKind;
	/** Aggregate surfaces this label is hidden from. */
	hiddenFrom?: TechSurface[];
}

// ---------------------------------------------------------------------------
// Contribution — discriminated on role
//
// `collaboration.team` is required on both variants so every project answers
// "who built this". `inferContribution` always supplies a default; the strict
// `Contribution` type is used on the merged Project output. Authored overlays
// use the looser `AuthoredContribution` (collaboration optional) so a note-only
// overlay can omit collaboration and inherit the inferred default via
// mergeContribution. `contributionNote` is optional and enforced on authored
// team projects by a data test, not the compiler.
// ---------------------------------------------------------------------------

/**
 * Who the work was built with, plus optional organisational context.
 * `team` is always present: "Solo (Jason)" for solo projects, a cohort name,
 * studio, or generic "Collaborators" for team projects.
 */
export interface Collaboration {
	/** Who the work was built with: a cohort, a studio, or "Solo (Jason)". */
	team: string;
	/** The organisation Jason was employed by, when distinct from the team. */
	employer?: string;
	/** The end client the work was delivered for, when distinct from the employer. */
	client?: string;
}

interface SoloContribution {
	role: 'solo';
	collaboration: Collaboration;
}

interface TeamContribution {
	role: 'lead' | 'collaborator';
	collaboration: Collaboration;
	/**
	 * Specific verified contributions (PRs, features, line stats). Optional because
	 * manifest-derived team projects have role inferred from commit share but no authored
	 * note yet. Absent on auto-listed projects; present once editorially authored.
	 */
	contributionNote?: string;
}

/** Strict merged output type: collaboration is always present. */
export type Contribution = SoloContribution | TeamContribution;

/**
 * Editorial contribution context for authored overlays. Role is authoritative:
 * lead, collaborator and solo describe responsibility rather than commit share,
 * so they may intentionally disagree with inferContribution. `collaboration` is
 * optional so an overlay can inherit the inferred default via mergeContribution.
 */
export type AuthoredContribution =
	| { role: 'solo'; collaboration?: Collaboration }
	| { role: 'lead' | 'collaborator'; collaboration?: Collaboration; contributionNote?: string };

// ---------------------------------------------------------------------------
// AuthoredProject — optional overlay written by a human
// ---------------------------------------------------------------------------

/**
 * The shape of a hand-authored project overlay (the .ts files under
 * src/lib/data/projects/). Every field is optional except `slug`, which is
 * required so the glob assembler can key the overlay without relying on the
 * camelCase binding name.
 *
 * The merged output type (Project) stays fully required: the builder in
 * defaults.ts fills every field with a safe default derived from the manifest,
 * then mergeAuthored overlays any field the human actually authored.
 *
 * Dates and metrics are never authored here: they always come from the drift
 * manifest (or an override/provisional entry) via withSyncedMetrics in
 * index.ts, so overlays cannot carry stale copies of derived values.
 */
export interface AuthoredProject {
	slug: ProjectSlug;
	name?: string;
	tagline?: string;
	blurb?: string;
	plainBlurb?: string;
	description?: string;
	kind?: ProjectKind;
	contribution?: AuthoredContribution;
	tags?: TechTag[];
	/**
	 * Labels removed from this project's merged tag list, whether inferred or
	 * authored — the only way to drop an inferred tag. Managed by `drift tag`.
	 */
	suppressTags?: string[];
	/** Intent: a spike proving an idea, or a product meant to be used. */
	track?: ProjectTrack;
	/**
	 * Whether the work reached the world: publicly usable by someone else (a
	 * live URL, a published package or action), delivered to a client or cohort,
	 * or arrived at its own finished state and in service.
	 *
	 * Authored-only, and orthogonal to `progress`. Git can see whether commits
	 * are still landing; it cannot see whether anyone received the result. The
	 * two combine on the badge, so a released project that is still being worked
	 * on reads differently from one that has settled.
	 */
	released?: boolean;
	/** End-state flag: the work is shelved. Renders as a shade shift, never a new hue. */
	retired?: boolean;
	liveUrl?: string;
	highlights?: string[];
	relationships?: ProjectRelationship[];
	/**
	 * Force this project to the top of the hero pool, above score.
	 * Use sparingly — hero selection is derived by default.
	 */
	pin?: boolean;
	/**
	 * Exclude this project from the hero pool entirely.
	 * Use when a project is technically live but not portfolio-ready.
	 */
	hide?: boolean;
	/**
	 * Exclude this project from the "for everyone else" home page. Default is
	 * shown; set when the plain description would need more caveats than it
	 * is worth (a training exercise, a prototype, a joke).
	 */
	hideFromPlainIntro?: boolean;
}

// ---------------------------------------------------------------------------
// Project — the complete merged output; all fields required (never undefined)
// ---------------------------------------------------------------------------

export interface Project {
	slug: ProjectSlug;
	name: string;
	/** One-sentence description used in meta tags, the detail header, and map tooltip. */
	tagline: string;
	/** Short card face, roughly a third of the tagline. Cards show this when collapsed. */
	blurb: string;
	/**
	 * What the project is and who it is for, written for a reader who knows
	 * nothing about software. Drives the "for everyone else" home page.
	 */
	plainBlurb: string;
	/** Longer body copy for the case-study page. Placeholder text initially. */
	description: string;
	kind: ProjectKind;
	contribution: Contribution;
	tags: TechTag[];
	track: ProjectTrack;
	/**
	 * True when track was authored; heuristic values render dotted-provisional.
	 *
	 * The only provenance bit in the surface, and deliberately so: `track` is the
	 * only field with a heuristic worth marking as uncertain. `released` and
	 * `retired` are authored-or-absent, so there is no guess to flag, and
	 * `progress` is always inferred, so there is no variation to record.
	 */
	trackAuthored: boolean;
	/**
	 * Observed, never authored. Derived from `commitsMeRecent > 0` at merge time
	 * rather than stored raw: the union is the vocabulary the colour system,
	 * badges and filters speak, so the named state is the useful form even though
	 * the underlying count already implies it.
	 */
	progress: ProjectProgress;
	/** Derived: the project runs somewhere (liveUrl is present). */
	deployed: boolean;
	/** Authored: the work reached the world. Orthogonal to `progress`. */
	released: boolean;
	/** Authored end-state flag; encoded as a shade shift of the progress ink. */
	retired: boolean;
	repoUrl: string;
	/** URLs of companion repos, preserving Drift's tracked topology order. */
	companionRepoUrls: string[];
	/** ISO date (YYYY-MM-DD) of the most recent commit, from the source drift manifest. */
	commitAnyLast?: string;
	/** ISO date (YYYY-MM-DD) of the first (root) commit, from the source drift manifest. Orders the timeline by inception. */
	commitAnyRoot?: string;
	/**
	 * First-introduced date (YYYY-MM-DD) per tech-tag label, e.g. `{ 'Svelte 5': '2025-03-01' }`.
	 * Distinct from commitAnyRoot: a tag can enter a long-lived repo years after
	 * the repo started, so the toolkit adoption timeline prefers this per-tag
	 * date and falls back to commitAnyRoot for any label absent here.
	 */
	detectedTechFirstSeen?: Record<string, string>;
	liveUrl?: string;
	/** 3–5 technically interesting things about this project. */
	highlights: string[];
	relationships: ProjectRelationship[];
	/**
	 * Force this project to the top of the hero pool, above score.
	 * Use sparingly — hero selection is derived by default.
	 */
	pin?: boolean;
	/**
	 * Exclude this project from the hero pool entirely.
	 * Use when a project is technically live but not portfolio-ready.
	 */
	hide?: boolean;
	/**
	 * Exclude this project from the "for everyone else" home page. Default is
	 * shown; set when the plain description would need more caveats than it
	 * is worth (a training exercise, a prototype, a joke).
	 */
	hideFromPlainIntro?: boolean;
	metrics?: ProjectMetrics;
}

// ---------------------------------------------------------------------------
// ProjectSlug — dynamic string; safety enforced at build time
// ---------------------------------------------------------------------------

/**
 * Previously a hand-maintained string-literal union that gave compile-time
 * cross-link safety. Now a plain string because manifest slugs are discovered
 * dynamically at build time and cannot be enumerated in a closed union.
 *
 * Type safety is preserved at build time through two mechanisms:
 *   1. themes.ts throws during prerender when a relationship target is not in
 *      the project registry (the build fails on dangling links).
 *   2. data.test.ts asserts that every relationship target is a known slug
 *      (the test suite fails on typos before the build runs).
 *
 * What is lost: editor autocomplete on slug string literals. What is kept:
 * build-time failure on actual typos in overlay files and themes.
 */
export type ProjectSlug = string;

// ---------------------------------------------------------------------------
// In-progress staging pipeline types
//
// Mirror the in-progress.schema.json contract. Used by index.ts to type the
// provisional values imported from in-progress.json, and by the drift engine
// (check-drift.js) for the inProgressStatus result entries.
// ---------------------------------------------------------------------------

/** A single provisionally-tracked metric field. */
export interface TrackedField {
	/** The provisional metric value on the in-progress branch. */
	value: number;
	/** The same metric at the merge target (baseline the branch diverged from). */
	baseOnMain: number;
}

/** In-progress work tracking for one project. */
export interface InProgressEntry {
	/** The branch carrying the in-progress work. Must be pipeline[0]. */
	branch: string;
	/** Ordered promotion stages: [sourceBranch, ..., mergeTarget]. */
	pipeline: string[];
	/** 'public': provisional values surface on the site. 'local': CLI-only. */
	visibility: 'public' | 'local';
	/** Metric fields to surface provisionally, keyed by field name. */
	tracked: Record<string, TrackedField>;
}
