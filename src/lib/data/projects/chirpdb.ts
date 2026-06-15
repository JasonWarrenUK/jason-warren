import type { Project } from '../types.js';

export const chirpdb: Project = {
	slug: 'chirpdb',
	name: 'CHIRPdb',
	tagline:
		'A production backend API for CHIRP\'s maritime incident-reporting system. Ingests UK MAIB accident reports via scraping or PDF upload, structures them, and serves them for semantic search.',
	description:
		'[Placeholder] CHIRPdb is commercial client work for Tandem Creative Dev and Zig Zag AI on behalf of CHIRP. The backend handles dual ingestion pipelines (GOV.UK scraping and PDF upload), SHA-256 deduplication, sentence splitting and classification, structured metadata extraction, domain-specific SHIELD-code taxonomy, and client-side 384-dim vector embeddings via Supabase pgvector.',
	kind: 'app',
	contribution: {
		role: 'collaborator',
		contributionNote:
			'28 commits. Contributed documentation, an understand-anything knowledge graph of the codebase, and Claude Code configuration to support ongoing development.',
		team: 'Tandem Creative Dev / Zig Zag AI'
	},
	status: 'wip',
	repoUrl: 'https://github.com/ZigZag-Technology/CHIRPdb',
	highlights: [
		'Dual ingestion pipelines: GOV.UK URL scraping and PDF upload, both producing structured incident records.',
		'SHA-256 deduplication prevents duplicate reports across ingestion runs.',
		'Domain-specific SHIELD-code taxonomy for maritime incident classification.',
		'Supabase pgvector for 384-dimension semantic search embeddings.',
		'Commercial client work: production-deployed behind Cloudflare on Tandem infrastructure.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'Python', kind: 'language' },
		{ label: 'FastAPI', kind: 'framework' },
		{ label: 'Supabase', kind: 'database' },
		{ label: 'pgvector', kind: 'database' },
		{ label: 'Docker', kind: 'tool' }
	],
	lastCommit: '2026-06-12',
	metrics: {
		commits: 28,
		linesAdded: 41200,
		linesRemoved: 38911
	}
};
