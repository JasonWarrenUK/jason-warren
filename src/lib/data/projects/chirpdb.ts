import type { AuthoredProject } from '../types.js';

export const chirpdb: AuthoredProject = {
	slug: 'chirpdb',
	name: 'CHIRPdb',
	tagline:
		"A production backend API for CHIRP's maritime incident-reporting system. Ingests UK MAIB accident reports via scraping or PDF upload, structures them, and serves them for semantic search.",
	blurb: 'A backend API serving maritime incident reports for semantic search.',
	description:
		'Commercial client work for Tandem Creative Dev and Zig Zag AI on behalf of CHIRP, this backend ingests UK maritime incident reports through two pipelines: GOV.UK URL scraping and direct PDF upload, both producing structured incident records. SHA-256 deduplication prevents duplicate reports across ingestion runs, a domain-specific SHIELD-code taxonomy classifies each incident, and 384-dimension embeddings stored in Supabase pgvector power semantic search. It runs in production behind Cloudflare on Tandem infrastructure. Jason contributed documentation, an understand-anything knowledge graph of the codebase, and Claude Code configuration to support ongoing development.',
	kind: 'app',
	contribution: {
		role: 'collaborator',
		collaboration: { team: 'Tandem', employer: 'Tandem Creative Dev', client: 'Zig Zag AI' },
		contributionNote: 'PLACEHOLDER'
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
	tags: [
		{ label: 'Python', kind: 'language' },
		{ label: 'CPython', kind: 'runtime' },
		{ label: 'FastAPI', kind: 'framework' },
		{ label: 'Supabase', kind: 'data' },
		{ label: 'pgvector', kind: 'data' },
		{ label: 'Docker', kind: 'tool' }
	],
	lastCommit: '2026-06-12',
	metrics: {
		commits: 28,
		linesAdded: 41200,
		linesRemoved: 38911
	}
};
