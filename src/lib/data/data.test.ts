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
import type { ProjectSlug } from './types.js';

// Build a lookup for quick slug resolution
const projectSlugs = new Set<ProjectSlug>(projects.map((p) => p.slug as ProjectSlug));

// The drift manifest's per-repo language lists (the exhaustive truth the curated
// language tags gate). Empty until the author runs `check-drift.js --update`.
const sources = sourcesManifest.sources as Record<string, { languages?: string[] }>;

// Curated language labels the extension scan does not emit (different spelling
// or no file extension of its own). These are exempt from the gate check.
const SCANNER_BLIND_LANGUAGES = new Set<string>([]);

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
			const fields = [project.tagline, project.description, ...project.highlights];
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
		{ commits?: number; lastCommit?: string; firstCommit?: string }
	>;

	it('every manifest slug resolves to a curated project (1:1 mapping)', () => {
		const unknown = Object.keys(synced).filter((k) => !projectSlugs.has(k as ProjectSlug));
		expect(unknown, `Manifest slugs with no project: ${unknown.join(', ')}`).toHaveLength(0);
	});

	it('overlays the manifest commit count and date onto each project (synced wins)', () => {
		const offenders: string[] = [];
		for (const project of projects) {
			const source = synced[project.slug];
			if (!source) continue;
			if (source.lastCommit && project.lastCommit !== source.lastCommit) {
				offenders.push(`${project.slug} lastCommit ${project.lastCommit} != ${source.lastCommit}`);
			}
			if (source.commits !== undefined && project.metrics?.commits !== source.commits) {
				offenders.push(`${project.slug} commits ${project.metrics?.commits} != ${source.commits}`);
			}
		}
		expect(offenders, `Synced metrics not applied:\n${offenders.join('\n')}`).toHaveLength(0);
	});
});
