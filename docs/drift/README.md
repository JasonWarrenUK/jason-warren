# Drift

> The consumer-facing documentation suite for Drift. It assumes you have
> already chosen Drift and want to run it, adopt it, or rebuild a portfolio
> on top of it. For the internal engineering record, see the
> [companion documents](#companion-documents).

## Contents

- [What Drift is](#what-drift-is)
- [The three artefacts](#the-three-artefacts)
- [The model, in five facts](#the-model-in-five-facts)
- [Reading order](#reading-order)
- [Document roster](#document-roster)
- [Precedence](#precedence)
- [Companion documents](#companion-documents)

---

## What Drift is

Portfolio data rots: commit counts, language lists and activity claims go
stale the moment you stop editing them. Drift inverts the authoring model.
Git repositories are the source of truth for everything measurable; humans
author only what git cannot see (taglines, highlights, judgement calls); a
CLI reports whenever the two disagree.

## The three artefacts

Three things share this repository. The distinction matters because they
are at different stages of separation, and this suite names them
consistently:

| Artefact            | What it is                                                                                                            | Lives at                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Drift CLI**       | The engine: fingerprints git repos, writes the data files, reports drift. Plain Node/Bun script, no framework code.   | `scripts/check-drift.js` and siblings |
| **Drift Framework** | The SvelteKit consumer layer: turns the data files into typed `Project` objects and derived structures at build time. | `src/lib/data/`                       |
| **Reference site**  | Jason Warren's portfolio: routes and components consuming the Framework. Not part of Drift; it is the worked example. | `src/routes/`, `src/lib/components/`  |

Neither the CLI nor the Framework is published as a package. Adopting
either today means copying files. [`01-entanglement.md`](./01-entanglement.md)
states exactly what is separated, what is coupled, and what is still
Jason-specific.

## The model, in five facts

1. **The manifest decides what exists.** Every non-excluded entry in
   `sources.json` appears on the site. Projects are not registered by hand;
   `drift sync` discovers and fingerprints them.
2. **Measurement and editorial never share a field.** The CLI writes
   measurements (commits, churn, dates, detected tech). Humans write
   editorial fields (tagline, highlights, role judgement) in overlay files.
   No field has two writers.
3. **Metrics resolve as override > synced > provisional.** A hand-pinned
   override beats a synced measurement, which beats a provisional figure
   for unmerged work. Overlays carry no metrics or dates at all, so an
   overlay can never hold a stale number.
4. **Every write is isolated.** Each CLI verb writes exactly one file (one
   section-scoped exception inside `sources.json`). The Framework writes
   nothing.
5. **Builds are deterministic.** The Framework derives everything (scores,
   layouts, adoption dates) as pure functions over the registry, using the
   manifest's `lastSyncedAt` as "now". The same inputs produce a
   byte-identical site.

## Reading order

Read in file order. Each document assumes the ones before it.

1. [`01-entanglement.md`](./01-entanglement.md): what you are actually
   adopting, and its current coupling state. Read first; it sets honest
   expectations for everything after.
2. [`02-cli.md`](./02-cli.md): install, bootstrap, configure and run the
   Drift CLI.
3. [`03-data-contracts.md`](./03-data-contracts.md): every file the CLI
   writes and the Framework reads, and the merge pipeline between them.
4. [`04-framework.md`](./04-framework.md): the Framework's query and
   derivation API, which is what your pages consume.
5. [`05-build-guide.md`](./05-build-guide.md): a sequenced plan for
   building a portfolio with full feature parity and any page or component
   structure you like, ending in the feature-parity roster.

## Document roster

| Document               | Owns                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| This file              | Vocabulary (CLI / Framework / reference site), the five-fact model, suite navigation |
| `01-entanglement.md`   | The coupling ledger: separation status and known blockers, per artefact              |
| `02-cli.md`            | CLI prerequisites, bootstrap, verb purposes, report semantics                        |
| `03-data-contracts.md` | The file-by-file data contract and the merge pipeline summary                        |
| `04-framework.md`      | The Framework module API: what each module computes and guarantees                   |
| `05-build-guide.md`    | Rebuild sequencing and the feature-parity roster                                     |

## Precedence

Where documents disagree, this order wins:

1. **Code and schemas** beat all prose: `scripts/check-drift.js`,
   `scripts/sources.schema.json`, `src/lib/data/types.ts`.
2. **Layer ownership** (which layer owns which concern):
   [`docs/drift-boundary.md`](../drift-boundary.md).
3. **Config keys and the metric lifecycle**:
   [`docs/drift-engine-reference.md`](../drift-engine-reference.md).
4. **Per-field authoring**: [`docs/drift-authoring.md`](../drift-authoring.md).
5. **Vocabulary, entanglement status and rebuild sequencing**: this suite.

State lives in the data files under `src/lib/data/` (see
`03-data-contracts.md`), never in documentation.

## Companion documents

The internal engineering record, written for maintainers of this repo
rather than adopters:

- [`docs/drift-boundary.md`](../drift-boundary.md): the engine/integration
  contract and the ownership table.
- [`docs/drift-engine-reference.md`](../drift-engine-reference.md): full
  config reference, data model, metric-precedence lifecycle.
- [`docs/drift-authoring.md`](../drift-authoring.md): the per-field guide
  to authoring content ("which field do I type, and what will overwrite
  me").
- [`docs/roadmaps/mvp.md`](../roadmaps/mvp.md): the task roadmap,
  including Milestone 10 (Drift Extraction), which tracks the coupling
  blockers `01-entanglement.md` reports.
