import type { AuthoredProject } from '../types.js';

export const wyrdTui: AuthoredProject = {
	slug: 'wyrd-tui',
	name: 'Wyrd',
	tagline:
		'An offline-first terminal productivity system where tasks, notes, and commitments are nodes in a flat-file property graph, with a custom Cypher-subset query engine and a three-way JSONC git merge driver.',
	blurb: 'A terminal task manager that stores everything as a queryable property graph.',
	description:
		'Everything lives in flat JSONC files under git, where tasks, notes, and commitments are nodes in a property graph with typed edges and the terminal UI is built for keyboard-first navigation. Two pieces carry the design: a custom read-only Cypher subset (parser, evaluator, MATCH/WHERE/RETURN/ORDER BY, aggregations, bidirectional and variable-length traversals, date variables with offset arithmetic) that compiles queries to in-memory traversals, and a three-way JSONC git merge driver shipped as its own binary that resolves property-level conflicts non-destructively, taking last-write-wins by timestamp on scalars and unioning arrays. Accessibility runs through it too: colour-blind-safe themes pair glyph and colour signals to WCAG AA via Reasonable Colors. The schedule view uses time displacement: tasks scheduled later compress visually as overruns eat into the remaining time, so the cost of delay is always in frame.',
	kind: 'tui',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/wyrd',
	highlights: [
		'Custom read-only Cypher subset: parser, evaluator, MATCH/WHERE/RETURN/ORDER BY, aggregations, bidirectional and variable-length traversals, date variables with offset arithmetic.',
		'Three-way JSONC git merge driver (its own binary): non-conflicting changes merge cleanly; scalars resolve last-write-wins by timestamp; arrays union.',
		'The Cypher evaluator, merge driver, and graph traversal are each covered by an independent test suite.',
		'Colour-blind-safe themes pairing glyph and colour signals; WCAG AA via Reasonable Colors; "time displacement" schedule view makes overruns visually compressing.',
		'JSON-lines stdin/stdout plugin protocol with deterministic UUID v5 deduplication for extensibility.'
	],
	relationships: [],
	tags: [
		{ label: 'Go', kind: 'language' },
		{ label: 'Go', kind: 'runtime' },
		{ label: 'Bubble Tea', kind: 'framework' },
		{ label: 'Graph / Cypher', kind: 'data' },
		{ label: 'Document / JSON', kind: 'data' },
		{ label: 'Git', kind: 'tool' },
		{ label: 'CLI', kind: 'tool' }
	]
};
