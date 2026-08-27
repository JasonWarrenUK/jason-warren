# Jason Warren, portfolio

The source for [jason-warren.vercel.app](https://jason-warren.vercel.app): a developer portfolio where the code itself is part of the exhibit. Built with SvelteKit 2, Svelte 5 (runes) and TypeScript in strict mode.

The site is fully prerendered and ships a no-JavaScript content baseline. Every interactive view (the project map, the timeline, the toolkit) renders as static SVG first; JavaScript only enhances it.

Two things live in this repo: the **portfolio site**, and **Drift**, the CLI engine that keeps its data honest by fingerprinting the git repos behind every project.

## Contents

- [The portfolio](#the-portfolio)
  - [Stack](#stack)
  - [Data is the source of truth](#data-is-the-source-of-truth)
  - [Routes](#routes)
  - [The connection views](#the-connection-views)
  - [Design system](#design-system)
- [The Drift engine](#the-drift-engine)
  - [What Drift does](#what-drift-does)
  - [The engine boundary](#the-engine-boundary)
  - [Data files](#data-files)
  - [Verbs](#verbs)
  - [Adding a project](#adding-a-project)
- [Commands](#commands)
  - [Site](#site)
  - [Drift](#drift)
- [Conventions](#conventions)
  - [Verification before commit](#verification-before-commit)
  - [Documentation](#documentation)

---

## The portfolio

### Stack

- **SvelteKit 2 / Svelte 5** with runes, no stores
- **TypeScript** strict; interfaces over types; discriminated unions
- **Vite 7** build, **Vitest** for tests
- **adapter-vercel**, prerendered (static output)
- **Reasonable Colors** via semantic CSS tokens; no CSS framework
- **d3-force / d3-polygon** for graph layout and territory hulls
- **satori + resvg** to generate Open Graph images at build time

### Data is the source of truth

Every project is a typed object under `src/lib/data/projects/` (33 at present). The model lives in `src/lib/data/types.ts` and leans on the type system to keep the data honest:

- `ProjectSlug` is a string-literal union, so every cross-link between projects is checked at compile time.
- `Contribution` is a discriminated union that forces a `contributionNote` on team projects.
- Relationships (`powers`, `extracted-from`, `related`) are first-class data, which is what makes the connection views possible.
- Lifecycle is decomposed into orthogonal axes rather than one `status` enum: `track` is authored (falling back to a heuristic, which renders as dotted-provisional), `progress` is observed-only and never authored, `deployed` derives from `liveUrl`, and `released` and `retired` are authored flags for reach and end-state.

`src/lib/data/queries.ts` holds pure query helpers; `src/lib/data/graph.ts` normalises the relationship data into a single graph (collapsing reciprocal edges) and computes a deterministic layout. Both are covered by structural tests in `src/lib/data/*.test.ts`.

### Routes

| Route              | What it is                                                      |
| ------------------ | --------------------------------------------------------------- |
| `/`                | Hero rotation and breadth summary, both derived from scoring    |
| `/projects`        | The full grid, with multi-select filters and client-side search |
| `/projects/[slug]` | A single project, with its local neighbourhood graph            |
| `/map`             | Force-directed graph, in Projects or Technologies mode          |
| `/timeline`        | Projects by activity, with extraction lineage drawn as ribbons  |
| `/toolkit`         | Technology adoption over time, as a dot-to-dot lineage chart    |
| `/about`           | Narrative positioning                                           |
| `/hire`            | CV and availability                                             |
| `/drift-engine`    | Deep-dive on the Drift tooling and data model                   |

`/og/[slug].png` and `/sitemap.xml` are generated server routes, both prerendered.

### The connection views

The relationship graph is presented four ways, all built from `graph.ts` and `tech-graph.ts`:

- **`/map`** in Projects mode plots every project, anchored into themed territories, with edges for the engine-extraction lineage and related links. In Technologies mode it maps the tools themselves, sized by usage and linked by co-occurrence or authored lineage.
- **`/timeline`** orders projects by activity and draws extraction lineages as ribbons across time, with year columns sized by density.
- **`/toolkit`** traces technology adoption as a dot-to-dot chart, routing rails forward-only through a crossing-minimising lane refinement pass.
- Each project page shows a **local neighbourhood graph** of its immediate connections.

### Design system

The visual direction (Atlas: a survey-map signature) is specified in [`docs/design/visual-direction.md`](./docs/design/visual-direction.md), and the colour system in [`docs/design/colour-system.md`](./docs/design/colour-system.md).

Every colour token is defined once via `light-dark()`. Semantic aliases only; Reasonable Colors variables are never used directly in components. Graph marks carry meaning structurally: tech kind by glyph shape, stage by survey mark, extraction and density in oxide.

---

## The Drift engine

### What Drift does

Portfolio data rots. Drift is a CLI that fingerprints the git repos behind every project and reports where the site's claims have drifted from what the repos actually say: commit counts, language breakdowns, activity spans, dependency manifests.

It is a plain Node/Bun script with no framework dependency, deliberately portable beyond this repo.

### The engine boundary

The engine/integration split is physically enforced and documented in [`docs/drift-boundary.md`](./docs/drift-boundary.md), which is the source of truth for which layer owns what.

- **Core engine** (`scripts/check-drift.js`) fingerprints repos, manages the manifest and provides the interactive surface. It knows nothing about how fingerprints render.
- **Svelte integration** (`src/lib/data/`) is build-time code that turns raw fingerprints into fully-typed `Project` objects. It owns `types.ts`, `defaults.ts`, `index.ts` and the authored overlays.

The tag taxonomy sits at the boundary in `scripts/tag-taxonomy.js`, shared by both.

### Data files

| File                   | Written by    | What it holds                                      |
| ---------------------- | ------------- | -------------------------------------------------- |
| `sources.json`         | `drift sync`  | The synced fingerprint per repo                    |
| `overrides.json`       | Hand-authored | Manual values that win over observed ones          |
| `excluded.json`        | `drift hide`  | Slugs kept off the public site                     |
| `in-progress.json`     | Staging       | Provisional entries, graduated via `drift promote` |
| `source-topology.json` | `drift sync`  | Companion-repo groupings                           |
| `sources.local.json`   | `drift init`  | Per-machine paths; not committed                   |

Each has a JSON Schema alongside it, and `sources.schema.json` is the engine's public data contract.

### Verbs

```sh
drift [report]     # compare synced fingerprints to current git state (default)
drift snapshot     # show ALL current metrics, changed vs unchanged
drift authored     # show every authored field per overlay, absent fields marked
drift sync         # rewrite sources.json with current fingerprints
drift keep         # keep a manual override, refreshing its baseline
drift hide         # remove a slug from the public site
drift promote      # graduate a landed in-progress entry
drift author       # scaffold projects/<slug>.ts, open in $EDITOR
drift flag         # set pin or hide on an overlay
drift relate       # author a project-to-project or tech-to-tech edge
drift tech         # per-tech overlays: date, note, kind, visibility
drift tag          # add or suppress a tech on one project
drift theme        # manage theme territories
drift audit        # score authored overlays against the content-depth rubric
drift init         # scaffold drift.config.ts and sources.local.json
```

`--check` exits non-zero on drift, which is what makes it usable as a gate. `--json` gives a machine-readable report. With no flags in an interactive terminal (and `gum` installed), `drift` opens a menu.

Run `drift help <verb>` for verb-specific help.

### Adding a project

1. Ensure the slug exists as an entry in `sources.json` (run `drift sync` once the repo is registered locally, via `sources.local.json`).
2. Run `drift author <slug>` to scaffold `src/lib/data/projects/<slug>.ts` from a full commented template and open it in `$EDITOR`. `ProjectSlug` is a plain `string` and overlay discovery is automatic via `import.meta.glob`, so there is no union to update and nothing to register.
3. Run `bun run test`; the data-integrity tests will tell you if anything (a dangling relationship, a missing note) is off.

See [`docs/drift-authoring.md`](./docs/drift-authoring.md) for the full per-field guide: which fields Drift populates, which you author, and where overrides live.

---

## Commands

### Site

```sh
bun run dev        # development server
bun run build      # production build (prerenders pages, OG images, sitemap)
bun run preview    # preview the production build
bun run test       # Vitest (drift engine suite runs isolated)
bun run check      # svelte-check (strict types)
bun run lint       # prettier --check, whole repo
bun run format     # prettier --write
```

### Drift

```sh
bun run drift            # the report
bun run drift:sync       # rewrite sources.json
bun run drift:keep       # keep one override
bun run drift:keep-all   # refresh every flagged baseline
```

---

## Conventions

British English throughout, tabs for indentation, Conventional Commits. See [`CLAUDE.md`](./CLAUDE.md) for the full house style.

### Verification before commit

`bun run prepare` installs a pre-commit hook that runs Prettier against staged files. That blocks _new_ formatting drift, but it cannot see files nobody has touched. CI runs `bun run lint` across the whole repository, so run that (not a scoped check on just what you touched) alongside `bun run check` and `bun run test` before opening a PR.

### Documentation

- [`docs/drift-boundary.md`](./docs/drift-boundary.md): the engine/integration contract
- [`docs/drift-authoring.md`](./docs/drift-authoring.md): per-field authoring guide, where overrides live
- [`docs/drift-engine-reference.md`](./docs/drift-engine-reference.md): config reference, data model, metric-precedence lifecycle
- [`docs/design/`](./docs/design/): visual direction and colour system
- [`docs/roadmaps/mvp.md`](./docs/roadmaps/mvp.md): task list and dependency diagram
- [`docs/reports/ROADMAP_OVERVIEW.md`](./docs/reports/ROADMAP_OVERVIEW.md): roadmap prose
