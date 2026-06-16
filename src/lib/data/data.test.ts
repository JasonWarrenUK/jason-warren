/**
 * Data integrity tests for the project registry.
 *
 * These tests are structural, not behavioural: they assert that the data
 * model is internally consistent. A failing test here means a data entry
 * needs fixing, not that the application logic is wrong.
 */

import { describe, it, expect } from 'vitest';
import { projects } from './index.js';
import { getEngineThreads } from './threads.js';
import sourcesManifest from './sources.json';
import overridesManifest from './overrides.json';
import type { ProjectSlug } from './types.js';

// Build a lookup for quick slug resolution
const projectSlugs = new Set<ProjectSlug>(projects.map((p) => p.slug as ProjectSlug));

// Helper: returns true when a given field on a given slug has a manual override.
// Used to skip synced-equality assertions for overridden fields, since an override
// winning over synced is the correct behaviour (not a data error).
const overrides = overridesManifest.overrides as Record<
	string,
	Record<string, { value: unknown; syncedWhenSet: unknown; syncedField?: string }>
>;
const isOverridden = (slug: string, field: string): boolean =>
	overrides[slug]?.[field] !== undefined;

// The drift manifest's per-repo language lists (the exhaustive truth the curated
// language tags gate). Empty until the author runs `check-drift.js --update`.
const sources = sourcesManifest.sources as Record<string, { languages?: string[] }>;

// Curated language labels the extension scan does not emit, or where the local
// repo path points at a related but structurally different checkout (e.g. a
// rewrite in another language), making the tag historically accurate but
// undetectable from the current local state.
//
// 'TypeScript' is exempt because the `psyche` sources.local.json entry points at
// the C# rewrite; the original SvelteKit version (which the tag describes) is
// not available at that path. Update sources.local.json if the SvelteKit repo
// becomes available locally.
const SCANNER_BLIND_LANGUAGES = new Set<string>(['TypeScript']);

