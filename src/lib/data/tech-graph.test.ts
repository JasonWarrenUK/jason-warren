/**
 * Tests for the Technologies-mode graph (tech-graph.ts).
 *
 * Guards the critical invariants: language exclusion, edge density, degree cap,
 * determinism, and layout completeness.
 */

import { describe, it, expect } from 'vitest';
import {
	getTechNodes,
	getTechCoEdges,
	computeTechLayout,
	buildLineageLinks
} from './tech-graph.js';
import type { TechCoEdge } from './tech-graph.js';
import type { TechRelationship } from './types.js';

describe('getTechNodes', () => {
	const nodes = getTechNodes();

	it('returns at least one node', () => {
		expect(nodes.length).toBeGreaterThan(0);
	});

	it('excludes language-kind nodes', () => {
		const langNodes = nodes.filter((n) => n.kind === 'language');
		expect(
			langNodes,
			`language nodes found: ${langNodes.map((n) => n.label).join(', ')}`
		).toHaveLength(0);
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

	it('per-node degree cap holds at default maxPerNode, bar the bridges', () => {
		const maxPerNode = 6; // matches the default
		// Bridges: edges past the bare cap that rejoin severed clusters. Count
		// them by replaying the cap alone over the uncapped candidates.
		const candidates = getTechCoEdges({ maxPerNode: Number.POSITIVE_INFINITY });
		const bareDegree = new Map<string, number>();
		let bareKept = 0;
		for (const e of candidates) {
			const ds = bareDegree.get(e.source) ?? 0;
			const dt = bareDegree.get(e.target) ?? 0;
			if (ds >= maxPerNode || dt >= maxPerNode) continue;
			bareDegree.set(e.source, ds + 1);
			bareDegree.set(e.target, dt + 1);
			bareKept++;
		}
		const bridges = edges.length - bareKept;
		const degree = new Map<string, number>();
		for (const e of edges) {
			degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
			degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
		}
		for (const [label, deg] of degree) {
			expect(deg, `${label} exceeds cap ${maxPerNode} + ${bridges} bridges`).toBeLessThanOrEqual(
				maxPerNode + bridges
			);
		}
	});

	it('keeps the co-occurrence landscape as connected as its candidates', () => {
		const candidates = getTechCoEdges({ maxPerNode: Number.POSITIVE_INFINITY });
		const components = (list: TechCoEdge[]): number => {
			const parent = new Map<string, string>();
			const find = (n: string): string => {
				if (!parent.has(n)) parent.set(n, n);
				let r = n;
				while (parent.get(r) !== r) r = parent.get(r)!;
				parent.set(n, r);
				return r;
			};
			for (const e of candidates) {
				find(e.source);
				find(e.target);
			}
			for (const e of list) parent.set(find(e.source), find(e.target));
			return new Set([...parent.keys()].map(find)).size;
		};
		expect(components(edges)).toBe(components(candidates));
	});

	it('at most 4 isolated non-language nodes with default settings', () => {
		const connected = new Set<string>();
		for (const e of edges) {
			connected.add(e.source);
			connected.add(e.target);
		}
		const isolated = nodes.filter((n) => !connected.has(n.label));
		expect(
			isolated.length,
			`isolated: ${isolated.map((n) => n.label).join(', ')}`
		).toBeLessThanOrEqual(4);
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

	it('stays deterministic with lineage links included', () => {
		const rels: TechRelationship[] = [
			{ kind: 'replaced-by', source: nodes[0].label, target: nodes[1].label }
		];
		const a = computeTechLayout(nodes, edges, rels);
		const b = computeTechLayout(nodes, edges, rels);
		for (const [label, p] of a.positions) {
			expect(b.positions.get(label)).toEqual(p);
		}
	});
});

describe('buildLineageLinks', () => {
	it('keeps only relationships whose endpoints are both present nodes', () => {
		const rels: TechRelationship[] = [
			{ kind: 'leads-to', source: 'A', target: 'B' },
			{ kind: 'replaced-by', source: 'A', target: 'Missing' },
			{ kind: 'replaced-by', source: 'Missing', target: 'B' }
		];
		const links = buildLineageLinks(rels, new Set(['A', 'B']));
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ source: 'A', target: 'B' });
	});

	it('gives lineage links a short distance and strong pull', () => {
		const links = buildLineageLinks(
			[{ kind: 'leads-to', source: 'A', target: 'B' }],
			new Set(['A', 'B'])
		);
		expect(links[0].strength).toBeGreaterThan(0.5);
		expect(links[0].distance).toBeLessThan(100);
	});
});
