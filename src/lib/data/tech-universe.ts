/**
 * The label universe drift recognises, for the surfaces that make claims
 * about history rather than about the present (5DR.32).
 *
 * Three sources, deliberately: the labels projects carry today, every label
 * the taxonomy can infer (a versionless fallback like 'Tailwind CSS' is real
 * even when nothing carries it), and every label an overlay declares. A
 * lineage edge is a statement about the past — 'Svelte 4 replaced-by
 * Svelte 5' became unverifiable against present tags the moment the
 * migration it describes happened — so lineage validation reads this union,
 * not project tags.
 *
 * Present-tense surfaces are unaffected: stack.ts, tech-graph.ts and
 * getTechAdoption's derived pass all still read project tags only.
 *
 * Imports the registry freely; tech-overlays.ts and tech-relationships.ts
 * must NOT import this module, since both are pulled into components and
 * must stay registry-free (see their own header comments).
 */

import { projects } from './index.js';
import { techOverlays } from './tech-overlays.js';
import {
	LANGUAGE_TAGS,
	RUNTIME_TAGS,
	FRAMEWORK_TAGS,
	DATABASE_TAGS
} from '../../../scripts/tag-taxonomy.js';
import type { TagKind } from './types.js';

const TAXONOMY_TABLES = [LANGUAGE_TAGS, RUNTIME_TAGS, FRAMEWORK_TAGS, DATABASE_TAGS];

/** Every label the taxonomy can infer, with every kind it is tabled under. */
export function getTaxonomyKinds(): Map<string, Set<TagKind>> {
	const kinds = new Map<string, Set<TagKind>>();
	for (const table of TAXONOMY_TABLES) {
		for (const tag of Object.values(table)) {
			const entry = tag as { label: string; kind: TagKind };
			const existing = kinds.get(entry.label);
			if (existing) existing.add(entry.kind);
			else kinds.set(entry.label, new Set([entry.kind]));
		}
	}
	return kinds;
}

/**
 * Every label a project currently carries, with every kind it is carried
 * under. Kept separate from the taxonomy so the ambiguity check in
 * surface-vocabulary.test.ts ("no label is carried under more than one kind")
 * keeps reading what the registry actually carries — Go and Shell are each
 * both `language` and `runtime` in the taxonomy, which would make that check
 * fail for reasons unrelated to 5DR.32 if the two maps were merged.
 */
export function getCarriedKinds(): Map<string, Set<TagKind>> {
	const kinds = new Map<string, Set<TagKind>>();
	for (const project of projects) {
		for (const tag of project.tags) {
			const existing = kinds.get(tag.label);
			if (existing) existing.add(tag.kind);
			else kinds.set(tag.label, new Set([tag.kind]));
		}
	}
	return kinds;
}

/**
 * The label universe drift recognises: present tags, every taxonomy-inferable
 * label (a versionless fallback is real even when nothing carries it today)
 * and every overlay-declared label (curated floors may legitimately predate
 * any tracked repo, or name a retired label no repo carries any more).
 */
export function getTechLabelUniverse(): Set<string> {
	return new Set([
		...projects.flatMap((p) => p.tags.map((t) => t.label)),
		...getTaxonomyKinds().keys(),
		...techOverlays.map((o) => o.label)
	]);
}

/**
 * The kind for any label in the universe: an overlay kind override first
 * (the single application point every surface already honours), then the
 * taxonomy, then whatever kind the registry actually carries it under (an
 * authored project tag like 'Graph / Cypher' has no taxonomy entry at all).
 * Undefined when none of the three knows it, which callers read as "not a
 * real label".
 */
export function resolveTechKind(label: string): TagKind | undefined {
	const overlay = techOverlays.find((o) => o.label === label);
	if (overlay?.kind !== undefined) return overlay.kind;
	const taxonomyKinds = getTaxonomyKinds().get(label);
	if (taxonomyKinds !== undefined) return [...taxonomyKinds][0];
	const carriedKinds = getCarriedKinds().get(label);
	return carriedKinds !== undefined ? [...carriedKinds][0] : undefined;
}