describe('project registry', () => {
	it('has at least one project', () => {
		expect(projects.length).toBeGreaterThan(0);
	});

	it('has no duplicate slugs', () => {
		const seen = new Set<string>();
		const duplicates: string[] = [];
		for (const project of projects) {
			if (seen.has(project.slug)) {
				duplicates.push(project.slug);
			}
			seen.add(project.slug);
		}
		expect(duplicates, `Duplicate slugs: ${duplicates.join(', ')}`).toHaveLength(0);
	});

	it('every relationship target resolves to a real slug', () => {
		const broken: string[] = [];
		for (const project of projects) {
			for (const rel of project.relationships) {
				if (!projectSlugs.has(rel.target)) {
					broken.push(`${project.slug} → ${rel.target} (${rel.kind})`);
				}
			}
		}
		expect(broken, `Dangling relationship targets:\n${broken.join('\n')}`).toHaveLength(0);
	});

	it('every team project has a non-empty contributionNote', () => {
		const missing: string[] = [];
		for (const project of projects) {
			if (project.contribution.role !== 'solo') {
				if (!project.contribution.contributionNote?.trim()) {
					missing.push(project.slug);
				}
			}
		}
		expect(missing, `Team projects missing contributionNote: ${missing.join(', ')}`).toHaveLength(
			0
		);
	});

	it('all projects have at least one tag', () => {
		const untagged = projects.filter((p) => p.tags.length === 0);
		expect(
			untagged.map((p) => p.slug),
			`Projects with no tags: ${untagged.map((p) => p.slug).join(', ')}`
		).toHaveLength(0);
	});

	it('no project has two tags with the same (kind, label) pair', () => {
		// A language and a runtime may share a label (e.g. Go), but an exact
		// (kind, label) duplicate is a data slip. It also breaks the keyed
		// {#each} in TechTagList, which throws during hydration.
		const offenders: string[] = [];
		for (const project of projects) {
			const seen = new Set<string>();
			for (const tag of project.tags) {
				const key = `${tag.kind}:${tag.label}`;
				if (seen.has(key)) {
					offenders.push(`${project.slug} → ${key}`);
				}
				seen.add(key);
			}
		}
		expect(offenders, `Duplicate (kind, label) tags:\n${offenders.join('\n')}`).toHaveLength(0);
	});

	it('every curated language tag is a language the repo actually uses', () => {
		// The curated `language` tags are a significance gate over the drift
		// manifest's detected languages: a tag must not claim a language the
		// repo lacks. Projects whose manifest entry has no languages yet (before
		// the author runs the drift update) are skipped, so this stays green
		// until there is truth to check against.
		const offenders: string[] = [];
		for (const project of projects) {
			const detected = sources[project.slug]?.languages;
			if (!detected || detected.length === 0) continue;
			const truth = new Set(detected);
			for (const tag of project.tags) {
				if (tag.kind !== 'language') continue;
				if (SCANNER_BLIND_LANGUAGES.has(tag.label)) continue;
				if (!truth.has(tag.label)) {
					offenders.push(
						`${project.slug} → '${tag.label}' not in detected [${detected.join(', ')}]`
					);
				}
			}
		}
		expect(
			offenders,
			`Language tags not backed by the repo:\n${offenders.join('\n')}`
		).toHaveLength(0);
	});

	it('all projects have at least one highlight', () => {
		const bare = projects.filter((p) => p.highlights.length === 0);
		expect(
			bare.map((p) => p.slug),
			`Projects with no highlights: ${bare.map((p) => p.slug).join(', ')}`
		).toHaveLength(0);
	});

	it('every project has a short blurb distinct from its tagline', () => {
		const offenders: string[] = [];
		for (const project of projects) {
			if (!project.blurb?.trim()) offenders.push(`${project.slug} (empty)`);
			else if (project.blurb.trim() === project.tagline.trim()) {
				offenders.push(`${project.slug} (same as tagline)`);
			} else if (project.blurb.length >= project.tagline.length) {
				offenders.push(`${project.slug} (not shorter than tagline)`);
			}
		}
		expect(offenders, `Blurb problems: ${offenders.join(', ')}`).toHaveLength(0);
	});

	it('no description still carries the [Placeholder] marker', () => {
		const placeholders = projects.filter((p) => p.description.includes('[Placeholder]'));
		expect(
			placeholders.map((p) => p.slug),
			`Projects with placeholder copy: ${placeholders.map((p) => p.slug).join(', ')}`
		).toHaveLength(0);
	});

	it('no copy uses em-dashes (house style: British English, no em-dashes)', () => {
		const offenders: string[] = [];
		for (const project of projects) {
			const fields = [project.tagline, project.blurb, project.description, ...project.highlights];
			if (fields.some((text) => text.includes('—'))) {
				offenders.push(project.slug);
			}
		}
		expect(offenders, `Projects with em-dashes: ${offenders.join(', ')}`).toHaveLength(0);
	});
});

describe('engine-extraction threads', () => {
	it('every "powers" edge has a matching "extracted-from" edge on the target', () => {
		const unreciprocated: string[] = [];

		for (const project of projects) {
			for (const rel of project.relationships) {
				if (rel.kind !== 'powers') continue;

				const consumer = projects.find((p) => p.slug === rel.target);
				if (!consumer) continue; // caught by the slug-resolution test above

				const hasReciprocal = consumer.relationships.some(
					(r) => r.kind === 'extracted-from' && r.target === project.slug
				);

				if (!hasReciprocal) {
					unreciprocated.push(
						`${project.slug} --powers--> ${consumer.slug} has no reciprocal extracted-from edge`
					);
				}
			}
		}

		expect(
			unreciprocated,
			`Non-reciprocal engine edges:\n${unreciprocated.join('\n')}`
		).toHaveLength(0);
	});

	it('every "extracted-from" edge has a matching "powers" edge on the source', () => {
		const unreciprocated: string[] = [];

		for (const project of projects) {
			for (const rel of project.relationships) {
				if (rel.kind !== 'extracted-from') continue;

				const library = projects.find((p) => p.slug === rel.target);
				if (!library) continue;

				const hasReciprocal = library.relationships.some(
					(r) => r.kind === 'powers' && r.target === project.slug
				);

				if (!hasReciprocal) {
					unreciprocated.push(
						`${project.slug} --extracted-from--> ${library.slug} has no reciprocal powers edge`
					);
				}
			}
		}

		expect(
			unreciprocated,
			`Non-reciprocal extraction edges:\n${unreciprocated.join('\n')}`
		).toHaveLength(0);
	});

	it('getEngineThreads returns at least one thread', () => {
		const threads = getEngineThreads();
		expect(threads.length).toBeGreaterThan(0);
	});

	it('getEngineThreads threads have library, consumer, and note', () => {
		const threads = getEngineThreads();
		for (const thread of threads) {
			expect(thread.library).toBeDefined();
			expect(thread.consumer).toBeDefined();
			expect(thread.note).toBeTruthy();
		}
	});
});

