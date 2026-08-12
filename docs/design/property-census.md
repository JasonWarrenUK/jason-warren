# Project property census (5DR.24, subtask 1)

Every field across the seven shapes in the Project property surface, with the
one thing the audit needs to know about each: where its value comes from.

This is the map, not the change. Nothing is merged, renamed or deleted here.

## Provenance vocabulary

| Code  | Meaning                                                                          |
| ----- | -------------------------------------------------------------------------------- |
| **S** | Synced. Measured from git/GitHub by `drift sync`, written to `sources.json`.     |
| **A** | Authored. A human wrote it in an overlay under `src/lib/data/projects/`.         |
| **D** | Derived. Computed in `defaults.ts` from S and/or A fields. Never stored.         |
| **G** | Gate output. Produced by `withSyncedMetrics` at merge time, not in the manifest. |

The governing rule for the audit: **one fact, one home**. A field is a finding
if two fields assert the same fact (duplicate) or if a fact worth storing has no
single owner (orphan).

---

## 1. SyncedSource (`src/lib/data/types.ts`)

All-synced by definition. Contract lives in `scripts/sources.schema.json`.

| Field                                                        | Prov | Scope                             | Fact asserted                                                  |
| ------------------------------------------------------------ | ---- | --------------------------------- | -------------------------------------------------------------- |
| `commitHead`                                                 | S    | —                                 | Commit the fingerprint was taken at                            |
| `measuredRef`                                                | S    | —                                 | Ref measured against; metadata, excluded from drift comparison |
| `commitsAny`                                                 | S    | all-authors                       | Lifetime commit count                                          |
| `commitsAnyRecent`                                           | S    | all-authors                       | Commits, trailing 4 weeks                                      |
| `commitsMe`                                                  | S    | Jason                             | Lifetime commit count                                          |
| `commitsMeRecent`                                            | S    | Jason                             | Commits, trailing 4 weeks                                      |
| `commitsHuman`                                               | S    | all-authors, bots removed         | Denominator for `inferContribution`                            |
| `authorsDistinct`                                            | S    | all-authors                       | Author-identity count                                          |
| `authorsDistinctHuman`                                       | S    | all-authors, identities collapsed | Author count where 1 proves solo                               |
| `commitMeRoot`                                               | S    | Jason                             | Originated vs joined the project                               |
| `commitAnyLast`                                              | S    | all-authors                       | Most recent commit date                                        |
| `commitMeLast`                                               | S    | Jason                             | Jason's most recent commit date                                |
| `commitAnyRoot`                                              | S    | Jason                             | Root commit date                                               |
| `spanMonthsActive`                                           | S    | Jason                             | Months with activity inside the span                           |
| `spanMonthsAll`                                              | S    | Jason                             | Total months first→last                                        |
| `spanGapMaxDays`                                             | S    | Jason                             | Longest silence inside the span                                |
| `detectedLanguages`                                          | S    | —                                 | Detected languages; advisory, feeds `inferTags`                |
| `linesAny`                                                   | S    | all-authors                       | Total tracked source lines                                     |
| `linesMeAdded` / `linesMeRemoved`                            | S    | Jason                             | Lifetime churn                                                 |
| `linesAnyAdded` / `linesAnyRemoved`                          | S    | all-authors                       | Lifetime churn                                                 |
| `linesMeAddedRecent` / `linesMeRemovedRecent`                | S    | Jason                             | Churn, trailing 4 weeks                                        |
| `linesAnyAddedRecent` / `linesAnyRemovedRecent`              | S    | all-authors                       | Churn, trailing 4 weeks                                        |
| `urlRepo`                                                    | S    | —                                 | Canonical repo URL                                             |
| `urlsRepoCompanion`                                          | S    | —                                 | Companion repo URLs, topology order                            |
| `detectedRuntime` / `detectedDatabase` / `detectedFramework` | S    | —                                 | Detected tech identities                                       |
| `detectedTechFirstSeen`                                      | S    | —                                 | First-introduced date per tech identity (identity-keyed)       |

## 2. ProjectMetrics (`types.ts`)

Derived from `SyncedSource` via `Pick<SyncedSource, SyncedMetricKey>` (F4), plus
the two gate-produced headline fields. The synced rows below are inherited, not
restated.

