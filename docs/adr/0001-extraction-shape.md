# ADR-001: The Engine owns the overlay contract

> **Status**: Accepted
> **Date**: 2026-09-25
> **Author**: Jason Warren
> **Context**: Roadmap task 10EX.1 (Milestone 10, Drift Extraction); [`docs/drift-boundary.md`](../drift-boundary.md); [`docs/drift/01-entanglement.md`](../drift/01-entanglement.md)

---

## Context

Milestone 10 exists because the boundary doc claimed the engine "can in principle be extracted into a standalone package" and the claim was verified false. Three of the blockers are mechanical (`repoRoot` derivation, three unconfigured file paths, an emitted type import) and have their own tasks. The fourth was this spike: nine verbs read or write TypeScript files under `src/lib/data/`, and the roadmap called them portfolio-shaped.

The nine are `author`, `flag`, `tag`, `relate project`, `relate tech`, `tech`, `theme`, `audit` and `authored`. The task listed eight; `authored` reuses the same overlay import as `audit` and keeps `AUTHORED_FIELDS`, a hand-maintained mirror of the overlay type, so it belongs with them. Together they hold about a third of `scripts/check-drift.js`.

What they know is schema: the overlay field names (`pin`, `hide`, `tags`, `suppressTags`, `relationships`, `highlights`, `contribution`), the `kind` enum, the two relationship-kind sets, the tech tag kinds, the four tech surfaces and the three sibling files (`themes.ts`, `tech-overlays.ts`, `tech-relationships.ts`). Every one of those duplicates a declaration in `src/lib/data/types.ts`. The scaffold template goes one step further and emits `import type { AuthoredProject } from '../types.js'`, naming a type the boundary doc assigns to the other side of the line. The reverse reach also exists: `scripts/tag-taxonomy.d.ts` imports `TechTag` from `src/lib/data/types.ts`.

The spike offered two shapes: a core plus portfolio-adapter package split, or generalising the nine verbs behind a host-declared overlay schema. Both assume the boundary doc's two-layer model, engine versus integration. The intended end state has three parts, and that changes the question.

---

## Decision

### Three artefacts

| Artefact  | What it is                                                                                                 | Today lives at                                          |
| --------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Engine    | The Drift CLI and TUI, every verb included. Fingerprints repos, writes the data files, authors overlays.   | `scripts/`                                              |
| Framework | The utilities that make Engine output easy to consume from a Svelte site: merge, queries, scoring, graphs. | `src/lib/data/` mechanism files                         |
| Portfolio | One site built on the Framework. The worked example, with its own content in the Engine's shape.           | `src/routes/`, `src/lib/components/`, the content files |

Dependency runs one way: Portfolio depends on Framework, Framework depends on Engine. The Engine is usable without the Framework. The Framework has no purpose without the Engine. The Portfolio is one consumer of the Framework among any number that could exist.

### All verbs are Engine verbs

The nine verbs stay in the Engine. The label "portfolio-shaped" is retired: they are overlay-shaped, and the overlay is the Engine's own output.

### The Engine owns the overlay contract

A type belongs to the Engine when the Engine writes or validates it. A type belongs to the Framework when it only exists after the merge. On that rule the contract moves out of `src/lib/data/types.ts` and into the Engine.

The contract is a JSON Schema, and the TypeScript types are its projection. This is how `sources.schema.json` already works: the Engine reads the schema at startup, derives `FINGERPRINT_FIELDS` from it and validates every record against it before writing. The overlay contract follows the same pattern for a reason the Engine cannot avoid: it is plain JavaScript and cannot read a `.d.ts` at runtime, so with types as the source of truth it keeps hand-mirrored enum lists (five today, each commented "keep in sync with types.ts"). With the schema canonical, those lists are derived, and `drift audit` and `drift authored` validate the overlay values they import.

The Engine ships `overlay.schema.json` and a `.d.ts` beside it, mirrored by hand and held to the schema by a parity test, the way `SyncedSource` is held to `sources.schema.json` today. The `.d.ts` is an Engine file because the scaffold imports from it and an Engine-only user has no Framework for that import to resolve against. The Framework imports the types; it translates nothing. The types that move:

