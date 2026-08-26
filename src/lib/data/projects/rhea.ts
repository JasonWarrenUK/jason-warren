import type { AuthoredProject } from '../types.js';

export const rhea: AuthoredProject = {
	slug: 'rhea',
	tagline:
		'An AI curriculum generator for peer-led learning cohorts. Produces multi-week course structures via Claude, with optional live research so output reflects current industry practice.',
	blurb: 'An AI curriculum generator for peer-led learning cohorts.',
	plainBlurb:
		'A course planner for a peer-led course on a subject that changes monthly. Each group reviews only the module they are about to teach, checking it against what the field looks like now; Rhea then carries their changes forward through every later module, so the whole plan stays current without anyone rewriting it all at once.',
	description:
		'Peer-led learning cohorts need multi-week course structures, and this generates them through Claude with optional live research so output reflects current industry practice. Named sub-workflows (Themis for courses, Metis for modules, Theia for import and export) share a common generation engine backed by the Anthropic SDK and LangChain, keeping each workflow independently maintainable. A provenance cascade gives every generated module a changelog, a high, medium, or low confidence score, and auto-cited research sources, so reviewers know exactly what to trust, while Zod enforces the output contract with automatic retry up to three attempts on failed generations. Deploys via Deno Deploy.',
	kind: 'app',
	track: 'exploration',
	highlights: [
		'Named sub-workflows (Themis/Metis/Theia) share a common generation engine with the Anthropic SDK and LangChain, making each workflow independently maintainable.',
		'Provenance/cascade pattern: every generated module carries a changelog, confidence score (high/medium/low), and auto-cited research sources.',
		'Schema validation with automatic retry (up to 3 attempts) on failed generations; Zod enforces the output contract.',
		'Configurable research domain allowlists, hierarchical course→arc→module config inheritance, agent client + prompt factory abstraction.',
		'Deploys via Deno Deploy with the @deno/svelte-adapter; configurable research domain allowlists and hierarchical course→arc→module config inheritance keep generation scope controllable.'
	],
	relationships: [],
	tags: [
		{ label: 'Anthropic SDK', kind: 'ai' },
		{ label: 'LangChain', kind: 'ai' },
		{ label: 'Zod', kind: 'tool' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
