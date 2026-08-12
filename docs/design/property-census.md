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

## 1. SyncedSource (`src/lib/data/index.ts:47`)

All-synced by definition. Contract lives in `scripts/sources.schema.json`.

| Field                                           | Prov | Scope                             | Fact asserted                                                  |
| ----------------------------------------------- | ---- | --------------------------------- | -------------------------------------------------------------- |
| `head`                                          | S    | —                                 | Commit the fingerprint was taken at                            |
| `measuredRef`                                   | S    | —                                 | Ref measured against; metadata, excluded from drift comparison |
| `commits`                                       | S    | all-authors                       | Lifetime commit count                                          |
| `commitsRecentAll`                              | S    | all-authors                       | Commits, trailing 4 weeks                                      |
| `commitsMine`                                   | S    | Jason                             | Lifetime commit count                                          |
| `commitsRecent`                                 | S    | Jason                             | Commits, trailing 4 weeks                                      |
| `commitsHuman`                                  | S    | all-authors, bots removed         | Denominator for `inferContribution`                            |
| `distinctAuthors`                               | S    | all-authors                       | Author-identity count                                          |
| `distinctAuthorsHuman`                          | S    | all-authors, identities collapsed | Author count where 1 proves solo                               |
| `rootCommitMine`                                | S    | Jason                             | Originated vs joined the project                               |
| `lastCommit`                                    | S    | all-authors                       | Most recent commit date                                        |
| `lastCommitMine`                                | S    | Jason                             | Jason's most recent commit date                                |
| `firstCommit`                                   | S    | Jason                             | Root commit date                                               |
| `activeMonths`                                  | S    | Jason                             | Months with activity inside the span                           |
| `spanMonths`                                    | S    | Jason                             | Total months first→last                                        |
| `maxGapDays`                                    | S    | Jason                             | Longest silence inside the span                                |
| `languages`                                     | S    | —                                 | Detected languages; advisory, feeds `inferTags`                |
| `linesOfCode`                                   | S    | all-authors                       | Total tracked source lines                                     |
| `linesAdded` / `linesRemoved`                   | S    | Jason                             | Lifetime churn                                                 |
| `linesAddedAll` / `linesRemovedAll`             | S    | all-authors                       | Lifetime churn                                                 |
| `linesAddedRecent` / `linesRemovedRecent`       | S    | Jason                             | Churn, trailing 4 weeks                                        |
| `linesAddedRecentAll` / `linesRemovedRecentAll` | S    | all-authors                       | Churn, trailing 4 weeks                                        |
| `remote`                                        | S    | —                                 | Canonical repo URL                                             |
| `companionRemotes`                              | S    | —                                 | Companion repo URLs, topology order                            |
| `runtime` / `database` / `framework`            | S    | —                                 | Detected tech identities                                       |
| `techFirstSeen`                                 | S    | —                                 | First-introduced date per tech identity (identity-keyed)       |

## 2. ProjectMetrics (`types.ts:76`)

Mirrors SyncedSource field-for-field, minus identity/date/tech fields.

| Field                                           | Prov  | Scope       | Notes                                                                                      |
| ----------------------------------------------- | ----- | ----------- | ------------------------------------------------------------------------------------------ |
| `commits`                                       | S     | all-authors | Headline for solo projects                                                                 |
| `commitsRecentAll`                              | S     | all-authors |                                                                                            |
| `commitsMine`                                   | S     | Jason       | Headline for team projects                                                                 |
| `commitsRecent`                                 | S     | Jason       | Also the sole input to `inferProgress`                                                     |
| `commitsAll`                                    | **G** | all-authors | Only field here with no manifest source; set by `withSyncedMetrics` when `role !== 'solo'` |
| `linesAdded` / `linesRemoved`                   | S     | Jason       |                                                                                            |
| `linesAddedAll` / `linesRemovedAll`             | S     | all-authors |                                                                                            |
| `linesAddedRecent` / `linesRemovedRecent`       | S     | Jason       |                                                                                            |
| `linesAddedRecentAll` / `linesRemovedRecentAll` | S     | all-authors |                                                                                            |
| `linesOfCode`                                   | S     | all-authors |                                                                                            |

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

