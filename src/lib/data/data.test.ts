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
import type { ProjectSlug } from './types.js';

// Build a lookup for quick slug resolution
const projectSlugs = new Set<ProjectSlug>(projects.map((p) => p.slug as ProjectSlug));

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

	it('all projects have at least one highlight', () => {
		const bare = projects.filter((p) => p.highlights.length === 0);
		expect(
			bare.map((p) => p.slug),
			`Projects with no highlights: ${bare.map((p) => p.slug).join(', ')}`
		).toHaveLength(0);
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
