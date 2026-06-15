import type { Project } from '../types.js';

export const beacons: Project = {
	slug: 'beacons',
	name: 'Beacons',
	tagline:
		'A graph-native language tool that turns free-text statements into a queryable grammar, backed by Neo4j and deployed on Deno.',
	description:
		'Free-text statements are decomposed into a Neo4j graph of subject and verb nodes, with a route that converts raw input into a structured Grammar object. The Deno and Oak API exposes the graph layer alongside an NLP pipeline (built on the compromise library) that extracts and encodes verbs from the corpus for semantic search, passwordless magic-link authentication tied to Neo4j user records, and a Deno Cron job that keeps the database warm. A feature-organised React frontend in a companion repo walks users through a statement-building wizard with framer-motion transitions and virtualised lists. Jason architected and built the backend: the graph queries, the verb encoding, the authentication, and the scheduled nudge that keep the system running.',
	kind: 'app',
	contribution: {
		role: 'lead',
		contributionNote:
			'Jason architected and built the Neo4j-backed grammar engine: the graph queries, the natural-language verb encoding, the magic-link authentication, and a cron-scheduled database nudge that power the Beacons backend.',
		team: 'Founders and Coders'
	},
	status: 'archived',
	repoUrl: 'https://github.com/foundersandcoders/beacons-backend',
	secondaryRepoUrl: 'https://github.com/foundersandcoders/beacons-frontend-v2',
	highlights: [
		'Graph-native language model: statements decomposed into subject/verb nodes in Neo4j, with a route that converts free-text input into a structured Grammar object.',
		'NLP pipeline using the compromise library to dynamically extract and encode verbs from the graph, enabling semantic verb search across the corpus.',
		'Passwordless magic-link authentication with Neo4j-linked user records and request-level middleware.',
		'Deno Cron scheduled job (the "DB nudge") keeping the database warm, using Deno\'s unstable cron and KV APIs.',
		'Feature-organised React frontend with an interactive statement-building wizard, framer-motion transitions, and react-window virtualised lists.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Deno', kind: 'runtime' },
		{ label: 'Neo4j', kind: 'database' },
		{ label: 'Oak', kind: 'framework' },
		{ label: 'React', kind: 'framework' },
		{ label: 'Supabase', kind: 'database' }
	],
	lastCommit: '2025-11-06',
	metrics: {
		commits: 175,
		mergedPrs: 21,
		linesAdded: 19800
	}
};
