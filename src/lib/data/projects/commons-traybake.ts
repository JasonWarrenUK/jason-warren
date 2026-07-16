import type { AuthoredProject } from '../types.js';

export const commonsTraybake: AuthoredProject = {
	slug: 'commons-traybake',
	tagline:
		'A comparative RAG experiment demonstrating that "ethics-neutral" data-processing choices are not neutral, by applying four chunking strategies to UK Parliament (Hansard) data and surfacing what each retrieves.',
	blurb: "A RAG experiment showing that 'neutral' chunking choices never are.",
	description:
		'The argument that "ethics-neutral" data-processing choices are not neutral is hard to make in the abstract, so this shows the same parliamentary debate through four different chunking lenses and lets the divergence speak for itself. The strategies span early chunking at 1024 and 256 tokens and late chunking that blends embeddings 70% chunk to 30% debate context, a non-standard approach with measurable retrieval effects, all stored across five vector indexes in Neo4j with OpenAI text-embedding-3-large. A divergence-analysis UI shows that only 8 to 25% of retrieved chunks overlap between strategies, making the point concrete rather than merely auditable. I implemented the semantic-chunking foundation, the UK Parliament Hansard API integration and the roadmap and documentation system.',
	kind: 'toy',
	contribution: {
		role: 'collaborator',
		collaboration: { team: 'FAC-31 cohort', employer: 'Founders and Coders' },
		contributionNote:
			'Co-led a FAC-31 cohort RAG research project into semantic chunking. Implemented the chunking foundation (1024 and 256 token strategies, late-chunking with 70/30 context blending); built the UK Parliament Hansard API integration; established the roadmap and documentation system.'
	},
	status: 'wip',
	highlights: [
		'Four chunking strategies: early (1024 token), early (256 token), late (1024 token blended 70/30 chunk/debate context), late (256 token).',
		'Late chunking blends embeddings: 70% chunk + 30% debate context, weighting document-level semantics into each retrieved fragment rather than treating chunks as isolated strings.',
		'Divergence analysis UI shows only 8-25% overlap between strategies, making the ethics argument concrete.',
		'Neo4j 5.11+ vector storage with five vector indexes and dual-label schema; OpenAI text-embedding-3-large.',
		'UK Parliament Hansard API integration with documented request patterns and Bruno/HTTPie test collection.'
	],
	relationships: [],
	tags: [
		{ label: 'OpenAI Embeddings', kind: 'ai' },
		{ label: 'RAG', kind: 'ai' }
	]
};
