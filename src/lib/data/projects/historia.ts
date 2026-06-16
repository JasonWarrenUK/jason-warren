import type { Project } from '../types.js';

export const historia: Project = {
	slug: 'historia',
	name: 'Historia',
	tagline:
		'An interactive historical atlas rendering animated maps of Anglo-Saxon and Viking-era English kingdoms across time, with linked events, artefacts, and a timeline.',
	blurb: 'An animated atlas of Anglo-Saxon and Viking-era England.',
	description:
		'An interactive historical atlas that renders real GIS maps of Anglo-Saxon and Viking-era English kingdoms with MapLibre GL, styled through a custom atlas-style.ts and a dedicated map renderer. It ships around 2,040 lines of hand-authored data covering kingdoms across the early, heptarchy, viking, and late periods alongside events, artefacts, and geographic data, fed through a TopoJSON preprocessing pipeline for optimised delivery into a rich component tree of map canvas, timeline, kingdom, artefact and events panels, legend, and tooltip. The codebase began as a React and D3 prototype and was rewritten in SvelteKit, with the original react.jsx kept in the repo as a cross-framework porting reference. It remains an early prototype.',
	kind: 'website',
	contribution: { role: 'solo' },
	status: 'prototype',
	repoUrl: 'https://github.com/JasonWarrenUK/historia',
	highlights: [
		'Real GIS map rendering with MapLibre GL; custom atlas-style.ts and a dedicated map-renderer.ts (~567 LOC).',
		'~2,040 lines of hand-authored historical data: kingdoms (early/heptarchy/viking/late), events, artefacts, geographic data.',
		'TopoJSON preprocessing pipeline (scripts/prepare-geo-data.ts) for optimised GIS data delivery.',
		'Rich component tree: map canvas, timeline, kingdom/artefact/events panels, legend, tooltip.',
		'Started as a React+D3 prototype, rewritten in SvelteKit. The original 53KB react.jsx remains as an interesting cross-framework reference.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'MapLibre GL', kind: 'tool' },
		{ label: 'TopoJSON / GIS', kind: 'tool' },
		{ label: 'Tailwind CSS v4', kind: 'framework' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'Document / JSON', kind: 'data' }
	],
	lastCommit: '2026-03-14',
	metrics: {
		commits: 8
	}
};