- Overlay: `AuthoredProject`, `AuthoredContribution`, `Collaboration`, `ProjectKind`, `ProjectTrack`, `RelationshipKind`, `ProjectRelationship`
- Tech identity: `TechTag`, `TagKind`, `TechSurface`, `TechOverlay`, `LineageKind`, `TechRelationship`
- Themes: `Theme`
- Already Engine contracts, mirrored in TypeScript: `SyncedSource`, `EnrichedSource`, `TrackedField`, `InProgressEntry`

The Framework keeps `Project`, `ProjectMetrics`, `SyncedMetricKey`, `ThemeWithProjects`, the inferred `ProjectRole` and `ProjectProgress`, the merge pipeline in `defaults.ts` and `index.ts`, and everything derived from `Project`. It imports the contract from the Engine. `tag-taxonomy.d.ts` stops reaching into `src/lib/data/`.

The scaffold template emits an import of `AuthoredProject` from the Engine's exported types. That is the type contract 10EX.4 was waiting on.

### Two stages

**Stage 1 is Milestone 10.** Declare the three artefacts, move the contract to the Engine, close the mechanical blockers, all in this repository. No packages, no second repo. M10 is done when a copy of `scripts/` dropped into an empty repository can run `drift init`, `drift sync` and `drift author`, and the scaffolded overlay type-checks against the Engine's own types with no `src/lib/data/` present.

**Stage 2 is deferred.** A host that wants the Engine's fingerprinting and reporting but rejects its overlay shape would need a host-declared schema: a description in `drift.config.ts` of the fields, enums and files the nine verbs should operate on. That generalisation is not built until such a host exists. The trigger is a named consumer with a data model of their own. If it fires, it gets ADR-002.

The physical split into packages and separate repositories, with separate docs directories, is a later milestone and its own ADR. This decision fixes the lines it will cut along.

---

## Rationale

The Engine has to define what it writes. `drift author` scaffolds a file and `drift tag` splices into one; if the shape of that file lives in an artefact the Engine can run without, then an Engine-only user has verbs that produce an undefined type. Putting the contract in the Engine is the only arrangement under which "usable without the Framework" is true for every verb.

The nine verbs were never a separate concern. They edit the Engine's own output files, and they validate against enums the Engine already holds. Splitting them into an adapter would create a second package whose only content is a copy of the Engine's schema.

A host-declared schema solves a problem nobody has. The Framework is the consumer; every current adoption path in `01-entanglement.md` copies it. Generalising a TypeScript splicer against a declared schema, for one consumer that already shares the schema, would be the largest piece of work in the milestone and would exercise nothing.

---

## Alternatives Considered

### Option 1: Core plus portfolio-adapter package split

**Description**: A `drift-core` package with the git and manifest verbs, and an adapter package holding the nine overlay verbs, registered into core's menu through a plug-in seam declared in `drift.config.ts`.

**Pros**:

- Core stays free of the `typescript` dependency
- The seam doubles as the mechanism a stage 2 adapter would use

**Cons**:

- The adapter's entire content is knowledge of the Engine's own output shape
- Two artefacts where the intended model has the Engine as one standalone TUI
- Refactors the ~1,000-line interactive menu into a registry before any consumer needs it

**Why rejected**: contradicts the stated end state, in which the Engine is one detachable TUI containing every verb.

### Option 2: Host-declared overlay schema contract now

**Description**: The nine verbs become a generic splicer driven by a schema the host declares in config: field names, enums, file paths.

**Pros**:

- The Engine is consumable by a host with any data model

**Cons**:

- No such host exists
- The Framework, the one real consumer, would declare a schema the Engine already knows
- Largest work item in M10, exercised only by the reference site

**Why rejected**: built for a hypothetical consumer. Kept as stage 2 with a concrete trigger.

### Option 3: The Framework keeps the contract

**Description**: Leave `AuthoredProject` and its neighbours in `src/lib/data/types.ts`; the Engine writes files typed by the Framework.

**Pros**:

- No type moves; `types.ts` stays one file

**Cons**:

- An Engine-only user's scaffolded overlay names a type they do not have
- The emitted import (10EX.4) has no honest replacement
- The reverse reach in `tag-taxonomy.d.ts` stays

**Why rejected**: makes the Engine's independence from the Framework false for every overlay verb.

---

## Consequences

### Positive

