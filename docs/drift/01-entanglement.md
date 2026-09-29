# Entanglement: what you are actually adopting

> The honest coupling ledger for the Drift Engine, Drift Framework and
> Portfolio, as of the date in the footer. Read this before planning an
> adoption; the rest of the suite assumes you have.

## Contents

- [Summary](#summary)
- [Drift Engine](#drift-engine)
- [Drift Framework](#drift-framework)
- [Portfolio](#portfolio)
- [Shared boundary code](#shared-boundary-code)
- [What adoption means today](#what-adoption-means-today)

---

## Summary

| Artefact        | Boundary state                                                       | Packaged? | Adoptable how                                |
| --------------- | -------------------------------------------------------------------- | --------- | -------------------------------------------- |
| Drift Engine    | Extraction shape decided (ADR-001); mechanical blockers open (M10)   | No        | Copy `scripts/` into your repo               |
| Drift Framework | Clean module seams; never designed as a package; Vite-dependent      | No        | Copy `src/lib/data/` into your repo          |
| Portfolio       | Not part of Drift; interleaves Jason's editorial data with mechanism | n/a       | Read it as the parity spec, not code to lift |

The Engine/Framework split is real and physically enforced (see
[`docs/drift-boundary.md`](../drift-boundary.md)): the Engine never parses
Framework code for data, the Framework never writes files, and every
boundary crossing is a documented, sanctioned exception. "Boundaried" is
not "extracted", though. The roadmap's Milestone 10 exists because an
earlier claim that the Engine "can in principle be extracted into a
standalone package" was verified false. [ADR-001](../adr/0001-extraction-shape.md)
now names the extraction shape: three artefacts (Engine, Framework,
Portfolio), with the Engine owning the overlay contract as JSON Schema.
The blockers below are what is left to build against that decision.

## Drift Engine

**Files:** `scripts/check-drift.js` (the Engine), `scripts/drift-config.js`
(config loading), `scripts/tag-taxonomy.js` + `tag-taxonomy.d.ts` (tech
identity), `scripts/sources.schema.json` (the output contract), plus the
`drift` zsh wrapper at the repo root.

**What is clean:**

- No framework dependency: plain Node/Bun, importable nowhere, run as a
  script.
- Offline by default: every verb is local git and filesystem work except
  `drift enrich`, which is opt-in and shells out to `gh`.
- Fail-closed output: every `sources.json` write is validated against
  `sources.schema.json` first; a violation throws and writes nothing.
- Write isolation: one file per verb, enforced in the Engine.
- Config is per-machine (`drift.config.ts`, gitignored) with built-in
  defaults; nothing personal is required to run it.

**Extraction blockers** (roadmap Milestone 10):

| Blocker                                                                                                                                                                                                                                                                                                                                                                            | Roadmap ID |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Decided: the nine overlay verbs (`author`, `flag`, `tag`, `relate project`, `relate tech`, `tech`, `theme`, `audit`, `authored`) all stay in the Engine. [ADR-001](../adr/0001-extraction-shape.md) retires the "portfolio-shaped" label: the overlay is the Engine's own output                                                                                                   | 10EX.1     |
| `repoRoot` is derived from the script's own location, so an install under `node_modules/` would resolve paths inside the package, not the host repo                                                                                                                                                                                                                                | 10EX.2     |
| `tech-relationships.ts`, `tech-overlays.ts` and `themes.ts` have no `config.paths` entries; they are assumed to be siblings of the projects directory                                                                                                                                                                                                                              | 10EX.3     |
| Scaffolded overlays emit `import type { AuthoredProject } from '../types.js'`. ADR-001 makes this the Engine's own type; the import becomes legitimate once the Engine ships its own `.d.ts`                                                                                                                                                                                       | 10EX.4     |
| `typescript` and `prettier` are used (compiler-API splices; `npx prettier` after every JSON write) but not declared as Engine dependencies. ADR-001 makes `typescript` legitimately core, since the Engine now owns a TypeScript contract                                                                                                                                          | 10EX.5     |
| Five enum and field lists are hand-mirrored from `src/lib/data/types.ts` (`AUTHOR_FIELD_ENUMS`, the relationship kinds split across `PROJECT_RELATIONSHIP_KINDS` and `TECH_RELATIONSHIP_KINDS`, `TECH_TAG_KINDS`, `TECH_SURFACES`, `AUTHORED_FIELDS`); ADR-001 moves the contract into `scripts/overlay.schema.json` with a parity-tested `.d.ts`, and derives these lists from it | 10EX.7     |
| The moved types stay in `src/lib/data/types.ts` until the Framework's imports and `tag-taxonomy.d.ts` are repointed at the Engine's `.d.ts`                                                                                                                                                                                                                                        | 10EX.8     |
| The nine overlay verbs assume `config.paths.projects` and its three sibling files exist, and `drift report --full` lists `projectsDir` for its coverage line (`buildCoverageStats`, check-drift.js:2526); an Engine-only adopter has no overlay directory and gets a bare ENOENT, not a message                                                                                    | 10EX.9     |
| The M10 acceptance test (a bare copy of `scripts/` in an empty repo running `drift init`, `drift sync` and `drift author`, with the scaffolded overlay type-checking with no `src/lib/data/` present) is unscripted                                                                                                                                                                | 10EX.10    |

**Runtime prerequisites worth knowing up front:**

- `drift audit` and `drift authored` require Bun (both dynamically import
  overlay `.ts` files via Bun's native ESM loader). Every other verb runs
  on Node or Bun, though `loadOverlays` (the shared loader) also feeds the
  tag, tech and relate pickers and swallows import errors per file: on
  Node those pickers can silently lose overlay labels rather than fail.
- [`gum`](https://github.com/charmbracelet/gum) is optional but pervasive
  (the interactive menu and formatted output); without it the Engine still
  works, plainly.
- Human-author metrics (`commitsHuman`, `authorsDistinctHuman`) need a
  PCRE-enabled git. Without one those counts return null and role
  inference degrades gracefully.
- `drift enrich` requires an authenticated `gh`.

**Jason-specific residue in defaults:** the built-in `author.pattern` default is
Jason's git identities. `drift init` scaffolds generic values and prompts
for yours, so this only bites if you skip `init` and run bare.

## Drift Framework

**Files:** the mechanism files under `src/lib/data/`: `defaults.ts`,
`index.ts` (the registry), `queries.ts`, `scoring.ts`, `graph.ts`,
`tech-graph.ts`, `adoption.ts`, `stack.ts`, `theme-queries.ts`,
`threads.ts`, plus the JSON data files and their schemas. `types.ts` is
shared today: `Project` and its derived types are Framework-owned, but the
overlay contract, tech identity types, `Theme` in `themes.ts`, and the four
data-file mirrors (`SyncedSource`, `EnrichedSource`, `TrackedField`,
`InProgressEntry`) also live there until 10EX.7/10EX.8 move them to the
Engine. Two framework-free helpers sit one level up: `src/lib/url-state.ts`
and `src/lib/audience.ts`.

**What is clean:**

- The data layer is pure: DOM-free, deterministic, side-effect-free
  functions over the registry, all unit-tested.
- The registry pipeline is a single composition in `index.ts`; there is
  exactly one application point for each transformation.
- Data integrity is enforced twice: a test suite fails on bad references
  before the build, and prerender throws on dangling slugs during it.

**What is coupled:**

- **Not a package, by any measure.** No entry point, no exports map, no
  independent `package.json`. It imports the tag taxonomy from
  `../../../scripts/tag-taxonomy.js`, a relative reach across the repo.
  ADR-001 grows this reach: once 10EX.7 lands, the Framework also imports
  the overlay contract's types from `scripts/`.
- **Vite is load-bearing.** Overlay discovery uses `import.meta.glob`,
  and data files arrive as static JSON imports. Porting to another
  bundler means replacing the discovery mechanism. ADR-001 records this as
  a blocker for the packaging milestone (12PK.1), not for M10, since the
  Framework stays in this repository through Stage 1.
- **Mechanism, policy and Portfolio content share files.** `themes.ts`
  holds all three artefacts at once: `Theme` is Engine-owned,
  `ThemeWithProjects` is Framework-owned and the `themes` array is Jason's
  editorial content. `tech-overlays.ts` holds two: `SURFACE_KINDS` is a
  Framework policy table layered on the Engine's `TechSurface` and
  `TagKind` types, and the `techOverlays` array is Jason's editorial
  content. Adopting the Framework means keeping the Engine and Framework
  layers and authoring your own content.
- **"Me" means the configured author.** Every `*Me` metric and the
  scoring that prefers `commitsMe` reflect whoever `author.pattern`
  matches. The semantics are portable; the Portfolio's copy
  ("N mine of M total") assumes a single-person site.
- **The `enriched` section is written but not yet consumed.**
  `drift enrich` populates GitHub-sourced facts in `sources.json`, but the
  merge into `Project` has not been built (roadmap 5DR.23). Nothing on the
  site reads it yet.

## Portfolio

`src/routes/` and `src/lib/components/` are Jason's portfolio: page
structure, components, copy, design system. They are deliberately outside
Drift. Treat them as the executable specification for
[`05-build-guide.md`](./05-build-guide.md)'s parity roster, not as code to
lift wholesale; the whole point of the Framework boundary is that these are
replaceable.

One route deserves a flag: `/drift-engine` is Portfolio content _about_
Drift, with build-time-highlighted snippets that are trimmed copies of real
source. One snippet (`slugSnippet`) hand-copies a type definition; nothing
enforces it staying in sync with `types.ts`.

## Shared boundary code

`scripts/tag-taxonomy.js` is Engine-owned tech _identity_ (which labels
exist, keyed how): the Engine imports it locally, the Framework by
relative path. Adopting the Framework implies adopting the Engine, since
the Framework has no purpose without it. Once 10EX.7 lands, the overlay
contract (`scripts/overlay.schema.json` and its `.d.ts`) joins the
taxonomy as a second file that must stay shared between the two.

## What adoption means today

- **Engine only** (keep your own data pipeline): copy `scripts/`, create a
  data directory and point `dataDir` at it in `drift.config.ts` before
  running `drift init` (the default, `src/lib/data`, does not exist in an
  empty repo, so `init` fails). `drift sync` only fingerprints slugs already
  in `sources.json`, so seed that file by hand with `lastSyncedAt` and one
  entry per repo. `drift` and `drift sync` then run. `drift report --full`
  and the nine overlay verbs assume `config.paths.projects` and its three
  sibling files exist; until 10EX.9 lands a missing path ends in a bare
  ENOENT, so create an empty projects directory and leave the overlay verbs
  alone.
- **Engine + Framework** (the supported path, and what
  [`05-build-guide.md`](./05-build-guide.md) sequences): copy `scripts/`
  and `src/lib/data/`, keep the relative taxonomy import intact, empty the
  editorial arrays, build your own routes against the API in
  [`04-framework.md`](./04-framework.md).
- **Fork the repo**: works today with the least friction, at the cost of
  carrying the Portfolio until you replace it.

Milestone 10 does not turn the first option into a package install: Stage 1
of ADR-001 is a bare copy of `scripts/` that runs `drift init`, `drift
sync` and `drift author` on its own, with the scaffolded overlay
type-checking against the Engine's own types and no `src/lib/data/`
present. An actual install, as a published package, is Milestone 12
(Packaging), with its own ADR still unwritten; it is separate from
ADR-001's deferred Stage 2.

---

_Coupling state as recorded against roadmap Milestone 10 and
[ADR-001](../adr/0001-extraction-shape.md), September 2026. Re-check
`docs/roadmaps/mvp.md` for movement._
