# Drift Boundary Document

> Defines the contract between the **core engine** (`scripts/check-drift.js`) and the
> **Svelte integration layer** (`src/lib/data/`). The engine/integration split (5DR.6)
> will enforce this boundary physically. Until then this document is the source of
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
| Tag taxonomy (`tag-taxonomy.js`) | Integration (leaks to engine) | **Coupling [5DR.4]** — engine imports `EXTENSION_LANGUAGE` directly. Resolves by moving taxonomy to the engine boundary. |
| `AuthoredProject` / `Project` types | Integration | TypeScript types the engine cannot import (plain JS) |
| `projects/*.ts` authored overlays | Integration | Engine reads them today by regex — **Coupling [5DR.6]** |
| `curatedLanguages(slug)` / `curatedStatus(slug)` | Engine (transitional) | Text-parses `.ts` overlay files. Belongs in integration. **Coupling [5DR.6]** |
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
only output the integration layer depends on. The shape is:

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
The engine must not add fields to this shape without a corresponding update to
`SyncedSource` in `index.ts`.

---

## The two active couplings

These are the violations of the boundary that 5DR.6 and its prerequisites exist to fix.

### Coupling [5DR.4] — tag taxonomy import

```js
// check-drift.js line 31
import { EXTENSION_LANGUAGE } from '../src/lib/data/tag-taxonomy.js';
```

The engine needs `EXTENSION_LANGUAGE` to map file extensions to language labels. Because
`tag-taxonomy.js` lives under `src/lib/data/`, the engine is importing from the Svelte
app tree. Resolves by moving `tag-taxonomy.js` (or the subset the engine needs) to a
shared location outside `src/lib/data/`.

### Coupling [5DR.6] — regex-parse of `.ts` overlays

```js
// check-drift.js lines 541–589
function curatedLanguages(slug) { ... } // reads projects/<slug>.ts by regex
function curatedStatus(slug) { ... }    // reads projects/<slug>.ts by regex
```

The engine cannot `import` TypeScript, so it text-parses the authored `.ts` overlay files
to read `status` and `tags[].label`. This ties the engine to the integration layer's file
layout and the authored project format. Resolves by the engine/integration split: the
integration layer exposes a JSON-serialised summary of overlay data (or the engine
drops the dependency and infers from the manifest alone).

---

## Write-isolation contract

The engine enforces single-file writes per verb. No verb touches more than one data file:

| Verb | File written |
|---|---|
| `drift sync` | `sources.json` only |
| `drift keep` / `drift keep-all` | `overrides.json` only |
| `drift hide` | `excluded.json` only |
| (cache) | `.drift-cache.json` only |

The integration layer never writes any of these files. The authored `projects/*.ts`
overlays are written by the developer, never by an automated process.

---

## What moves in 5DR.6

When the engine/integration split lands:

1. `curatedLanguages` and `curatedStatus` move out of the engine.
2. The integration layer (or a build step) exposes overlay data as JSON so the engine
   can read it without parsing TypeScript.
3. The engine no longer has any import from `src/lib/data/`.
4. `tag-taxonomy.js` (or the engine's slice of it) moves to a shared boundary location.

After 5DR.6, the engine's only dependency on the rest of the repo is the four data
files it reads and writes. It can in principle be extracted into a standalone package.
