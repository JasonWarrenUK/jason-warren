/**
 * Technology lineage: the authored "this led to that" and "this replaced that"
 * edges between tech tags, independent of any project relationship.
 *
 * Unlike `ProjectRelationship` (which links two projects), a `TechRelationship`
 * links two tag labels directly, so it can render on both the tech constellation
 * (co-occurrence graph) and the adoption timeline, surfaces that have no notion
 * of a project at all. Authored, not derived: lineage is a judgement call about
 * what actually motivated a switch, not something that can be read off the tags
 * themselves.
 *
 * Registry-free by design: this module is imported by ProjectMap.svelte and
 * AdoptionTimeline.svelte, so it must not import './index.js' or anything that
 * transitively pulls in the project registry, the same constraint themes.ts
 * documents. Source and target labels are validated against the real tag set by
 * a data test instead of the compiler, exactly like `ProjectRelationship.target`
 * is checked against real slugs.
 */

import type { TechRelationship } from './types.js';

export const techRelationships: TechRelationship[] = [
	{
		kind: 'replaced-by',
		source: 'Node.js',
		target: 'Bun',
		note: 'Bun became the default JavaScript runtime for its speed and built-in tooling, ahead of npm and ts-node friction.'
	},
	{
		kind: 'replaced-by',
		source: 'Node.js',
		target: 'Deno',
		note: 'Deno picked up server-side work from Node.js for its native TypeScript support and stricter security model.'
	},
	{
		kind: 'replaced-by',
		source: 'Express',
		target: 'Oak',
		note: "Oak is Deno's Express-shaped middleware router; it took over once server work moved off Node."
	},
	{
		kind: 'replaced-by',
		source: 'React',
		target: 'Svelte 5',
		note: 'Svelte 5 runes gave the same component model with less ceremony and no virtual DOM, so React was dropped from new work.'
	},
	{
		kind: 'replaced-by',
		source: 'Next.js',
		target: 'SvelteKit',
		note: 'SvelteKit followed Svelte 5 as the default full-stack framework once React and its ecosystem stopped being the daily driver.'
	},
	{
		kind: 'leads-to',
		source: 'Deno',
		target: 'Oak',
		note: 'Adopting Deno as a runtime meant reaching for Oak as its natural middleware router.'
	},
	{
		kind: 'leads-to',
		source: 'JavaScript',
		target: 'TypeScript',
		note: 'TypeScript was adopted for its static types and editor tooling once projects grew past the size where plain JavaScript stayed manageable.'
	},
	{
		kind: 'leads-to',
		source: 'Svelte 5',
		target: 'SvelteKit',
		note: "SvelteKit is Svelte 5's own full-stack framework; picking up the component model brought its meta-framework with it."
	},
	{ kind: 'replaced-by', source: 'OpenTUI', target: 'Bubble Tea' },
	{ kind: 'replaced-by', source: '.NET 8', target: '.NET 9' },
	{ kind: 'leads-to', source: 'CSS', target: 'Tailwind CSS' },
	{ kind: 'leads-to', source: 'JavaScript', target: 'React' },
	{ kind: 'leads-to', source: 'JavaScript', target: 'Svelte 5' },
	{ kind: 'leads-to', source: 'TypeScript', target: 'React' },
	{ kind: 'leads-to', source: 'TypeScript', target: 'Svelte 5' },
	{ kind: 'leads-to', source: 'Ink', target: 'JavaScript' },
	{ kind: 'leads-to', source: 'Ink', target: 'inkjs' },
	{ kind: 'leads-to', source: 'JavaScript', target: 'inkjs' },
	{ kind: 'leads-to', source: 'Go', target: 'Bubble Tea' },
	{ kind: 'leads-to', source: 'HTML', target: 'CSS' }
];
