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

import type {
	Project,
	AuthoredProject,
	AuthoredContribution,
	Collaboration,
	Contribution,
	TechTag
} from './types.js';
import type { SyncedSource } from './index.js';
import {
	LANGUAGE_TAGS,
	RUNTIME_TAGS,
	FRAMEWORK_TAGS,
	DATABASE_TAGS
} from '../../../scripts/tag-taxonomy.js';

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
 * Special case: 'SQL' in manifest.detectedLanguages is surfaced as a data tag (not a
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
	for (const lang of manifest.detectedLanguages ?? []) {
		const tag = LANGUAGE_TAGS[lang];
		if (tag) add(tag as TechTag);
	}

	// SQL is a data/persistence signal, not a glyph-row language, so it has no
	// LANGUAGE_TAGS entry. If the file-extension scan found .sql files, surface
	// it as a data tag (kind: 'data') so classifyDataLabel can resolve 'relational'.
	// This fires even when no database driver (pg, psycopg, etc.) is present.
	if ((manifest.detectedLanguages ?? []).includes('SQL')) {
		add(DATABASE_TAGS['SQL'] as TechTag);
	}

	// Runtime from dependency-manifest parser
	for (const rt of manifest.detectedRuntime ?? []) {
		const tag = RUNTIME_TAGS[rt];
		if (tag) add(tag as TechTag);
	}

	// Frameworks from dependency-manifest parser
	for (const fw of manifest.detectedFramework ?? []) {
		const tag = FRAMEWORK_TAGS[fw];
		if (tag) add(tag as TechTag);
	}

	// Databases from dependency-manifest parser
	for (const db of manifest.detectedDatabase ?? []) {
		const tag = DATABASE_TAGS[db];
		if (tag) add(tag as TechTag);
	}

	return tags;
}

/**
 * Re-keys the manifest's identity-keyed `detectedTechFirstSeen` (e.g. `'svelte-5'`) to
 * the tag-label-keyed form the app reads (e.g. `'Svelte 5'`), via the same
 * RUNTIME_TAGS/FRAMEWORK_TAGS/LANGUAGE_TAGS lookups inferTags uses. Kept as a
 * sibling rather than folded into inferTags so inferTags's existing
 * TechTag[]-returning signature (and its test coverage) stays untouched.
 *
 * When two identities map to the same label (rare — e.g. a project detected
 * via both a lockfile and a package.json entry for the same tech), the
 * earlier date wins.
 */
export function inferTechFirstSeen(manifest: SyncedSource): Record<string, string> {
	const dates: Record<string, string> = {};
	const identityDates = manifest.detectedTechFirstSeen ?? {};

	function apply(identity: string, tag: TechTag | undefined): void {
		if (!tag) return;
		const date = identityDates[identity];
		if (date === undefined) return;
		const existing = dates[tag.label];
		if (existing === undefined || date < existing) {
			dates[tag.label] = date;
		}
	}

	for (const rt of manifest.detectedRuntime ?? []) apply(rt, RUNTIME_TAGS[rt] as TechTag);
	for (const fw of manifest.detectedFramework ?? []) apply(fw, FRAMEWORK_TAGS[fw] as TechTag);
	for (const db of manifest.detectedDatabase ?? []) apply(db, DATABASE_TAGS[db] as TechTag);

	return dates;
}

// ---------------------------------------------------------------------------
// Contribution inference
// ---------------------------------------------------------------------------

/**
 * Produces a provisional Contribution fallback for projects without an authored
 * editorial role. Commit arithmetic cannot establish professional
 * responsibility; mergeAuthored replaces this fallback whenever a curated role
 * is present.
 *
 * Bare commit share was the sole signal until 5DR.21, and it mislabelled 14 of
 * 33 projects. Two failure modes drove nearly all of it:
 *
 *   - Non-human authors counted as collaborators. Where an AI agent or CI bot
 *     authored most commits, solo work inferred as a team project (flyt is 63%
 *     agent-authored, kitchen-gremlin 64%). `commitsHuman` is the corrected
 *     denominator.
 *   - A missing git identity deflated `commitsMe` to zero, so a repo with
 *     exactly one author (Jason) inferred as `collaborator` on his own work.
 *     `authorsDistinctHuman` catches this independently of the share.
 *
 * Signals, in precedence order:
 *   1. authorsDistinctHuman === 1 — one human wrote it; solo, whatever the share.
 *   2. commitsMe === human total, or no collaborator data — solo.
 *   3. Otherwise share = commitsMe / commitsHuman decides lead vs collaborator,
 *      with churn share breaking the near-tie band and commitMeRoot breaking
 *      an exact tie.
 *
 * Every signal is optional: a manifest predating 5DR.21 falls back to the
 * original commits/commitsMe behaviour rather than throwing or guessing.
 *
 * `collaboration.team` is always set to a neutral default: "Solo (Jason)" for
 * solo projects, "Collaborators" for inferred team projects. Both are honest
 * placeholders; authored overlays overwrite them via mergeContribution.
 *
 * `contributionNote` is deliberately omitted on inferred team projects: no
 * fabricated prose appears on the public site. The note is added once editorially
 * authored.
 */

