# Drift Framework API

> The build-time API your pages consume. Everything here is a pure,
> DOM-free, deterministic function over the registry: same data files in,
> byte-identical output out. Signatures live in the source; this document
> says what each module is for and what it guarantees.

## Contents

- [Design guarantees](#design-guarantees)
- [The registry](#the-registry)
- [Queries](#queries)
- [Scoring](#scoring)
- [Graphs and layout](#graphs-and-layout)
- [Adoption, stack, themes, threads](#adoption-stack-themes-threads)
- [Per-tech overlays](#per-tech-overlays)
- [Site-level helpers](#site-level-helpers)
- [Import constraints](#import-constraints)

---

## Design guarantees

- **Determinism.** No `Date.now()`, no `Math.random()`, no locale
  dependence. Anything time-relative takes `now` as an argument; pass
  `Date.parse(sources.lastSyncedAt)` at build time. Sorts always carry a
  slug tiebreak. Prerendered output is reproducible across builds.
- **Purity.** Query and derivation functions take the registry (or accept
  it as an override parameter for testing) and return new values.
- **Totality.** Every `Project` field is present after the merge; optional
  metrics are genuinely absent rather than `undefined`-valued.

## The registry

`index.ts` exports `projects: Project[]`: every non-excluded manifest slug
run through the merge pipeline
([`03-data-contracts.md`](./03-data-contracts.md#the-merge-pipeline)).
Array order is `sources.json` insertion order; presentation order always
comes from a query sorter, never from the registry.

## Queries

`queries.ts`, all pure:

| Export                                                        | Returns                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getBySlug(slug)`                                             | One project or `undefined`                                                                                                                                                     |
| `getAllProjects()`                                            | The registry                                                                                                                                                                   |
| `getAllProjectsByRecency()`                                   | Sorted by `commitAnyLast` desc; dateless last                                                                                                                                  |
| `getAllProjectsByInception()`                                 | Sorted by `commitAnyRoot` desc, falling back to `commitAnyLast`                                                                                                                |
| `getHeroPool(now)`                                            | Eligible pool (`trackAuthored && !hide`), pinned first, then `heroScore` desc, slug tiebreak                                                                                   |
| `getTimelineProjects()`                                       | Everything except `hide`; retired and uncategorised kept deliberately (a timeline is a historical record); inception desc                                                      |
| `filterProjects(filters)`                                     | AND across dimensions, OR within: roles, tracks, progresses, flags (`deployed`/`retired`), kinds, exact tag labels, free-text query over name/tagline/blurb/description/labels |
| `getAllTags()` / `getTagsByKind()`                            | Distinct labels, flat or bucketed by `TagKind`, sorted                                                                                                                         |
| `getAllKinds()` / `getAllRoles()` / `anyProjectHasFlag(flag)` | Facet metadata so filter chips only render when the registry has something to show                                                                                             |
| `getPlainProjects()`                                          | The no-jargon home-page list: projects with a `plainBlurb`, minus `hideFromPlainIntro`; context label via `plainContext` (client > cohort > employer > personal)               |

## Scoring

`scoring.ts`:

- `substanceScore(p)`: how much project is here. `log1p(commits) +
log1p(loc / 50)`, preferring `commitsMe` so collaborator volume does not
  inflate your own claim.
- `recencyDecay(commitAnyLast, now)`: exponential, halving every
  `HERO_HALF_LIFE_DAYS` (30); 0 when dateless.
- `heroScore(p, now)`: `recency × substance`. Neither a huge dormant
  project nor a fresh one-commit toy wins.
- `hubThreshold(list)`: the substance value at `HUB_PERCENTILE` (0.85);
  projects at or above it are map hubs (enlarged minimum radius, always
  labelled). `Infinity` when nothing has metrics, so the degenerate case
  has no hubs.
- `HERO_COUNT` (3): how many projects the hero shows at once.

The only escape hatches are `pin` and `hide` on overlays; there are no
manual ranking flags.

## Graphs and layout

`graph.ts` normalises the per-project `relationships[]` into one graph and
computes deterministic layouts:

- `getProjectGraph()`: nodes plus edges, with reciprocal pairs collapsed:
  `powers` + `extracted-from` become one directed extraction edge (library
  to consumer); mutual `related` becomes one undirected edge.
- `getSharedTechEdges()`: projects linked by shared non-language tech
  (language would connect everything). `getThemeEdges()`: projects linked
  by shared theme membership.
- `keepLegibleEdges(candidates, maxPerNode)`: the legibility policy, cap
  then bridge: greedily cap per-node degree, then re-admit the strongest
  dropped edges that reconnect clusters the cap split. Applied to every
  dense edge family.
- `getHubSlugs()` / `selectLabelledSlugs()`: the hub set and the standing
  labels (`MAP_LABEL_COUNT`, 10; the timeline passes 6).
- `getNeighbours(slug)`: a project's immediate connections, for the
  detail-page neighbourhood view.
- `getTechIndex()`: label to slugs.
- `computeForceLayout` / `computeStackLayout`: build-time d3-force layouts;
  `LAYOUT_CANDIDATES` (12) seeded runs, keep the least edge-crossing
  result (`countCrossings`), normalise to canvas. Identical input,
  identical coordinates.
- `buildSimLinks` / `createForceSimulation`: client-side live simulation
  for the enhanced map; `MapMode` is
  `'relationships' | 'stack' | 'technologies'`.
- `getStackGroups()` (in `graph.ts`): each project's dominant tech
  category, the stack-mode clustering anchor.

`tech-graph.ts` inverts the lens for Technologies mode: `getTechNodes()`
(every non-language label, sized by `projectCount`, minus labels hidden
from the `map` surface), `getTechCoEdges()` (co-occurrence, weight = shared
projects, capped legibly), `buildLineageLinks()` (authored
`tech-relationships` as layout links), `computeTechLayout()`.

## Adoption, stack, themes, threads

- `adoption.ts`: `getTechAdoption()` answers "when did each technology
  enter the work". Per label: the earliest of the authored floor
  (`tech-overlays.firstUsed`) and the derived date (per-tag
  `detectedTechFirstSeen`, falling back to the earliest project's
  `commitAnyRoot`); `dateSource` records which won (`curated` /
  `derived`); `projectCount` drives dot weight; ties break date then slug.
- `stack.ts`: `getStackGroups()` derives the hero "wide toolkit" claim:
  languages, runtimes, frameworks and databases fully derived from
  detection; tooling filtered through a small allowlist of authored `tool`
  tags, so the group can never claim tooling no project carries.
- `themes.ts` / `theme-queries.ts`: the authored territories; `getThemes()`
  resolves member slugs to full projects and throws on a dangling slug at
  build time.
- `threads.ts`: `getEngineThreads()` derives every library-to-consumer
  extraction story from `powers` relationships. Nothing hand-declared.

## Per-tech overlays

`tech-overlays.ts` is the single authoring surface for per-tech data and
the policy point for surface visibility:

- `hiddenTechLabels(surface)`: labels hidden from `toolkit`, `map`,
  `stack` or `relate`.
- `SURFACE_KINDS` / `surfaceAdmitsKind`: which `TagKind`s each surface
  renders at all.
- `getTechKindOverrides()`: authored kind pins, applied once in the
  registry pipeline so every consumer sees the same kind.

## Site-level helpers

Framework-free, unit-tested, safe anywhere:

- `url-state.ts`: canonical filter-state URL codecs. `parseSet` /
  `serialiseSet` (sorted, comma-joined, `null` means delete the param);
  `encodeTagSet` / `decodeTagSet` (per-token percent-encoding, so `C#`
  cannot corrupt a neighbour); `encodeTechLabel` / `decodeTechLabel`
  (single-label deep link, validated against the labels actually present:
  a stale link must never dim a chart against nothing).
- `audience.ts`: the home-page audience switch. `Audience` is
  `'developer' | 'everyone'`, persisted under `AUDIENCE_STORAGE_KEY`
  (`home-audience`), parsed defensively back to `DEFAULT_AUDIENCE`.

## Import constraints

Two rules keep the module graph acyclic; violating either breaks the build
in ways that only surface under the test runner:

1. `tech-overlays.ts`, `tech-relationships.ts` and `themes.ts` are
   registry-free: they must never import `index.ts` or anything that
   transitively pulls in the registry, because components import them
   directly.
2. Resolving slugs to `Project` objects belongs in query modules
   (`theme-queries.ts` is the pattern), never in the authored data
   modules themselves.
