/**
 * Engine-extraction thread derivation.
 *
 * An "engine thread" is the story of a library that was pulled out of an
 * application project and made reusable. Each thread pairs a library project
 * (kind: 'library') with the consumer project it originally powered.
 *
 * Threads are derived from the relationship graph — they are NOT hand-authored
 * here. A library project declares `powers → consumer`; the consumer declares
 * the reciprocal `extracted-from → library`. This module finds and validates
 * those pairs.
 */

import { projects } from './index.js';
import type { Project } from './types.js';

export interface EngineThread {
	library: Project;
	consumer: Project;
	/** The human-readable note from the 'powers' relationship. */
	note: string;
}

/**
 * Derives all engine-extraction threads from the relationship graph.
 * Returns one entry per library → consumer pair.
 */
export function getEngineThreads(): EngineThread[] {
	const projectBySlug = new Map(projects.map((p) => [p.slug, p]));
	const threads: EngineThread[] = [];

	for (const project of projects) {
		for (const rel of project.relationships) {
			if (rel.kind !== 'powers') continue;

			const consumer = projectBySlug.get(rel.target);
			if (!consumer) continue;

			threads.push({
				library: project,
				consumer,
				note: rel.note ?? `${project.name} powers ${consumer.name}.`
			});
		}
	}

	return threads;
}
