/**
 * Builder functions for manifest-derived project defaults.
 *
 * These are called by index.ts for every entry in sources.json. They produce a
 * complete Project with safe defaults, which mergeAuthored then overlays with
 * any hand-authored content from the matching .ts file.
 *
 * Design contract:
 * - defaultProjectFromManifest ALWAYS returns a Project with no undefined
 *   required fields. Consumers must never crash on a manifest-only project.
 * - mergeAuthored overlays each authored field individually; it never blindly
 *   spreads an object, which would risk leaking undefined over required fields.
 * - inferTags deduplicates by (kind, label) so inferred + authored tags merge
 *   cleanly without exact duplicates.
 * - inferContribution uses the commit share already in the fingerprint; no new
 *   git data is needed.
 */

import type { Project, AuthoredProject, AuthoredContribution, Collaboration, Contribution, TechTag } from './types.js';
import type { SyncedSource } from './index.js';
import { LANGUAGE_TAGS, RUNTIME_TAGS, FRAMEWORK_TAGS, DATABASE_TAGS } from '../../../scripts/tag-taxonomy.js';

// ---------------------------------------------------------------------------
// Name humanisation
// ---------------------------------------------------------------------------

/** Short tokens that should be fully uppercased regardless of position. */
const ACRONYMS: Record<string, string> = {
	tui: 'TUI',
	cra: 'CRA',
	db: 'DB',
	ai: 'AI',
	cli: 'CLI',
	api: 'API',
	fac: 'FAC',
	ui: 'UI',
	sdk: 'SDK',
	url: 'URL',
	uuid: 'UUID',
	og: 'OG'
};

/**
 * Converts a kebab-case slug to a human-readable name.
 * Splits on hyphens, capitalises each token, and applies the acronym map.
 * Examples: 'baby-names' -> 'Baby Names', 'wyrd-tui' -> 'Wyrd TUI',
 * 'fac-cra' -> 'FAC CRA', 'chirpdb' -> 'Chirpdb' (overlay needed for 'CHIRPdb').
 */
export function humaniseSlug(slug: string): string {
	return slug
		.split('-')
		.map((token) => ACRONYMS[token.toLowerCase()] ?? token.charAt(0).toUpperCase() + token.slice(1))
		.join(' ');
}

// ---------------------------------------------------------------------------
// Tag inference
// ---------------------------------------------------------------------------

/**
 * Derives TechTag records from the manifest fields populated by the drift CLI.
 * Maps languages via LANGUAGE_TAGS, and runtime/framework/database via their
 * respective taxonomy maps. Deduplicates by (kind, label) pair.
 * Returns [] when nothing maps (never crashes).
 *
 * Special case: 'SQL' in manifest.languages is surfaced as a data tag (not a
 * language tag) because SQL is a persistence signal. card.ts has no SQL glyph,
 * but classifyDataLabel correctly routes the 'SQL' label to the relational model.
 */
export function inferTags(manifest: SyncedSource): TechTag[] {
	const seen = new Set<string>();
	const tags: TechTag[] = [];

	function add(tag: TechTag): void {
		const key = `${tag.kind}:${tag.label}`;
		if (!seen.has(key)) {
			seen.add(key);
			tags.push(tag);
		}
	}

	// Languages from file-extension scan
	for (const lang of manifest.languages ?? []) {
		const tag = LANGUAGE_TAGS[lang];
		if (tag) add(tag as TechTag);
	}

	// SQL is a data/persistence signal, not a glyph-row language, so it has no
	// LANGUAGE_TAGS entry. If the file-extension scan found .sql files, surface
	// it as a data tag (kind: 'data') so classifyDataLabel can resolve 'relational'.
	// This fires even when no database driver (pg, psycopg, etc.) is present.
	if ((manifest.languages ?? []).includes('SQL')) {
		add(DATABASE_TAGS['SQL'] as TechTag);
	}

	// Runtime from dependency-manifest parser
	for (const rt of manifest.runtime ?? []) {
		const tag = RUNTIME_TAGS[rt];
		if (tag) add(tag as TechTag);
	}

	// Frameworks from dependency-manifest parser
	for (const fw of manifest.framework ?? []) {
		const tag = FRAMEWORK_TAGS[fw];
		if (tag) add(tag as TechTag);
	}

	// Databases from dependency-manifest parser
	for (const db of manifest.database ?? []) {
		const tag = DATABASE_TAGS[db];
		if (tag) add(tag as TechTag);
	}

	return tags;
}

// ---------------------------------------------------------------------------
// Contribution inference
// ---------------------------------------------------------------------------

/**
 * Infers a Contribution from the commit share already in the manifest.
 *
 * Rules (per D3):
 *   - commitsMine === commits (or commitsMine absent/undefined): sole author -> solo
 *   - commits === 0: guard divide-by-zero -> solo
 *   - commitsMine / commits > 0.5: majority author -> lead (no contributionNote)
 *   - commitsMine / commits <= 0.5: minority author -> collaborator (no contributionNote)
 *
 * `collaboration.team` is always set to a neutral default: "Solo (Jason)" for
 * solo projects, "Collaborators" for inferred team projects. Both are honest
 * placeholders; authored overlays overwrite them via mergeContribution.
 *
 * `contributionNote` is deliberately omitted on inferred team projects: no
 * fabricated prose appears on the public site. The note is added once editorially
 * authored.
 */
