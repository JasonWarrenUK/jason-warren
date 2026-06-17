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

export type ProjectStatus = 'live' | 'wip' | 'finished' | 'prototype' | 'archived' | 'uncategorised';

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
	commits?: number;
	/** All-authors, trailing four weeks. */
	commitsRecentAll?: number;
	/** Jason only, lifetime. Headline for team projects; overlaid from drift manifest. */
	commitsMine?: number;
	/** Jason only, trailing four weeks. */
	commitsRecent?: number;
	/**
	 * Gate output: the all-authors total exposed as context for team projects.
	 * Set by withSyncedMetrics when role !== 'solo'; used to render "N mine of M total".
	 * Never authored in project .ts files — populated by the curation gate only.
	 */
	commitsAll?: number;

	// ---------------------------------------------------------------------------
	// Churn grid: Jason-only / all-authors × lifetime / recent (×2 for added/removed)
	// ---------------------------------------------------------------------------

	/** Lines added by Jason, lifetime. */
	linesAdded?: number;
	/** Lines removed by Jason, lifetime. */
	linesRemoved?: number;
	/** Lines added by all authors, lifetime. */
	linesAddedAll?: number;
	/** Lines removed by all authors, lifetime. */
	linesRemovedAll?: number;
	/** Lines added by Jason, trailing four weeks. */
	linesAddedRecent?: number;
	/** Lines removed by Jason, trailing four weeks. */
	linesRemovedRecent?: number;
	/** Lines added by all authors, trailing four weeks. */
	linesAddedRecentAll?: number;
	/** Lines removed by all authors, trailing four weeks. */
	linesRemovedRecentAll?: number;

	// ---------------------------------------------------------------------------
	// Other metrics (authored in project .ts files; not from drift manifest)
	// ---------------------------------------------------------------------------

	/** Overall codebase size: total lines across tracked source files, all authors. */
	linesOfCode?: number;
	/** Statement coverage, 0–100 */
	testCoverage?: number;
	/** Merged pull requests (team projects) */
	mergedPrs?: number;
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

// ---------------------------------------------------------------------------
// Contribution — discriminated on role
// Forces contributionNote for team projects at compile time.
// ---------------------------------------------------------------------------

interface SoloContribution {
	role: 'solo';
}

interface TeamContribution {
	role: 'lead' | 'collaborator';
	/**
	 * Specific verified contributions (PRs, features, line stats). Optional because
	 * manifest-derived team projects have role inferred from commit share but no authored
	 * note yet. Absent on auto-listed projects; present once editorially authored.
	 */
	contributionNote?: string;
	/** Team or client name, optional. */
	team?: string;
}

export type Contribution = SoloContribution | TeamContribution;

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
 * Date fields (firstCommit, lastCommit) are intentionally absent: they come
 * from the drift manifest only, never from authored files.
 */
export interface AuthoredProject {
	slug: ProjectSlug;
	name?: string;
	tagline?: string;
	blurb?: string;
	description?: string;
	kind?: ProjectKind;
	contribution?: Contribution;
	tags?: TechTag[];
	status?: ProjectStatus;
	repoUrl?: string;
	secondaryRepoUrl?: string;
	liveUrl?: string;
	highlights?: string[];
	relationships?: ProjectRelationship[];
	featured?: boolean;
	flagship?: boolean;
	metrics?: ProjectMetrics;
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
	status: ProjectStatus;
	repoUrl: string;
	/** URL of a companion repo (e.g. a separate frontend or backend repo for split products). */
	secondaryRepoUrl?: string;
	/** ISO date (YYYY-MM-DD) of the most recent commit, from the source drift manifest. */
	lastCommit?: string;
	/** ISO date (YYYY-MM-DD) of the first (root) commit, from the source drift manifest. Orders the timeline by inception. */
	firstCommit?: string;
	liveUrl?: string;
	/** 3–5 technically interesting things about this project. */
	highlights: string[];
	relationships: ProjectRelationship[];
	/** Show in the featured/home sections. */
	featured: boolean;
	/** One of the 2–3 deep-dive hero projects on the home page. */
	flagship?: boolean;
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
