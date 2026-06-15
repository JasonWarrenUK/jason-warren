import type { Project } from '../types.js';

export const sparker: Project = {
	slug: 'sparker',
	name: 'Sparker',
	tagline:
		'A SEN observation tracker that uses Neo4j to surface correlations between student behaviours, built for special educational needs facilitators.',
	description:
		'An observation tracker for special educational needs facilitators, built graph-native on Neo4j. Rather than forcing observations into rigid table rows, the data model treats each one as a node linked to a student, a field definition, and a value, so finding correlations becomes a natural Cypher traversal rather than a complex SQL join. A flexible user-defined field system (text, number, boolean, tags, datetime) adapts to any school\'s vocabulary, and auto-detected co-occurrence correlations surface in per-student insight reports and a global feed ranked by strength. The SvelteKit code keeps a clean server/load separation with all Neo4j access isolated behind typed loaders. This is a v0.1.0 MVP, with temporal patterns, trigger analysis, multi-user auth, and richer visualisation on the roadmap.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'prototype',
	repoUrl: 'https://github.com/JasonWarrenUK/sparker',
	highlights: [
		'Graph-native data model: (Student)<-[:ABOUT]-(Observation)-[:HAS_FIELD {value}]->(FieldDefinition). Correlation discovery as a Cypher traversal.',
		'Flexible user-defined field system: text, number, boolean, tags, datetime. Adapts to any school\'s observation vocabulary.',
		'Auto-detected co-occurrence correlations surfaced in per-student insight reports and a global insight feed ranked by correlation strength.',
		'Clean SvelteKit server/load separation: all Neo4j access isolated in src/lib/server/ behind typed +page.server.ts loaders.',
		'v0.1.0 MVP with a clear roadmap: temporal patterns, trigger analysis, multi-user auth, richer visualisation.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Svelte 5', kind: 'framework' },
		{ label: 'Neo4j', kind: 'database' },
		{ label: 'Graph databases', kind: 'database' }
	],
	lastCommit: '2026-03-05',
	metrics: {
		commits: 11
	}
};
