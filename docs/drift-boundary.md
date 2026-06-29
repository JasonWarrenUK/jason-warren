# Drift Boundary Document

> Defines the contract between the **core engine** (`scripts/check-drift.js`) and the
> **Svelte integration layer** (`src/lib/data/`). The engine/integration split (5DR.6)
> has landed — the boundary is now physically enforced. This document is the source of
> truth for which layer owns what.

---

## The two layers

### Core engine

`scripts/check-drift.js` — a portable CLI tool that fingerprints git repos, manages the
drift manifest, and provides an interactive reporting surface.

The engine:
- is a plain Node/Bun script with no framework dependency
- reads and writes the four data files (`sources.json`, `overrides.json`, `excluded.json`, `.drift-cache.json`)
- emits a structured JSON fingerprint per repo (the `SyncedSource` shape)
- knows nothing about how those fingerprints are rendered on screen

### Svelte integration layer

`src/lib/data/` — the build-time registry that turns raw fingerprints into fully-typed
`Project` objects the Svelte app can render.

The integration layer:
- is Vite/SvelteKit build-time code
- consumes the four data files as static JSON imports
- owns `types.ts`, `defaults.ts`, `index.ts`, and the `projects/*.ts` authored overlays
- knows the full `Project` shape, tag taxonomy, contribution logic, and scoring

---

## Ownership table

