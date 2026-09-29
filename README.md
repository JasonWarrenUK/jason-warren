# Drift Suite

Drift keeps portfolio data honest. The suite is three things: the Drift Engine, a CLI that fingerprints the git repos behind every project; the Drift Framework, a SvelteKit layer that turns those fingerprints into typed data a site can render; and the Portfolio, [jason-warren.vercel.app](https://jason-warren.vercel.app), Jason Warren's site, where the code itself is part of the exhibit. Built with SvelteKit 2, Svelte 5 (runes) and TypeScript in strict mode.

Adopting Drift rather than reading about it? Start at [`docs/drift/`](./docs/drift/README.md): the consumer-facing suite covering the Engine, the Framework, their current entanglement and a feature-parity build guide.

## Contents

- [Drift Engine](#drift-engine)
  - [What it does](#what-it-does)
  - [The boundary](#the-boundary)
  - [Data files](#data-files)
  - [Verbs](#verbs)
- [Drift Framework](#drift-framework)
  - [The registry inversion](#the-registry-inversion)
  - [The data model](#the-data-model)
  - [Derived structures](#derived-structures)
- [Adding a project](#adding-a-project)
- [The Portfolio](#the-portfolio)
- [Commands](#commands)
  - [Site](#site)
  - [Drift](#drift)
- [Conventions](#conventions)
  - [Verification before commit](#verification-before-commit)
  - [Documentation](#documentation)

---

## Drift Engine

### What it does

Portfolio data rots. Drift is a CLI that fingerprints the git repos behind every project and reports where a site's claims have drifted from what the repos actually say: commit counts, language breakdowns, activity spans, dependency manifests.

It is a plain Node/Bun script with no framework dependency.

### The boundary

The Engine/Framework split is physically enforced and documented in [`docs/drift-boundary.md`](./docs/drift-boundary.md), which is the source of truth for which artefact owns what.

- **The Engine** (`scripts/check-drift.js`) fingerprints repos, manages the manifest, provides the interactive surface and owns the overlay contract (ADR-001). It knows nothing about how fingerprints render.
- **The Framework** (`src/lib/data/`) is build-time code that turns raw fingerprints into fully-typed `Project` objects. It owns `defaults.ts`, `index.ts` and the merge pipeline; `types.ts` is shared until 10EX.7/10EX.8 move the overlay contract into the Engine.

The tag taxonomy sits at the boundary in `scripts/tag-taxonomy.js`, shared by both.

### Data files

| File                   | Written by                      | What it holds                             |
| ---------------------- | ------------------------------- | ----------------------------------------- |
| `sources.json`         | `drift sync`                    | The synced fingerprint per repo           |
| `overrides.json`       | Hand-authored                   | Manual values that win over observed ones |
| `excluded.json`        | `drift hide`                    | Slugs kept off the public site            |
| `in-progress.json`     | Hand-authored; `promote` tidies | Provisional entries for unmerged branches |
| `source-topology.json` | Hand-authored                   | Companion-repo groupings                  |
| `sources.local.json`   | `drift init`                    | Per-machine paths; not committed          |

Each has a JSON Schema alongside it, and `sources.schema.json` is the Engine's public data contract.

### Verbs

```sh
drift [report]     # compare synced fingerprints to current git state (default)
drift snapshot     # show ALL current metrics, changed vs unchanged
drift authored     # show every authored field per overlay, absent fields marked
drift sync         # rewrite sources.json with current fingerprints
drift enrich       # opt-in, gh-backed: fetch GitHub's archived flag and homepage URL
drift new          # report newly-discovered repos under scanRoot, writes nothing
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

---

## Drift Framework

### The registry inversion

The manifest decides what exists: every non-excluded entry in `sources.json` appears on the site. Authored `.ts` files under `src/lib/data/projects/` are optional overlays, keyed by slug; a bare manifest entry still renders, from inference alone (humanised name, detected tags, inferred role and stage). You author where you disagree with the inference, nowhere else.

### The data model

The model lives in `src/lib/data/types.ts` and leans on the type system to keep the data honest:

- `Contribution` is a discriminated union that forces a `contributionNote` on team projects.
- Relationships (`powers`, `extracted-from`, `related`) are first-class data, which is what makes the connection views possible.
- Lifecycle is decomposed into orthogonal axes rather than one `status` enum: `track` is authored (falling back to a heuristic, which renders as dotted-provisional), `progress` is observed-only and never authored, `deployed` derives from `liveUrl`, and `released` and `retired` are authored flags for reach and end-state.
- Cross-links are checked at build time: a dangling relationship target or theme slug fails the data tests before the build and throws during prerender.

### Derived structures

`src/lib/data/queries.ts` holds pure query helpers; `graph.ts` normalises the relationship data into a single graph (collapsing reciprocal edges) and computes a deterministic layout; scoring, technology adoption and stack breadth are all derived rather than claimed. Everything is covered by structural tests in `src/lib/data/*.test.ts`.

The Portfolio's connection views show what these structures support in practice:

- **`/map`** plots every project into themed territories, with extraction lineage and related links as edges; a Technologies mode maps the tools themselves, sized by usage and linked by co-occurrence or authored lineage.
- **`/timeline`** orders projects by activity and draws extraction lineages as ribbons across time.
- **`/toolkit`** traces technology adoption as a dot-to-dot chart, routing lineage rails forward-only through a crossing-minimising lane refinement pass.
- Each project page shows a **local neighbourhood graph** of its immediate connections.

The full module-by-module API is in [`docs/drift/04-framework.md`](./docs/drift/04-framework.md).

---

## Adding a project

1. Ensure the slug exists as an entry in `sources.json` (run `drift sync` once the repo is registered locally, via `sources.local.json`).
2. Run `drift author <slug>` to scaffold `src/lib/data/projects/<slug>.ts` from a full commented template and open it in `$EDITOR`. `ProjectSlug` is a plain `string` and overlay discovery is automatic via `import.meta.glob`, so there is no union to update and nothing to register.
3. Run `bun run test`; the data-integrity tests will tell you if anything (a dangling relationship, a missing note) is off.

See [`docs/drift-authoring.md`](./docs/drift-authoring.md) for the full per-field guide: which fields Drift populates, which you author, and where overrides live.

---

## The Portfolio

[jason-warren.vercel.app](https://jason-warren.vercel.app) is the worked example: one site built on the Framework, whose behaviours are catalogued as an implementation-agnostic parity roster in [`docs/drift/05-build-guide.md`](./docs/drift/05-build-guide.md). The site is fully prerendered and ships a no-JavaScript content baseline; every interactive view renders as static SVG first, and JavaScript only enhances it.

Its stack:

- **SvelteKit 2 / Svelte 5** with runes, no stores
- **TypeScript** strict; interfaces over types; discriminated unions
- **Vite 7** build, **Vitest** for tests
- **adapter-vercel**, prerendered (static output)
- **Reasonable Colors** via semantic CSS tokens; no CSS framework
- **d3-force / d3-polygon** for graph layout and territory hulls
- **satori + resvg** to generate Open Graph images at build time

Beyond the connection views above, it renders a hero rotation and breadth summary derived from scoring on `/`, a filterable grid at `/projects`, narrative pages at `/about` and `/hire` and a Drift deep-dive at `/drift-engine`. `/og/[slug].png` and `/sitemap.xml` are generated server routes, both prerendered.

The visual direction (Atlas: a survey-map signature) is specified in [`docs/design/visual-direction.md`](./docs/design/visual-direction.md), and the colour system in [`docs/design/colour-system.md`](./docs/design/colour-system.md). Every colour token is defined once via `light-dark()`; semantic aliases only, with Reasonable Colors variables never used directly in components.

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

- [`docs/drift/`](./docs/drift/README.md): the consumer-facing Drift suite: Engine vs Framework, the coupling ledger, data contracts, the Framework API and a feature-parity build guide
- [`docs/drift-boundary.md`](./docs/drift-boundary.md): the Engine/Framework contract
- [`docs/drift-authoring.md`](./docs/drift-authoring.md): per-field authoring guide, where overrides live
- [`docs/drift-engine-reference.md`](./docs/drift-engine-reference.md): config reference, data model, metric-precedence lifecycle
- [`docs/design/`](./docs/design/): visual direction and colour system
- [`docs/roadmaps/mvp.md`](./docs/roadmaps/mvp.md): task list and dependency diagram
- [`docs/reports/ROADMAP_OVERVIEW.md`](./docs/reports/ROADMAP_OVERVIEW.md): roadmap prose