export function inferContribution(manifest: SyncedSource): Contribution {
	const { commits = 0, commitsMine } = manifest;

	// No collaborator data or truly sole author
	if (commitsMine === undefined || commits === 0 || commitsMine === commits) {
		return { role: 'solo', collaboration: { team: 'Solo (Jason)' } };
	}

	const share = commitsMine / commits;
	if (share > 0.5) {
		return { role: 'lead', collaboration: { team: 'Collaborators' } };
	}
	return { role: 'collaborator', collaboration: { team: 'Collaborators' } };
}

// ---------------------------------------------------------------------------
// Default project builder
// ---------------------------------------------------------------------------

/**
 * Produces a complete Project from a manifest entry. Every required field is
 * populated with a safe default; no field is undefined. withSyncedMetrics then
 * overlays the dates and metrics from the same manifest entry.
 *
 * repoUrl falls back to the GitHub URL constructed from the slug when remote is
 * absent, so the link is never empty even before `drift update` populates remote.
 */
export function defaultProjectFromManifest(slug: string, manifest: SyncedSource): Project {
	return {
		slug,
		name: humaniseSlug(slug),
		tagline: '',
		blurb: '',
		description: '',
		kind: 'repo',
		contribution: inferContribution(manifest),
		tags: inferTags(manifest),
		status: 'uncategorised',
		repoUrl: manifest.remote ?? `https://github.com/JasonWarrenUK/${slug}`,
		highlights: [],
		relationships: []
		// metrics and date fields are NOT set here; withSyncedMetrics supplies them
		// from the same manifest entry so they appear on manifest-only projects too.
		// pin and hide default to undefined (absent = pure score).
	};
}

// ---------------------------------------------------------------------------
// Authored overlay merge
// ---------------------------------------------------------------------------

/**
 * Merges an authored contribution overlay onto the inferred base.
 *
 * `Contribution` is a discriminated union, so a blind object spread is unsound
 * (it can produce a hybrid solo/team object TypeScript cannot narrow). Instead:
 * - Authored role wins outright.
 * - `collaboration` falls back to the base's inferred default when the overlay
 *   omits it, so a note-only overlay keeps the defaulted team value.
 * - `contributionNote` falls back to the base's note when the overlay omits it
 *   (rare, but safe).
 */
function mergeContribution(base: Contribution, authored: AuthoredContribution | undefined): Contribution {
	if (authored === undefined) return base;

	// Collaboration: prefer authored; fall back to the inferred default so an
	// overlay that omits collaboration (e.g. { role: 'solo' }) inherits the
	// defaulted team value from inferContribution.
	const collaboration: Collaboration = authored.collaboration ?? base.collaboration;

	if (authored.role === 'solo') {
		return { role: 'solo', collaboration };
	}

	// For team variants, carry contributionNote from the overlay when present,
	// else from the base when the base is also a team variant.
	const baseNote = base.role !== 'solo' ? base.contributionNote : undefined;
	const note = authored.contributionNote ?? baseNote;
	return note !== undefined
		? { role: authored.role, collaboration, contributionNote: note }
		: { role: authored.role, collaboration };
}

/**
 * Overlays hand-authored fields onto a manifest-derived base Project.
 * Returns base unchanged when authored is undefined (manifest-only project).
 *
 * Tag merge strategy: when the overlay supplies tags, the result is
 * (inferred tags) ++ (authored tags) deduplicated by (kind, label), with
 * inferred tags first. This means:
 *   - Authored tags add concept/kind/tool tags that inference can't produce.
 *   - Inferred language/runtime/framework/data tags are NOT dropped by an
 *     authored overlay that only specifies concept tags.
 *   - Exact duplicates (same kind and label) are collapsed.
 *
 * Contribution is merged field-by-field via mergeContribution so the inferred
 * collaboration default survives when an overlay omits it.
 *
 * All other authored fields replace the base entirely when !== undefined.
 * No blind object spread: each field is guarded so undefined authored fields
 * leave the base value intact.
 */
export function mergeAuthored(base: Project, authored: AuthoredProject | undefined): Project {
	if (!authored) return base;

	// Tag merge: inferred first, authored additions appended, deduped.
	let mergedTags = base.tags;
	if (authored.tags !== undefined) {
		const seen = new Set<string>(base.tags.map((t) => `${t.kind}:${t.label}`));
		const extra = authored.tags.filter((t) => !seen.has(`${t.kind}:${t.label}`));
		mergedTags = [...base.tags, ...extra];
	}

	return {
		slug: authored.slug !== undefined ? authored.slug : base.slug,
		name: authored.name !== undefined ? authored.name : base.name,
		tagline: authored.tagline !== undefined ? authored.tagline : base.tagline,
		blurb: authored.blurb !== undefined ? authored.blurb : base.blurb,
		description: authored.description !== undefined ? authored.description : base.description,
		kind: authored.kind !== undefined ? authored.kind : base.kind,
		contribution: mergeContribution(base.contribution, authored.contribution),
		tags: mergedTags,
		status: authored.status !== undefined ? authored.status : base.status,
		repoUrl: authored.repoUrl !== undefined ? authored.repoUrl : base.repoUrl,
		secondaryRepoUrl:
			authored.secondaryRepoUrl !== undefined ? authored.secondaryRepoUrl : base.secondaryRepoUrl,
		liveUrl: authored.liveUrl !== undefined ? authored.liveUrl : base.liveUrl,
		highlights: authored.highlights !== undefined ? authored.highlights : base.highlights,
		relationships:
			authored.relationships !== undefined ? authored.relationships : base.relationships,
		pin: authored.pin !== undefined ? authored.pin : base.pin,
		hide: authored.hide !== undefined ? authored.hide : base.hide,
		metrics: authored.metrics !== undefined ? authored.metrics : base.metrics
	};
}
