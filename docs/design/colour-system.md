# Colour System: Ground-Up Redesign (signed off, 16 July 2026)

> Decision document for the portfolio's colour system, superseding the colour vocabulary that grew incrementally before and during the Atlas restyle. Companion to [`visual-direction.md`](./visual-direction.md), whose §3 (chromatic tokens) and §5 (edge colours) defer to this document once signed off. Everything here is designed against the Atlas test: would it look at home on a well-made survey sheet?

## Why this exists

The current system claims 21 of Reasonable Colors' 25 hues. Seven of them belong to individual theme edges that render in one mode of one view. Blue is booked four ways: primary UI, finished-status rails, language node dots and extraction edges, which is why extraction connectors on `/timeline` read as noise against Complete rails. Nobody designed this; it accreted, one reasonable-at-the-time claim after another, and the Atlas restyle explicitly carried it forward unchanged.

A printed atlas works the other way round. It owns a small, fixed set of inks. A feature class gets its meaning from the pairing of ink and mark, declared per sheet by its legend; the same green means vegetation on one plate and contour shading on another, and nobody is confused, because meaning was never in the hue alone.

## 1. Doctrine

**Symbology first.** Hue is the scarcest channel and the last resort. Distinction is carried by mark shape, line style, shade, opacity and labels wherever those channels are legible; hue is reserved for the registers where nothing else works at the sizes we draw.

**Meaning = ink × mark, resolved by the sheet's legend.** No data value owns an ink globally. An ink may serve two registers when their mark classes differ (a line is never confused with a ring) or when the registers never share a sheet.

**The census is closed.** The chromatic inks are enumerated below. A new feature that wants colour must reuse an existing ink through different symbology, use a label, or amend this document. There is no fourth option.

Two conventions apply across every register:

- **End-of-life is a fade within the same hue.** A retired project keeps its progress ink, its chroma drained by a fixed-ratio mix toward the mid neutral. A superseded technology keeps its mark ink the same way. Old features on survey sheets fade in place.
- **Provisional data is drawn provisionally.** Any value produced by heuristic rather than authorship renders with the cartographic unsurveyed convention: dotted stroke where the authored equivalent is solid. The reader can always tell surveyed ground from conjecture.

## 2. The ink census

Six chromatic inks. Plus the warm paper neutrals, which stay as they are (derived from grey and cinnamon via the `--warmth` mix; see §7 for the mechanism change).

| Ink                         | Light                 | Dark                  | Registers served                                                        | Mark classes                              |
| --------------------------- | --------------------- | --------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| **ink**                     | blue-4 `#006dca`      | blue-3 `#0089fc`      | primary UI, links, focus chrome; tech survey marks                      | chrome; glyph marks                       |
| **oxide**                   | cinnamon-4 `#ac5c00`  | cinnamon-3 `#d57300`  | accent, extraction lineage, lifted edge webs, focus marks, density wash | solid 2px routes; wash fills; focus rings |
| **succession: leads-to**    | lime-4 `#677600`      | lime-3 `#819300`      | tech succession, forward                                                | solid routes with arrowheads              |
| **succession: replaced-by** | raspberry-4 `#de0051` | raspberry-3 `#ff426c` | tech succession, backward                                               | solid routes with arrowheads              |
| **progress: in-progress**   | purple-4 `#b01fe3`    | purple-3 `#d150ff`    | project progress                                                        | rails, rings, badges                      |
| **progress: dormant**       | violet-4 `#794aff`    | violet-3 `#9b70ff`    | project progress                                                        | rails, rings, badges                      |
| **released**                | indigo-4 `#0061fc`    | indigo-3 `#3d81ff`    | released work (settled or maintained)                                   | rails, rings, badges                      |

Blue serves both chrome and tech marks. That is mark-class scoping working as intended: chrome is never a data mark, and the sheets that draw tech marks (map technologies mode, adoption timeline) colour no other data in blue. The four-way booking dies because finished rails move to the progress ramp and extraction moves to oxide.

