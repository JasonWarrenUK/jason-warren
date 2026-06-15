import type { Project } from '../types.js';

export const flyt: Project = {
	slug: 'flyt',
	name: 'Flyt',
	tagline:
		'A Norse interactive fiction game about flyting (ritual insult-poetry contests) where you defend your honour through stat-checked verbal duels.',
	description:
		'A Norse interactive fiction game about flyting, the ritual insult-poetry contest, where you defend your honour through stat-checked verbal duels. It is built on DendryNexus, a niche StoryNexus-style card-and-deck format: rather than wait for a packaged engine, Jason wrote a custom compiler that parses the .dry format into a static game.json, consumed by a hand-written reactive runtime with card priority and frequency draw ordering, broad and narrow difficulty checks, and tag-based choice expansion. Around 1,330 lines of authored .dry content span two story areas, the contest and the great-hall, and Claude Code hooks auto-compile .dry files on save to keep the developer loop tight. The reactive engine was later extracted into the standalone Riffle library.',
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
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'Document / JSON', kind: 'data' }
	],
	lastCommit: '2026-03-11',
	metrics: {
		commits: 30
	}
};