describe('synced metrics from sources.json', () => {
	const synced = sourcesManifest.sources as Record<
		string,
		{
			commits?: number;
			commitsMine?: number;
			lastCommit?: string;
			firstCommit?: string;
		}
	>;

	it('every manifest slug resolves to a curated project (1:1 mapping)', () => {
		const unknown = Object.keys(synced).filter((k) => !projectSlugs.has(k as ProjectSlug));
		expect(unknown, `Manifest slugs with no project: ${unknown.join(', ')}`).toHaveLength(0);
	});

	it('overlays lastCommit date onto each project (synced wins)', () => {
		const offenders: string[] = [];
		for (const project of projects) {
			const source = synced[project.slug];
			if (!source) continue;
			// Skip projects with a manual override on lastCommit — override winning is correct.
			if (isOverridden(project.slug, 'lastCommit')) continue;
			if (source.lastCommit && project.lastCommit !== source.lastCommit) {
				offenders.push(`${project.slug} lastCommit ${project.lastCommit} != ${source.lastCommit}`);
			}
		}
		expect(offenders, `Synced lastCommit not applied:\n${offenders.join('\n')}`).toHaveLength(0);
	});

	it('applies the role-keyed commit headline (solo: all-authors; team: Jason-scoped)', () => {
		// Projects whose manifest entry has no commits yet are skipped —
		// the gate cannot be verified before the manifest is populated.
		// Projects with a manual override on `commits` or `commitsAll` are also
		// skipped for those fields — override winning is correct, not a gate failure.
		const offenders: string[] = [];
		for (const project of projects) {
			const source = synced[project.slug];
			if (!source || source.commits === undefined) continue;

			const isSolo = project.contribution.role === 'solo';
			const commitsOverridden = isOverridden(project.slug, 'commits');
			const commitsAllOverridden = isOverridden(project.slug, 'commitsAll');

			if (isSolo) {
				// Solo: rendered commits must equal the all-authors total.
				if (!commitsOverridden && project.metrics?.commits !== source.commits) {
					offenders.push(
						`${project.slug} (solo) commits ${project.metrics?.commits} != synced.commits ${source.commits}`
					);
				}
				// Solo: commitsAll context must not be set (no override can put it here).
				if (!commitsAllOverridden && project.metrics?.commitsAll != null) {
					offenders.push(
						`${project.slug} (solo) has commitsAll set — should be undefined for solo projects`
					);
				}
			} else {
				// Team: rendered commits must be Jason-scoped (synced.commitsMine when
				// present, otherwise the authored fallback — not synced.commits).
				if (
					!commitsOverridden &&
					source.commitsMine !== undefined &&
					project.metrics?.commits !== source.commitsMine
				) {
					offenders.push(
						`${project.slug} (team) commits ${project.metrics?.commits} != synced.commitsMine ${source.commitsMine}`
					);
				}
				// Team: commitsAll must equal the all-authors total.
				if (
					!commitsAllOverridden &&
					source.commits !== undefined &&
					project.metrics?.commitsAll !== source.commits
				) {
					offenders.push(
						`${project.slug} (team) commitsAll ${project.metrics?.commitsAll} != synced.commits ${source.commits}`
					);
				}
			}
		}
		expect(offenders, `Curation gate misapplied:\n${offenders.join('\n')}`).toHaveLength(0);
	});
});

