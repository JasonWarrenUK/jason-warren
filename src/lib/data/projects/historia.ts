import type { Project } from '../types.js';

export const historia: Project = {
	slug: 'historia',
	name: 'Historia',
	tagline:
		'An interactive historical atlas rendering animated maps of Anglo-Saxon and Viking-era English kingdoms across time, with linked events, artefacts, and a timeline.',
	description:
		'[Placeholder] Historia uses MapLibre GL and TopoJSON to render real GIS maps of historical kingdoms, styled with a custom atlas aesthetic. The project ships a substantial hand-authored historical dataset and a preprocessing pipeline that converts raw geographic data into optimised TopoJSON. The codebase started as a React+D3 prototype that was then rewritten in SvelteKit. The original prototype remains in the root as an interesting cross-framework porting story.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'wip',
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
		{ label: 'MapLibre GL', kind: 'domain' },
		{ label: 'TopoJSON / GIS', kind: 'domain' },
		{ label: 'Tailwind CSS v4', kind: 'framework' },
		{ label: 'Bun', kind: 'runtime' }
	],
	metrics: {
		commits: 8
	}
};
