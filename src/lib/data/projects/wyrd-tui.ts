import type { Project } from '../types.js';

export const wyrdTui: Project = {
	slug: 'wyrd-tui',
	name: 'Wyrd',
	tagline:
		'An offline-first terminal productivity system where tasks, notes, and commitments are nodes in a flat-file property graph, with a custom Cypher-subset query engine and a three-way JSONC git merge driver.',
	description:
		'Everything lives in flat JSONC files under git, where tasks, notes, and commitments are nodes in a property graph with typed edges and the terminal UI is built for keyboard-first navigation. Two pieces carry the design: a custom read-only Cypher subset (parser, evaluator, MATCH/WHERE/RETURN/ORDER BY, aggregations, bidirectional and variable-length traversals, date variables with offset arithmetic) that compiles queries to in-memory traversals, and a three-way JSONC git merge driver shipped as its own binary that resolves property-level conflicts non-destructively, taking last-write-wins by timestamp on scalars and unioning arrays. Accessibility runs through it too: colour-blind-safe themes pair glyph and colour signals to WCAG AA via Reasonable Colors. The rigour is uncommon for a side project, with 68.5% statement coverage across 150 Go files and 62 test files.',
	kind: 'tui',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/wyrd',
	highlights: [
		'Custom read-only Cypher subset: parser, evaluator, MATCH/WHERE/RETURN/ORDER BY, aggregations, bidirectional and variable-length traversals, date variables with offset arithmetic.',
		'Three-way JSONC git merge driver (its own binary): non-conflicting changes merge cleanly; scalars resolve last-write-wins by timestamp; arrays union.',
		'68.5% statement coverage across 150 Go files and 62 test files. Uncommon rigour for a side project.',
		'Colour-blind-safe themes pairing glyph and colour signals; WCAG AA via Reasonable Colors; "time displacement" schedule view makes overruns visually compressing.',
		'JSON-lines stdin/stdout plugin protocol with deterministic UUID v5 deduplication for extensibility.'
	],
	relationships: [],
	featured: true,
	flagship: true,
	tags: [
		{ label: 'Go', kind: 'language' },
		{ label: 'Bubble Tea', kind: 'framework' },
		{ label: 'Graph / Cypher', kind: 'database' },
		{ label: 'Git', kind: 'tool' },
		{ label: 'CLI', kind: 'tool' }
	],
	lastCommit: '2026-06-15',
	metrics: {
		commits: 279,
		testCoverage: 68.5,
		linesOfCode: 150
	}
};