describe('curation gate', () => {
	// Stable test fixtures: iris is solo, chirpdb is collaborator.
	// These test the gate logic independent of manifest data by injecting known values.
	// The gate is exercised via the live `projects` export, which merges sources.json at
	// module load time — so we verify the gate's current output, not a mock.

	it('solo project (iris) exposes commits as all-authors total from manifest', () => {
		const iris = projects.find((p) => p.slug === 'iris');
		expect(iris, 'iris project not found').toBeDefined();
		if (!iris) return;

		const manifestEntry = (sourcesManifest.sources as Record<string, { commits?: number }>)['iris'];
		if (!manifestEntry?.commits) return; // skip if not yet synced

		// For solo: metrics.commits should equal the synced all-authors total
		// (unless a manual override is in place — then the override wins by design)
		if (!isOverridden('iris', 'commits')) {
			expect(iris.metrics?.commits).toBe(manifestEntry.commits);
		}
		// For solo: no "of N total" context (unless commitsAll is itself overridden)
		if (!isOverridden('iris', 'commitsAll')) {
			expect(iris.metrics?.commitsAll).toBeUndefined();
		}
	});

	it('team project (chirpdb) exposes Jason-scoped headline, all-authors as context', () => {
		const chirpdb = projects.find((p) => p.slug === 'chirpdb');
		expect(chirpdb, 'chirpdb project not found').toBeDefined();
		if (!chirpdb) return;

		const manifestEntry = (
			sourcesManifest.sources as Record<string, { commits?: number; commitsMine?: number }>
		)['chirpdb'];
		if (!manifestEntry?.commits) return; // skip if not yet synced

		if (!isOverridden('chirpdb', 'commits') && manifestEntry.commitsMine !== undefined) {
			// If synced.commitsMine is present and not overridden, it must be the headline
			expect(chirpdb.metrics?.commits).toBe(manifestEntry.commitsMine);
		}
		// The all-authors total must appear as context (unless commitsAll is itself overridden)
		if (!isOverridden('chirpdb', 'commitsAll')) {
			expect(chirpdb.metrics?.commitsAll).toBe(manifestEntry.commits);
		}
	});

	it('team project without synced commitsMine falls back to authored commits value', () => {
		// This ensures the authored fallback (chirpdb.ts `commits: 28`) is honoured
		// before the manifest has commitsMine populated.
		const chirpdb = projects.find((p) => p.slug === 'chirpdb');
		if (!chirpdb) return;

		const manifestEntry = (
			sourcesManifest.sources as Record<string, { commits?: number; commitsMine?: number }>
		)['chirpdb'];

		// Only run this sub-case when commitsMine is absent from the manifest
		if (manifestEntry?.commitsMine !== undefined) return;

		// Should not be rendering the all-authors 309 as the headline
		expect(chirpdb.metrics?.commits).not.toBe(manifestEntry?.commits);
	});
});

