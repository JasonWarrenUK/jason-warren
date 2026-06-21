# Drift Improvement Plan

> This plan was authored before implementation began. The actual build reordered
> phases, added unplanned scope, and made choices that the original sequencing
> did not anticipate. The document has been reconciled against the real git
> history (`build/enhance-drift-checker`). The source of truth for what is and
> is not built is the code, not this file.

---

## Status legend

| Symbol | Meaning                                     |
| ------ | ------------------------------------------- |
| ✅     | Complete                                    |
| 🟡     | Partial — some bullets shipped, some remain |
| ⬜     | Not started                                 |

---

## Context

`check-drift.js` reconciles the git reality of ~33 source repos against the last-synced fingerprints in `src/lib/data/sources.json`, and is the middle tier of the render-time metric stack (`override.value ?? synced ?? authored`, merged in `src/lib/data/index.ts`).

### Decisions taken (these shape the whole plan)

1. **Drop the Claude Code SessionStart hook entirely.** Drift is a first-class **interactive CLI tool**, invoked deliberately. The hook's only unique power was injecting repo-state into the model's context unprompted; everything else the CLI does better, and the hook can't write safely anyway. **Accepted tradeoff:** Claude loses proactive session-start awareness. Repo state reaches the model only when the user runs the CLI. Optional, non-Claude automation (a git `post-commit`/`post-merge` hook in source repos) can keep numbers warm without any session-start cost.

2. **`gum` is a required dependency for interactive UX, TTY-gated.** Mirrors the user's own `_wot-interactive` idiom. Interactive runs get gum pickers/confirms/styled output; non-TTY paths (pipes, CI, scripts) fall back to plain text. "Required" means a documented prerequisite + a capability check, not crash-on-absent.

3. **In-progress store is a separate committed `in-progress.json`** (third sibling to `sources.json`/`overrides.json`), with a per-entry `visibility: "public" | "local"` field. See Phase 6 (⬜ not yet built).

Verified environment: Node v25.2.1 (`node:util` `parseArgs` available); `gum` 0.17.0, `glow`, `vhs` all installed.

### Guiding constraints

- The core script stays dependency-free in `node:*` terms. `gum`/`glow` are external binaries invoked via child process, capability-gated.
- British spelling, tabs for indentation, no em-dashes (CLAUDE.md).
- Preserve write-isolation: `update` never touches `overrides.json`; `accept` only touches `overrides.json`.
- A subcommand-style CLI (`drift <verb>`) reads better than flag soup. `--update`/`--accept` are migrated to verbs.

---

## Shipped (not originally planned phases)

Work that landed during the build but was not part of any numbered phase in the original plan.

- **`snapshot` verb** (`2f41f3e`, `3c61dc3`, `a1d8493`) — shows all current metrics for every configured repo in a card-per-project layout; absent fields shown with a placeholder.
- **Shared tag taxonomy module** (`789facc`, `772ab88`) — `src/lib/data/tag-taxonomy.js` + `.d.ts`; `EXTENSION_LANGUAGE`, `LANGUAGE_TAGS`, `RUNTIME_TAGS`, `FRAMEWORK_TAGS`, `DATABASE_TAGS` extracted from the CLI so both the app and the script share one source of truth.
- **Per-project card renderer** (`ab9f195`, `ed2cd11`) — `renderProjectCard()` shared between the `report` and `snapshot` paths; field-level drift markers, two-column metric grid.
- **Manifest-driven registry inversion** (`4b7cf7e`, `685dd13`) — `sources.json` manifest is now the authoritative source of slugs; registry builder (`defaultProjectFromManifest`) and `mergeAuthored` overlay.
- **Committed exclusion list** (`7976320`, `6bd0800`) — `src/lib/data/excluded.json` for repos and slugs to suppress; loaded at scan time, editable via `drift exclude`.
- **DRIFT wordmark above interactive menu** (`05b487f`) — gum-rendered ASCII wordmark sits above the `gum choose` picker on bare invocation.
- **`exclude` verb** (`f8d50d2`) — appends a slug to `excluded.json.slugs`; interactive gum confirm gate.
- **Coverage summary** (`50b3bd9`) — counts manifest slugs, excluded, overlay vs manifest-only; printed at the foot of every report.
- **Tag taxonomy: SQL as data tag** (`fb1cd0d`) — `SQL: { label: 'SQL', kind: 'data' }` entry in `tag-taxonomy.js`; `inferTags()` special-cases the `.sql` file-extension scan to surface SQL as a data signal so the relational model resolves without a driver dependency.
- **Cleanup: SessionStart hook removed** — `.claude/settings.local.json` `hooks` block is empty; `Bash(bun run scripts/check-drift.js*)` allow-entry kept for frictionless manual invocation.

