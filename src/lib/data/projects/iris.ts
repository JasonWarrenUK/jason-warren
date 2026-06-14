import type { Project } from '../types.js';

export const iris: Project = {
	slug: 'iris',
	name: 'Iris',
	tagline:
		'A three-interface toolkit that converts apprenticeship learner data from CSV into ESFA-compliant ILR XML, with semantic XSD validation.',
	description:
		'[Placeholder] Iris solves a real pain point at Founders and Coders: turning messy CSV exports from student management systems into the strict XML format the ESFA requires for funding submissions. The same TypeScript core drives a full-screen TUI, direct CLI commands, and a native desktop app built with Tauri — write the validation logic once, ship three interfaces.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/iris',
	highlights: [
		'Single TypeScript core drives three interfaces: OpenTUI terminal UI, direct CLI commands, and a Tauri 2 (Rust) native desktop app.',
		'Schema-driven validation: parses the real ESFA XSD to build a validation registry with type resolution, cardinality and constraint checking — semantic validation beyond structural XML.',
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
		{ label: 'Vitest', kind: 'domain' },
		{ label: 'XML / XSD', kind: 'domain' }
	],
	metrics: {
		commits: 666,
		linesAdded: 31500
	}
};
