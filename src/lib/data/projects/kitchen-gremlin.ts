import type { AuthoredProject } from '../types.js';

export const kitchenGremlin: AuthoredProject = {
	slug: 'kitchen-gremlin',
	tagline:
		'A self-hosted, local-first recipe manager built around a real Paprika library, a FTS5 full-text search index, and a planned Yjs CRDT sync layer.',
	blurb: 'A self-hosted, local-first recipe manager built to replace Paprika.',
	description:
		'The project exists because Paprika Recipe Manager is the best option available and it is not good enough. A large recipe library is trapped in a proprietary format with nowhere better to go; this is my completely proportionate response. The current MVP is a SvelteKit PWA running SQLite compiled to WASM in a Web Worker, persisted to OPFS with an in-memory fallback when OPFS is unavailable. The schema is normalised across recipes, ingredients, steps, tags and photos, with an FTS5 full-text index and synonym expansion for search. A streaming Paprika importer unzips, gunzips, and parses the archive as an async generator: per-entry failures are isolated as error events rather than aborting the import, and each recipe is inserted transactionally with a unique-id check for idempotency. The importer is validated against a real 69MB export. On the roadmap: Yjs CRDT as the source of truth with SQLite as a derived query index, a Bun relay for sync and photo proxying, and Voyage embeddings for memory-style semantic search.',
	kind: 'app',
	track: 'product',
	progress: 'in-progress',
	highlights: [
		'SQLite/WASM in a Web Worker, persisted to OPFS; in-memory fallback when OPFS is unavailable.',
		'Normalised schema with an FTS5 full-text search index and synonym expansion (explicit ingredient ontology stub).',
		'Streaming Paprika importer: async generator, per-entry error isolation, transactional and idempotent; validated against a real 69MB export.',
		'Content-addressed OPFS photo store: SHA-256 keyed, served via object URL.',
		'Planned: Yjs CRDT as source of truth with SQLite as derived index, plus Voyage-embedding semantic search (designed and specced; not yet built).'
	],
	relationships: [],
	tags: [{ label: 'WASM', kind: 'tool' }]
};