---

## Phase 1 — ✅ CLI foundation (`refactor/drift-cli-foundation`)

All bullets landed in `932868f` (Phase 1 baseline) and subsequent commits on the branch.

- ✅ Migrated `process.argv` to `node:util` `parseArgs` + subcommand dispatcher
- ✅ `KNOWN_VERBS` set; `verb` / `args` derived cleanly; `--update`/`--accept` aliases removed (one cycle elapsed)
- ✅ Per-verb `--help` / `drift help <verb>` with gum-rendered markdown
- ✅ `NO_COLOR` + non-TTY detection; colour helper no-ops when piped
- ✅ `--json` output mode
- ✅ `--check` exit-code gate (non-zero on drift / new / conflicts)

---

## Phase 2 — ✅ Fingerprint performance (`perf/drift-fingerprint`)

**Goal:** make the fingerprint pass fast and responsive. Add an optional cache so repeated runs are cheap.

- ✅ **Async fan-out.** `git()` converted from `execSync` to `execFile` (promisified); `getFingerprint` runs all independent git calls concurrently via `Promise.all`; `computeDrift` uses a bounded-concurrency worker pool (`os.cpus().length` workers). Wall-clock dropped ~8× on the 33-repo set (~5.8s cold → ~0.7s warm).
- ✅ **De-duplicated `ls-files`.** `detectLanguages` and `countLinesOfCode` now share a single `listFiles()` result per repo instead of each spawning `git ls-files` independently.
- ✅ **HEAD+TTL cache.** Gitignored `src/lib/data/.drift-cache.json` caches per-repo `{ head, fingerprint, syncedAt }`. Cache hit requires HEAD match AND entry age < 24h (so windowed metrics never go stale indefinitely). `update`, `--full`, and `--no-cache` all bypass.
- ✅ **Opt-in source-repo git hook example.** `docs/drift-post-commit-hook.example.sh` — a `post-commit`/`post-merge` snippet a source repo can install to run `drift update <slug>` after each commit. Not auto-installed.

**Files:** `scripts/check-drift.js`, `.gitignore`, `docs/drift-post-commit-hook.example.sh`.

---

## Phase 3 — 🟡 Write safety (`fix/drift-update-safety`)

**Goal:** make writes safe and targeted.

- ✅ **Discriminated `git()` result.** `git()` returns `{ ok: true, out } | { ok: false, err }`; all callers check `.ok`. Shipped `fab885d`.
- ✅ **Null-safe `update`.** Field-merge in `runUpdate` only overwrites when the fresh value is non-null; warns which fields were preserved. Shipped `fab885d`.
- ⬜ **Per-repo `update <slug...>`.** Refresh one repo without rewriting all N. (`args` not yet forwarded to `runUpdate`.)
- ⬜ **`--dry-run`.** Field-level diff of what `update` would change, before writing.
- 🟡 **Clear `firstCommitProvisional`.** Schema field exists in `sources.schema.json` ("Set to false after a real --update sync") but code never reads or writes it.

**Files:** `scripts/check-drift.js`.

---

## Phase 4 — 🟡 Detection and targeting (`feat/drift-detection-and-targeting`)

**Shipped:**

- ✅ Runtime, database, framework, and remote detection (`detectDependencies`, `9444c0d`)
- ✅ `exclude` verb; committed exclusion list

**Remaining:**

- `--only <slug...>` scoping for `report`, `update`, and `accept`
- Dirty working-tree detection via `git status --porcelain`; advisory report section
- Removed-vs-never-configured split (currently both land in `missing`)
- Rename/move hint: correlate `missing` with `filteredNew` to suggest "looks like X moved to Y?"
- Multi-repo slugs: let a slug aggregate fingerprints across a `secondaryRepoUrl` companion

**Files:** `scripts/check-drift.js`.

---

## Phase 5 — ⬜ Branch awareness (`feat/drift-branch-awareness`)

**Goal:** stop measuring whatever branch is parked; resolve the default branch.