- "Usable without the Framework" is true for the whole verb set, and testable
- 10EX.4 has a concrete answer: import from the Engine's exported types
- The `tag-taxonomy.d.ts` reverse import goes away in the same move
- `typescript` becomes a declared Engine dependency (10EX.5)
- The Engine's five hand-mirrored enum and field lists become derivations, and overlay values get the same fail-closed validation fingerprints have
- A stage 2 host authoring overlays in JSON or YAML would validate against the same schema; the contract already exists in a form that does not assume TypeScript

### Negative

- The Framework imports its foundational types across the repo from `scripts/`, a relative reach, until packaging happens. The taxonomy import already does this; the decision adds a second such reach
- `drift audit` and `drift authored` stay Bun-only (native ESM import of `.ts` overlays). Every other verb runs on Node or Bun
- The nine verbs must behave sensibly when `config.paths.projects` points nowhere, since an Engine-only user has no overlay directory. Today they assume it exists
- Two copies of the contract (schema and `.d.ts`) held together by a test, as `SyncedSource` is now. `AuthoredContribution` reads worse as `oneOf` than as a two-line union, and field documentation lives in `description` strings the `.d.ts` must repeat

### Neutral

- The boundary doc's ownership table is rewritten around three artefacts; several rows flip owner (10EX.6)
- The Framework's Vite-bound loading (`import.meta.glob` for overlays, static JSON imports) is not an M10 blocker under this decision, because the Framework stays in the repository. It becomes a blocker for the packaging milestone and is recorded there

---

## Implementation Notes

Effect on the open M10 tasks:

| Task   | Before this decision                                     | After                                                                                           |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 10EX.2 | Inject `repoRoot`                                        | Unchanged                                                                                       |
| 10EX.3 | Add `config.paths` entries for the three sibling files   | Unchanged; the three files are Engine-owned overlay files addressed by config, like `projects/` |
| 10EX.4 | Stop emitting the `AuthoredProject` import               | Emit it from the Engine's own exported types                                                    |
| 10EX.5 | Declare `typescript` and `prettier`; degrade without gum | Unchanged; `typescript` is now legitimately core                                                |
| 10EX.6 | Correct the boundary doc's extraction claim              | Rewrite the doc around three artefacts and the flipped ownership rows; point to this ADR        |

New work this decision creates:

1. Write `scripts/overlay.schema.json` for the types listed above, with `oneOf` for `AuthoredContribution`, and a `.d.ts` beside it with a parity test. Derive the Engine's five hand-mirrored lists from the schema. Remove the moved types from `types.ts`, update the Framework's imports and `tag-taxonomy.d.ts`, and move the schema conformance tests (`sources.schema.test.ts`, `in-progress.schema.test.ts`) from `src/lib/data/` to the Engine's suite.
2. Add `authored` to the verb list wherever the nine are enumerated (boundary doc, entanglement ledger, this milestone).
3. Make the nine verbs exit cleanly, with a message, when the overlay paths are unconfigured or absent.
4. Record the Framework's Vite-bound loading as a blocker on the packaging milestone.

Ordering: the type split (1) comes first, because 10EX.4 and the `tag-taxonomy.d.ts` fix both depend on the Engine having types to export.

---

## Verification

The M10 acceptance test, run by hand until it is scripted: copy `scripts/` into an empty git repository with a `drift.config.ts` pointing at an empty data directory, run `drift init`, `drift sync` and `drift author <slug>`, then type-check the scaffolded overlay with `tsc --noEmit`. It passes with no `src/lib/data/` present. The same copy runs `drift report` without touching the nine verbs' files.

The decision was wrong if a real second consumer appears and the first thing they need is a different overlay shape. That is stage 2's trigger, and it is cheap to detect: they will say so.

---

## Related Decisions

- Roadmap M10 (10EX.1 to 10EX.6); 7DR.4 and 11LC.8 soft-depend on this spike for where new overlay verbs grow (answer: the Engine)
- ADR-002, unwritten: host-declared overlay schema, if stage 2 triggers
- The packaging milestone's ADR, unwritten: physical split into packages and repositories

---

## References

- [`docs/drift-boundary.md`](../drift-boundary.md), the two-layer model this decision replaces
- [`docs/drift/01-entanglement.md`](../drift/01-entanglement.md), the coupling ledger and its extraction blocker table
- [`scripts/tag-taxonomy.d.ts`](../../scripts/tag-taxonomy.d.ts), the precedent for Engine-exported types
