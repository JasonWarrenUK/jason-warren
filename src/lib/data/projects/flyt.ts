import type { Project } from '../types.js';

export const flyt: Project = {
	slug: 'flyt',
	name: 'Flyt',
	tagline:
		'A Norse interactive fiction game about flyting (ritual insult-poetry contests) where you defend your honour through stat-checked verbal duels.',
	description:
		'[Placeholder] Flyt uses DendryNexus, a niche interactive fiction format by Autumn Chen with StoryNexus-style card and deck mechanics. Rather than waiting for a packaged engine, I reverse-engineered the .dry format specification and built a custom compiler pipeline and reactive runtime. The Riffle engine library emerged from this work.',
	kind: 'game',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/flyt',
	highlights: [
		'Custom DendryNexus compiler: scripts/compile-dendry.js parses .dry format → static/game.json, consumed by the hand-written Riffle engine.',
		'~1,330 lines of authored .dry narrative content across two story areas (contest, great-hall).',
		'Card priority/frequency draw ordering, broad/narrow difficulty checks with configurable curves, tag-based choice expansion.',
		'Claude Code hooks auto-compile .dry files on save, keeping the developer loop tight.',
		'The Riffle engine library was extracted from this project for reuse.'
	],
	relationships: [
		{
			kind: 'extracted-from',
			target: 'riffle',
			note: 'The DendryNexus reactive engine was extracted from this project into the standalone Riffle library.'
		}
	],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'DendryNexus', kind: 'tool' },
		{ label: 'Interactive Fiction', kind: 'concept' },
		{ label: 'Bun', kind: 'runtime' }
	],
	lastCommit: '2026-03-11',
	metrics: {
		commits: 30
	}
};
