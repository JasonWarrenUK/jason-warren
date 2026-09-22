# Entanglement: what you are actually adopting

> The honest coupling ledger for Drift CLI, Drift Framework and the
> reference site, as of the date in the footer. Read this before planning
> an adoption; the rest of the suite assumes you have.

## Contents

- [Summary](#summary)
- [Drift CLI](#drift-cli)
- [Drift Framework](#drift-framework)
- [The reference site](#the-reference-site)
- [Shared boundary code](#shared-boundary-code)
- [What adoption means today](#what-adoption-means-today)

---

## Summary

| Artefact        | Boundary state                                                       | Packaged? | Adoptable how                                |
| --------------- | -------------------------------------------------------------------- | --------- | -------------------------------------------- |
| Drift CLI       | Internally boundaried; extraction blockers known and tracked (M10)   | No        | Copy `scripts/` into your repo               |
| Drift Framework | Clean module seams; never designed as a package; Vite-dependent      | No        | Copy `src/lib/data/` into your repo          |
| Reference site  | Not part of Drift; interleaves Jason's editorial data with mechanism | n/a       | Read it as the parity spec, not code to lift |

The engine/integration split is real and physically enforced (see
[`docs/drift-boundary.md`](../drift-boundary.md)): the CLI never parses
Framework code for data, the Framework never writes files, and every
boundary crossing is a documented, sanctioned exception. "Boundaried" is
not "extracted", though. The roadmap's Milestone 10 exists precisely
because an earlier claim that the engine "can in principle be extracted
into a standalone package" was verified false; the blockers below are that
correction.

## Drift CLI

**Files:** `scripts/check-drift.js` (the engine), `scripts/drift-config.js`
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
- Write isolation: one file per verb, enforced in the engine.
- Config is per-machine (`drift.config.ts`, gitignored) with built-in
  defaults; nothing personal is required to run it.

**Known extraction blockers** (roadmap Milestone 10, all open):

| Blocker                                                                                                                                                                                                                                                                        | Roadmap ID |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `repoRoot` is derived from the script's own location, so an install under `node_modules/` would resolve paths inside the package, not the host repo                                                                                                                            | 10EX.2     |
| `tech-relationships.ts`, `tech-overlays.ts` and `themes.ts` have no `config.paths` entries; they are assumed to be siblings of the projects directory                                                                                                                          | 10EX.3     |
| Scaffolded overlays emit `import type { AuthoredProject } from '../types.js'`, a Framework-owned type the CLI has no business naming                                                                                                                                           | 10EX.4     |
| `typescript` and `prettier` are used (compiler-API splices; `npx prettier` after every JSON write) but not declared as engine dependencies                                                                                                                                     | 10EX.5     |
| Eight verbs are portfolio-shaped: `author`, `flag`, `tag`, `relate project`, `tech`, `relate tech`, `theme`, `audit` all read or write Framework `.ts` files. The extraction shape for them (core + adapter split, or a host-declared overlay contract) is an unresolved spike | 10EX.1     |

**Runtime prerequisites worth knowing up front:**

- `drift audit` requires Bun (it dynamically imports overlay `.ts` files
  via Bun's native ESM loader). Every other verb runs on Node or Bun.
- [`gum`](https://github.com/charmbracelet/gum) is optional but pervasive
  (the interactive menu and formatted output); without it the CLI still
  works, plainly.
- Human-author metrics (`commitsHuman`, `authorsDistinctHuman`) need a
  PCRE-enabled git. Without one those counts return null and role
  inference degrades gracefully.
- `drift enrich` requires an authenticated `gh`.

**Portfolio residue in defaults:** the built-in `author.pattern` default is
Jason's git identities. `drift init` scaffolds generic values and prompts
for yours, so this only bites if you skip `init` and run bare.

## Drift Framework

**Files:** everything under `src/lib/data/`: `types.ts`, `defaults.ts`,
`index.ts` (the registry), `queries.ts`, `scoring.ts`, `graph.ts`,
`tech-graph.ts`, `adoption.ts`, `stack.ts`, `themes.ts`,
`theme-queries.ts`, `threads.ts`, `tech-overlays.ts`,
`tech-relationships.ts`, plus the JSON data files and their schemas. Two
framework-free helpers sit one level up: `src/lib/url-state.ts` and
`src/lib/audience.ts`.

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
- **Vite is load-bearing.** Overlay discovery uses `import.meta.glob`,
  and data files arrive as static JSON imports. Porting to another
  bundler means replacing the discovery mechanism.
- **Mechanism and Jason's data share files.** `themes.ts`,
  `tech-overlays.ts`, `tech-relationships.ts` and every `projects/*.ts`
  overlay are Framework-owned _shapes_ filled with Jason's editorial
  _content_. Adopting the Framework means emptying those arrays and
  authoring your own.
- **"Me" means the configured author.** Every `*Me` metric and the
  scoring that prefers `commitsMe` reflect whoever `author.pattern`
  matches. The semantics are portable; the reference site's copy
  ("N mine of M total") assumes a single-person portfolio.
- **The `enriched` section is written but not yet consumed.**
  `drift enrich` populates GitHub-sourced facts in `sources.json`, but the
  merge into `Project` has not been built (roadmap 5DR.23). Nothing on the
  site reads it yet.

## The reference site

`src/routes/` and `src/lib/components/` are Jason's portfolio: page
structure, components, copy, design system. They are deliberately outside
Drift. Treat them as the executable specification for
[`05-build-guide.md`](./05-build-guide.md)'s parity roster, not as code to
lift wholesale; the whole point of the Framework boundary is that these are
replaceable.

One route deserves a flag: `/drift-engine` is portfolio content _about_
Drift, with build-time-highlighted snippets that are trimmed copies of real
source. One snippet (`slugSnippet`) hand-copies a type definition; nothing
enforces it staying in sync with `types.ts`.

## Shared boundary code

`scripts/tag-taxonomy.js` is the one module both artefacts import: the CLI
locally, the Framework by relative path. It owns tech _identity_ (which
labels exist, keyed how). It moves with whichever artefact you adopt; if
you adopt both, it is the file that must stay shared.

## What adoption means today

- **CLI only** (keep your own data pipeline): copy `scripts/`, run
  `drift init`, point `dataDir` wherever you like. You get `sources.json`
  and the report loop. The eight portfolio-shaped verbs will expect
  Framework-shaped `.ts` files to exist; simply do not use them.
- **CLI + Framework** (the supported path, and what
  [`05-build-guide.md`](./05-build-guide.md) sequences): copy `scripts/`
  and `src/lib/data/`, keep the relative taxonomy import intact, empty the
  editorial arrays, build your own routes against the API in
  [`04-framework.md`](./04-framework.md).
- **Fork the repo**: works today with the least friction, at the cost of
  carrying the reference site until you replace it.

When Milestone 10 lands, the first option becomes an install rather than a
copy. Until then, this ledger is the contract.

---

_Coupling state as recorded against roadmap Milestone 10, September 2026.
Re-check `docs/roadmaps/mvp.md` for movement._
