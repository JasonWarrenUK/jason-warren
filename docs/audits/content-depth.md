---
description: Hybrid depth audit of all 34 hand-authored project entries. Output of 1CO.1; feeds 1CO.2 (bring entries to flagship depth) and 1CO.6 (theme coherence).
---

# Content Depth Audit

> **1CO.1** output. Every authored entry scored against the flagship rubric; the worklist for 1CO.2 falls out of the bottom.

---

## Contents

- [Rubric](#rubric)
- [Scorecard](#scorecard)
- [Gap Notes](#gap-notes)
- [Theme Observations](#theme-observations)
- [Worklist for 1CO.2](#worklist)

---

<a name="rubric"><h2>Rubric</h2></a>

Three tiers. Structural proxies give the first-pass triage; an editorial read of borderline entries confirms the verdict.

### Depth-signal fields

These carry editorial investment; all others (metrics, tags, dates) are Drift-sourced or structural:

| Field | Weight | Notes |
| --- | --- | --- |
| `description` | **Primary** | Longer body copy; one-sentence summaries and tooling-config lists score low regardless of word count |
| `highlights[]` | **High** | Intended as 3--5 technically interesting things; tooling-setup bullets undercut entries that otherwise look strong |
| `tagline` / `blurb` | Medium | High visibility; a generic tagline is felt across every card, the map, and meta |
| `contributionNote` | High (team only) | Absence is invisible in the UI; presence/specificity separates credited entries from credited-in-name-only |
| `relationships[].note` | Low | Matters mainly for engine-thread entries; generated fallback is acceptable |

### Tier definitions

| Tier | Structural proxy | Editorial test |
| --- | --- | --- |
| **Full** | description ≥ 80 words; ≥ 4 highlights; team projects have a specific `contributionNote` (PRs, stats, named features) | Description names the problem, the architecture or approach, and a verification or outcome signal; highlights are feature/technical, not tooling-config |
| **Partial** | description 40--80 words **or** 3 highlights **or** team note present but generic | Some substance but missing at least one of: problem framing, architecture detail, feature-level highlights; could be tightened to pass |
| **Thin** | description < 40 words **or** ≤ 2 highlights **or** highlights read as tooling-config boilerplate | Reads as scaffolding; no architecture narrative; needs a rewrite, not a tweak |

Word counts below are approximate; the editorial tier is the verdict when they differ from the proxy.

### Flagship benchmark

**Iris** sets the bar: a description that opens with the problem (apprenticeship XML submissions demand a strict format; data rarely arrives in it), names the architecture (single TS core driving three interfaces), explains the technical approach (real ESFA XSD parsed into a type-resolving registry), and closes with a verification signal (v5.0.0, 666 commits, 1:1 source-to-test mapping). Five feature-level highlights, none of which reference ESLint or project structure. A relationship note that explains why Schema Forge was extracted and what it now powers.

**Wyrd** is the second flagship and reaches the same level from a different angle: the description is unusually specific about the custom Cypher subset (what it parses, what traversals it supports), the merge driver (its own binary, conflict resolution strategy), and test coverage (68.5% across 150 Go files). The technical rigour is the narrative.

---

<a name="scorecard"><h2>Scorecard</h2></a>

Sorted by confirmed tier (Thin first), then by visibility within tier (featured/flagship entries and those on engine threads rank up).

| Slug | Role | Status | ~Words | Highlights | Note? | Featured | Proxy | Confirmed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `psyche` | lead | archived | ~37 | 1 | ✓ (generic) | — | **Thin** | **Thin** |
| `baby-names` | solo | finished | ~43 | 2 | — | — | Thin | **Thin** |
| `kitchen-gremlin` | solo | wip | ~42 | 2 | — | — | Thin | **Thin** |
| `kamino` | solo | finished | ~76 | 5 | — | — | Partial | **Partial** |
| `grumble` | solo | finished | ~57 | 4 | — | — | Partial | **Partial** |
| `those-who-came-before` | solo | prototype | ~80 | 5 | — | — | Full (proxy) | **Partial** |
| `nib` | solo | finished | ~78 | 4 | — | — | Partial | **Partial** |
| `top-girls` | solo | finished | ~95 | 5 | — | — | Full | **Full** |
| `rimewarden` | solo | prototype | ~97 | 5 | — | — | Full | **Full** |
| `historia` | solo | prototype | ~95 | 5 | — | — | Full | **Full** |
| `sakura` | lead | finished | ~97 | 5 | ✓ | — | Full | **Full** |
| `craft-and-graft` | lead | finished | ~90 | 5 | ✓ | — | Full | **Full** |
| `the-tongue` | solo | live | ~87 | 5 | — | ✓ | Full | **Full** |
| `redot` | collaborator | finished | ~92 | 5 | ✓ | — | Full | **Full** |
| `riffle` | solo | finished | ~97 | 5 | — | — | Full | **Full** |
| `sparker` | solo | prototype | ~100 | 5 | — | — | Full | **Full** |
| `workwise` | lead | wip | ~100 | 5 | ✓ | ✓ | Full | **Full** |
| `epoch` | solo | finished | ~107 | 5 | — | ✓ | Full | **Full** |
| `schema-forge` | solo | wip | ~84 | 5 | — | — | Full | **Full** |
| `things-we-do` | collaborator | archived | ~82 | 5 | ✓ | — | Full | **Full** |
| `beacons` | lead | archived | ~115 | 5 | ✓ | — | Full | **Full** |
| `flyt` | solo | wip | ~100 | 5 | — | — | Full | **Full** |
| `rhea` | solo | prototype | ~110 | 5 | — | ✓ | Full | **Full** |
| `guardrails` | collaborator | wip | ~108 | 5 | ✓ | — | Full | **Full** |
| `chirpdb` | collaborator | wip | ~96 | 5 | ✓ | — | Full | **Full** |
| `code-arcana` | solo | finished | ~90 | 5 | — | — | Full | **Full** |
| `commons-traybake` | lead | wip | ~105 | 5 | ✓ | — | Full | **Full** |
| `cogni` | solo | prototype | ~105 | 5 | — | — | Full | **Full** |
| `lyra-rose` | solo | wip | ~112 | 6 | — | — | Full | **Full** |
| `the-work` | solo | wip | ~110 | 5 | — | — | Full | **Full** |
| `fac-cra` | collaborator | wip | ~140 | 5 | ✓ | — | Full | **Full** |
| `iris` | solo | finished | ~115 | 5 | — | ✓ | Full | **Full** (flagship) |
| `wyrd-tui` | solo | wip | ~118 | 5 | — | ✓ | Full | **Full** (flagship) |

**Summary:** 3 Thin · 4 Partial · 27 Full (including 2 flagship).

---

<a name="gap-notes"><h2>Gap Notes</h2></a>

Notes cover only Thin and Partial entries. Full entries need no structural work for 1CO.1's purposes, though some have room for editorial polish.

### Thin entries

#### `psyche`

The description is a 37-word summary: it names the cohort, the tech, and the commit share, but says nothing about what the project does or what was technically interesting about it. The single highlight ("Primary author (76/82 commits) on a collaborative training project") is a commitment claim, not a technical point. The `contributionNote` is present but restatement-only; it adds nothing to the description.

This was a training project and is now archived, which is context worth capturing: the entry's weakness partly reflects the project's nature, but "training project" is not a description. What did it build? What were the interesting problems, even at a learning stage?

Gaps: no problem statement; no architecture; no feature-level highlights; contributionNote restates the description.

#### `baby-names`

43 words of description that mention the tech stack (Svelte 5 runes, lucide-svelte, ESLint, Prettier) but not what the app does in any interesting way. The tagline is more useful than the description. Two highlights both reference tooling setup.

This is a toy and the scope is limited; it will never be a flagship entry. The gap is not ambition but specificity: what does the shortlisting mechanic look like? Is there a search? How does state flow? Even a small app can have one technically specific thing to say.

Gaps: no architecture note; no feature specifics; highlights are tooling-config boilerplate.

#### `kitchen-gremlin`

42 words covering the monorepo structure and ESLint/Bun config. The tagline ("A TypeScript monorepo. Under active construction.") is honest but inert. The description ends with "more to follow as the project takes shape," which is placeholder phrasing even without the `[Placeholder]` marker.

This is wip with 18 commits, so limited to write about. The update belongs when the project has something to say; in the meantime the description sits as a soft placeholder.

Gaps: genuinely no feature content yet to describe; acceptable to revisit after project matures, but the current text reads as holding copy.

---

### Partial entries

#### `kamino`

76 words; proxy-Full on word count but editorially Partial. The description opens with what it is (a project template) and lists the automation features, but never frames the problem it solves. Why do apprenticeship projects need a dedicated template? What was the previous state? The description moves straight to what it does without anchoring the reader in why. Five strong, specific highlights; those carry the entry. The description needs a one-sentence problem frame before the feature list.

Gaps: no problem framing in the description; highlights are good and specific.

#### `grumble`

57 words; 4 highlights. The description is structurally correct (opens with the architecture decision, names the scoring library's isolation, mentions tests, closes with tech) but thin in the middle: "implements the full Gin Rummy ruleset" is a feature list, not a specific technical choice. The architecture point (pure scoring library, zero Svelte dependencies, covered by tests) is genuinely interesting and partially made, but the description doesn't explain *why* that separation matters or what it enabled. Highlight 4 ("Built with SvelteKit and Svelte 5 runes") is a tech-stack statement masquerading as a technical detail.

Gaps: fourth highlight is boilerplate; description makes the architecture point but doesn't extend it to its value.

#### `those-who-came-before`

Proxy-Full at 80 words and 5 highlights, but editorially Partial. The description is dominated by tech-stack enumeration (SvelteKit through Deno, Tailwind CSS v4, DaisyUI v5, @deno/svelte-adapter) rather than the interesting design decisions. "A grammar-based procedural artefact generator with typed definitions for item parts, conditions, and materials sits staged for integration" is the most interesting sentence; it appears once and is not developed. Highlight 1 ("Runs SvelteKit through Deno (not Node)") is a deployment note, not a technical insight. Highlight 5 ("Architecture Decisions documented") is metadata.

Gaps: description reads as a tech-stack list; the procedural generator is the interesting part and gets one mention; at least two highlights are infrastructure notes rather than design insights.

#### `nib`

78 words; 4 highlights. The description is clean and specific (extraction from The Work, copy-paste distribution model, Svelte 5 runes, tag parsing, single onInit callback). It is Partial rather than Full on highlight count (4 vs 5) and because the description, while specific, doesn't carry a problem statement: what was wrong with integrating Ink directly that made extraction worthwhile? One more highlight naming the extraction trigger, and a single sentence on the motivation, would lift this to Full.

Gaps: fourth highlight on motivation would round out the entry; description could open with the extraction trigger.

---

<a name="theme-observations"><h2>Theme Observations</h2></a>

Feeding into **1CO.6** (theme coherence). These are observations about depth distribution across theme clusters, not content judgements.

### The tooling cluster

`kamino`, `grumble`, `redot`, `schema-forge`, and `nib` all sit in the tooling/utility space. Of these, `redot` and `schema-forge` are Full; `nib` is borderline Partial. The thinnest tooling entry is `kamino`, which has the strongest architecture but the weakest framing. The cluster has good overall coverage but `kamino`'s problem statement is the priority fix.

### Training-project entries

`psyche` (archived, FAC-31), and to a lesser degree `baby-names`, are the entries that most visibly reflect a learning context. They will never be flagships. The question for 1CO.6 is whether they belong in a distinct theme ("learning/training") or whether thin entries scattered through other themes degrade those themes' coherence. Given both are `archived` or `toy`, they are unlikely to be foregrounded; the risk is low.

### The engine-extraction thread

`iris`, `schema-forge`, `flyt`, `riffle`, `nib`, and `the-work` form the engine-thread cluster. All except `nib` are Full. The `schema-forge` description correctly cross-references `iris`; the `flyt`/`riffle` pair is symmetrically documented. The `nib`/`the-work` pair is the only one where the library entry is editorially thinner than the consumer. Worth completing `nib` to Full before 1CO.6 reviews thread coherence.

### Game/interactive-fiction entries

`flyt`, `riffle`, `the-work`, `those-who-came-before`, `top-girls`, `rimewarden`. All Full except `those-who-came-before` (Partial). The cluster is strong; `those-who-came-before` is the outlier and its gap is the procedural generator description.

### AI/research entries

`rhea`, `commons-traybake`, `chirpdb`, `guardrails`, `redot`. All Full. This cluster is the strongest by description quality, possibly because the problems are inherently specific (retrieval, PII detection, documentation drift). Worth preserving as a model for other clusters.

---

<a name="worklist"><h2>Worklist for 1CO.2</h2></a>

Priority order: confirmed tier × visitor visibility × theme impact. Visibility ranking from the surfacing audit: `blurb` is most-exposed (collapsed cards everywhere + engine threads); then `tagline` (header, expanded cards, hero, meta); then `highlights` (detail page + flagship hero top 3); then `description` (detail page only).

### Priority 1 — Thin entries (rewrite)

| Slug | Priority rationale | Specific asks |
| --- | --- | --- |
| `psyche` | Team/lead entry; contributionNote present; least content of all 34 | Add a one-paragraph description: what did it build, what was technically interesting at a learning stage. Replace the single highlight with 3--4 feature or process points. Tighten contributionNote to add something the description doesn't say. |
| `baby-names` | Thin by every measure; low complexity so should be quick | Name the shortlisting mechanic, state search, and describe how state flows. Replace the two tooling highlights with one feature highlight and one design/state-management point. |
| `kitchen-gremlin` | Holding copy; should wait until project matures | Acceptable to defer until the project has something to say. If `wip` status means it stays on the list, add a single specific sentence about the intended architecture or purpose. |

### Priority 2 — Partial entries (targeted extension)

| Slug | Priority rationale | Specific asks |
| --- | --- | --- |
| `nib` | Engine-thread entry; library for `the-work`; coherence at risk | Add one more highlight on the extraction motivation. Open description with a sentence on why integrating Ink directly was the wrong move (the problem nib solves). |
| `kamino` | Tool entry with strong highlights but description lacks framing | Add one sentence to the opening of the description naming the problem before the feature list. |
| `those-who-came-before` | Partial despite word count; procedural generator undersold | Replace "Runs SvelteKit through Deno" highlight with a highlight on the grammar-based generator. Tighten description to lead with the game mechanic, not the stack. |
| `grumble` | Partial highlight quality; fourth highlight is boilerplate | Replace highlight 4 ("Built with SvelteKit and Svelte 5 runes") with a specific note on what the architecture separation enabled (testability, or what). |

### Priority 3 — Full entries with room for editorial polish

The 27 Full entries do not need structural work for 1CO.1's purposes. Some observations for 1CO.2's later passes:

- `the-tongue`, `epoch`, `workwise`, `rhea`, and `the-work` are featured/full and read well. If the rotation mechanism (1CO.10) foregrounds any of these, no description work is needed.
- `code-arcana` is Full but its tagline and description reference "British aesthetic" and "anti-authoritarian framing" without explaining what that means in practice. Worth a single explanatory clause when 1CO.2 reaches it.
- `chirpdb` is technically Full but the `contributionNote` is honest about limited scope (28 commits, docs and tooling). The description is good; nothing structural to do.

---

*Audit completed: 2026-06-20. Feed gaps into 1CO.2; theme observations into 1CO.6.*
