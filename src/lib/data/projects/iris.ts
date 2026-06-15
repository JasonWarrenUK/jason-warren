import type { Project } from '../types.js';

export const iris: Project = {
	slug: 'iris',
	name: 'Iris',
	tagline:
		'A three-interface toolkit that converts apprenticeship learner data from CSV into ESFA-compliant ILR XML, with semantic XSD validation.',
	description:
		'Apprenticeship funding submissions demand a strict XML format, and learner data rarely arrives in it. A single TypeScript core handles the conversion and drives three interfaces from one codebase: an OpenTUI terminal UI, direct CLI commands, and a Tauri 2 native desktop app written in Rust. Validation goes beyond structural XML checks by parsing the real ESFA XSD into a registry that resolves types and enforces cardinality and constraints, while header-tolerant CSV parsing and cross-submission consistency checks guard against column reordering and data drift. The result is a version 5.0.0 toolkit built across 666 commits with close to 1:1 source-to-test mapping and full round-trip coverage of the CSV to XML cycle.',
	kind: 'tui',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/iris',
	highlights: [
		'Single TypeScript core drives three interfaces: OpenTUI terminal UI, direct CLI commands, and a Tauri 2 (Rust) native desktop app.',
		'Schema-driven validation: parses the real ESFA XSD to build a validation registry with type resolution, cardinality and constraint checking. Semantic validation beyond structural XML.',
		'Header-tolerant CSV parsing handles column reordering; cross-submission consistency checks guard against data drift between submissions.',
		'Close to 1:1 source-to-test mapping with Vitest and Bun test; round-trip tests cover the full CSV → XML → re-parse cycle.',
		'Version 5.0.0 across 666 commits; full ADRs, technical specs, dev-log work records, and per-workflow roadmaps.'
	],
	relationships: [
		{
			kind: 'related',
			target: 'schema-forge',
			note: 'The XSD parsing and validation approach in schema-forge grew out of the same problem domain as iris.'
		}
	],
	featured: true,
	flagship: true,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Tauri', kind: 'framework' },
		{ label: 'Rust', kind: 'language' },
		{ label: 'OpenTUI', kind: 'framework' },
		{ label: 'Vitest', kind: 'tool' },
		{ label: 'XML / XSD', kind: 'tool' },
		{ label: 'No persistence', kind: 'data' }
	],
	lastCommit: '2026-03-12',
	metrics: {
		commits: 666,
		linesAdded: 31500
	}
};