| Field                               | Prov  | Source of truth                                             |
| ----------------------------------- | ----- | ----------------------------------------------------------- |
| `slug`                              | A/S   | Overlay slug, else manifest key                             |
| `name`                              | A/D   | Authored, else `humaniseSlug(slug)`                         |
| `tagline` / `blurb` / `description` | A     | Empty string when unauthored                                |
| `kind`                              | A/D   | Authored, else `'repo'`                                     |
| `contribution`                      | A/D   | `inferContribution(manifest)` merged with authored          |
| `tags`                              | A/D   | `inferTags(manifest)` + authored − suppressed               |
| `track`                             | A/D   | Authored, else `inferTrack(manifest)`                       |
| `trackAuthored`                     | **D** | Exactly `authored.track !== undefined`                      |
| `progress`                          | **D** | `inferProgress`: `commitsRecent > 0`. Never authored.       |
| `deployed`                          | **D** | Exactly `mergedLiveUrl !== undefined`                       |
| `released`                          | A     | Authored-only                                               |
| `retired`                           | A     | Authored-only                                               |
| `repoUrl`                           | S/D   | `manifest.remote`, else constructed GitHub URL              |
| `companionRepoUrls`                 | S     | `manifest.companionRemotes ?? []`                           |
| `lastCommit` / `firstCommit`        | S     | Via `withSyncedMetrics`                                     |
| `techFirstSeen`                     | **D** | Manifest `techFirstSeen` re-keyed from identity → tag label |
| `liveUrl`                           | A     | Authored, else base                                         |
| `highlights` / `relationships`      | A     | Empty array when unauthored                                 |
| `pin` / `hide`                      | A     | Undefined when unauthored                                   |
| `metrics`                           | S/G   | `ProjectMetrics`, above                                     |

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

**F1. `progress` and `commitsRecent` are the same fact.**
`inferProgress` is a total function of one field: `commitsRecent > 0`. `progress`
stores no information `metrics.commitsRecent` does not already carry, and both
reach the merged `Project`. The threshold (`> 0`, 4-week window) is the only
content, and it lives in code, not data. Candidate for deriving at read time
rather than storing.

### Near-duplicates — resolved, worth recording as precedent

**F2. `deployed` and `liveUrl`.** `deployed` is exactly
`liveUrl !== undefined`. Already correctly typed as derived and recomputed at
merge, never authored: this is the precedent the roadmap note cites. Not a
finding, but the pattern F1 and F3 should follow.

**F3. `trackAuthored` and `track`.** `trackAuthored` is a provenance bit about
`track`, not a fact about the project. It is the only field in the surface that
records _where another field came from_. Note the asymmetry: `released` and
`retired` are equally authored-only and carry no such bit, and `progress` is
equally inference-only and carries no such bit. Either provenance deserves a
uniform mechanism or `trackAuthored` should be reachable another way.

**F4. `SyncedSource` and `ProjectMetrics` overlap on 13 field names.**
Deliberate mirroring, and the comment says so. The duplication is structural
rather than semantic: the same fact, two shapes, one copied to the other. Worth
asking in the audit whether `ProjectMetrics` can be a derived subset type of
`SyncedSource` instead of a hand-maintained parallel list. `commitsAll` is the
sole field that would need special handling, being gate-produced.

### Orphans — facts with no clear home

**F5. Six synced fields are inference-only inputs.** `commitsHuman`,
`distinctAuthors`, `distinctAuthorsHuman`, `rootCommitMine`, `lastCommitMine`
and `languages` never reach `Project`: `ProjectMetrics` omits them, so nothing
portfolio-facing can read them. Each is consumed at build time in `defaults.ts`
(`inferContribution` for the first four, `inferTrack` for `lastCommitMine`,
`inferTags` for `languages`). Verified by grep across `src/`. This looks
deliberate rather than orphaned, so the audit's job is to state the category
explicitly, not to promote them.

**F6. `activeMonths` / `spanMonths` / `maxGapDays` have zero consumers.** Synced
with a clear purpose in the comment (sustained-vs-bursty shape) but absent from
`ProjectMetrics` and from every inference function. A grep across `src/` finds
no reads outside the interface declaration itself. Measured and stored for
nothing: either wire them up or stop syncing them.

**F7. Scope is encoded in field names, not in the type.** The all-authors vs
Jason-only distinction is carried by a `…All` / `…Mine` suffix convention that
the compiler cannot enforce, and the convention is not uniform: `commits` is
all-authors while `linesAdded` is Jason-only, so the unsuffixed name means
different scopes in the two grids. This is the sharpest correctness risk in the
surface, and the one most likely to produce a wrong number on the site.

### Doc-drift risk (not a property finding)

`src/routes/drift-engine/+page.ts:61` contains a hand-copied `ProjectRelationship`
definition inside a template literal, displayed as source on the drift-engine
page. It is not a second definition, but it will silently diverge from
`types.ts` if the real interface changes.
