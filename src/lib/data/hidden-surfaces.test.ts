/**
 * Behavioural coverage for tech-overlay visibility and kind overrides. The
 * shipped overlays currently hide nothing, so tech-overlays.test.ts's
 * invariants alone would pass vacuously; this file mocks the overlay module
 * with a hidden entry and a kind override to prove each surface actually
 * honours them.
 */

import { describe, it, expect, vi } from 'vitest';
import type { TagKind, TechOverlay, TechSurface } from './types.js';

vi.mock('./tech-overlays.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('./tech-overlays.js')>();
	const techOverlays: TechOverlay[] = [
		...original.techOverlays,
		// TypeScript is carried by many projects on every surface, so hiding it
		// exercises each filter for real.
		{ label: 'TypeScript', hiddenFrom: ['toolkit', 'map', 'stack'] },
		// Vite is inferred as a framework; override to tool to prove the single
		// application point rewrites every project's tags.
		{ label: 'Vite', kind: 'tool' }
	];
	return {
		...original,
		techOverlays,
		hiddenTechLabels: (surface: TechSurface): Set<string> =>
			new Set(techOverlays.filter((o) => o.hiddenFrom?.includes(surface)).map((o) => o.label)),
		getTechKindOverrides: (): Map<string, TagKind> =>
			new Map(
				techOverlays.filter((o) => o.kind !== undefined).map((o) => [o.label, o.kind as TagKind])
			)
	};
});

describe('hidden surfaces and kind overrides (mocked overlays)', () => {
	it('a toolkit-hidden tech never reaches the adoption timeline', async () => {
		const { getTechAdoption } = await import('./adoption.js');
		const labels = getTechAdoption().map((item) => item.label);
		expect(labels).not.toContain('TypeScript');
		expect(labels.length).toBeGreaterThan(0);
	});

	it('a map-hidden tech appears in no node and no co-occurrence edge', async () => {
		const { getTechNodes, getTechCoEdges } = await import('./tech-graph.js');
		expect(getTechNodes().map((n) => n.label)).not.toContain('TypeScript');
		for (const edge of getTechCoEdges()) {
			expect(edge.source).not.toBe('TypeScript');
			expect(edge.target).not.toBe('TypeScript');
		}
	});

	it('a stack-hidden tech appears in no stack group', async () => {
		const { getStackGroups } = await import('./stack.js');
		for (const group of getStackGroups()) {
			expect(group.items).not.toContain('TypeScript');
		}
	});

	it('a kind override rewrites the tag on every project carrying it', async () => {
		const { projects } = await import('./index.js');
		let seen = 0;
		for (const project of projects) {
			for (const tag of project.tags) {
				if (tag.label === 'Vite') {
					expect(tag.kind).toBe('tool');
					seen += 1;
				}
			}
		}
		expect(seen).toBeGreaterThan(0);
	});
});
