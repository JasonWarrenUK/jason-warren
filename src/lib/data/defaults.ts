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

import type { Project, AuthoredProject, Contribution, TechTag } from './types.js';
import type { SyncedSource } from './index.js';
import {
	LANGUAGE_TAGS,
	RUNTIME_TAGS,
	FRAMEWORK_TAGS,
	DATABASE_TAGS
} from './tag-taxonomy.js';

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
 * contributionNote is deliberately omitted on inferred team projects: it is
 * optional on TeamContribution since Phase 1.1, and no fabricated prose appears
 * on the public site. The note is added when the project is editorially authored.
 */
export function inferContribution(manifest: SyncedSource): Contribution {
	const { commits = 0, commitsMine } = manifest;

	// No collaborator data or truly sole author
	if (commitsMine === undefined || commits === 0 || commitsMine === commits) {
		return { role: 'solo' };
	}

	const share = commitsMine / commits;
	if (share > 0.5) {
		return { role: 'lead' };
	}
	return { role: 'collaborator' };
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
		relationships: [],
		featured: false
		// metrics and date fields are NOT set here; withSyncedMetrics supplies them
		// from the same manifest entry so they appear on manifest-only projects too.
	};
}

// ---------------------------------------------------------------------------
// Authored overlay merge
// ---------------------------------------------------------------------------

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
		contribution: authored.contribution !== undefined ? authored.contribution : base.contribution,
		tags: mergedTags,
		status: authored.status !== undefined ? authored.status : base.status,
		repoUrl: authored.repoUrl !== undefined ? authored.repoUrl : base.repoUrl,
		secondaryRepoUrl:
			authored.secondaryRepoUrl !== undefined
				? authored.secondaryRepoUrl
				: base.secondaryRepoUrl,
		liveUrl: authored.liveUrl !== undefined ? authored.liveUrl : base.liveUrl,
		highlights: authored.highlights !== undefined ? authored.highlights : base.highlights,
		relationships:
			authored.relationships !== undefined ? authored.relationships : base.relationships,
		featured: authored.featured !== undefined ? authored.featured : base.featured,
		flagship: authored.flagship !== undefined ? authored.flagship : base.flagship,
		metrics: authored.metrics !== undefined ? authored.metrics : base.metrics
	};
}