/**
 * Commit-share band around 0.5 within which churn share, not commit count,
 * decides lead vs collaborator. Many tiny commits should not outrank
 * substantially larger authorship, and vice versa; outside the band the commit
 * majority is decisive on its own.
 */
const ROLE_TIEBREAK_BAND = 0.1;

export function inferContribution(manifest: SyncedSource): Contribution {
	const {
		commitsAny = 0,
		commitsMe,
		commitsHuman,
		authorsDistinctHuman,
		commitMeRoot,
		linesMeAdded,
		linesAnyAdded
	} = manifest;

	const solo = (): Contribution => ({ role: 'solo', collaboration: { team: 'Solo (Jason)' } });
	const team = (role: 'lead' | 'collaborator'): Contribution => ({
		role,
		collaboration: { team: 'Collaborators' }
	});

	// One human author means solo work, however the commits divide. This is the
	// signal that rescues a repo where AUTHOR_PATTERN missed one of Jason's git
	// identities: the share can read 0, but the headcount cannot lie.
	if (authorsDistinctHuman === 1) return solo();

	// Prefer the human-only denominator; fall back to the raw count for manifests
	// synced before commitsHuman existed.
	const total = commitsHuman ?? commitsAny;

	// No collaborator data, no commits to divide, or truly sole author.
	if (commitsMe === undefined || total === 0 || commitsMe >= total) return solo();

	const share = commitsMe / total;

	// Outside the tiebreak band the commit majority decides on its own.
	if (share > 0.5 + ROLE_TIEBREAK_BAND) return team('lead');
	if (share < 0.5 - ROLE_TIEBREAK_BAND) return team('collaborator');

	// Inside the band, weigh churn: authorship measured in lines rather than
	// commit count, which is insensitive to commit-granularity habits.
	if (linesMeAdded !== undefined && linesAnyAdded !== undefined && linesAnyAdded > 0) {
		const churnShare = linesMeAdded / linesAnyAdded;
		if (churnShare !== 0.5) return team(churnShare > 0.5 ? 'lead' : 'collaborator');
	}

	// Churn absent or exactly balanced: originating the repo is the last
	// signal that distinguishes leading from joining.
	if (commitMeRoot === true) return team('lead');

	return team(share > 0.5 ? 'lead' : 'collaborator');
}

// ---------------------------------------------------------------------------
// Default project builder
// ---------------------------------------------------------------------------

/** Track heuristic: a repo that spans real time and real size reads as a
 *  product; anything smaller or shorter reads as a spike. Thresholds are
 *  tunable; wrong guesses are visible by design (heuristic values render
 *  dotted-provisional until authored — colour-system.md §3). */
const TRACK_HEURISTIC_MIN_SPAN_DAYS = 90;
const TRACK_HEURISTIC_MIN_LINES = 5000;

/**
 * Size at which a codebase reads as a product on its own, regardless of how
 * long its author was on it. Sustained time is one route to a product, not the
 * only one: a team repo Jason joined for an intense burst can be enormous and
 * still fail a span test. fac-cra is 213,140 lines across a 44-day
 * involvement, chirpdb 48,255 across 64 days, redot 35,624 across 7. Scoring
 * those as exploration mistook the shape of the engagement for the shape of
 * the work.
 */
const TRACK_HEURISTIC_SUBSTANTIAL_LINES = 20_000;

/**
 * Span is measured in one consistent scope (5DR.20): commitAnyRoot is
 * author-scoped, so pairing it with the all-authors commitAnyLast measured a
 * period belonging to neither. On fac-cra that ran from Jason's first commit to
 * the cohort's last, reporting a 51-day span for a 2-day engagement. Falls back
 * to commitAnyLast for manifests synced before commitMeLast existed.
 *
 * Two routes to `product`: substantial size alone, or real time plus real size.
 */
function inferTrack(manifest: SyncedSource): Project['track'] {
	const { commitAnyRoot, commitMeLast, commitAnyLast, linesAny } = manifest;
	const lines = linesAny ?? 0;

	if (lines > TRACK_HEURISTIC_SUBSTANTIAL_LINES) return 'product';

	const spanEnd = commitMeLast ?? commitAnyLast;
	if (!commitAnyRoot || !spanEnd) return 'exploration';
	const spanDays = (Date.parse(spanEnd) - Date.parse(commitAnyRoot)) / 86_400_000;
	return spanDays > TRACK_HEURISTIC_MIN_SPAN_DAYS && lines > TRACK_HEURISTIC_MIN_LINES
		? 'product'
		: 'exploration';
}