Everything else the old system coloured chromatically goes neutral, glyph-coded or label-first: six category edge hues, seven theme edge hues, three role pill hues, two spare status hues. Sixteen hues leave the system.

## 3. Stage: track × progress

The old `status` field conflates at least three axes. Decomposed, with provenance per axis (from the drift-engine audit, July 2026):

| Axis       | Values                 | Provenance today                                                  | Encoding                          |
| ---------- | ---------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `track`    | exploration \| product | authored; heuristic default for unauthored projects, drawn dotted | mark treatment (hollow centre)    |
| `progress` | in-progress \| dormant | observed only, never authored (Jason-scoped commit recency)       | hue ramp                          |
| `released` | boolean                | authored only; reach is invisible to git                          | ramp's settled ink + badge phrase |
| `deployed` | boolean                | authored (`liveUrl` presence); `drift enrich` derives it later    | outer ring mark                   |
| `activity` | continuous recency     | derived now (`lastCommit`, `commitsRecent`)                       | opacity, floor 0.55               |
| `retired`  | boolean                | authored; presentation only, never a visibility control           | fixed-ratio chroma drain          |

Unstaged projects (neither axis authored, heuristic unavailable) render pale neutral, as `uncategorised` does today. Archived projects are exempt from the activity fade; the shade shift is their recession, and stacking both would sink them below findability.

**Model B (track × progress) is the chosen model** (review round 1). Model A, a single ordinal scale `prototype → developing → complete`, was rejected for a structural reason: prototypes do not graduate. A prototype that proves its idea gets rebuilt as a new project; a prototype that finishes its exploration is _done_, and Model A files it under the earliest stop of a maturity scale it was never on. Six of the current 33 projects are prototypes, and several completed exactly what they set out to test.

### Model B: track × progress (chosen)

Two axes. **Track**: exploration or product; a statement of intent, authored. **Progress**: in-progress or complete; a statement of state. Track is carried by mark treatment: exploration projects draw with a hollow centre dot where product projects draw solid, and their badges announce the track, an honest label for a finished experiment.

The progress axis was superseded in August 2026; see below. The ramp now carries three inks (`in-progress → dormant → released`) and the badge phrase reads `Spike · Released · Settled` where this originally read `spike · complete`.

This answers the conflation honestly: a complete prototype stops being "early" and becomes what it is, a finished piece of exploration.

#### Progress, release and retirement (August 2026)

`progress` was originally binary (`in-progress | complete`), and the heuristic read silence as completion: no commits in the trailing window meant `complete`. That asserted something the data never supported. Git can see that work stopped; it cannot see whether it stopped because the project was finished or because it was set down.

The two are indistinguishable in the history. ReDoT shipped (six merged PRs, released as a licensed GitHub Action) and has been quiet for 302 days. Cogni simply stopped, and has been quiet for 147. Any threshold that calls one complete calls the other complete, and an idle-time rule ranks them the wrong way round.

The axes were therefore separated, so each field asserts one thing and no field restates another:

| Field      | Asserts                             | Provenance                           |
| ---------- | ----------------------------------- | ------------------------------------ |
| `track`    | intent: what it was meant to be     | authored; heuristic fallback, dotted |
| `progress` | activity: are commits still landing | observed only, never authored        |
| `released` | reach: did it get to anyone else    | authored only                        |
| `retired`  | presentation: show it as ended      | authored only                        |

`progress` is now `in-progress | dormant` and always inferred, from Jason's own commits rather than all authors: a cohort repo that keeps moving after he left is dormant _for him_, which is what the portfolio describes.

`released` carries what `complete` was reaching for. It is authored-only, because reach is not visible in a commit log, and orthogonal to activity, so the badge can say `Released · Maintained` and `Released · Settled` as well as plain `Building` or `Dormant`. Of 32 projects, 5 claim it.

