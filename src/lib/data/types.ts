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

export type ProjectStatus = 'live' | 'wip' | 'finished' | 'archived';

export type ProjectKind = 'app' | 'game' | 'library' | 'tool' | 'tui';

export type TagKind = 'language' | 'framework' | 'domain' | 'runtime';

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
	linesOfCode?: number;
	/** Merged pull requests (team projects) */
	mergedPrs?: number;
	linesAdded?: number;
	linesRemoved?: number;
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
	| 'fac-cra';
