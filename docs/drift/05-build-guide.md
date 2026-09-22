# Build guide: a portfolio with feature parity

> A sequenced plan for building a Drift-backed portfolio whose pages and
> components look nothing like the reference site. Features are specified
> against the data API ([`04-framework.md`](./04-framework.md)), never
> against components, so any page structure that satisfies the
> [parity roster](#the-feature-parity-roster) is a complete rebuild.

## Contents

- [Ground rules](#ground-rules)
- [Phase 0: repo setup](#phase-0-repo-setup)
- [Phase 1: measurement](#phase-1-measurement)
- [Phase 2: the data layer, green](#phase-2-the-data-layer-green)
- [Phase 3: authoring](#phase-3-authoring)
- [Phase 4: surfaces](#phase-4-surfaces)
- [The feature-parity roster](#the-feature-parity-roster)
- [Verification](#verification)

---

## Ground rules

- **Parity is behavioural.** A feature holds when the roster row's
  behaviour is observable, whatever markup produces it.
- **The roster is complete.** A behaviour not on it is not required for
  parity; if you find one on the reference site that is missing here, the
  roster has a bug.
- **Dependency order is real.** Each phase consumes the previous one's
  output; skipping ahead means building against data you cannot render.

## Phase 0: repo setup

1. Scaffold a SvelteKit 2 / Svelte 5 / TypeScript-strict project with
   Vite. Set `prerender = true` in the root layout; the whole site is
   static.
2. Copy `scripts/` (the CLI) and `src/lib/data/` (the Framework) from the
   Drift repo, preserving the relative path between them: the Framework
   imports `scripts/tag-taxonomy.js` by relative path
   ([`01-entanglement.md`](./01-entanglement.md#shared-boundary-code)).
3. Copy `src/lib/url-state.ts` and `src/lib/audience.ts`.
4. Empty the editorial content: `projects/` overlays, the arrays in
   `themes.ts`, `tech-overlays.ts`, `tech-relationships.ts`, and the
   slug data inside the JSON files. Keep the shapes and schemas.
5. Dependencies by feature: `d3-force` + `d3-polygon` (map, timeline
   layout), `satori` + `@resvg/resvg-js` + `simple-icons` (OG cards),
   `shiki` (only if you build a code-snippet page).

**Done when:** `bun install` succeeds and `svelte-check` passes on the
copied layer.

## Phase 1: measurement

Follow [`02-cli.md`](./02-cli.md#bootstrap): `drift init`, fill
`sources.local.json` (and `source-topology.json` for multi-repo projects),
`drift sync`, optionally `drift enrich`. Set your own `author.pattern`;
every `*Me` metric and the scoring layer depend on it.

**Done when:** `drift` reports cleanly and `sources.json` holds a
fingerprint per repo you intend to show. Run `drift hide <slug>` for any
repo the scan found that should stay private.

## Phase 2: the data layer, green

With real `sources.json` and empty editorial files, the registry should
build: every project renders from inference alone (humanised name,
detected tags, inferred role/track/progress; see
[`03-data-contracts.md`](./03-data-contracts.md#what-gets-inferred)).

**Done when:** `bun run test` passes and `getAllProjects()` returns your
repos, fully typed.

## Phase 3: authoring

The loop, per project: `drift author <slug>` scaffolds the overlay; write
`tagline`, `blurb`, `plainBlurb`, `description`, `highlights`; author
`track` (this is what admits a project to the hero pool); set `released` /
`retired` / `liveUrl` where true; add `relationships` (declare `powers`
and its reciprocal `extracted-from` for every extraction). Then the
cross-project data: themes (`drift theme`), tech floors and notes
(`drift tech`), tech lineage (`drift relate tech`). `drift audit` scores
depth; `bun run test` catches every dangling reference.

**Done when:** `drift authored` shows the coverage you intend and the
tests pass.

## Phase 4: surfaces

Build order minimises rework; each step names its data dependencies.

1. **Shell**: navigation from a single link list, theme toggle, skip
   link, error page. No registry dependency.
2. **Project index and detail**: `getAllProjectsByRecency`, `getBySlug`,
   prerender `entries()` from the registry. The first end-to-end proof.
3. **Filters and URL state**: `filterProjects`, facet queries,
   `url-state.ts` codecs. Client-side, on top of step 2.
4. **Home**: `getHeroPool(now)` with `now = Date.parse(lastSyncedAt)`,
   `getStackGroups`, `getEngineThreads`, `getThemes`,
   `getPlainProjects` + `audience.ts`.
5. **Map**: `graph.ts` + `tech-graph.ts` layouts baked in the loader;
   client enhancement optional.
6. **Timeline**: `getTimelineProjects`, extraction edges from
   `getProjectGraph`, `selectLabelledSlugs(projects, 6)`.
7. **Toolkit**: `getTechAdoption`, `getThemes`, the
   `firstCommitProvisional` flag, `?tech=` deep link.
8. **Metadata**: per-page SEO, OG cards, sitemap.

## The feature-parity roster

One row per behaviour. **Data** names the API that feeds it; **Behaviour**
is the acceptance test.

### Site-wide

| Feature            | Data                             | Behaviour                                                                                                                                                                  |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full prerender     | n/a                              | Every route static; server routes (OG, sitemap) prerendered                                                                                                                |
| Byte-stable builds | `sources.lastSyncedAt`           | Rebuilding unchanged data produces identical output; no wall-clock reads anywhere in a loader                                                                              |
| No-JS baseline     | Baked layouts from loaders       | Map, timeline and toolkit render as static SVG without JavaScript; JS only enhances (live simulation, hover, pinning)                                                      |
| Navigation         | One authored link list           | Desktop row and mobile menu from the same source; current page marked; skip-to-content link first in tab order                                                             |
| Theme              | Semantic colour tokens           | Light/dark toggle; components consume aliases only, never palette variables (house rule in `CLAUDE.md`)                                                                    |
| SEO                | Per-page title/description       | Every page sets meta; a site-wide default backstops it                                                                                                                     |
| OG cards           | `Project`, `og/card.ts` approach | Deterministic 1200×630 PNG per project: kind drives background colour, curated language tags drive glyphs, runtime drives geometry, data model drives the display typeface |
| Sitemap            | Registry slugs                   | `/sitemap.xml` lists every prerendered page                                                                                                                                |
| Error page         | n/a                              | Unknown routes and unknown slugs render a designed 404                                                                                                                     |

### Home

| Feature         | Data                               | Behaviour                                                                                                                       |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Audience switch | `audience.ts`, `getPlainProjects`  | Developer and plain-English versions of the page; choice persists in localStorage; unknown stored values fall back to developer |
| Hero            | `getHeroPool(now)`, `HERO_COUNT`   | Rotates through the top 3: pinned first, then recency × substance; only authored-track, non-hidden projects appear              |
| Breadth claim   | `getStackGroups` (stack.ts)        | Language/runtime/framework/database groups fully derived; tooling only from tags a project actually carries                     |
| Engine threads  | `getEngineThreads`                 | Every `powers` pair told as a library-to-consumer story with its authored note                                                  |
| Territories     | `getThemes`                        | Authored theme groupings with blurbs and member projects                                                                        |
| Plain list      | `getPlainProjects`, `plainContext` | Jargon-free entries; context label collapses client > cohort > employer > personal; live link only when deployed                |

### Project index

| Feature         | Data                                               | Behaviour                                                                                                                                       |
| --------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Grid            | `getAllProjectsByRecency`                          | Newest-touched first; dateless last                                                                                                             |
| Cards           | `Project`                                          | Collapsed face shows the blurb; expansion reveals more without navigation                                                                       |
| Stage badges    | `track`/`progress`/`released`/`retired`/`deployed` | All five axes legible; heuristic track renders visually provisional (`trackAuthored === false`)                                                 |
| Role badge      | `contribution.role`                                | Solo / lead / collaborator distinguished                                                                                                        |
| Filters         | `filterProjects`, facet queries                    | Multi-select kind and tag (grouped by `TagKind`); deployed/retired chips render only when `anyProjectHasFlag`; AND across dimensions, OR within |
| Search          | `filterProjects` `query`                           | Free text over name, tagline, blurb, description and tag labels                                                                                 |
| Shareable state | `url-state.ts`                                     | Filters round-trip through URL params; canonical sorted encoding; empty sets delete the param; `C#`-class labels survive                        |

### Project detail

| Feature         | Data                                      | Behaviour                                                                                                                                                             |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static per-slug | `entries()` from registry                 | Every project prerendered; unknown slug is a 404                                                                                                                      |
| Case study      | `Project` editorial fields                | Tagline, description, 3–5 highlights, tech tags                                                                                                                       |
| Metrics         | `Project.metrics`                         | Headline commit figure respects scope: `'me'` renders "N mine of M total" against `commitsAny`; `'any'` renders one figure; absent metrics render nothing, never zero |
| Contribution    | `contribution`                            | Team projects show the authored `contributionNote`; solo projects claim solo honestly                                                                                 |
| Neighbourhood   | `getNeighbours`                           | The project's immediate graph connections, rendered locally                                                                                                           |
| Links           | `repoUrl`, `companionRepoUrls`, `liveUrl` | Repo, every companion repo in topology order, and the live deployment when present                                                                                    |

### Map

| Feature         | Data                                                              | Behaviour                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three modes     | `MapMode`                                                         | Relationships (curated + theme edges, theme territory hulls), Stack (shared-tech clustering, grouped by dominant category), Technologies (the tools themselves) |
| Baked layout    | `computeForceLayout` / `computeStackLayout` / `computeTechLayout` | Deterministic coordinates chosen from 12 candidates by fewest crossings; identical across builds                                                                |
| Hubs and labels | `getHubSlugs`, `selectLabelledSlugs`                              | Substance-p85 hubs get enlarged minimum radius and permanent labels; 10 standing labels; the rest reveal on hover/focus/pin                                     |
| Edge legibility | `keepLegibleEdges`                                                | Dense edge families capped per node, then bridged so no connected cluster is split into islands; language tags never form edges                                 |
| Tech mode nodes | `getTechNodes`, `getTechCoEdges`, lineage links                   | Sized by project count; co-occurrence weighted by shared projects; authored lineage drawn distinctly; `map`-hidden labels absent                                |

### Timeline

| Feature         | Data                                       | Behaviour                                                                                                                  |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Rails           | `getTimelineProjects`                      | One lifespan rail per project, inception-descending; only `hide` excludes; retired and unauthored kept                     |
| Lineage ribbons | `getProjectGraph` extraction edges         | Extraction drawn across time, authored note carried through                                                                |
| Still-live      | `commitAnyLast`, `metrics.commitsMeRecent` | A rail reads live when unretired-and-active with a commit inside 56 days of `lastSyncedAt`, or with any recent own-commits |
| Labels          | `selectLabelledSlugs(projects, 6)`         | Six standing labels; the rest on hover/focus                                                                               |

### Toolkit

| Feature         | Data                                   | Behaviour                                                                                                                                   |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Adoption chart  | `getTechAdoption`                      | One dot per technology at the earlier of authored floor and derived first-seen date; weight = project count; `toolkit`-hidden labels absent |
| Lineage rails   | `techRelationships`                    | `leads-to` / `replaced-by` routed forward-only through crossing-minimised lanes                                                             |
| Provenance      | `dateSource`, `firstCommitProvisional` | Curated-floor dates distinguishable from repo-derived ones; a provisional-dates notice when the manifest says so                            |
| Cross-highlight | `getThemes`                            | Selecting a territory highlights its members' technologies                                                                                  |
| Deep link       | `encodeTechLabel` / `decodeTechLabel`  | `?tech=` pins one technology; a stale or unknown label pins nothing rather than dimming the chart                                           |
| Tech detail     | `techOverlays.note`                    | Authored one-sentence note per technology on demand                                                                                         |

### Narrative pages

About and hire pages are yours entirely: no data dependency, no parity
obligation. A Drift deep-dive page (the reference site's `/drift-engine`)
is optional; if built, highlight snippets at build time and pull the
manifest excerpt live from `sources.json` so the example can never go
stale.

## Verification

- `bun run test`: data integrity (dangling slugs, missing notes, taxonomy
  subset rules) plus the engine suite.
- `bun run check`: strict types.
- `bun run lint`: whole-repo Prettier, matching CI.
- `bun run build`: prerender is itself a test; theme resolution throws on
  dangling slugs.
- `drift --check` in CI: fail the pipeline when the site's claims have
  drifted from the repos. This gate is the reason Drift exists; wire it
  first.
