import type { AuthoredProject } from '../types.js';

export const sparker: AuthoredProject = {
	slug: 'sparker',
	tagline:
		'A SEN observation tracker that uses Neo4j to surface correlations between student behaviours, built for special educational needs facilitators.',
	blurb: 'A SEN tracker that surfaces behaviour correlations with Neo4j.',
	description:
		"An observation tracker for special educational needs facilitators, built graph-native on Neo4j. The data model treats each observation as a node linked to a student, a field definition and a value, so finding correlations becomes a natural Cypher traversal rather than a complex SQL join. A flexible user-defined field system (text, number, boolean, tags, datetime) adapts to any school's vocabulary, and auto-detected co-occurrence correlations surface in per-student insight reports and a global feed ranked by strength. The SvelteKit code keeps a clean server/load separation with all Neo4j access isolated behind typed loaders. This prototype leaves temporal patterns, trigger analysis, multi-user auth, and richer visualisation on the roadmap.",
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'prototype',
	track: 'exploration',
	progress: 'complete',
	highlights: [
		'Graph-native data model: (Student)<-[:ABOUT]-(Observation)-[:HAS_FIELD {value}]->(FieldDefinition). Correlation discovery as a Cypher traversal.',
		"Flexible user-defined field system: text, number, boolean, tags, datetime. Adapts to any school's observation vocabulary.",
		'Auto-detected co-occurrence correlations surfaced in per-student insight reports and a global insight feed ranked by correlation strength.',
		'Clean SvelteKit server/load separation: all Neo4j access isolated in src/lib/server/ behind typed +page.server.ts loaders.',
		'Neo4j query patterns kept in src/lib/server/ with typed loaders; the graph traversal for co-occurrence is a two-hop match across shared observation fields.'
	],
	relationships: [],
	tags: []
};
