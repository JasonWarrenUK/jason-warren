import type { Project } from '../types.js';

export const commonsTraybake: Project = {
	slug: 'commons-traybake',
	name: 'Commons Traybake',
	tagline:
		'A comparative RAG experiment demonstrating that "ethics-neutral" data-processing choices are not neutral, by applying four chunking strategies to UK Parliament (Hansard) data and surfacing what each retrieves.',
	description:
		'The argument that "ethics-neutral" data-processing choices are not neutral is hard to make in the abstract, so this shows the same parliamentary debate through four different chunking lenses and lets the divergence speak for itself. The strategies span early chunking at 1024 and 256 tokens and late chunking that blends embeddings 70% chunk to 30% debate context, a non-standard approach with measurable retrieval effects, all stored across five vector indexes in Neo4j with OpenAI text-embedding-3-large. A divergence-analysis UI shows that only 8 to 25% of retrieved chunks overlap between strategies, making the point concrete rather than merely auditable. Jason implemented the semantic-chunking foundation, the UK Parliament Hansard API integration, and the roadmap and documentation system.',
	kind: 'toy',
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
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'SvelteKit', kind: 'framework' },
		{ label: 'Neo4j', kind: 'data' },
		{ label: 'OpenAI Embeddings', kind: 'ai' },
		{ label: 'RAG', kind: 'ai' },
		{ label: 'PostgreSQL', kind: 'data' }
	],
	lastCommit: '2025-11-10',
	metrics: {
		commits: 46,
		mergedPrs: 5,
		linesAdded: 6300,
		linesRemoved: 270
	}
};