describe('manual overrides', () => {
	// The overridable field allow-list: every ProjectMetrics key plus the two top-level dates.
	const OVERRIDABLE_FIELDS = new Set([
		'commits',
		'commitsRecentAll',
		'commitsMine',
		'commitsRecent',
		'commitsAll',
		'linesOfCode',
		'linesAdded',
		'linesRemoved',
		'linesAddedAll',
		'linesRemovedAll',
		'linesAddedRecent',
		'linesRemovedRecent',
		'linesAddedRecentAll',
		'linesRemovedRecentAll',
		'testCoverage',
		'mergedPrs',
		'lastCommit',
		'firstCommit'
	]);

	it('every override slug resolves to a curated project', () => {
		const unknown = Object.keys(overrides).filter((slug) => !projectSlugs.has(slug as ProjectSlug));
		expect(unknown, `Override slugs with no project: ${unknown.join(', ')}`).toHaveLength(0);
	});

	it('every override field name is in the allowed set', () => {
		const offenders: string[] = [];
		for (const [slug, fields] of Object.entries(overrides)) {
			for (const field of Object.keys(fields)) {
				if (field.startsWith('_')) continue; // _note, _setNote are metadata
				if (!OVERRIDABLE_FIELDS.has(field)) {
					offenders.push(`${slug}.${field}`);
				}
			}
		}
		expect(offenders, `Unknown override fields:\n${offenders.join('\n')}`).toHaveLength(0);
	});

	it('every override entry has value and syncedWhenSet', () => {
		const offenders: string[] = [];
		for (const [slug, fields] of Object.entries(overrides)) {
			for (const [field, entry] of Object.entries(fields)) {
				if (field.startsWith('_')) continue;
				if (entry.value === undefined) offenders.push(`${slug}.${field} missing value`);
				if (!('syncedWhenSet' in entry)) offenders.push(`${slug}.${field} missing syncedWhenSet`);
			}
		}
		expect(offenders, `Malformed override entries:\n${offenders.join('\n')}`).toHaveLength(0);
	});

	it('syncedWhenSet is null only for no-synced-source fields (testCoverage, mergedPrs)', () => {
		const NO_SYNCED_SOURCE = new Set(['testCoverage', 'mergedPrs']);
		const offenders: string[] = [];
		for (const [slug, fields] of Object.entries(overrides)) {
			for (const [field, entry] of Object.entries(fields)) {
				if (field.startsWith('_')) continue;
				if (entry.syncedWhenSet === null && !NO_SYNCED_SOURCE.has(field)) {
					offenders.push(`${slug}.${field} has syncedWhenSet: null but has a synced source`);
				}
				if (entry.syncedWhenSet !== null && NO_SYNCED_SOURCE.has(field)) {
					offenders.push(`${slug}.${field} must use syncedWhenSet: null (no synced source)`);
				}
			}
		}
		expect(offenders, `syncedWhenSet contract violations:\n${offenders.join('\n')}`).toHaveLength(
			0
		);
	});

	it('override value wins over synced for each overridden field', () => {
		// Vacuously green when there are no overrides (nothing to assert).
		// Verifies requirement 1 (override not overwritten) and requirement 2 (correct precedence).
		const synced = sourcesManifest.sources as Record<string, { [k: string]: unknown }>;
		const offenders: string[] = [];

		for (const [slug, fields] of Object.entries(overrides)) {
			const project = projects.find((p) => p.slug === slug);
			if (!project) continue; // caught by slug-resolution test above

			for (const [field, entry] of Object.entries(fields)) {
				if (field.startsWith('_')) continue;
				if (synced[slug] === undefined) continue; // un-synced repo, skip
				const expected = entry.value;

				// Resolve where the rendered value lives on the project
				let rendered: unknown;
				if (field === 'lastCommit') rendered = project.lastCommit;
				else if (field === 'firstCommit') rendered = project.firstCommit;
				else rendered = project.metrics?.[field as keyof typeof project.metrics];

				if (rendered !== expected) {
					offenders.push(`${slug}.${field}: expected override value ${expected}, got ${rendered}`);
				}
			}
		}
		expect(offenders, `Override precedence failures:\n${offenders.join('\n')}`).toHaveLength(0);
	});

	it('unoverridden fields on a project with overrides still reflect synced data (requirement 3)', () => {
		// Find a project that has at least one override AND at least one synced field that is NOT
		// overridden. If no such project exists (empty overrides), the test is vacuously green.
		const synced = sourcesManifest.sources as Record<string, { [k: string]: unknown }>;

		for (const [slug, fields] of Object.entries(overrides)) {
			const project = projects.find((p) => p.slug === slug);
			if (!project) continue;
			const source = synced[slug];
			if (!source) continue;

			// Pick the first synced field that is NOT overridden and has a known value
			const syncedCandidates = ['commitsMine', 'commits', 'linesAdded', 'linesOfCode'] as const;
			for (const candidate of syncedCandidates) {
				if (isOverridden(slug, candidate)) continue;
				const syncedValue = source[candidate];
				if (syncedValue === undefined) continue;

				const rendered = project.metrics?.[candidate as keyof typeof project.metrics];
				expect(
					rendered,
					`${slug}.${candidate}: unoverridden synced field should equal synced value ${syncedValue}`
				).toBe(syncedValue);
				return; // one proof is sufficient
			}
		}
	});
});
