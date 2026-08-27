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
- reads and writes the data files under `config.paths` (`sources.json`, `overrides.json`,
  `excluded.json`, `in-progress.json`, `.drift-cache.json`), plus the hand-authored
  `source-topology.json`
- emits a structured JSON fingerprint per repo (the `SyncedSource` shape)
- knows nothing about how those fingerprints are rendered on screen

### Svelte integration layer

`src/lib/data/` — the build-time registry that turns raw fingerprints into fully-typed
`Project` objects the Svelte app can render.

The integration layer:

- is Vite/SvelteKit build-time code
- consumes those data files as static JSON imports
- owns `types.ts`, `defaults.ts`, `index.ts`, and the `projects/*.ts` authored overlays
- knows the full `Project` shape, tag taxonomy, contribution logic, and scoring

---

## Ownership table

| Concern                                                   | Owner                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fingerprinting (commits, churn, language detection)       | Engine                                 | Core reason the engine exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `sources.json` — reading                                  | Both                                   | Engine reads for drift state; integration reads for registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `sources.json` — writing                                  | Engine only                            | `drift sync` is the one sanctioned writer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `overrides.json` — reading                                | Both                                   | Engine reads for conflict detection; integration for metric precedence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `overrides.json` — writing                                | Engine only                            | `drift keep` / `drift keep-all` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `excluded.json` — reading                                 | Both                                   | Engine filters scan; integration filters registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `excluded.json` — writing                                 | Engine only                            | `drift hide` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `.drift-cache.json`                                       | Engine only                            | Never read by the Svelte build                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tag taxonomy (`tag-taxonomy.js`)                          | Engine (`scripts/tag-taxonomy.js`)     | **Resolved (5DR.4)** — taxonomy moved to the engine; integration imports the four `*_TAGS` maps from `scripts/tag-taxonomy.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Output schema (`sources.schema.json`)                     | Engine (`scripts/sources.schema.json`) | **Resolved (5DR.5)** — schema moved to the engine; validated at write time; `FINGERPRINT_FIELDS` derived from it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `AuthoredProject` / `Project` types                       | Integration                            | TypeScript types the engine cannot import (plain JS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `projects/*.ts` authored overlays — content               | Integration                            | **Resolved (5DR.6)** — engine no longer reads overlay content. Filename-only `readdirSync` in `buildCoverageStats` is still allowed (lists names, never opens files). `drift author` and `drift flag` (5DR.15/5DR.16, the latter renamed from `drift pin` in 5DR.17) create and modify overlay files; creating and flag-setting is distinct from content-parsing. `drift audit` (5DR.11) reads overlay content via dynamic `import()` of the typed export value to score editorial depth — a sanctioned exception (imports the module's value, does NOT regex-scrape source text, unlike the retired `curatedLanguages`/`curatedStatus`).                                                                                        |
| `curatedLanguages(slug)` / `curatedStatus(slug)`          | ~~Engine~~ retired                     | **Resolved (5DR.6)** — both functions deleted. Advisory hints (`ungated`, `statusHint`) removed from the report. The correctness gate (curated tags ⊆ detected) remains as a CI test in `data.test.ts`; completeness belongs in 5DR.11 (`drift audit`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `defaultProjectFromManifest` / `mergeAuthored`            | Integration                            | Pure build-time builders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `withSyncedMetrics`                                       | Integration                            | Applies override > synced > provisional precedence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Config (paths, scan root, author identity, brand colours) | Engine (`scripts/drift-config.js`)     | **Resolved (5DR.3)** — `drift.config.ts` per-machine config; built-in defaults reproduce previous behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `repoNames` exclusion list                                | Engine (`config.excludedRepoNames`)    | **Resolved (5DR.3)** — moved to `drift.config.ts`, paired with `scanRoot`; `excluded.json` now holds only `slugs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Project scoring / hero selection                          | Integration                            | `scoring.ts` — engine never touches this                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Graph / relationship edges                                | Integration                            | `graph.ts`, `threads.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Themes / visual data                                      | Integration                            | `themes.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Authorship signals (bot exclusion, author headcount)      | Engine                                 | **5DR.21** — `commitsHuman`, `authorsDistinct`, `authorsDistinctHuman`, `commitMeRoot`. Measurement, so the engine owns it; non-human authors are matched by `config.author.botPattern`. `authorsDistinctHuman` collapses every AUTHOR_PATTERN identity to one, so it counts people rather than addresses. **Requires a PCRE-enabled git:** excluding an author needs a negative lookahead (`--perl-regexp`), because `--invert-grep` inverts the message match and not `--author`. Without PCRE those two queries fail, the counts return null, and the guards omit `commitsHuman` and `authorsDistinctHuman`; `inferContribution` then divides by the raw `commitsAny`, degrading to pre-5DR.21 behaviour rather than failing. |
| Role inference (solo / lead / collaborator)               | Integration                            | **5DR.21** — `inferContribution` in `defaults.ts`. Editorial judgement, not measurement: the engine supplies the signals and never stores a role. An authored `contribution.role` still wins outright via `mergeContribution`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Intra-span activity shape                                 | Engine                                 | **5DR.20** — `spanMonthsActive`, `spanMonthsAll`, `spanGapMaxDays`, `commitMeLast`. Author-scoped, matching `commitAnyRoot`: measures whether Jason was sustained or bursty, not whether the repo had a pulse. On a team repo the two diverge sharply.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Tech surface scope (which kinds each surface renders)     | Integration                            | **4QU.8** — `SURFACE_KINDS` in `tech-overlays.ts`, the single policy table both the map and the toolkit read. The engine owns tech _identity_ (`tag-taxonomy.js`); which of those labels a given surface shows is a presentation decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## Data flow

```
primary and companion git repos on disk
      │
      │  source-topology.json (hand-authored companion groupings)
      ▼
  [Engine]
  check-drift.js
  - fingerprint every repo
  - write sources.json (via drift sync)
  - write overrides.json (via drift keep / keep-all)
  - write excluded.json (via drift hide)
  - write in-progress.json (via drift promote)
  - write .drift-cache.json (HEAD-sha cache; engine-only)
      │
      │  sources.json ─────────────────────────┐
      │  overrides.json ───────────────────────┤
      │  excluded.json ────────────────────────┤
      │  in-progress.json ─────────────────────┤
      ▼                                        ▼
  [Engine reads for drift report]     [Integration reads at build time]
                                       index.ts / defaults.ts
                                       + projects/*.ts authored overlays
                                              │
                                              ▼
                                    mergeAuthored → withSyncedMetrics
                                    (override > synced > provisional)
                                              │
                                              ▼
                                         Project[]
                                       (fully typed, merged)
                                              │
                                              ▼
                                        Svelte components
```

For the per-metric precedence chain inside `withSyncedMetrics` (not the layer-level
flow above), see `docs/drift-engine-reference.md`.

---

## The engine's public output contract

The engine writes `SyncedSource` records (one per slug) into `sources.json`. This is the
only output the integration layer depends on.

Repository relationships are declared in the tracked `source-topology.json` file. Local
absolute paths only resolve the source IDs from that topology. Metrics, dates, contribution
inference, `commitHead`, and `urlRepo` come from the primary repository. Languages, runtimes,
frameworks, and databases are merged as an ordered union across the primary and every
companion. `urlsRepoCompanion` preserves topology order for portfolio links. Cache entries
include every source HEAD, so a companion-only commit invalidates the project fingerprint.

**Canonical contract:** `scripts/sources.schema.json` (`$defs/SyncedSource`) — a JSON Schema
draft-07 definition with `additionalProperties: false`. The engine validates every assembled
`SyncedSource` record against this schema before writing `sources.json`. A contract violation
causes `drift sync` to throw and write nothing (fail-closed).

The shape (for illustration — the schema is authoritative):

```typescript
interface SyncedSource {
	commitHead?: string;
	measuredRef?: string; // metadata; excluded from drift comparison
	// commit grid
	commitsAny?: number;
	commitsAnyRecent?: number;
	commitsMe?: number;
	commitsMeRecent?: number;
	// inference-only inputs: never reach Project; consumed in defaults.ts
	commitsHuman?: number;
	authorsDistinct?: number;
	authorsDistinctHuman?: number;
	commitMeRoot?: boolean;
	commitMeLast?: string;
	detectedLanguages?: string[];
	// dates
	commitAnyLast?: string;
	commitAnyRoot?: string;
	// intra-span activity shape: measured, not yet surfaced on the site
	spanMonthsActive?: number;
	spanMonthsAll?: number;
	spanGapMaxDays?: number;
	// codebase size
	linesAny?: number;
	// churn grid (8 fields)
	linesMeAdded?: number;
	linesMeRemoved?: number;
	linesAnyAdded?: number;
	linesAnyRemoved?: number;
	linesMeAddedRecent?: number;
	linesMeRemovedRecent?: number;
	linesAnyAddedRecent?: number;
	linesAnyRemovedRecent?: number;
	// repo identity and dependency-manifest fields
	urlRepo?: string;
	urlsRepoCompanion?: string[];
	detectedRuntime?: string[];
	detectedDatabase?: string[];
	detectedFramework?: string[];
	detectedTechFirstSeen?: Record<string, string>;
}
```

All fields are optional. The integration layer must tolerate any subset being absent.
Adding a field requires three coordinated edits: the schema property in
`scripts/sources.schema.json` (the gate), the `SyncedSource` interface in `types.ts`,
and the `getFingerprint` return value in `check-drift.js` (the `FINGERPRINT_FIELDS`
derivation picks up the new field automatically once the schema is updated). Only 13
of these fields reach the site as metrics (the `SyncedMetricKey` union in `types.ts`);
see `docs/drift-engine-reference.md` for the full data-model breakdown.

---

## Resolved couplings

All boundary violations have been resolved. The engine's only repo dependency is the
data files under `config.paths`, the hand-authored `source-topology.json`, and a
filename-only `readdirSync` of `projects/` for coverage counting.

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

See [`docs/drift-authoring.md`](./drift-authoring.md#what-will-overwrite-me) for the
per-field authoring guide's own verb-by-verb table, kept current against the source
`Write-isolation` declarations in `check-drift.js`.

The engine enforces single-file writes per verb. No verb touches more than one data file:

| Verb                            | File written                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `drift sync`                    | `sources.json` only                                                                         |
| `drift keep` / `drift keep-all` | `overrides.json` only                                                                       |
| `drift hide`                    | `excluded.json` only                                                                        |
| `drift promote`                 | `in-progress.json` only                                                                     |
| `drift author`                  | `projects/<slug>.ts` only (create-if-absent)                                                |
| `drift flag`                    | `projects/<slug>.ts` only (insert or flip `pin`/`hide`; renamed from `drift pin` in 5DR.17) |
| `drift tag`                     | `projects/<slug>.ts` only (splice `tags` / `suppressTags`)                                  |
| `drift relate project`          | `projects/<slug>.ts` only (append to `relationships`)                                       |
| `drift tech`                    | `tech-overlays.ts` only                                                                     |
| `drift relate tech`             | `tech-relationships.ts` only                                                                |
| `drift theme`                   | `themes.ts` only                                                                            |
| `drift audit`, `drift authored` | (no writes — read-only)                                                                     |
| (cache)                         | `.drift-cache.json` only                                                                    |

The integration layer never writes any of these files. Every verb above that touches
`projects/<slug>.ts` inserts or flips named properties via a TypeScript-compiler splice
(or, for `drift author`, creates the file from a template); none rewrites editorial
content wholesale. See `docs/drift-authoring.md#what-will-overwrite-me` for the
per-verb table this one summarises.

---

## What moved in 5DR.6 (done)

The engine/integration split has landed. What changed:

1. ~~`curatedLanguages` and `curatedStatus` move out of the engine.~~ Done — both functions deleted; engine never parses `.ts` files.
2. ~~The integration layer (or a build step) exposes overlay data as JSON.~~ Not taken — Route B (drop the dependency) was chosen over the JSON-bridge route.
3. The engine no longer parses any file from `src/lib/data/`. Filename-only `readdirSync` of `projects/` remains for coverage counting (lists names, never opens content).
4. ~~`tag-taxonomy.js` moves to a shared boundary location~~ — done in 5DR.4: moved to `scripts/tag-taxonomy.js`.

The engine's repo dependency is the data files under `config.paths` it reads and
writes (`sources.json`, `overrides.json`, `excluded.json`, `in-progress.json`,
`.drift-cache.json`), the hand-authored `source-topology.json`, plus a filename-only
`readdirSync` of `projects/` for coverage counting and, for `drift audit`, a
read-only dynamic import of each overlay's exported value. It can in principle be
extracted into a standalone package.

### Overlay reads and writes [5DR.11 / 5DR.15 / 5DR.16]

Several verbs added overlay-level access to the engine across M5: `drift author`,
`drift flag` (renamed from `drift pin` in 5DR.17), `drift tag`, and
`drift relate project` all write `projects/<slug>.ts`; `drift audit` reads it.

**`drift author` (5DR.15) and `drift flag` (5DR.16)** write `projects/<slug>.ts`.
Creating a new overlay file is distinct from parsing one for data: the engine
produces a TypeScript source string (the scaffold template) and uses the
TypeScript compiler API (targeted text-splice) for `flag`. The `projects/*.ts`
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
