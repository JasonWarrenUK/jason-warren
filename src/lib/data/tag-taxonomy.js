/**
 * Shared tag taxonomy for the portfolio.
 *
 * This file is deliberately plain ESM JavaScript (not TypeScript) so it can be
 * imported by both the typed SvelteKit app and the plain-JS drift CLI script
 * (scripts/check-drift.js). The companion tag-taxonomy.d.ts provides explicit
 * TypeScript declarations for the app.
 *
 * Taxonomy rules:
 * - Keys are canonical identities (file extension, package name, lock-file name).
 * - Values are { label, kind } objects that become TechTag records on Project.
 * - Labels MUST match the keys in card.ts's languageIcon / runtimeArchetype so
 *   inferred tags drive the OG card geometry and glyphs.
 * - Maps are intentionally conservative: unmapped identities are silently dropped,
 *   never guessed. Add new entries when you have a real project that exercises them.
 */

// ---------------------------------------------------------------------------
// Extension -> language name
// Lifted verbatim from scripts/check-drift.js so both consumers stay in sync.
// Keys are lowercase file extensions. Values are the canonical language label
// used throughout the tag system and card renderer.
// ---------------------------------------------------------------------------

export const EXTENSION_LANGUAGE = {
	ts: 'TypeScript',
	tsx: 'TypeScript',
	mts: 'TypeScript',
	cts: 'TypeScript',
	js: 'JavaScript',
	jsx: 'JavaScript',
	mjs: 'JavaScript',
	cjs: 'JavaScript',
	py: 'Python',
	go: 'Go',
	rs: 'Rust',
	cs: 'C#',
	sh: 'Shell',
	bash: 'Shell',
	zsh: 'Shell',
	css: 'CSS',
	scss: 'CSS',
	sass: 'CSS',
	html: 'HTML',
	htm: 'HTML',
	c: 'C',
	h: 'C',
	cpp: 'C++',
	cc: 'C++',
	cxx: 'C++',
	hpp: 'C++',
	lua: 'Lua',
	kt: 'Kotlin',
	kts: 'Kotlin',
	swift: 'Swift',
	rb: 'Ruby',
	php: 'PHP',
	ex: 'Elixir',
	exs: 'Elixir',
	hs: 'Haskell',
	scala: 'Scala',
	dart: 'Dart',
	zig: 'Zig',
	ml: 'OCaml',
	jl: 'Julia',
	sql: 'SQL',
	vue: 'Vue',
	svelte: 'Svelte',
	astro: 'Astro'
};

// ---------------------------------------------------------------------------
// Language name -> TechTag (kind: 'language')
// Keys are the SAME values EXTENSION_LANGUAGE produces (canonical language
// names). Labels must match the keys in card.ts:languageIcon so the OG glyph
// row renders correctly.
// ---------------------------------------------------------------------------

export const LANGUAGE_TAGS = {
	TypeScript: { label: 'TypeScript', kind: 'language' },
	JavaScript: { label: 'JavaScript', kind: 'language' },
	Python: { label: 'Python', kind: 'language' },
	Go: { label: 'Go', kind: 'language' },
	Rust: { label: 'Rust', kind: 'language' },
	'C#': { label: 'C#', kind: 'language' },
	Shell: { label: 'Shell', kind: 'language' },
	CSS: { label: 'CSS', kind: 'language' },
	HTML: { label: 'HTML', kind: 'language' },
	C: { label: 'C', kind: 'language' },
	'C++': { label: 'C++', kind: 'language' },
	Lua: { label: 'Lua', kind: 'language' },
	Kotlin: { label: 'Kotlin', kind: 'language' },
	Swift: { label: 'Swift', kind: 'language' },
	Ruby: { label: 'Ruby', kind: 'language' },
	PHP: { label: 'PHP', kind: 'language' },
	Elixir: { label: 'Elixir', kind: 'language' },
	Haskell: { label: 'Haskell', kind: 'language' },
	Scala: { label: 'Scala', kind: 'language' },
	Dart: { label: 'Dart', kind: 'language' },
	Zig: { label: 'Zig', kind: 'language' },
	OCaml: { label: 'OCaml', kind: 'language' },
	R: { label: 'R', kind: 'language' },
	Julia: { label: 'Julia', kind: 'language' }
};

// ---------------------------------------------------------------------------
// Runtime identity -> TechTag (kind: 'runtime')
// Keys are the identity strings produced by detectDependencies() in
// check-drift.js. Labels MUST match what card.ts:runtimeArchetype() recognises:
//   'bun', 'deno', 'node', 'python', 'go', 'dotnet', 'shell'
// The runtimeArchetype function does a .toLowerCase().includes() check, so
// the label casing here must be correct: e.g. 'Bun' matches r.includes('bun').
// ---------------------------------------------------------------------------

export const RUNTIME_TAGS = {
	bun: { label: 'Bun', kind: 'runtime' },
	deno: { label: 'Deno', kind: 'runtime' },
	node: { label: 'Node.js', kind: 'runtime' },
	python: { label: 'Python', kind: 'runtime' },
	go: { label: 'Go', kind: 'runtime' },
	dotnet: { label: '.NET', kind: 'runtime' },
	shell: { label: 'Shell', kind: 'runtime' }
};

// ---------------------------------------------------------------------------
// Framework dependency identity -> TechTag (kind: 'framework')
// Keys are the package name (or canonical short-form) detectDependencies uses.
// ---------------------------------------------------------------------------

export const FRAMEWORK_TAGS = {
	svelte: { label: 'Svelte', kind: 'framework' },
	'@sveltejs/kit': { label: 'SvelteKit', kind: 'framework' },
	react: { label: 'React', kind: 'framework' },
	next: { label: 'Next.js', kind: 'framework' },
	express: { label: 'Express', kind: 'framework' },
	fastapi: { label: 'FastAPI', kind: 'framework' },
	flask: { label: 'Flask', kind: 'framework' },
	django: { label: 'Django', kind: 'framework' },
	'@opentui/core': { label: 'OpenTUI', kind: 'framework' },
	'@tauri-apps/api': { label: 'Tauri', kind: 'framework' },
	tauri: { label: 'Tauri', kind: 'framework' }
};

// ---------------------------------------------------------------------------
// Database dependency identity -> TechTag (kind: 'data')
// Keys are the package name detectDependencies uses.
// ---------------------------------------------------------------------------

export const DATABASE_TAGS = {
	pg: { label: 'PostgreSQL', kind: 'data' },
	postgres: { label: 'PostgreSQL', kind: 'data' },
	'@supabase/supabase-js': { label: 'Supabase', kind: 'data' },
	'neo4j-driver': { label: 'Neo4j', kind: 'data' },
	mongodb: { label: 'MongoDB', kind: 'data' },
	rxdb: { label: 'RxDB', kind: 'data' },
	psycopg2: { label: 'PostgreSQL', kind: 'data' },
	psycopg: { label: 'PostgreSQL', kind: 'data' },
	sqlalchemy: { label: 'SQLAlchemy', kind: 'data' }
};
