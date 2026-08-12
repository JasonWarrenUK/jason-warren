/**
 * Cross-surface vocabulary reconciliation (4QU.8).
 *
 * The map's Technologies mode and the /toolkit adoption timeline read the same
 * registry tags through the same canonical labels, so they can never disagree
 * on spelling. What they can disagree on is scope, and until these tests the
 * two scope rules lived in different modules with nothing asserting that the
 * difference was deliberate.
 *
 * These are the invariants that keep the two surfaces honest about each other:
 * one policy table, one kind per label, and no silently dropped lineage.
 */

import { describe, it, expect } from 'vitest';
import { projects } from './index.js';
import { getTechNodes, getTechCoEdges } from './tech-graph.js';
import { getTechAdoption } from './adoption.js';
import { techRelationships } from './tech-relationships.js';
import { SURFACE_KINDS, hiddenTechLabels, surfaceAdmitsKind } from './tech-overlays.js';
import type { TagKind, TechSurface } from './types.js';

const mapLabels = new Set(getTechNodes().map((node) => node.label));
const toolkitLabels = new Set(getTechAdoption().map((entry) => entry.label));

/** Every label in the registry, with every kind it is ever carried under. */
const kindsByLabel = new Map<string, Set<TagKind>>();
for (const project of projects) {
	for (const tag of project.tags) {
		let kinds = kindsByLabel.get(tag.label);
		if (!kinds) {
			kinds = new Set();
			kindsByLabel.set(tag.label, kinds);
		}
		kinds.add(tag.kind);
	}
}

describe('surface kind policy', () => {
	it('declares a kind list for every surface', () => {
		const surfaces: TechSurface[] = ['toolkit', 'map', 'stack', 'relate'];
		for (const surface of surfaces) {
			expect(SURFACE_KINDS[surface], `${surface} has no declared kinds`).toBeDefined();
			expect(SURFACE_KINDS[surface].length).toBeGreaterThan(0);
		}
	});

	it('admits no kind twice within a surface', () => {
		for (const [surface, kinds] of Object.entries(SURFACE_KINDS)) {
			expect(new Set(kinds).size, `${surface} repeats a kind`).toBe(kinds.length);
		}
	});

	it('each surface renders only labels of the kinds it admits', () => {
		for (const label of mapLabels) {
			const kinds = kindsByLabel.get(label);
			expect(kinds, `${label} is a map node but carries no registry tag`).toBeDefined();
			const admitted = [...(kinds ?? [])].some((kind) => surfaceAdmitsKind('map', kind));
			expect(admitted, `${label} is on the map but its kind is not admitted`).toBe(true);
		}
		for (const label of toolkitLabels) {
			const kinds = kindsByLabel.get(label);
			expect(kinds, `${label} is on the toolkit but carries no registry tag`).toBeDefined();
			const admitted = [...(kinds ?? [])].some((kind) => surfaceAdmitsKind('toolkit', kind));
			expect(admitted, `${label} is on the toolkit but its kind is not admitted`).toBe(true);
		}
	});
});

describe('label kind is unambiguous', () => {
	/**
	 * A label carried under two kinds resolves by first-occurrence in registry
	 * order, so an unrelated edit elsewhere could flip its glyph on the map or
	 * drop it from a surface entirely. tech-overlays.ts pins such labels to one
	 * kind; this asserts none is left unpinned.
	 */
	it('no label is carried under more than one kind', () => {
		const ambiguous = [...kindsByLabel.entries()]
			.filter(([, kinds]) => kinds.size > 1)
			.map(([label, kinds]) => `${label} (${[...kinds].sort().join(', ')})`);
		expect(
			ambiguous,
			`pin these to one kind via a tech-overlays.ts kind override: ${ambiguous.join('; ')}`
		).toEqual([]);
	});
});

describe('lineage edges resolve or are deliberately out of scope', () => {
	/**
	 * The map excludes language-kind labels by policy, so lineage edges with a
	 * language endpoint cannot render there. That is a deliberate consequence,
	 * not a bug — but it must stay deliberate: an edge dropped for any *other*
	 * reason (a typo, a renamed label, a tech removed from the registry) is a
	 * real fault and this test is what separates the two.
	 */
	it('every dropped map edge is dropped only because of a language endpoint', () => {
		const hidden = hiddenTechLabels('map');
		const unexplained: string[] = [];

		for (const relationship of techRelationships) {
			for (const endpoint of [relationship.source, relationship.target]) {
				if (mapLabels.has(endpoint)) continue;

				const kinds = kindsByLabel.get(endpoint);
				// Explained: a language endpoint (the map excludes languages by
				// policy), or an endpoint authored as hidden from the map. An
				// endpoint no project carries is NOT excused here — that is a typo
				// or a stale label, and tech-relationships.test.ts fails on it.
				const isLanguage = kinds?.has('language') === true;
				if (isLanguage || hidden.has(endpoint)) continue;

				unexplained.push(`${relationship.source} -> ${relationship.target} (missing: ${endpoint})`);
			}
		}

		expect(
			unexplained,
			`lineage edges dropped from the map for no declared reason: ${unexplained.join('; ')}`
		).toEqual([]);
	});

	it('every lineage endpoint the toolkit admits actually renders there', () => {
		const hidden = hiddenTechLabels('toolkit');
		const missing: string[] = [];

		for (const relationship of techRelationships) {
			for (const endpoint of [relationship.source, relationship.target]) {
				if (toolkitLabels.has(endpoint)) continue;
				const kinds = kindsByLabel.get(endpoint);
				if (kinds === undefined || hidden.has(endpoint)) continue;
				const admitted = [...kinds].some((kind) => surfaceAdmitsKind('toolkit', kind));
				if (admitted) missing.push(`${endpoint} (${[...kinds].join(', ')})`);
			}
		}

		expect(
			missing,
			`admitted by policy but absent from the timeline: ${missing.join('; ')}`
		).toEqual([]);
	});
});

describe('map edges never dangle', () => {
	it('every co-occurrence endpoint is a rendered node', () => {
		for (const edge of getTechCoEdges()) {
			expect(mapLabels.has(edge.source), `${edge.source} is not a map node`).toBe(true);
			expect(mapLabels.has(edge.target), `${edge.target} is not a map node`).toBe(true);
		}
	});
});

describe('the two surfaces agree where they overlap', () => {
	it('a label on both surfaces carries the same kind on each', () => {
		const shared = [...mapLabels].filter((label) => toolkitLabels.has(label));
		// Guards the test itself: an empty intersection would make it vacuous.
		expect(shared.length).toBeGreaterThan(0);

		const mapKind = new Map(getTechNodes().map((node) => [node.label, node.kind]));
		const toolkitKind = new Map(getTechAdoption().map((entry) => [entry.label, entry.kind]));
		for (const label of shared) {
			expect(mapKind.get(label), `${label} has a different kind on each surface`).toBe(
				toolkitKind.get(label)
			);
		}
	});
});
