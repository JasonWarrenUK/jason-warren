import type { Project } from '../types.js';

export const lyraRose: Project = {
	slug: 'lyra-rose',
	name: 'Lyra Rose',
	tagline:
		'A wordless, single-URL artwork: a drifting field of shards, each a fragment of a world built for someone.',
	description:
		'Lyra Rose (working title: The World I\'d Build You) is a personal artwork in progress. The site is a single URL with no about page, no captions, no persistence, and no analytics: a drifting field of shards, each a piece of a world a parent would build for their daughter. The visitor\'s own someone is the implicit second register; the site never names this. The engineering is deliberately substantial: a pluggable surface and interior renderer architecture, a day-cycle sky synced to the visitor\'s real local time, parallel pointer and touch grammars, and proximity-summoned audio via the Web Audio API. An active, unhurried personal work.',
	kind: 'toy',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/lyra-rose',
	highlights: [
		'Pluggable renderer architecture for both surfaces and interiors from day one: adding a new surface or interior type is "write a new renderer," not modifying core opening logic.',
		'Viewport-bounded layout discipline at every level: nothing scrolls anywhere in the system. Interior content that exceeds the viewport paginates, animates, or reflows within a contained region.',
		'Dual pointer and touch grammars designed in parallel as distinct inhabitations of the same essence, not a cursor-model port. Hover-based proximity does not exist on touch; the grammar is designed from scratch.',
		'Day-cycle background synced to the visitor\'s real local time: a 3am visitor gets a different sky than a noon visitor, with no session state involved.',
		'Proximity-summoned audio via the Web Audio API: distance-based gain ramping as the cursor approaches a shard. No synthesis library. Silent by default.',
		'Archived OpenGraph previews at capture time: title, description, and hero image stored locally so shards survive link rot and paywalls.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'GSAP', kind: 'domain' },
		{ label: 'Web Audio API', kind: 'domain' },
		{ label: 'Supabase', kind: 'domain' },
		{ label: 'Bun', kind: 'runtime' }
	],
	metrics: {
		commits: 26
	}
};
