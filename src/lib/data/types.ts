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

export type ProjectStatus = 'live' | 'wip' | 'finished' | 'prototype' | 'archived';

export type ProjectKind = 'app' | 'game' | 'website' | 'toy' | 'library' | 'tool' | 'tui';

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
	commits?: number;
	/** Statement coverage, 0–100 */
	testCoverage?: number;
	/** Overall codebase size: total lines across tracked source files, all authors. */
	linesOfCode?: number;
	/** Merged pull requests (team projects) */
	mergedPrs?: number;
	/** Lines added by Jason (author-filtered churn). */
	linesAdded?: number;
	/** Lines removed by Jason (author-filtered churn). */
	linesRemoved?: number;
	/** Commits by Jason in the trailing four weeks, from the drift manifest. */
	commitsRecent?: number;
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
	/** Specific verified contributions (PRs, features, line stats). Required. */
	contributionNote: string;
	/** Team or client name, optional. */
	team?: string;
}

export type Contribution = SoloContribution | TeamContribution;

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
	slug: ProjectSlug;
	name: string;
	/** One-sentence description used in cards and meta tags. */
	tagline: string;
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
// ProjectSlug — the canonical list; cross-links are compile-time checked.
// ---------------------------------------------------------------------------

export type ProjectSlug =
	// Solo flagships
	| 'iris'
	| 'wyrd-tui'
	| 'rhea'
	| 'epoch'
	| 'the-tongue'
	| 'cogni'
	| 'sparker'
	// Solo narrative / games
	| 'the-work'
	| 'flyt'
	| 'those-who-came-before'
	| 'historia'
	| 'top-girls'
	| 'grumble'
	| 'code-arcana'
	| 'baby-names'
	// Solo libraries — engine extraction
	| 'nib'
	| 'riffle'
	| 'schema-forge'
	// Solo tooling / WIP
	| 'kamino'
	| 'lyra-rose'
	| 'kitchen-gremlin'
	// Team projects
	| 'workwise'
	| 'commons-traybake'
	| 'psyche'
	| 'things-we-do'
	| 'guardrails'
	| 'redot'
	| 'chirpdb'
	| 'fac-cra'
	// New entries (FAC team + solo)
	| 'beacons'
	| 'craft-and-graft'
	| 'sakura'
	| 'rimewarden';
