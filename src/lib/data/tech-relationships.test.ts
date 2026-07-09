/**
 * Data integrity tests for the authored tech lineage edges.
 *
 * Structural, not behavioural: every edge must point at real tag labels, every
 * edge must resolve on at least one of the two surfaces that can render it
 * (tech constellation or adoption timeline), and the graph-style dispatch
 * helpers must agree with the authored vocabulary.
 */

import { describe, it, expect } from 'vitest';
import { techRelationships } from './tech-relationships.js';
import { projects } from './index.js';
import { getTechNodes } from './tech-graph.js';
import { getTechAdoption } from './adoption.js';
import { edgeTypeColour, edgeTypeLabel, isLineageKind } from '$lib/components/graph/graph-style.js';

const allLabels = new Set(projects.flatMap((p) => p.tags.map((t) => t.label)));

describe('tech lineage relationships', () => {
	it('every source and target is a real tag label', () => {
		const offenders: string[] = [];
		for (const rel of techRelationships) {
			if (!allLabels.has(rel.source)) offenders.push(`source "${rel.source}" (${rel.kind})`);
			if (!allLabels.has(rel.target)) offenders.push(`target "${rel.target}" (${rel.kind})`);
		}
		expect(offenders, `Unknown tech labels:\n${offenders.join('\n')}`).toHaveLength(0);
	});

	it('has no self-loops', () => {
		const selfLoops = techRelationships.filter((rel) => rel.source === rel.target);
		expect(
			selfLoops,
			`Self-loop edges:\n${selfLoops.map((r) => `${r.source} → ${r.target}`).join('\n')}`
		).toHaveLength(0);
	});

	it('has no duplicate directed pairs', () => {
		const keys = techRelationships.map((rel) => `${rel.kind}\0${rel.source}\0${rel.target}`);
		const seen = new Set<string>();
		const duplicates: string[] = [];
		for (const key of keys) {
			if (seen.has(key)) duplicates.push(key);
			seen.add(key);
		}
		expect(duplicates, `Duplicate directed pairs:\n${duplicates.join('\n')}`).toHaveLength(0);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('every kind is a valid LineageKind', () => {
		for (const rel of techRelationships) {
			expect(['leads-to', 'replaced-by']).toContain(rel.kind);
		}
	});

	it('constellation resolution: JavaScript → TypeScript has an excluded endpoint', () => {
		const techLabels = new Set(getTechNodes().map((n) => n.label));
		const edge = techRelationships.find(
			(rel) => rel.source === 'JavaScript' && rel.target === 'TypeScript'
		);
		expect(edge, 'expected a JavaScript → TypeScript edge in techRelationships').toBeDefined();
		const bothResolve = techLabels.has(edge!.source) && techLabels.has(edge!.target);
		expect(
			bothResolve,
			'JavaScript and TypeScript are language-kind tags, excluded from the tech constellation'
		).toBe(false);
	});

	it('constellation resolution: at least 7 edges resolve on both endpoints', () => {
		const techLabels = new Set(getTechNodes().map((n) => n.label));
		const bothResolve = techRelationships.filter(
			(rel) => techLabels.has(rel.source) && techLabels.has(rel.target)
		);
		expect(bothResolve.length).toBeGreaterThanOrEqual(7);
	});

	it('timeline resolution: JavaScript and TypeScript are both dated', () => {
		const dated = new Set(getTechAdoption().map((a) => a.label));
		expect(dated.has('JavaScript')).toBe(true);
		expect(dated.has('TypeScript')).toBe(true);
	});

	it('every edge resolves on at least one surface (constellation or timeline)', () => {
		const techLabels = new Set(getTechNodes().map((n) => n.label));
		const dated = new Set(getTechAdoption().map((a) => a.label));
		const unrenderable: string[] = [];
		for (const rel of techRelationships) {
			const resolvesOnConstellation = techLabels.has(rel.source) && techLabels.has(rel.target);
			const resolvesOnTimeline = dated.has(rel.source) && dated.has(rel.target);
			if (!resolvesOnConstellation && !resolvesOnTimeline) {
				unrenderable.push(`${rel.source} → ${rel.target} (${rel.kind})`);
			}
		}
		expect(unrenderable, `Unrenderable on both surfaces:\n${unrenderable.join('\n')}`).toHaveLength(
			0
		);
	});

	it('graph-style dispatch agrees with the lineage vocabulary', () => {
		expect(edgeTypeColour('leads-to')).toBe('var(--color-edge-lineage-leads-to)');
		expect(edgeTypeColour('replaced-by')).toBe('var(--color-edge-lineage-replaced-by)');
		expect(edgeTypeLabel('leads-to')).toBe('Leads to');
		expect(edgeTypeLabel('replaced-by')).toBe('Replaced by');
		expect(isLineageKind('leads-to')).toBe(true);
		expect(isLineageKind('replaced-by')).toBe(true);
		expect(isLineageKind('related')).toBe(false);
	});
});
