import type { AuthoredProject } from '../types.js';

export const flyt: AuthoredProject = {
	slug: 'flyt',
	tagline:
		'A Norse interactive fiction game about flyting (ritual insult-poetry contests) where you defend your honour through stat-checked verbal duels.',
	blurb: 'A Norse interactive fiction about ritual insult-poetry duels.',
	description:
		'A Norse interactive fiction game about flyting, the ritual insult-poetry contest, where you defend your honour through stat-checked verbal duels. It is built on DendryNexus, a niche StoryNexus-style card-and-deck format: rather than wait for a packaged engine, I wrote a custom compiler that parses the .dry format into a static game.json, consumed by a hand-written reactive runtime with card priority and frequency draw ordering, broad and narrow difficulty checks, and tag-based choice expansion. A substantial authored .dry corpus spans two story areas, the contest and the great-hall, and Claude Code hooks auto-compile .dry files on save to keep the developer loop tight. The reactive engine was later extracted into the standalone Riffle library.',
	kind: 'game',
	contribution: { role: 'solo' },
	track: 'product',
	progress: 'in-progress',
	highlights: [
		'Custom DendryNexus compiler: scripts/compile-dendry.js parses .dry format → static/game.json, consumed by the hand-written Riffle engine.',
		'Authored .dry narrative content across two story areas: the contest and the great-hall.',
		'Card priority/frequency draw ordering, broad/narrow difficulty checks with configurable curves, tag-based choice expansion.',
		'Claude Code hooks auto-compile .dry files on save, keeping the developer loop tight.',
		'Two story areas authored in .dry: the contest (verbal duel against an opponent with escalating stakes) and the great-hall (social navigation ahead of the contest).'
	],
	relationships: [
		{
			kind: 'extracted-from',
			target: 'riffle',
			note: 'The reactive DendryNexus engine was lifted out of Flyt into the standalone Riffle library.'
		}
	],
	tags: [
		{ label: 'DendryNexus', kind: 'tool' },
		{ label: 'Interactive Fiction', kind: 'concept' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
