import type { Project } from '../types.js';

export const sparker: Project = {
	slug: 'sparker',
	name: 'Sparker',
	tagline:
		'A SEN observation tracker that uses Neo4j to surface correlations between student behaviours, built for special educational needs facilitators.',
	description:
		'[Placeholder] Sparker is a graph-native tool for SEN facilitators. Rather than forcing student observations into rigid table rows, the data model treats each observation as a node connected to a student, a field definition, and a value. Finding correlations ("these two fields co-occur 80% of the time for this student") is a natural Cypher traversal rather than a complex SQL join. The result is a tool that grows smarter the more you use it.',
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
		{ label: 'Neo4j', kind: 'domain' },
		{ label: 'Graph databases', kind: 'domain' }
	],
	metrics: {
		commits: 11
	}
};
