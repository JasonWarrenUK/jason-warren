# Drift authoring guide (5DR.10)

> Answers one question: I want field X to say Y. Where do I type it, and what
> will overwrite me? For the mechanism this all runs on (config, data model,
> the precedence lifecycle diagram), see
> [`docs/drift-engine-reference.md`](./drift-engine-reference.md), and
> [`docs/drift-boundary.md`](./drift-boundary.md) for layer ownership. For the
> complete type-level provenance map, see
> [`docs/design/property-census.md`](./design/property-census.md).

## Contents

- [Start here](#start-here)
- [The one rule](#the-one-rule)
- [Where you type things](#where-you-type-things)
- [Per-field action table](#per-field-action-table)
- [Fields you cannot author, and why](#fields-you-cannot-author-and-why)
- [Author only where you disagree](#author-only-where-you-disagree)
- [Pinning a metric](#pinning-a-metric)
- [Provisional metrics for unmerged work](#provisional-metrics-for-unmerged-work)
- [Four ways to hide something](#four-ways-to-hide-something)
- [Per-tech overrides](#per-tech-overrides)
- [What will overwrite me](#what-will-overwrite-me)
- [What the tests will reject](#what-the-tests-will-reject)
- [Checking your work](#checking-your-work)
- [Adding a new project, end to end](#adding-a-new-project-end-to-end)

---

## Start here

| I want to...                                 | Go to                                                                |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Change what a project card says              | [Per-field action table](#per-field-action-table)                    |
| Pin a metric that has drifted                | [Pinning a metric](#pinning-a-metric)                                |
| Hide a project or tech from part of the site | [Four ways to hide something](#four-ways-to-hide-something)          |
| Fix a tech's first-used date                 | [Per-tech overrides](#per-tech-overrides)                            |
| Know what a verb is allowed to write         | [What will overwrite me](#what-will-overwrite-me)                    |
| Know why `bun run test` rejected my overlay  | [What the tests will reject](#what-the-tests-will-reject)            |
| Add a brand-new project                      | [Adding a new project, end to end](#adding-a-new-project-end-to-end) |

---

## The one rule

Metrics and dates resolve as **override > synced > provisional**. Overlays
carry no metrics and no dates by design (`AuthoredProject` in `types.ts`
deliberately omits them), so there is no authored tier for metrics: an
overlay cannot out-rank a sync, only `overrides.json` can.

Two places in the repo currently say otherwise: `overrides.json`'s own
`_note` and `docs/drift-improvement-plan.md` both describe an authored tier
that does not exist. Trust the code (`withSyncedMetrics` in `index.ts`), not
that prose.

For editorial fields (`tagline`, `highlights`, `track`, and so on) the rule
is simpler: authored always wins, straight override, with three exceptions
covered below (`tags`, `progress`, `deployed`).

---

## Where you type things

| Surface                 | Holds                                               | Verb                                                              | Hand-editing OK?                                                     | Watch out                                                                                                                                |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `projects/<slug>.ts`    | Editorial content, one file per project             | `drift author`, `drift flag`, `drift tag`, `drift relate project` | Yes, always                                                          | Nothing rewrites content wholesale; see [What will overwrite me](#what-will-overwrite-me)                                                |
| `overrides.json`        | Manual metric/date pins, keyed by slug              | `drift keep`, `drift keep-all`                                    | Yes, for the first entry (see [Pinning a metric](#pinning-a-metric)) | `drift keep` refreshes an existing entry; it does not create one                                                                         |
| `excluded.json`         | Slugs removed from the public site                  | `drift hide`                                                      | Yes                                                                  | Warns if the slug isn't in `sources.json` yet                                                                                            |
| `in-progress.json`      | Provisional metrics for unmerged branches           | `drift promote`                                                   | Rarely; see below                                                    | Only `visibility: 'public'` entries reach the site                                                                                       |
| `tech-overlays.ts`      | Per-tech kind, first-used floor, surface visibility | `drift tech`                                                      | Yes                                                                  | `firstUsed` is a floor, not a trump: see [Per-tech overrides](#per-tech-overrides)                                                       |
| `tech-relationships.ts` | Tech-to-tech edges (`leads-to`, `replaced-by`)      | `drift relate tech`                                               | Yes                                                                  | Endpoints validated by a data test, not the compiler                                                                                     |
| `themes.ts`             | Theme membership (`/toolkit` groupings)             | `drift theme`                                                     | Yes                                                                  | Throws during prerender on a dangling slug; needs ≥2 members                                                                             |
| `sources.local.json`    | Per-machine absolute paths, gitignored              | `drift init` (scaffolds), then hand-fill                          | Yes, and it's the only way                                           | The first authoring action on a fresh checkout; get it wrong and nothing resolves                                                        |
| `source-topology.json`  | Companion-repo groupings                            | Hand-authored                                                     | Yes, it's the only way                                               | `drift sync` does **not** write this file, despite what the README's data-file table says: every reference in `check-drift.js` is a read |

`tech-overlays.ts` and `tech-relationships.ts` are registry-free by design:
they must never import `./index.js`, so Svelte components can pull in one
without dragging in the whole project registry.

---

## Per-field action table

Legend, reused from `property-census.md`: **S**ynced (measured by `drift
sync`), **A**uthored (you write it), **D**erived (computed, never stored),
**G**ate output (produced only at merge). Two fields here are missing from
that census's own table today: `plainBlurb` and `hideFromPlainIntro`. Both
exist in `AuthoredProject` right now.

Only authorable fields appear below. If you're looking for a field and it
isn't here, it's probably in [Fields you cannot author, and why](#fields-you-cannot-author-and-why).

| I want to change...                        | Prov | Where you type it     | Verb                       | Overwritten by                                                | Watch out                                                                                          |
| ------------------------------------------ | ---- | --------------------- | -------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The name on the card                       | A/D  | `name` in the overlay | `drift author`             | Nothing; falls back to `humaniseSlug(slug)` when unauthored   | A test rejects a name identical to the generated one                                               |
| The one-line tagline                       | A    | `tagline`             | `drift author`             | Nothing                                                       | n/a                                                                                                |
| The short blurb                            | A    | `blurb`               | `drift author`             | Nothing                                                       | Must be shorter than, and distinct from, `tagline`                                                 |
| The plain-English summary                  | A    | `plainBlurb`          | `drift author`             | Nothing                                                       | Required on every authored overlay                                                                 |
| The full description                       | A    | `description`         | `drift author`             | Nothing                                                       | ≥ 25 words, longer than `blurb`, no leftover `[Placeholder]`                                       |
| The project kind (repo / tui / lib / …)    | A/D  | `kind`                | `drift author`             | Falls back to `'repo'` when unauthored                        | n/a                                                                                                |
| Whether it reached the world               | A    | `released`            | `drift author`             | Nothing; authored-only, no inference exists                   | Orthogonal to `progress`; the two combine on the badge                                             |
| Whether the work is shelved                | A    | `retired`             | `drift author`             | Nothing                                                       | Shows as a shade shift, never a new hue                                                            |
| The live URL                               | A    | `liveUrl`             | `drift author`             | Nothing                                                       | Also flips `deployed` (see below)                                                                  |
| The bullet highlights                      | A    | `highlights`          | `drift author`             | Nothing                                                       | ≥1 required on every authored overlay                                                              |
| Relationships to other projects            | A    | `relationships`       | `drift relate project`     | Nothing                                                       | `powers` / `extracted-from` must be authored as a matching pair                                    |
| Role and collaboration story               | A/D  | `contribution`        | `drift author`             | `inferContribution` when unauthored                           | Team roles need a `contributionNote` or the role is dead weight; see below                         |
| Solo vs product vs spike intent            | A/D  | `track`               | `drift author`             | `inferTrack` when unauthored                                  | Don't restate the inference; see [Author only where you disagree](#author-only-where-you-disagree) |
| Which technologies show                    | A/D  | `tags`                | `drift tag add`            | Never fully; **appends** to inferred, deduped on `kind:label` | Adding a tag Drift already infers is rejected by a test                                            |
| Dropping an inferred or authored tag       | A    | `suppressTags`        | `drift tag hide`           | N/A                                                           | Applies **last**, beats both inference and authored additions. Used by 0 of 33 overlays today      |
| Forcing the hero pool above score          | A    | `pin`                 | `drift flag --pin`         | Nothing                                                       | Use sparingly; used by 0 of 33 overlays today                                                      |
| Excluding from the hero pool only          | A    | `hide`                | `drift flag --hide`        | Nothing                                                       | Different from `excluded.json`; see below                                                          |
| Excluding from the plain-English home page | A    | `hideFromPlainIntro`  | `drift author` (hand-edit) | Nothing                                                       | Missing from `property-census.md`'s table                                                          |

---

## Fields you cannot author, and why

These fields never accept an authored value, however they're spelled in an
overlay. The reasoning is drawn straight from the `types.ts` JSDoc.

- **`progress`**: never authored. It's a pure observation:
  `commitsMeRecent > 0`. Git can see whether commits are still landing; it
  cannot see why, and authoring an opinion over that would misrepresent a
  measurement as a judgement.
- **`deployed`**: never authored. Recomputed at merge as exactly
  `liveUrl !== undefined`, so authoring `liveUrl` is how you change it.
- **`trackAuthored`**: set implicitly, `true` whenever you authored `track`
  at all. It's a provenance bit about `track`, not a fact about the project.
- **`commitsHeadlineScope`**: records which scope (`'any'` or `'me'`) the
  curation gate chose for `commitsHeadline`. Deliberately excluded from the
  overridable list: pinning it would let an override misattribute which
  scope a figure came from.
- **`repoUrl` / `companionRepoUrls`**: sourced from `sources.json` only. A
  test rejects any overlay containing a repository URL field at all.
- **`metrics`**: the whole `ProjectMetrics` object; see [Pinning a metric](#pinning-a-metric)
  for the only way to change a piece of it.

---

## Author only where you disagree

An overlay exists to record a human decision the manifest cannot reach. A
value identical to the inferred one records nothing: it pins no judgement,
and deleting it would change no rendered output.

It's not merely inert, either. `trackAuthored` drives the dotted-provisional
convention (surveyed ground rendered distinctly from conjecture), so a
redundant authored `track` silently upgrades a heuristic guess into a
confident claim. This happened in practice: blanket authoring had left 0 of
32 projects rendering as provisional, retiring the convention while the code
for it remained. Two data tests now catch it:

- an authored `track` identical to `inferTrack`'s output is rejected
- an authored `contribution` carrying only a role matching the inference,
  with no `collaboration` or `contributionNote`, is rejected

Authoring a value that _disagrees_ with the inference is exactly the point,
and always allowed.

---

## Pinning a metric

`drift keep` refreshes an existing override's baseline; **it does not create
one**. The first entry for a field is hand-written into `overrides.json`.

Entry shape (`{value, syncedWhenSet, syncedField?, _setNote?}`):

```json
{
	"overrides": {
		"lyra-rose": {
			"commitsMe": {
				"value": 240,
				"syncedWhenSet": 240,
				"_setNote": "Pinned after a history rewrite dropped the real count."
			}
		}
	}
}
```

- `value`: what renders.
- `syncedWhenSet`: the synced value at the moment you pinned it, so the
  drift report can flag when the ground truth moves on. `null` means a pure
  pin with no baseline at all: the report never flags it as stale.
- `syncedField`: only needed when the override key doesn't match the synced
  field it compares against. In practice that's only `commitsHeadline`
  (compare against `commitsMe` for a team project, `commitsAny` for solo).
- `_setNote`: why, for future you.

Once the entry exists, `drift keep <slug> <field>` dismisses a drift flag by
refreshing `syncedWhenSet` while keeping your value. `drift keep
--all-projects <field>` does that one field across every flagged project;
`drift keep-all` does every flagged field on every project.

**Legal keys** are the 16-entry allow-list enforced by `OVERRIDABLE_FIELDS`
in `data.test.ts`, not the schema's own comments: `commitsAny`,
`commitsAnyRecent`, `commitsMe`, `commitsMeRecent`, `commitsHeadline`,
`linesAny`, `linesMeAdded`, `linesMeRemoved`, `linesAnyAdded`,
`linesAnyRemoved`, `linesMeAddedRecent`, `linesMeRemovedRecent`,
`linesAnyAddedRecent`, `linesAnyRemovedRecent`, `commitAnyLast`,
`commitAnyRoot`.

---

## Provisional metrics for unmerged work

`in-progress.json` holds metrics for work still on an unmerged branch, keyed
by slug, with a `visibility: 'public' | 'local'` flag. Only `'public'`
entries reach the site; `'local'` lets you track a branch's numbers without
showing provisional figures publicly.

This is the one surface that heals itself: once the branch lands, the next
`drift sync` measures the default branch and the real numbers naturally
outrank the provisional ones under the `override > synced > provisional`
rule. `drift promote <slug>` then removes the now-redundant provisional
entry (or `drift promote <slug> <field>` for just one tracked field);
promoting is tidying, not what makes the real numbers show.

---

## Four ways to hide something

Four different mechanisms answer "make this not show", and each hides a
different amount:

| Mechanism                 | Where                      | Effect                                                                                                                   |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `excluded.json`           | `drift hide <slug>`        | Off the site entirely: absent from the registry, every filter view, the map, the timeline, the sitemap, and OG prerender |
| `hide` (overlay field)    | `drift flag <slug> --hide` | Out of the home-page hero pool only; stays visible everywhere else on the site                                           |
| `hideFromPlainIntro`      | hand-edit the overlay      | Off the "for everyone else" plain-English home page only                                                                 |
| `retired` (overlay field) | hand-edit the overlay      | Still shown, rendered as a shade shift rather than removed                                                               |

Two narrower tools sit alongside these for tags rather than projects:

- **`suppressTags`** drops one tag label from one project's merged list,
  whether the tag was inferred or authored. `drift tag hide <slug> <label>`.
- **`hiddenFrom`** on a `tech-overlays.ts` entry drops a label from an
  _aggregate_ surface (`toolkit`, `map`, `stack`, `relate`) without touching
  any individual project's chips, which are never hidden this way. `drift
tech hide <label> [--from toolkit,map,stack,relate]`.

---

## Per-tech overrides

`tech-overlays.ts`, managed by `drift tech`, is the single authoring surface
for per-tech data. Two behaviours reach into project fields:

**`kind` overrides the taxonomy kind globally.** Set with `drift tech set
<label> --kind <tag-kind>`. It's applied once, at a single point in the
merge path (`applyTechKindOverrides`, between `mergeAuthored` and
`withSyncedMetrics`), so every consumer of `Project.tags` sees the same
kind for that label everywhere it appears.

**`firstUsed` is a floor, not a trump.** Set with `drift tech set <label>
--first-used YYYY-MM-DD`. Verified in `adoption.ts`:

```ts
const useDerived = derived !== undefined && (curated === undefined || derived <= curated);
```

Your authored date survives only when it predates every repo's evidence. The
moment any project carrying that tag has a `commitAnyRoot` earlier than or
equal to your date, the derived date wins and yours is silently ignored.
`dateSource` (`'curated'` or `'derived'`) on the rendered adoption record is
the only visible sign of which one won, so if a date you set doesn't seem to
be taking effect, check that field first: your earliest commit has probably
overtaken it.

---

## What will overwrite me

The claim "nothing auto-writes `projects/*.ts`" is repeated in a few places
in this repo and is **false**. Four verbs write overlay files, derived here
from each verb's own `Write-isolation` declaration in `check-drift.js`
(`grep -n "Write-isolation" scripts/check-drift.js` to re-verify):

| Verb                            | Writes                                 | Behaviour                                              |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `drift sync`                    | `sources.json` only                    | Never touches an overlay                               |
| `drift keep` / `keep-all`       | `overrides.json` only                  | Never touches an overlay                               |
| `drift hide`                    | `excluded.json` only                   | Never touches an overlay                               |
| `drift promote`                 | `in-progress.json` only                | Never touches an overlay                               |
| `drift author`                  | `projects/<slug>.ts`, create-if-absent | Never overwrites an existing file                      |
| `drift flag`                    | `projects/<slug>.ts`                   | TS-compiler splice: inserts or flips `pin`/`hide` only |
| `drift tag`                     | `projects/<slug>.ts`                   | Splices `tags` / `suppressTags` only                   |
| `drift relate project`          | `projects/<slug>.ts`                   | Appends to `relationships` only                        |
| `drift tech`                    | `tech-overlays.ts` only                | Splices one entry                                      |
| `drift theme`                   | `themes.ts` only                       | Splices membership                                     |
| `drift relate tech`             | `tech-relationships.ts` only           | Appends an edge                                        |
| `drift audit`, `drift authored` | nothing                                | Read-only                                              |

The accurate summary: **no verb ever rewrites your editorial content.** The
splicing verbs insert or flip named properties precisely, using the
TypeScript compiler API, and leave everything else in the file untouched.
`index.ts`'s own header comment and `docs/drift-boundary.md`'s
write-isolation table both still assert the stronger "nothing auto-writes"
claim and both still call `drift flag` by its retired name `drift pin`;
trust the table above over either.

---

## What the tests will reject

`data.test.ts` enforces about eighteen authoring rules the compiler can't
see. These are the highest-friction thing an author hits, usually as a batch
of red lines from `bun run test`. Grouped by what they're protecting:

**Required content**

| Rule                                               | Why                                                 |
| -------------------------------------------------- | --------------------------------------------------- |
| Every authored project has ≥1 tag and ≥1 highlight | Empty editorial fields signal an unfinished overlay |
| `plainBlurb` is present                            | Required on every authored overlay                  |
| `description` is ≥25 words                         | The Thin floor from `docs/audits/content-depth.md`  |
| No leftover `[Placeholder]` marker                 | Scaffold copy left unedited                         |

**Distinctness**

| Rule                                              | Why                                               |
| ------------------------------------------------- | ------------------------------------------------- |
| `blurb` differs from `tagline` and is shorter     | Otherwise one field is dead weight                |
| `description` is longer than `blurb`              | A short description signals unedited holding copy |
| An authored `name` differs from the generated one | Otherwise the field is redundant                  |
| No `(kind, label)` tag duplicate                  | Breaks the keyed list render                      |
| No authored tag duplicates a Drift-inferred one   | Redundant, same reasoning as `name`               |

**Don't restate the inference**

See [Author only where you disagree](#author-only-where-you-disagree):
a redundant `track` or bare `contribution.role` is rejected outright.

**Structural**

| Rule                                                              | Why                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| Every relationship target resolves to a real slug                 | Dangling edges break the graph                                    |
| `powers` and `extracted-from` must be authored as a matching pair | One-sided edges misrepresent the relationship                     |
| Authored team projects need a non-empty `contributionNote`        | Solo projects are exempt; team ones need the story git can't tell |

**Boundaries**

| Rule                                                      | Why                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| No repository URL field in an overlay                     | `repoUrl` comes from Drift only                                 |
| Curated `language` tags must be a subset of detected ones | A tag can't claim a language the repo doesn't have              |
| `data`-kind tags limited to editorial architecture labels | Dependency-backed data facts come from Drift, not hand-authored |

**House style**

| Rule                          | Why                                                            |
| ----------------------------- | -------------------------------------------------------------- |
| No em-dashes anywhere in copy | British English house style, enforced in code as well as prose |

---

## Checking your work

- **`drift authored [<slug>]`**: every `AuthoredProject` field for every
  overlay (or one), absent fields shown as `-` so gaps are as visible as
  content. The fastest way to see exactly what you've set.
- **`drift audit [--json]`**: scores every overlay against the
  content-depth rubric (Full / Partial / Thin, worst-axis wins) and flags
  volatile prose (hardcoded counts, dates, status-tense phrases) that will
  drift as the repo moves on. Writes nothing; recomputes from live files.
- **`bun run test`**: runs every rule in [What the tests will reject](#what-the-tests-will-reject)
  plus the data-integrity suite. Run this before committing an overlay
  change; it's what CI runs too.
- **Can I do this without opening an editor?** `drift author <slug>`
  accepts inline flags for the scalar fields: `name`, `tagline`, `blurb`,
  `plainBlurb`, `description`, `kind`, `liveUrl`. Everything else (tags,
  relationships, contribution, track, released, retired, pin, hide) needs
  its own verb or a hand-edit.

For scale: across the 33 existing overlays, every one carries `slug`,
`tagline`, `blurb`, `description`, `kind`, `highlights`, `relationships` and
`tags`. `track` appears on 20, `contribution` on 12, `released` on 5,
`name` on 5, `retired` on 2, `liveUrl` on 1. `suppressTags` and `pin` appear
on none. That's a rough guide to what's normal versus exceptional to author.

---

## Adding a new project, end to end

The README's older three-step version is out of date: it says to add the
slug to a `ProjectSlug` union and register it in `index.ts`. Neither step
exists any more. `ProjectSlug` is a plain `string`, and overlay discovery is
automatic via `import.meta.glob`. The real steps:

1. Ensure the slug exists as an entry in `sources.json` (run `drift sync`
   once the repo is registered locally, via `sources.local.json`).
2. Run `drift author <slug>` to scaffold `projects/<slug>.ts` from the full
   commented template and open it in `$EDITOR`. Fill in what applies; delete
   the rest, and the registry falls back to Drift-derived defaults for
   anything left unset.
3. Run `bun run test`. The rules in [What the tests will reject](#what-the-tests-will-reject)
   will catch a dangling relationship, a missing note, or holding copy left
   unedited.
