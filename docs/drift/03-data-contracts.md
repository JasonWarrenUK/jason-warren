# Data contracts

> Every file that crosses the CLI/Framework boundary, and the pipeline
> that merges them into `Project` objects. Canonical shapes live in
> `scripts/sources.schema.json` and `src/lib/data/types.ts`; this document
> is the map, not the territory.

## Contents

- [File inventory](#file-inventory)
- [sources.json](#sourcesjson)
- [The editorial files](#the-editorial-files)
- [The merge pipeline](#the-merge-pipeline)
- [What gets inferred](#what-gets-inferred)
- [Integrity enforcement](#integrity-enforcement)

---

## File inventory

All paths relative to `dataDir` (default `src/lib/data`). "Writer" is
exclusive: nothing else may write that file.

| File                    | Writer                    | Holds                                                      | Committed? |
| ----------------------- | ------------------------- | ---------------------------------------------------------- | ---------- |
| `sources.json`          | `drift sync` (+ `enrich`) | Synced fingerprint per slug; enriched GitHub facts         | Yes        |
| `source-topology.json`  | Hand                      | Companion-repo groupings per project                       | Yes        |
| `sources.local.json`    | Hand (`init` scaffolds)   | Absolute repo paths on this machine                        | No         |
| `overrides.json`        | Hand; `keep` refreshes    | Manual metric pins that beat synced values                 | Yes        |
| `excluded.json`         | `drift hide`              | Slugs kept off the public site                             | Yes        |
| `in-progress.json`      | Hand; `promote` tidies    | Provisional metrics for unmerged branches                  | Yes        |
| `.drift-cache.json`     | Engine                    | HEAD-sha cache; never read by the Framework                | No         |
| `projects/<slug>.ts`    | Hand; four verbs splice   | The editorial overlay (`AuthoredProject`)                  | Yes        |
| `tech-overlays.ts`      | Hand; `drift tech`        | Per-tech floor dates, notes, kind overrides, visibility    | Yes        |
| `tech-relationships.ts` | Hand; `drift relate tech` | Authored tech lineage (`leads-to`, `replaced-by`)          | Yes        |
| `themes.ts`             | Hand; `drift theme`       | Authored theme territories (id, name, blurb, member slugs) | Yes        |

Each JSON file has a schema beside it; `sources.schema.json` (in
`scripts/`) is the engine's public contract and is enforced at write time.

## sources.json

Top-level shape (`lastSyncedAt` shown here as of the last `drift sync`; it
moves on every sync, so treat the value itself as illustrative):

```json
{
	"firstCommitProvisional": false,
	"lastSyncedAt": "2026-09-21",
	"sources": { "<slug>": { "…": "SyncedSource" } },
	"enriched": { "<slug>": { "…": "EnrichedSource" } }
}
```

- `lastSyncedAt` is the Framework's "now": recency decay and still-live
  checks key off it so builds are byte-stable.
- `firstCommitProvisional` flags seeded root-commit dates; the toolkit
  surfaces it. A real `sync` clears the condition.
- `sources` and `enriched` have different exclusive writers (`sync` and
  `enrich`); neither verb touches the other's section.

**`SyncedSource`** (per slug, all fields optional; the Framework must
tolerate any subset): commit grid (`commitsAny/Me` × lifetime/recent),
dates (`commitAnyRoot`, `commitAnyLast`), span shape (`spanMonthsActive`,
`spanMonthsAll`, `spanGapMaxDays`), codebase size (`linesAny`), an
eight-field churn grid, repo identity (`urlRepo`, `urlsRepoCompanion`),
detected tech (`detectedRuntime/Framework/Database`,
`detectedTechFirstSeen`), and six inference-only inputs (`commitsHuman`,
`authorsDistinct(Human)`, `commitMeRoot`, `commitMeLast`,
`detectedLanguages`) that never reach `Project` directly.

Scope discipline: `Any` is all-authors, `Me` is the configured author,
`Human` is a bot-filter within `Any`. Names never lie about scope.

Which fields surface on the site is decided in exactly one place: the
`SyncedMetricKey` union in `types.ts` (16 members). `ProjectMetrics`
derives from it via `Pick`, plus two gate-produced fields
(`commitsHeadline`, `commitsHeadlineScope`) that are never authored.

**Override entry shape** (`overrides.json`, per slug per field):

```json
{ "value": 128, "syncedWhenSet": 120, "_setNote": "why" }
```

`syncedWhenSet` is the drift-detection baseline; when the live synced
value moves off it, the report flags the pin. `null` marks a pure pin
with no baseline, never flagged.

**In-progress entry shape** (`in-progress.json`, per slug): `branch`,
`pipeline` (ordered promotion stages), `visibility` (`public` surfaces on
the site, `local` is CLI-only), and `tracked` (per-field
`{ value, baseOnMain }`).

## The editorial files

**`projects/<slug>.ts`**: one named export, an `AuthoredProject` literal.
Every field optional except `slug`. Fields: `name`, `tagline`, `blurb`,
`plainBlurb`, `description`, `kind`, `contribution` (role, collaboration,
contributionNote), `tags`, `suppressTags`, `track`, `released`, `retired`,
`liveUrl`, `highlights`, `relationships`, `pin`, `hide`,
`hideFromPlainIntro`. Deliberately absent: dates and metrics, so an
overlay can never carry a stale copy of a measured value. The registry
rejects files with zero or multiple exports, a missing `slug`, or a
duplicate slug. Per-field guidance:
[`docs/drift-authoring.md`](../drift-authoring.md).

**`tech-overlays.ts`**: `TechOverlay[]` keyed by exact tag label:
`firstUsed` (a floor date, not a trump: an earlier derived date wins),
`note`, `kind` override, `hiddenFrom` (surfaces: `toolkit`, `map`,
`stack`, `relate`).

**`tech-relationships.ts`**: `TechRelationship[]`: `kind`
(`leads-to` / `replaced-by`), `source` and `target` (exact labels), `note`.

**`themes.ts`**: `Theme[]`: `id`, `name`, `blurb`, `slugs`. Membership is
deliberately overlapping; the overlap is the narrative.

Labels and slugs in all three are validated by data tests and a prerender
throw, not the compiler (`ProjectSlug` is a plain string).

## The merge pipeline

For every non-excluded slug in `sources.json`, in order:

```
defaultProjectFromManifest(slug, synced)   // safe defaults + inference
	→ mergeAuthored(base, overlay)           // authored fields win
	→ applyTechKindOverrides(project)        // tech-overlays kind pins
	→ withSyncedMetrics(project)             // override > synced > provisional
	= Project                                // fully-typed, all fields present
```

Inside `withSyncedMetrics`, every metric field follows one chain:

```typescript
merged.field = override?.field?.value ?? synced?.field ?? provisional?.tracked?.field?.value;
```

Plus the curation gate: `commitsHeadline` is `commitsAny` for solo
projects (scope `'any'`) and `commitsMe` for team projects (scope `'me'`),
so the scoped facts stay pure and the display figure is a separate field.
Undefined keys are deleted, and a scope never outlives its headline.

Promotion is self-healing: once a branch lands and `sync` runs, the synced
value out-ranks the provisional one automatically; `drift promote` is
tidying, not activation.

## What gets inferred

`defaults.ts` derives every field an overlay omits. The heuristics, so you
know what a bare manifest entry renders as:

| Field                   | Inference                                                                                             | Authored escape                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `name`                  | `humaniseSlug` (kebab-case to title case, known tokens uppercased)                                    | `name`                               |
| `tags`                  | `inferTags`: detected languages/runtime/framework/database mapped through the taxonomy                | `tags` adds, `suppressTags` removes  |
| `contribution`          | `inferContribution`: solo when the human-author evidence says one person; else role from commit share | `contribution.role` wins outright    |
| `track`                 | `inferTrack`: span plus size heuristic; renders dotted-provisional until authored                     | `track` (sets `trackAuthored`)       |
| `progress`              | `inferProgress`: `commitsMeRecent > 0` means `in-progress`, else `dormant`                            | None, by design: purely observable   |
| `deployed`              | Derived from `liveUrl` presence                                                                       | Via `liveUrl`                        |
| `detectedTechFirstSeen` | Re-keyed from identity strings to tag labels for the adoption timeline                                | `tech-overlays.ts` `firstUsed` floor |

`released` and `retired` are authored-or-absent: git cannot see whether
work reached the world, so no heuristic pretends to.

## Integrity enforcement

Two mechanisms replace compile-time slug safety:

1. The data test suite fails on any relationship target, theme slug or
   tech label that does not resolve, before a build runs.
2. Prerender throws on a dangling theme slug, so a bad reference can never
   ship silently.

Run `bun run test` after authoring; the failures name the file and field.