| Field                                           | Prov  | Scope       | Notes                                                                                     |
| ----------------------------------------------- | ----- | ----------- | ----------------------------------------------------------------------------------------- |
| `commitsAny`                                    | S     | all-authors | Headline for solo projects                                                                |
| `commitsAnyRecent`                              | S     | all-authors |                                                                                           |
| `commitsMe`                                     | S     | Jason       | Headline for team projects                                                                |
| `commitsMeRecent`                               | S     | Jason       | Also the sole input to `inferProgress`                                                    |
| `commitsHeadline`                               | **G** | role-keyed  | Display figure only; no manifest source. Solo takes `commitsAny`, team takes `commitsMe`. |
| `commitsHeadlineScope`                          | **G** | —           | Which scope `commitsHeadline` came from (`'any'` / `'me'`). Not overridable.              |
| `linesMeAdded` / `linesMeRemoved`               | S     | Jason       |                                                                                           |
| `linesAnyAdded` / `linesAnyRemoved`             | S     | all-authors |                                                                                           |
| `linesMeAddedRecent` / `linesMeRemovedRecent`   | S     | Jason       |                                                                                           |
| `linesAnyAddedRecent` / `linesAnyRemovedRecent` | S     | all-authors |                                                                                           |
| `linesAny`                                      | S     | all-authors |                                                                                           |

## 3. AuthoredProject (`types.ts:265`)

All-authored by definition. Every field optional except `slug`.

| Field                                        | Prov | Merge behaviour                                           |
| -------------------------------------------- | ---- | --------------------------------------------------------- |
| `slug`                                       | A    | Required; keys the overlay                                |
| `name` / `tagline` / `blurb` / `description` | A    | Straight override                                         |
| `kind`                                       | A    | Straight override                                         |
| `contribution`                               | A    | `mergeContribution`; role is authoritative over inference |
| `tags`                                       | A    | Appended to inferred, deduped on `kind:label`             |
| `suppressTags`                               | A    | Applied last; beats both inference and authored additions |
| `track`                                      | A    | Straight override; also sets `trackAuthored`              |
| `released`                                   | A    | Authored-only by design; orthogonal to `progress`         |
| `retired`                                    | A    | Straight override                                         |
| `liveUrl`                                    | A    | Straight override; also drives derived `deployed`         |
| `highlights`                                 | A    | Straight override                                         |
| `relationships`                              | A    | Straight override                                         |
| `pin` / `hide`                               | A    | Hero-pool controls                                        |

Note: dates and metrics are deliberately **absent** here, so overlays cannot
carry stale copies of synced values.

## 4. Project (`types.ts:313`) — merged output

| Field                               | Prov  | Source of truth                                                     |
| ----------------------------------- | ----- | ------------------------------------------------------------------- |
| `slug`                              | A/S   | Overlay slug, else manifest key                                     |
| `name`                              | A/D   | Authored, else `humaniseSlug(slug)`                                 |
| `tagline` / `blurb` / `description` | A     | Empty string when unauthored                                        |
| `kind`                              | A/D   | Authored, else `'repo'`                                             |
| `contribution`                      | A/D   | `inferContribution(manifest)` merged with authored                  |
| `tags`                              | A/D   | `inferTags(manifest)` + authored − suppressed                       |
| `track`                             | A/D   | Authored, else `inferTrack(manifest)`                               |
| `trackAuthored`                     | **D** | Exactly `authored.track !== undefined`                              |
| `progress`                          | **D** | `inferProgress`: `commitsRecent > 0`. Never authored.               |
| `deployed`                          | **D** | Exactly `mergedLiveUrl !== undefined`                               |
| `released`                          | A     | Authored-only                                                       |
| `retired`                           | A     | Authored-only                                                       |
| `repoUrl`                           | S/D   | `manifest.remote`, else constructed GitHub URL                      |
| `companionRepoUrls`                 | S     | `manifest.companionRemotes ?? []`                                   |
| `commitAnyLast` / `commitAnyRoot`   | S     | Via `withSyncedMetrics`                                             |
| `detectedTechFirstSeen`             | **D** | Manifest `detectedTechFirstSeen` re-keyed from identity → tag label |
| `liveUrl`                           | A     | Authored, else base                                                 |
| `highlights` / `relationships`      | A     | Empty array when unauthored                                         |
| `pin` / `hide`                      | A     | Undefined when unauthored                                           |
| `metrics`                           | S/G   | `ProjectMetrics`, above                                             |

## 5–7. Nested shapes

**TechTag** (`types.ts:67`) — `label`, `kind`. Both A or D depending on origin
(authored overlay vs `inferTags`). `TechOverlay.kind` overrides `kind`
everywhere tags are assembled.

**ProjectRelationship** (`types.ts:137`) — `kind`, `target`, `note?`. All A.

**Contribution** (`types.ts:235`) — discriminated on `role`.
`role` A/D, `collaboration.team` A/D (always present on merged output),
`collaboration.employer?` / `collaboration.client?` A,
`contributionNote?` A (team variants only).

---

## Findings

### Duplicate pairs — two fields asserting the same fact

**F1. `progress` and `commitsMeRecent` are the same fact. RESOLVED — kept by
design.** `inferProgress` is a total function of one field:
`commitsMeRecent > 0`, so `progress` stores no information the metric does not
already carry.

Kept anyway. `progress` is read at 12+ sites across the colour system
(`ProjectMap`, `TimelineChart`, `NeighbourhoodGraph`, `StageBadge`) and filtered
on as a union value in `queries.ts`. Deriving at read time would replace a named
domain state with a magic comparison at every one of them.

