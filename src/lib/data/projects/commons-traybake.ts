import type { Project } from '../types.js';

export const commonsTraybake: Project = {
	slug: 'commons-traybake',
	name: 'Commons Traybake',
	tagline:
		'A comparative RAG experiment demonstrating that "ethics-neutral" data-processing choices are not neutral, by applying four chunking strategies to UK Parliament (Hansard) data and surfacing what each retrieves.',
	description:
		'[Placeholder] Commons Traybake makes an abstract argument tangible: show the same parliamentary debate through four different chunking lenses and let the divergence analysis speak for itself. Only 8-25% of retrieved chunks overlap between strategies, which is the point. The UI makes this visible, not just auditable.',
	kind: 'app',
	contribution: {
		role: 'lead',
		contributionNote:
			'5 merged PRs. Implemented the semantic-chunking foundation (1024 and 256 token strategies); built the Parliament API integration; established the roadmap and documentation system. +6,300 / −270 lines.',
		team: 'FAC-31 cohort'
	},
	status: 'wip',
	repoUrl: 'https://github.com/fac-31/commons-traybake',
	highlights: [
		'Four chunking strategies: early (1024 token), early (256 token), late (1024 token blended 70/30 chunk/debate context), late (256 token).',
		'Late chunking blends embeddings: 70% chunk + 30% debate context. A non-standard approach with measurable retrieval effects.',
		'Divergence analysis UI shows only 8-25% overlap between strategies, making the ethics argument concrete.',
		'Neo4j 5.11+ vector storage with five vector indexes and dual-label schema; OpenAI text-embedding-3-large.',
		'UK Parliament Hansard API integration with documented request patterns and Bruno/HTTPie test collection.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Neo4j', kind: 'domain' },
		{ label: 'OpenAI Embeddings', kind: 'domain' },
		{ label: 'RAG', kind: 'domain' },
		{ label: 'PostgreSQL', kind: 'domain' }
	],
	metrics: {
		commits: 46,
		mergedPrs: 5,
		linesAdded: 6300,
		linesRemoved: 270
	}
};