/**
 * Progress heuristic: commits in the trailing four weeks mean it is being
 * built; silence means the work has stopped.
 *
 * Stopped is `dormant`, never `complete`. The heuristic can see that work
 * stopped; it cannot see whether that is because the project was finished or
 * because it was set down. Those look identical in git — redot shipped (six
 * merged PRs, released as a licensed action) and cogni simply stopped, yet
 * after 302 and 147 idle days the histories say the same thing. Inferring
 * `complete` from silence therefore asserted something the data never
 * supported, on every quiet repo.
 *
 * What `complete` was reaching for now lives in `released`, which is authored
 * only: a human recording that the work reached someone else. That makes it a
 * real claim rather than an inference from silence, and it is orthogonal to
 * this field, so released work can be either in-progress or dormant.
 */
function inferProgress(manifest: SyncedSource): Project['progress'] {
	return (manifest.commitsMeRecent ?? 0) > 0 ? 'in-progress' : 'dormant';
}

/**
 * Produces a complete Project from a manifest entry. Every required field is
 * populated with a safe default; no field is undefined. withSyncedMetrics then
 * overlays the dates and metrics from the same manifest entry.
 *
 * repoUrl falls back to the GitHub URL constructed from the slug when remote is
 * absent. Companion repository URLs preserve Drift's tracked topology order.
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
		track: inferTrack(manifest),
		trackAuthored: false,
		progress: inferProgress(manifest),
		deployed: false, // recomputed from liveUrl in mergeAuthored; no manifest source
		released: false,
		retired: false,
		repoUrl: manifest.urlRepo ?? `https://github.com/JasonWarrenUK/${slug}`,
		companionRepoUrls: manifest.urlsRepoCompanion ?? [],
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
 * Merges authoritative editorial contribution context onto the provisional
 * commit-share fallback.
 *
 * `Contribution` is a discriminated union, so a blind object spread is unsound
 * (it can produce a hybrid solo/team object TypeScript cannot narrow). Instead:
 * - Authored role wins outright.
 * - `collaboration` falls back to the base's inferred default when the overlay
 *   omits it, so a note-only overlay keeps the defaulted team value.
 * - `contributionNote` falls back to the base's note when the overlay omits it
 *   (rare, but safe).
 */
function mergeContribution(
	base: Contribution,
	authored: AuthoredContribution | undefined
): Contribution {
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
 *   - Authored tags add concept, AI, tool and semantic data-model labels that
 *     dependency inference cannot prove.
 *   - Inferred language/runtime/framework/data tags are NOT dropped by an
 *     authored overlay that only specifies concept tags.
 *   - Exact duplicates (same kind and label) are collapsed.
 *   - suppressTags runs LAST and drops matching labels whether inferred or
 *     authored — it is the only way to remove an inferred tag, and it wins
 *     over an authored addition of the same label.
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
	// Suppression last, so it beats both inference and authored additions.
	if (authored.suppressTags !== undefined && authored.suppressTags.length > 0) {
		const suppressed = new Set(authored.suppressTags);
		mergedTags = mergedTags.filter((t) => !suppressed.has(t.label));
	}

	// Deployed is derived, never authored: it is exactly "the merged project
	// has a liveUrl", recomputed here so an authored liveUrl flips it.
	const mergedLiveUrl = authored.liveUrl !== undefined ? authored.liveUrl : base.liveUrl;

	return {
		slug: authored.slug !== undefined ? authored.slug : base.slug,
		name: authored.name !== undefined ? authored.name : base.name,
		tagline: authored.tagline !== undefined ? authored.tagline : base.tagline,
		blurb: authored.blurb !== undefined ? authored.blurb : base.blurb,
		description: authored.description !== undefined ? authored.description : base.description,
		kind: authored.kind !== undefined ? authored.kind : base.kind,
		contribution: mergeContribution(base.contribution, authored.contribution),
		tags: mergedTags,
		track: authored.track !== undefined ? authored.track : base.track,
		trackAuthored: authored.track !== undefined,
		// progress is never authored: it is a pure observation of commit activity.
		progress: base.progress,
		deployed: mergedLiveUrl !== undefined,
		released: authored.released !== undefined ? authored.released : base.released,
		retired: authored.retired !== undefined ? authored.retired : base.retired,
		repoUrl: base.repoUrl,
		companionRepoUrls: base.companionRepoUrls,
		liveUrl: mergedLiveUrl,
		highlights: authored.highlights !== undefined ? authored.highlights : base.highlights,
		relationships:
			authored.relationships !== undefined ? authored.relationships : base.relationships,
		pin: authored.pin !== undefined ? authored.pin : base.pin,
		hide: authored.hide !== undefined ? authored.hide : base.hide,
		metrics: base.metrics
	};
}