The census rule wants one home per fact; it does not want a raw count standing
in for a vocabulary. `ProjectProgress` is the language the UI speaks, and
`commitsMeRecent` is the input that decides it. The duplication is a derivation,
recorded as such on the field.

### Near-duplicates — resolved, worth recording as precedent

**F2. `deployed` and `liveUrl`.** `deployed` is exactly
`liveUrl !== undefined`. Already correctly typed as derived and recomputed at
merge, never authored: this is the precedent the roadmap note cites. Not a
finding, but the pattern F1 and F3 should follow.

**F3. `trackAuthored` and `track`. RESOLVED — kept by design.**
`trackAuthored` is a provenance bit about `track` rather than a fact about the
project, and it is the only such bit in the surface.

The asymmetry turns out to be the domain, not an oversight: `track` is the only
field carrying a heuristic worth marking as uncertain (heuristic values render
dotted-provisional). `released` and `retired` are authored-or-absent, so there
is no guess to flag; `progress` is always inferred, so there is no variation to
record. A uniform provenance mechanism would be machinery for one real case.
The reasoning now lives on the field.

**F4. `SyncedSource` and `ProjectMetrics` overlapped on 13 field names. FIXED.**
The same 13 facts were declared twice and kept in step by hand.

`SyncedSource` moved into `types.ts` (it is part of the data model, and `types.ts`
imports nothing, so the dependency runs the right way). `ProjectMetrics` now
reads:

```ts
export interface ProjectMetrics extends Pick<SyncedSource, SyncedMetricKey> {
	commitsHeadline?: number;
	commitsHeadlineScope?: 'any' | 'me';
}
```

`SyncedMetricKey` is the single list deciding which measurements are
portfolio-facing, and being constrained to `keyof SyncedSource` it cannot name a
field nothing measures. Verified: adding an invented key to `SyncedMetricKey`
fails the build rather than compiling to an always-undefined field. The
`commitsHeadline*` pair stays declared locally, being gate-produced.

Import paths are unchanged: `index.ts` re-exports everything from `types.ts`.

### Orphans — facts with no clear home

**F5. Six synced fields are inference-only inputs. RESOLVED — category now
explicit.** `commitsHuman`, `authorsDistinct`, `authorsDistinctHuman`,
`commitMeRoot`, `commitMeLast` and `detectedLanguages` never reach `Project`.
Each is consumed at build time in `defaults.ts` (`inferContribution` for the
first four, `inferTrack` for `commitMeLast`, `inferTags` for
`detectedLanguages`).

Correct as-is: these are raw signals the site has no vocabulary for, and each
already feeds a field that _is_ surfaced. The risk was a future reader mistaking
them for an omission and promoting one. They now sit under a named
"inference-only inputs" heading in `SyncedSource` saying exactly that, and their
absence from `SyncedMetricKey` is what keeps them off the site.

**F6. `spanMonthsActive` / `spanMonthsAll` / `spanGapMaxDays` have zero
consumers. SCHEDULED.** Synced with a clear purpose (sustained-vs-bursty shape)
but absent from `SyncedMetricKey` and from every inference function. Re-verified
after the rename: no reads anywhere in `src/` outside the interface declaration
and the engine that writes them.

Resolved as "surface them", not "stop measuring them": the measurement is the
expensive part and it already works, and the signal distinguishes a repo worked
steadily for eight months from one with two commits eight months apart, which
the endpoint dates cannot. Tracked as its own roadmap task.

**F7. Scope was encoded in field names, not in the type. FIXED.** The
all-authors vs Jason-only distinction was carried by a `…All` / `…Mine` suffix
convention the compiler could not enforce, applied inconsistently: `commits` was
all-authors while `linesAdded` was Jason-only, so the unsuffixed name meant
opposite scopes in the two grids.

Every field now carries an explicit `Any` / `Me` marker, so the scope is in the
name at every use site. `Human` is retained as a filter _within_ the all-authors
scope (`commitsHuman`, `authorsDistinctHuman`) rather than a third scope.

The rename alone was not sufficient. The curation gate wrote a role-keyed
headline into the all-authors field, so on team projects `commits` held
Jason-only data. Map node sizing read that field as a quantity, sizing team
projects by Jason's count against solo projects' all-authors totals. The scoped
fields are now pure, with the display figure moved to `commitsHeadline` /
`commitsHeadlineScope`, and a corpus-wide test asserts `commitsAny` matches the
synced all-authors total on every project regardless of role.

### Doc-drift risk (not a property finding)

`src/routes/drift-engine/+page.ts:61` contains a hand-copied `ProjectRelationship`
definition inside a template literal, displayed as source on the drift-engine
page. It is not a second definition, but it will silently diverge from
`types.ts` if the real interface changes.