- **Resolve default branch instead of `HEAD`.** Add `defaultBranch(repoPath)`: try `git rev-parse --abbrev-ref origin/HEAD`, fall back to local `main`/`master`, fall back to `HEAD`. Measure against the resolved ref.
- **Record `measuredRef`** in the fingerprint so the manifest is self-describing; warn in the report when it fell back to `HEAD`.
- **Guard `delta` maths.** `current.commits - saved.commits` can go negative on history rewrites/branch switches; annotate instead of a misleading bare `-N`.

**Note:** The delta guard is the Phase 5 item the PR review flagged. It is intentionally deferred here because the root cause (measuring arbitrary `HEAD` instead of the default branch) is the whole point of Phase 5. Annotating the symptom without fixing the measurement would be premature.

**Files:** `scripts/check-drift.js`, `src/lib/data/sources.schema.json` (`measuredRef`), `src/lib/data/index.ts`.

---

## Phase 6 — ⬜ Staging pipeline (`feat/drift-staging-pipeline`)

**Goal:** track in-progress work on unmerged branches as provisional, opt-in metrics.

A third committed data file `in-progress.json` (sibling to `sources.json` / `overrides.json`). Per-entry `visibility: "public" | "local"` for case-by-case site exposure.

```jsonc
{
	"lyra-rose": {
		"branch": "feat/new-thing",
		"pipeline": ["feat/new-thing", "main"],
		"visibility": "public",
		"tracked": {
			"commitsMine": { "value": 27, "baseOnMain": 21 }
		}
	}
}
```

- Graduation detection: per tracked property, `git merge-base --is-ancestor <branchTip> <nextStage>` to test whether the branch has landed.
- New `drift promote <slug> [field]` verb: fold the value into the normal synced flow on the next `update` and remove the in-progress entry.
- New report section "In-progress work (N):" with each tracked property's pipeline position.
- `index.ts` gains a third input; provisional values surface only for `visibility: "public"` entries.

**Files:** `scripts/check-drift.js`, new `src/lib/data/in-progress.json` + `in-progress.schema.json`, `src/lib/data/index.ts`, `src/lib/data/types.ts`.

---

## Phase 7 — ✅ Gum interactive layer (`feat/drift-gum-cli`)

Substantially complete. `gum` capability gate mirrors the `_wot-interactive` idiom.

- ✅ TTY-gated capability check (`gumPath()` + `stdin`/`stdout` TTY guards)
- ✅ `gum format --theme pink` for styled report / snapshot / help output
- ✅ `gum confirm` before `update` writes (shows fingerprint count before committing)
- ✅ `gum choose` interactive menu on bare invocation; two-column described picker
- ✅ DRIFT wordmark above the picker (`gum style`)
- ⬜ `gum spin` spinner during the fingerprint pass (Phase 2 dependency; serial pass currently too fast to need it, but relevant once async)

**Files:** `scripts/check-drift.js`.

---

## Phase 8 — ⬜ Documentation (`docs/drift-workflow`)

**Goal:** close the documentation gap (README and CLAUDE.md currently have zero mention of drift).

- README "Commands" section: add the `drift*` verbs and a "Source drift" subsection explaining the synced/override stack, the `gum` prerequisite, and that drift is a deliberate CLI tool (no session hook).
- Fresh-machine bootstrap: install `gum`, copy `sources.local.json.example` → `sources.local.json`, fill paths, run `drift`.
- Note the optional source-repo git hook for a warm cache (Phase 2).
- A mermaid diagram of the metric precedence lifecycle.

**Files:** `README.md`, top-of-file comment in `check-drift.js`.

---

## Suggested sequencing (revised)

Phase 3's two safety-critical items (discriminated `git()` result, null-safe update) are shipped. The three remaining Phase 3 items (scoped update, `--dry-run`, `firstCommitProvisional`) are the current near-term work. Phase 2 (performance) becomes more relevant once Phase 6's multi-repo support makes the scan larger. Phase 5 unblocks Phase 6. Phase 8 last.

`4 (remaining) → 5 → 6 → 7 (gum spin) → 8`

---

## Unresolved questions

Both have sensible defaults to pick at implementation time.

1. **Cache file location:** default `src/lib/data/.drift-cache.json` (next to the data, gitignored) vs OS temp. Leaning to the data dir for discoverability.
2. **CLI binary name:** keep invoking via `bun run drift` / `bun run scripts/check-drift.js`, or add a thin `drift` shell shim? The plan assumes `bun run` verbs; a shim is a small add if wanted.
