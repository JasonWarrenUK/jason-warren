/**
 * Tests for the Technologies-mode graph (tech-graph.ts).
 *
 * Guards the critical invariants: language exclusion, edge density, degree cap,
 * determinism, and layout completeness.
 */

import { describe, it, expect } from 'vitest';
import { getTechNodes, getTechCoEdges, computeTechLayout } from './tech-graph.js';

describe('getTechNodes', () => {
	const nodes = getTechNodes();

	it('returns at least one node', () => {
		expect(nodes.length).toBeGreaterThan(0);
	});

	it('excludes language-kind nodes', () => {
		const langNodes = nodes.filter((n) => n.kind === 'language');
		expect(langNodes, `language nodes found: ${langNodes.map((n) => n.label).join(', ')}`).toHaveLength(0);
	});

	it('is deterministic', () => {
		expect(getTechNodes()).toEqual(nodes);
	});

	it('every node has a positive projectCount', () => {
		for (const n of nodes) {
			expect(n.projectCount, `${n.label}`).toBeGreaterThan(0);
		}
	});
});

describe('getTechCoEdges', () => {
	const nodes = getTechNodes();
	const nodeLabels = new Set(nodes.map((n) => n.label));
	const edges = getTechCoEdges();

	it('returns edges', () => {
		expect(edges.length).toBeGreaterThan(0);
	});

	it('is deterministic', () => {
		expect(getTechCoEdges()).toEqual(edges);
	});

	it('source < target (canonical ordering)', () => {
		for (const e of edges) {
			expect(e.source <= e.target, `${e.source} > ${e.target}`).toBe(true);
		}
	});

	it('no language-kind label appears as an endpoint', () => {
		for (const e of edges) {
			expect(nodeLabels.has(e.source), `${e.source} is not in getTechNodes()`).toBe(true);
			expect(nodeLabels.has(e.target), `${e.target} is not in getTechNodes()`).toBe(true);
		}
	});

	it('per-node degree cap holds at default maxPerNode', () => {
		const maxPerNode = 6; // matches the default
		const degree = new Map<string, number>();
		for (const e of edges) {
			degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
			degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
		}
		for (const [label, deg] of degree) {
			expect(deg, `${label} exceeds cap ${maxPerNode}`).toBeLessThanOrEqual(maxPerNode);
		}
	});

	it('at most 2 isolated non-language nodes with default settings', () => {
		const connected = new Set<string>();
		for (const e of edges) {
			connected.add(e.source);
			connected.add(e.target);
		}
		const isolated = nodes.filter((n) => !connected.has(n.label));
		expect(isolated.length, `isolated: ${isolated.map((n) => n.label).join(', ')}`).toBeLessThanOrEqual(2);
	});
});

describe('computeTechLayout', () => {
	const nodes = getTechNodes();
	const edges = getTechCoEdges();
	const layout = computeTechLayout(nodes, edges);

	it('positions every tech node', () => {
		for (const n of nodes) {
			expect(layout.positions.has(n.label), `${n.label} has no position`).toBe(true);
		}
	});

	it('all positions are finite', () => {
		for (const [label, p] of layout.positions) {
			expect(Number.isFinite(p.x), `${label}.x not finite`).toBe(true);
			expect(Number.isFinite(p.y), `${label}.y not finite`).toBe(true);
		}
	});

	it('is deterministic', () => {
		const b = computeTechLayout(nodes, edges);
		for (const [label, p] of layout.positions) {
			expect(b.positions.get(label)).toEqual(p);
		}
	});

	it('handles an empty node list without throwing', () => {
		expect(() => computeTechLayout([], [])).not.toThrow();
	});
});