| Concern | Owner | Notes |
|---|---|---|
| Fingerprinting (commits, churn, language detection) | Engine | Core reason the engine exists |
| `sources.json` — reading | Both | Engine reads for drift state; integration reads for registry |
| `sources.json` — writing | Engine only | `drift sync` is the one sanctioned writer |
| `overrides.json` — reading | Both | Engine reads for conflict detection; integration for metric precedence |
| `overrides.json` — writing | Engine only | `drift keep` / `drift keep-all` only |
| `excluded.json` — reading | Both | Engine filters scan; integration filters registry |
| `excluded.json` — writing | Engine only | `drift hide` only |
| `.drift-cache.json` | Engine only | Never read by the Svelte build |
| Tag taxonomy (`tag-taxonomy.js`) | Engine (`scripts/tag-taxonomy.js`) | **Resolved (5DR.4)** — taxonomy moved to the engine; integration imports the four `*_TAGS` maps from `scripts/tag-taxonomy.js`. |
| Output schema (`sources.schema.json`) | Engine (`scripts/sources.schema.json`) | **Resolved (5DR.5)** — schema moved to the engine; validated at write time; `FINGERPRINT_FIELDS` derived from it. |
| `AuthoredProject` / `Project` types | Integration | TypeScript types the engine cannot import (plain JS) |
| `projects/*.ts` authored overlays — content | Integration | **Resolved (5DR.6)** — engine no longer reads overlay content. Filename-only `readdirSync` in `buildCoverageStats` is still allowed (lists names, never opens files). `drift author` and `drift pin` (5DR.15/5DR.16) create and modify overlay files; creating and flag-setting is distinct from content-parsing. `drift audit` (5DR.11) reads overlay content via dynamic `import()` of the typed export value to score editorial depth — a sanctioned exception (imports the module's value, does NOT regex-scrape source text, unlike the retired `curatedLanguages`/`curatedStatus`). |
| `curatedLanguages(slug)` / `curatedStatus(slug)` | ~~Engine~~ retired | **Resolved (5DR.6)** — both functions deleted. Advisory hints (`ungated`, `statusHint`) removed from the report. The correctness gate (curated tags ⊆ detected) remains as a CI test in `data.test.ts`; completeness belongs in 5DR.11 (`drift audit`). |
| `defaultProjectFromManifest` / `mergeAuthored` | Integration | Pure build-time builders |
| `withSyncedMetrics` | Integration | Applies override > synced > authored precedence |
| Config (paths, scan root, author identity, brand colours) | Engine (`scripts/drift-config.js`) | **Resolved (5DR.3)** — `drift.config.ts` per-machine config; built-in defaults reproduce previous behaviour |
| `repoNames` exclusion list | Engine (`config.excludedRepoNames`) | **Resolved (5DR.3)** — moved to `drift.config.ts`, paired with `scanRoot`; `excluded.json` now holds only `slugs` |
| Project scoring / hero selection | Integration | `scoring.ts` — engine never touches this |
| Graph / relationship edges | Integration | `graph.ts`, `threads.ts` |
| Themes / visual data | Integration | `themes.ts` |

---

## Data flow

```
git repos on disk
      │
      ▼
  [Engine]
  check-drift.js
  - fingerprint every repo
  - write sources.json
  - write overrides.json (via drift keep)
  - write excluded.json (via drift hide)
      │
      │  sources.json ─────────────────────────┐
      │  overrides.json ───────────────────────┤
      │  excluded.json ────────────────────────┤
      ▼                                        ▼
  [Engine reads for drift report]     [Integration reads at build time]
                                       index.ts / defaults.ts
                                       + projects/*.ts authored overlays
                                              │
                                              ▼
                                         Project[]
                                       (fully typed, merged)
                                              │
                                              ▼
                                        Svelte components
```

---

## The engine's public output contract

The engine writes `SyncedSource` records (one per slug) into `sources.json`. This is the
only output the integration layer depends on.

**Canonical contract:** `scripts/sources.schema.json` (`$defs/SyncedSource`) — a JSON Schema
draft-07 definition with `additionalProperties: false`. The engine validates every assembled
`SyncedSource` record against this schema before writing `sources.json`. A contract violation
causes `drift sync` to throw and write nothing (fail-closed).

The shape (for illustration — the schema is authoritative):

```typescript
interface SyncedSource {
  head?: string;
  // commit grid
  commits?: number;
  commitsRecentAll?: number;
  commitsMine?: number;
  commitsRecent?: number;
  // dates
  lastCommit?: string;
  firstCommit?: string;
  // language advisory
  languages?: string[];
  // codebase size
  linesOfCode?: number;
  // churn grid (8 fields)
  linesAdded?: number;
  linesRemoved?: number;
  linesAddedAll?: number;
  linesRemovedAll?: number;
  linesAddedRecent?: number;
  linesRemovedRecent?: number;
  linesAddedRecentAll?: number;
  linesRemovedRecentAll?: number;
  // dependency-manifest fields
  remote?: string;
  runtime?: string[];
  database?: string[];
  framework?: string[];
}
```

All fields are optional. The integration layer must tolerate any subset being absent.
Adding a field requires three coordinated edits: the schema property in
`scripts/sources.schema.json` (the gate), the `SyncedSource` interface in `index.ts`,
and the `getFingerprint` return value in `check-drift.js` (the `FINGERPRINT_FIELDS`
derivation picks up the new field automatically once the schema is updated).

---

## Resolved couplings

All boundary violations have been resolved. The engine's only repo dependency is the
four data files plus a filename-only `readdirSync` of `projects/` for coverage counting.

### Coupling [5DR.4] — tag taxonomy import (resolved)

`tag-taxonomy.js` moved to `scripts/tag-taxonomy.js` (5DR.4). The engine now imports
`EXTENSION_LANGUAGE` locally (`./tag-taxonomy.js`); the integration layer imports the
four `*_TAGS` maps back from `../../../scripts/tag-taxonomy.js`. The engine no longer
imports from `src/lib/data/` for the taxonomy.

### Coupling [5DR.6] — regex-parse of `.ts` overlays (resolved)

Both `curatedLanguages` and `curatedStatus` deleted from the engine (5DR.6, Route B).
The advisory hints they fed (`ungated` and `statusHint`) were removed from the report.
The engine took Route B: it dropped the overlay dependency entirely rather than building
a JSON-bridge file. The `ungated` completeness nudge was not ported to a hard CI test
because curation is intentionally selective (omitting HTML/CSS/Shell is correct); the
existing correctness gate in `data.test.ts` (curated ⊆ detected) is sufficient. A
completeness audit belongs in 5DR.11 (`drift audit`).

---

## Write-isolation contract

The engine enforces single-file writes per verb. No verb touches more than one data file:

| Verb | File written |
|---|---|
| `drift sync` | `sources.json` only |
| `drift keep` / `drift keep-all` | `overrides.json` only |
| `drift hide` | `excluded.json` only |
| `drift author` | `projects/<slug>.ts` only (create-if-absent) |
| `drift pin` | `projects/<slug>.ts` only (insert or flip `pin` property) |
| `drift audit` | (no writes — read-only) |
| (cache) | `.drift-cache.json` only |

The integration layer never writes any of these files. Authored `projects/*.ts`
overlays are written by the developer or by the sanctioned scaffold/flag verbs
(`drift author`, `drift pin`; 5DR.15/5DR.16) — never by the build or by `drift sync`.

---

## What moved in 5DR.6 (done)

The engine/integration split has landed. What changed:

1. ~~`curatedLanguages` and `curatedStatus` move out of the engine.~~ Done — both functions deleted; engine never parses `.ts` files.
2. ~~The integration layer (or a build step) exposes overlay data as JSON.~~ Not taken — Route B (drop the dependency) was chosen over the JSON-bridge route.
3. The engine no longer parses any file from `src/lib/data/`. Filename-only `readdirSync` of `projects/` remains for coverage counting (lists names, never opens content).
4. ~~`tag-taxonomy.js` moves to a shared boundary location~~ — done in 5DR.4: moved to `scripts/tag-taxonomy.js`.

The engine's only repo dependency is the four data files it reads and writes
(`sources.json`, `overrides.json`, `excluded.json`, `.drift-cache.json`), plus a
filename-only `readdirSync` of `projects/` for coverage counting and, for
`drift audit`, a read-only dynamic import of each overlay's exported value.
It can in principle be extracted into a standalone package.

### Overlay reads and writes [5DR.11 / 5DR.15 / 5DR.16]

Three new verbs introduced overlay-level access to the engine in M5:

**`drift author` (5DR.15) and `drift pin` (5DR.16)** write `projects/<slug>.ts`.
Creating a new overlay file is distinct from parsing one for data: the engine
produces a TypeScript source string (the scaffold template) and uses the
TypeScript compiler API (targeted text-splice) for `pin`. The `projects/*.ts`
files are git-tracked and owned by the developer; these verbs automate the
mechanical parts of authoring without reading editorial content.

**`drift audit` (5DR.11)** reads overlay content via `await import()` of each
`projects/*.ts` file using Bun's native ESM loader (`pathToFileURL`). It imports
the typed export value to access `description`, `highlights`, and `contribution`
fields for mechanical-proxy tier scoring. This is distinct from the retired
`curatedLanguages`/`curatedStatus` regex-scraping (5DR.6): it operates on the
live module value, not on source text, and writes nothing. It is a sanctioned
exception to the "engine never parses overlay content" rule — documented here as
the authoritative record.