`retired` (formerly `archived`) is presentation only: the drained-chroma treatment, the pill and the filter facet. It no longer excludes from the hero pool. That exclusion belonged to `hide`, and while both flags carried it neither owned it; the hero score already sinks ended work without a categorical ban. `hide` is the single visibility control.

## 4. The ramp

**Chosen (review round 1): the violet family, purple → violet.** Adjacent Reasonable hues reading as one graded ink, hypsometric-tint style; hexes verifiable at [reasonable.work/colors](https://www.reasonable.work/colors/).

| Progress    | Light              | Dark               |
| ----------- | ------------------ | ------------------ |
| in-progress | purple-4 `#b01fe3` | purple-3 `#d150ff` |
| complete    | violet-4 `#794aff` | violet-3 `#9b70ff` |

Inherits violet-means-prototype in reverse: violet becomes the _complete_ end. Cool and abstract against the warm paper, and higher contrast with oxide and the succession pair than the alternative offered.

The rejected candidate was the green family (chartreuse-4 `#497c00` → green-4 `#008217` under Model B), carrying the site's green-means-healthy association from `live = emerald` (emerald-4 `#008147`) and the vegetation-tint register of survey sheets. It lost on separation: the violet family sits further from oxide, from succession lime and from the amber-adjacent warmth of the paper itself.

**The end-of-life fade: a chroma drain, not a lightness shift** (amended three times at review; the history is the lesson). The one-step Reasonable shade shift was indistinguishable from active; the two-step shift was invisible on light paper; mixing toward the paper put distinctness and legibility on one knob, where raising either lowered the other. What "faded" actually needs is both at once, and they live on different axes: a retired or superseded mark's ink is `color-mix(in oklab, <active ink> 40%, var(--color-text-muted))` — the mix toward the mid neutral drains the COLOURFULNESS while holding the LIGHTNESS, so the mark stays fully readable and reads as unmistakably duller than its active ink. Both themes follow from one rule because both mix inputs are theme-resolved. The corridor is pinned by tests in both themes: faded ink ≥2.2:1 against the sheet (findable) and faded chroma ≤55% of the active ink's oklch chroma (distinct — a luminance pin cannot measure this, which is how an indistinct fade slipped through review). The same rule colours historic technologies (§5, tech-kind).

## 5. The registers

**Track and progress**: progress picks the ramp ink on rails, rings and badges; exploration draws the centre dot hollow where product draws it solid. Deployed adds the outer ring; activity sets opacity; retired shifts the shade.

**Deployed**: a second concentric ring at `r + 7`, the mark the timeline already uses for still-live rails, promoted to mean exactly one thing everywhere: this project is running somewhere. The map's current second-ring-for-hubs retires; node size already carries weight.

**Tech-kind**: glyph-coded survey marks, all in ink (blue; confirmed at review). A real sheet treats kind as a feature class, and feature classes get symbols. Current stack draws at full shade; historic stack (any tech that is the source of a `replaced-by` edge) draws two shades paperward, same rule as retired projects. The vocabulary (chosen at review, the abstraction-gradient variant), drawn at the 8–14px radii the charts actually use:

| Kind      | Glyph             | Mnemonic                                                                          |
| --------- | ----------------- | --------------------------------------------------------------------------------- |
| language  | ring + centre dot | the base survey mark; languages are the stations everything else is measured from |
| framework | hexagon           | an assembly you build inside                                                      |
| runtime   | triangle          | engine                                                                            |
| data      | diamond           | store                                                                             |
| tool      | square            | a block you pick up                                                               |
| ai        | four-point star   | spark                                                                             |
| concept   | dashed ring       | abstract, unbuilt                                                                 |

Square versus diamond (one is the other rotated) is an accepted risk at small sizes. If they blur in practice, the fallback is folding `data` into a filled-centre variant of the ring and retiring the diamond. Concept's dashed ring is distinct from the dotted-provisional convention: dashes are longer and the ring is a glyph, its stroke pattern fixed, where provisional dotting applies to whatever mark carries a heuristic value.

**Themes**: label-first. Theme edges draw as one quiet paper-neutral web (`border-strong` weight, dash-distinguished from related edges). Hulls fill with a paper tint and carry their italic-serif names, which were always doing the identification anyway; ThemeTerritories and the homepage teaser already identify themes purely by text. Hovering or toggling a theme in the map legend lifts that theme's web to oxide and dims the rest. Seven hues leave the system and the relationships sheet stops asking readers to hold a 13-hue legend in working memory.

**Category edges** (map stack mode): identical treatment. One quiet web at rest; the existing interactive legend chips lift one category's edges to oxide. Six more hues gone.

**Succession**: leads-to in lime, replaced-by in raspberry, solid with route arrowheads, as today. These two genuinely co-occur on the toolkit sheet and read as a pair; they keep their inks.

**Extraction**: oxide, solid 2px. The authored mark of one project begetting another, which is what the accent has meant since EngineThread drew its "extracted into" arrow in accent. On the timeline it becomes the ribbon between adjacent lineage rails (per the queued timeline rework).

**Related**: neutral dashed. Unchanged.

**Roles**: neutral paper pills. The word does the work; azure, violet and cyan leave the census, along with the three dead base tokens and the duplicated dark-bg hexes that came with them.

**Density** (timeline gutter): an oxide wash at low opacity, count-scaled. Sepia hachures on the margin of the sheet. Extraction ribbons and the density wash share oxide on the same sheet; one is a solid 2px route, the other a translucent marginal fill, and no reader will take a wash for a route.

## 6. Interaction model

Progressive disclosure for every edge web. At rest a sheet shows its structure in neutrals; pointing at the legend inks one system of routes at a time in oxide. Focus and pin states keep their existing behaviour, and the focused mark keeps its oxide swap. Dim tokens (`--dim-node` 0.28, `--dim-edge` 0.08, `--dim-label` 0.32) are unchanged.

## 7. Mechanism

Two layers of tokens. The ink layer names the census (`--ink`, `--ink-oxide`, `--ink-succession-fwd`, `--ink-succession-back`, `--ink-progress-1`, `--ink-progress-2`); the register layer maps meanings onto inks (`--progress-complete: var(--ink-progress-2)`, `--edge-extraction: var(--ink-oxide)`). Components consume register tokens only. Opening the census means adding an ink, which means editing one visible table in one file, which is the audit trail.

Every token defines once via `light-dark()`. The theme toggle sets `color-scheme` on the root instead of swapping token blocks. This deletes the duplicated `[data-theme='dark']` and `@media (prefers-color-scheme: dark)` blocks, which are token-for-token copies today with no test guarding their agreement.

`--warmth` becomes real in both themes. Dark mode currently hardcodes the 88% mix ratio; it moves to `calc(100% - var(--warmth))` like light mode. The nine hand-set dark `-bg` hexes (two of them accidentally identical across semantically different tokens) are replaced by derived mixes under the same rule.

The contrast test extends to cover the ramp inks against both surfaces, resolves `light-dark()` in its CSS parser, and drops its dark-block special-casing once there is only one block to read.

## 8. Accessibility

Every same-shade Reasonable hue pair sits in one lightness band, so a categorical system built on hue alone fails colour-blind readers precisely where it has the most values. This redesign reduces exposure structurally: tech-kind moves to glyphs, which survive any colour vision; deployed is a ring, retired is a shade, activity is opacity, provisional is a dot pattern. The progress ramp is ordinal, where adjacent-hue confusion costs a step rather than a category, and every track and progress value also appears as badge text. The succession pair (lime and raspberry) is the one remaining hue-only distinction between exactly two values; their arrowheads and positions carry direction redundantly.

## 9. Migration

### Views

| View                       | Before                                                                      | After                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ProjectMap · relationships | 7 theme edge hues + 7 hull tints + status nodes + accent/primary extraction | neutral web, paper hulls with serif labels, oxide lift on legend hover; progress-ramp nodes with deployed rings |
| ProjectMap · stack         | 6 category edge hues + status nodes                                         | neutral web, oxide lift via existing chips; progress-ramp nodes                                                 |
| ProjectMap · technologies  | 7 kind hues on nodes, lime/raspberry lineage                                | ink glyph marks, historic one shade paperward; lime/raspberry unchanged                                         |
| AdoptionTimeline           | kind hues on dots and rails, lime/raspberry connectors                      | ink glyphs, historic shade-shifted; succession colours on rails and connectors unchanged                        |
| TimelineChart              | status rails, blue extraction bows, grey density                            | progress-ramp rails with deployed rings and activity fade; oxide extraction ribbons; oxide density wash         |
| NeighbourhoodGraph         | status nodes, primary/neutral edges                                         | progress-ramp nodes; extraction edges oxide                                                                     |
| ThemeTerritories           | text-only already                                                           | unchanged                                                                                                       |
| StatusBadge                | 6 status pill tints                                                         | progress pill in ramp tint, hollow-marked for exploration; `deployed` chip; archived pill shade-shifted         |
| ExternalLink               | `live` variant tinted emerald                                               | keyed off `deployed`, tinted from the complete-progress ink                                                     |
| EngineThread               | oxide arrow and library border                                              | unchanged; the rest of the site now agrees with it                                                              |
| Role pills                 | azure / violet / cyan tints                                                 | neutral paper                                                                                                   |

### Data

`ProjectStatus` retires. The registry's 33 overlays migrate mechanically except where noted:

| Old         | Count          | New                                                      |
| ----------- | -------------- | -------------------------------------------------------- |
| `wip`       | 11             | product · in-progress                                    |
| `finished`  | 12             | product · complete                                       |
| `prototype` | 6              | exploration · progress judged per project                |
| `live`      | 1 (the-tongue) | product · complete · deployed (liveUrl already authored) |
| `archived`  | 3              | per-project outcomes below (review round 1)              |

The archived three, as ruled at review:

- **beacons**: product · archived. Progress recorded as complete (the LIFT backend shipped end-to-end before the engagement closed); the ramp ink needs a progress value to shade-shift from, and complete is the honest one.
- **psyche**: exploration · archived. Reclassified from my product proposal: the storylet engine was an experiment in quality-based narrative, and it belongs on the exploration track. Progress recorded as complete; the exploration ran its course, 63 storylets and a full suite deep.
- **things-we-do**: product · complete, no archived flag. Deliberately un-archived at review.

### Sequencing (implementation phase, planned separately after sign-off)

1. tokens.css rewrite: ink layer, register layer, `light-dark()`, warmth unification
2. graph-style.ts: register mappings, glyph vocabulary
3. Quiet webs and progressive disclosure (ProjectMap), glyph marks (ProjectMap, AdoptionTimeline)
4. Data model: track/progress/deployed/archived fields, overlay migration, heuristic default
5. Badges and legends site-wide
6. Contrast test extension
7. The queued timeline rework (extraction ribbons, lineage-adjacent packing, density retune), which lands on the new system

Roadmap tasks created alongside: role-detection improvement; `drift enrich`, the opt-in gh-backed command that derives `archived` and `deployed` while `drift sync` stays offline.

## Review record

Round 1 (16 July 2026), all six open items ruled:

1. Stage model: **B, track × progress** (§3)
2. Ramp family: **violet, purple → violet** (§4)
3. Glyph vocabulary: **abstraction-gradient variant**; square/diamond accepted for now (§5)
4. Tech marks in ink (blue): **confirmed**
5. Archived shade, one step paperward: **confirmed**, then widened to two steps at round 2 (one step proved invisible)
6. Archived three: **beacons product · archived, psyche exploration · archived, things-we-do product · complete** (§9)

Two interpretations recorded for correction if wrong:

- beacons and psyche were ruled without a progress value; both are recorded as `complete` because the shade shift needs a progress ink to start from, and both ran their course.
- things-we-do was ruled un-archived; its overlay description still reads "The project is now archived" and needs that sentence rewritten at migration.
