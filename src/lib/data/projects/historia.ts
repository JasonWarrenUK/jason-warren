import type { AuthoredProject } from '../types.js';

export const historia: AuthoredProject = {
	slug: 'historia',
	tagline:
		'An interactive historical atlas rendering animated maps of Anglo-Saxon and Viking-era English kingdoms across time, with linked events, artefacts, and a timeline.',
	blurb: 'An animated atlas of Anglo-Saxon and Viking-era England.',
	description:
		'An interactive historical atlas that renders real GIS maps of Anglo-Saxon and Viking-era English kingdoms with MapLibre GL, styled through a custom atlas-style.ts and a dedicated map renderer. It ships a hand-authored dataset covering kingdoms across the early, heptarchy, viking, and late periods alongside events, artefacts, and geographic data, fed through a TopoJSON preprocessing pipeline for optimised delivery into a rich component tree of map canvas, timeline, kingdom, artefact and events panels, legend and tooltip. The codebase began as a React and D3 prototype and was rewritten in SvelteKit, with the original react.jsx kept in the repo as a cross-framework porting reference.',
	kind: 'website',
	contribution: { role: 'solo' },
	status: 'prototype',
	track: 'exploration',
	progress: 'complete',
	highlights: [
		'Real GIS map rendering with MapLibre GL, a custom atlas style and a dedicated map renderer.',
		'Hand-authored historical data covering kingdoms, events, artefacts and geography.',
		'TopoJSON preprocessing pipeline (scripts/prepare-geo-data.ts) for optimised GIS data delivery.',
		'Rich component tree: map canvas, timeline, kingdom/artefact/events panels, legend, tooltip.',
		'Started as a React and D3 prototype, then rewritten in SvelteKit; the original implementation remains as a cross-framework reference.'
	],
	relationships: [],
	tags: [
		{ label: 'MapLibre GL', kind: 'tool' },
		{ label: 'TopoJSON / GIS', kind: 'tool' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
