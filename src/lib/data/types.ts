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
// Metrics — all optional; fill in what's known
// ---------------------------------------------------------------------------

export interface ProjectMetrics {
	// ---------------------------------------------------------------------------
	// Commit grid: all-authors / Jason-only × lifetime / recent
	// ---------------------------------------------------------------------------

	/** All-authors, lifetime. Headline for solo projects (Jason IS all authors). */
	commitsAny?: number;
	/** All-authors, trailing four weeks. */
	commitsAnyRecent?: number;
	/** Jason only, lifetime. Headline for team projects; overlaid from drift manifest. */
	commitsMe?: number;
	/** Jason only, trailing four weeks. */
	commitsMeRecent?: number;
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

	// ---------------------------------------------------------------------------
	// Churn grid: Jason-only / all-authors × lifetime / recent (×2 for added/removed)
	// ---------------------------------------------------------------------------

	/** Lines added by Jason, lifetime. */
	linesMeAdded?: number;
	/** Lines removed by Jason, lifetime. */
	linesMeRemoved?: number;
	/** Lines added by all authors, lifetime. */
	linesAnyAdded?: number;
	/** Lines removed by all authors, lifetime. */
	linesAnyRemoved?: number;
	/** Lines added by Jason, trailing four weeks. */
	linesMeAddedRecent?: number;
	/** Lines removed by Jason, trailing four weeks. */
	linesMeRemovedRecent?: number;
	/** Lines added by all authors, trailing four weeks. */
	linesAnyAddedRecent?: number;
	/** Lines removed by all authors, trailing four weeks. */
	linesAnyRemovedRecent?: number;

	// ---------------------------------------------------------------------------
	// Size — every metric here has a synced source in the drift manifest
	// ---------------------------------------------------------------------------

	/** Overall codebase size: total lines across tracked source files, all authors. */
	linesAny?: number;
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
	/** Longer body copy for the case-study page. Placeholder text initially. */
	description: string;
	kind: ProjectKind;
	contribution: Contribution;
	tags: TechTag[];
	track: ProjectTrack;
	/** True when track was authored; heuristic values render dotted-provisional. */
	trackAuthored: boolean;
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
