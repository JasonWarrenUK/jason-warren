import type { AuthoredProject } from '../types.js';

export const beacons: AuthoredProject = {
	slug: 'beacons',
	tagline:
		'A graph-native language tool that turns free-text statements into a queryable grammar, backed by Neo4j and deployed on Deno.',
	blurb: 'A graph-native tool that turns free text into a queryable grammar.',
	plainBlurb:
		'Write a plain sentence like "Priya approved the invoice" and it works out who did what, then files the sentence by meaning. Later you can ask "what has Priya approved?" and it finds every matching statement, even ones that never used the word "approved".',
	description:
		'Free-text statements are decomposed into a Neo4j graph of subject and verb nodes, with a route that converts raw input into a structured Grammar object. The Deno and Oak API exposes the graph layer alongside an NLP pipeline (built on the compromise library) that extracts and encodes verbs from the corpus for semantic search, passwordless magic-link authentication tied to Neo4j user records, and a Deno Cron job that keeps the database warm. A feature-organised React frontend in a companion repo walks users through a statement-building wizard with framer-motion transitions and virtualised lists.',
	kind: 'app',
	contribution: {
		role: 'lead',
		collaboration: { team: 'Founders and Coders', employer: 'Founders and Coders', client: 'LIFT' },
		contributionNote:
			'Owned the Beacons backend end-to-end: a Neo4j grammar engine where statements decompose into subject/verb nodes, a compromise.js NLP pipeline that extracts verbs from the graph for semantic search, passwordless magic-link auth and a Deno Cron job keeping the database warm.'
	},
	track: 'product',
	retired: true,
	highlights: [
		'Graph-native language model: statements decomposed into subject/verb nodes in Neo4j, with a route that converts free-text input into a structured Grammar object.',
		'NLP pipeline using the compromise library to dynamically extract and encode verbs from the graph, enabling semantic verb search across the corpus.',
		'Passwordless magic-link authentication with Neo4j-linked user records and request-level middleware.',
		'Deno Cron scheduled job (the "DB nudge") keeping the database warm, using Deno\'s unstable cron and KV APIs.',
		'Feature-organised React frontend with an interactive statement-building wizard, framer-motion transitions, and react-window virtualised lists.'
	],
	relationships: [],
	tags: []
};
