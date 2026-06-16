# Action Plan: Improving `scripts/check-drift.js`

## Context

`check-drift.js` reconciles the git reality of ~33 source repos against the last-synced fingerprints in `src/lib/data/sources.json`, and is the middle tier of the render-time metric stack (`override.value ?? synced ?? authored`, merged in `src/lib/data/index.ts:123-176`).

Exploration surfaced weaknesses across three axes:

- **Automation**: ~429 git subprocesses + a full `~/Code` filesystem walk + hundreds of synchronous `readFileSync` calls, run **serially on every Claude SessionStart** (startup, resume, clear, compact) with zero caching, dumping raw ANSI into model context.
- **CLI**: hand-rolled `process.argv` parsing, no `--help`, no `--json`, no `--only`, no `NO_COLOR`/TTY handling, fragile positional `--accept` parsing, always exits 0 (no CI gate), undocumented in README/CLAUDE.md.
- **Functionality**: `HEAD`-only measurement silently tracks whatever branch is parked; `--update` clobbers good values with `null` from transient git failures and is all-or-nothing; multi-repo slugs (`beacons`, `craft-and-graft`, `sakura`) count only one of their two repos; no dirty/removed/moved detection; no way to track in-progress work on unmerged branches.

### Decisions taken (these shape the whole plan)

1. **Drop the Claude Code SessionStart hook entirely.** Drift becomes a first-class **interactive CLI tool**, invoked deliberately (`drift`, `drift update`, `drift promote …`). The hook's only unique power was injecting repo-state into the model's context unprompted; everything else the CLI does better, and the hook can't write safely anyway. **Accepted tradeoff:** Claude loses proactive session-start awareness (the lyra-rose/top-girls report that fired at the start of this session will no longer appear automatically). Repo state reaches the model only when the user runs the CLI. Optional, non-Claude automation (a git `post-commit`/`post-merge` hook in source repos that refreshes the cache) can keep numbers warm without any session-start cost. This is the user's chosen direction.

2. **`gum` is a required dependency for interactive UX, TTY-gated.** Mirrors the user's own `_wot-interactive` idiom in `~/code/personal/utils/terminal-config/my-tools/commands.sh:93-95`: `command -v gum && [[ -t 0 && -t 1 ]]`. Interactive runs get gum pickers/confirms/styled output; non-TTY paths (pipes, CI, scripts) fall back to plain text. "Required" means a documented prerequisite + a capability check, not crash-on-absent. Reuse the user's brand palette (`_wot-choose`: cursor/selected `#3E7F96` teal, items `#B34480` pink).

3. **In-progress store is a separate committed `in-progress.json`** (third sibling to `sources.json`/`overrides.json`), with a per-entry `visibility: "public" | "local"` field for case-by-case site exposure. See Phase 6.

Verified environment: Node v25.2.1 (`node:util` `parseArgs` available); `git rev-parse --abbrev-ref origin/HEAD` resolves the default branch cleanly (`origin/main` on the portfolio repo); `gum` 0.17.0, `glow`, `vhs` all installed; the user's `wot` functions are the reference gum idiom (`_wot-interactive`, `_wot-choose`, `_wot-choose-described`, gradient-header + static-fallback pattern).

---

## Guiding constraints

- The core script stays dependency-free in `node:*` terms (no npm deps). `gum`/`glow` are external binaries invoked via child process, capability-gated. The non-TTY path must work without them.
- British spelling, tabs for indentation, no em-dashes (CLAUDE.md).
- Preserve write-isolation: `update` never touches `overrides.json` or `in-progress.json`; `accept` only touches `overrides.json`; `promote` only touches `in-progress.json` (and triggers a normal synced update).
- Keep the top-of-file contract comment and the JSON `_note` blocks in sync with behaviour.
- A subcommand-style CLI (`drift <verb>`) reads better than flag soup now that the hook is gone and a human is the primary caller. Migrate `--update`/`--accept` to `update`/`accept` verbs, keeping the old flags as deprecated aliases for one cycle.

---

## Phase 1 — `refactor/drift-cli-foundation`

**Goal:** turn the script into a proper interactive CLI. This is now the centre of gravity, not polish.

- Migrate `process.argv` hand-parsing (`check-drift.js:33-36`) to `node:util` `parseArgs`, and introduce a **subcommand dispatcher**: `drift [report]` (default), `drift update`, `drift accept`, `drift accept-all`, `drift promote` (Phase 6). Keep `--update`/`--accept` working as deprecated aliases.
- Add `--help`/`-h` per verb with a usage banner covering every mode (current JSDoc at `check-drift.js:12-15` documents only `--update`).
- Fix the fragile positional `--accept <slug> <field>` reading (`check-drift.js:539` blindly reads `argv[index+1/+2]`); with `parseArgs` the positionals are validated and a following flag can no longer be misread as the slug.
- Extract ANSI constants (`check-drift.js:435-441`) behind a `colour()` helper that no-ops when `process.env.NO_COLOR` is set or `!process.stdout.isTTY`. Strip escapes when piped, so `drift --json | jq` and redirects stay clean.
- Add `--json` output mode emitting `{ changed, conflicts, filteredNew, missing, inProgress }` as machine-readable JSON. Substrate for scripting and the gum/glow rendering in Phase 7.
- Exit-code semantics: `--check` exits non-zero when drift/new/conflicts are detected (CI gate). Default report stays exit 0.

**Files:** `scripts/check-drift.js`, `package.json` (rename script aliases to verbs: `drift`, `drift:update`, `drift:accept`, `drift:accept-all`, `drift:promote`).

**Commits:** `refactor(drift): parse args with node:util parseArgs`; `feat(drift): subcommand dispatcher (report/update/accept)`; `feat(drift): per-verb --help`; `feat(drift): respect NO_COLOR and non-TTY`; `feat(drift): --json output mode`; `feat(drift): --check exit-code gating`.

---

## Phase 2 — `perf/drift-fingerprint`

**Goal:** make the fingerprint pass fast and robust, now for CLI responsiveness rather than a session-start budget. Add an optional cache so repeated runs and source-repo git hooks are cheap.

- **Async + parallel.** Convert `git()` from `execSync` to async `execFile`, replace the serial `for` loop (`check-drift.js:315`) with bounded-concurrency fan-out over repos. Drops wall-clock from ~serial-429-subprocess to concurrency-limited.
- **De-duplicate the double `ls-files`.** `detectLanguages` (`check-drift.js:142`) and `countLinesOfCode` (`check-drift.js:156`) each run `ls-files`; fetch once, share.
- **HEAD-SHA cache.** A gitignored `src/lib/data/.drift-cache.json` storing per-repo `head` + last-run timestamp. Skip a repo's full fingerprint when `HEAD` is unchanged (one cheap `rev-parse` vs 13 subprocesses). `--no-cache`/`--force` bypass; `update` always bypasses.
- **Optional source-repo git hook (the replacement automation).** Provide a documented, opt-in `post-commit`/`post-merge` snippet for source repos that runs `drift update --only <thisRepo>` (or just refreshes the cache). This keeps numbers warm without any Claude/session involvement. Ship it as a documented example, not auto-installed.

**Files:** `scripts/check-drift.js`, `.gitignore` (add `.drift-cache.json`), a `docs/` example git hook, `src/lib/data/sources.local.json.example` (note the cache).

**Commits:** `perf(drift): async execFile git helper`; `perf(drift): parallelise per-repo fingerprinting`; `perf(drift): share single ls-files`; `feat(drift): HEAD-SHA cache with --no-cache`; `docs(drift): example source-repo git hook for warm cache`.

---

## Phase 3 — `fix/drift-update-safety`

**Goal:** make writes safe and targeted.

- **Discriminated `git()` result.** Capture stderr (currently discarded, `check-drift.js:83`) and return `{ ok: true, out } | { ok: false, err }`, so a true `0` is distinguishable from a git failure (lock file, dubious-ownership `safe.directory`, mid-rebase). Drives the null-safe merge and a `--verbose` diagnostic.
- **Null-safe `update`.** Replace whole-object replacement (`check-drift.js:595`) with a field-merge that only overwrites when the fresh value is non-null, preserving prior good data; warn which fields were preserved.
- **Per-repo `update <slug...>`.** Refresh one repo without rewriting all 33. Composes with `--only` (Phase 4).
- **`--dry-run`.** Field-level diff of what `update` would change, before writing.
- **Clear `firstCommitProvisional`.** `update` currently never flips it (`sources.json:5`) despite `_firstCommitNote` saying it should; set it false once real root-commit dates are written.

**Files:** `scripts/check-drift.js`.

**Commits:** `refactor(drift): discriminated ok/err git result`; `fix(drift): preserve good values on null fresh reads`; `feat(drift): per-repo update <slug>`; `feat(drift): --dry-run diff for update`; `fix(drift): clear firstCommitProvisional after real sync`.

---

## Phase 4 — `feat/drift-detection-and-targeting`

**Goal:** richer detection plus the `--only` filter.

- **`--only <slug...>`** scoping for the report, `update`, and `accept`.
- **Dirty working-tree detection** via `git status --porcelain`; advisory report section. Catches work drift currently misses entirely because `head` is unchanged.
- **Removed-vs-never-configured split.** The report conflates "deleted local repo" with "no local path configured" (both land in `missing`, `check-drift.js:318/323`). Split into two sections.
- **Rename/move hint.** Correlate `missing` (path gone) with `filteredNew` (new repo) to emit "looks like `X` moved to `Y`?".
- **Multi-repo slugs.** Let a slug aggregate fingerprints across its `secondaryRepoUrl` companion (`beacons`→`beacons-backend`+`beacons-frontend-v2`, etc., currently the frontend is entirely uncounted). Extend `sources.local.json` to allow an array of paths per slug; `getFingerprint` sums across them.

**Files:** `scripts/check-drift.js`, `src/lib/data/sources.local.json.example` (array-of-paths note).

**Commits:** `feat(drift): --only slug filter`; `feat(drift): flag dirty working trees`; `feat(drift): split removed from unconfigured`; `feat(drift): hint renamed/moved repos`; `feat(drift): aggregate multi-repo slugs`.

---

## Phase 5 — `feat/drift-branch-awareness`

**Goal:** stop measuring whatever branch is parked; resolve the default branch. Prerequisite for Phase 6.

- **Resolve default branch instead of `HEAD`.** Every fingerprint command hardcodes `HEAD` (`check-drift.js:187,205,231,232`, plus `getFirstCommit`). Add `defaultBranch(repoPath)`: try `git rev-parse --abbrev-ref origin/HEAD` (verified to return `origin/main`), fall back to local `main`/`master`, fall back to `HEAD`. Measure against the resolved ref. Fixes silent stat corruption on feature branches.
- **Record `measuredRef`** in the fingerprint so the manifest is self-describing; the report warns when it fell back to HEAD (detached/unknown-default).
- **Guard `delta` maths.** `current.commits - saved.commits` (`check-drift.js:352`) can go negative on history rewrites/branch switches; clamp/annotate instead of a misleading `+`.

**Files:** `scripts/check-drift.js`, `src/lib/data/sources.schema.json` (`measuredRef`), `src/lib/data/index.ts` (`SyncedSource` interface).

**Commits:** `feat(drift): resolve default branch via origin/HEAD`; `feat(drift): record measuredRef`; `fix(drift): annotate non-monotonic deltas`.

---

## Phase 6 — `feat/drift-staging-pipeline` (headline new capability)

**Goal:** track in-progress work on unmerged branches as **provisional, opt-in** metrics, stored distinctly, with detection of when a property graduates into `main` (or `staging → main`).

### Model — separate committed `in-progress.json`, per-entry visibility

A third sibling to `sources.json` (script-owned) and `overrides.json` (hand-owned). NOT props on `sources.json`, because: (1) `update` rewrites `sources.json` wholesale and this hand-authored data must survive it (the same write-isolation reason `overrides.json` exists); (2) the shape differs (branch/pipeline/per-property tracking vs a flat fingerprint); (3) the lifecycle differs (transient until graduation vs permanent). The case-by-case "show on site?" choice is a per-entry field, so it does not force the data into `sources.json`.

```jsonc
{
  "lyra-rose": {
    "branch": "feat/new-thing",
    "pipeline": ["feat/new-thing", "main"],   // 2 (branch->main) or 3 (branch->staging->main) stages
    "visibility": "public",                    // "public" = render surfaces it (opt-in); "local" = report-only, never ships
    "tracked": {                               // opt-in per property — only these may surface from the branch
      "commitsMine": { "value": 27, "baseOnMain": 21 },
      "linesAddedRecent": { "value": 0 }
    },
    "_note": "why this branch's work is surfaced early"
  }
}
```

### Graduation detection (core algorithm)

For each in-progress slug, per pipeline stage:

1. Resolve each stage ref (`feat/x`, optional `staging`, `main`).
2. Per `tracked` property, measure on the branch and the next stage down; use `git merge-base --is-ancestor <branchTip> <nextStage>` to test whether the branch has landed, and `git log <stage>..<branch>` for the not-yet-merged delta.
3. **Graduation event:** when the branch's tracked work becomes reachable from the next stage, the property has moved into it. Report: "`lyra-rose.commitsMine`: feat/new-thing merged into main; `drift promote lyra-rose commitsMine`".
4. **Both topologies:** 2-stage tests branch→main directly; 3-stage tracks two hops and reports partial graduation ("merged to staging, not yet main") distinctly from full graduation.

### Lifecycle + CLI

- New report section **"In-progress work (N):"** with each tracked property's pipeline position (on-branch / merged-to-staging / merged-to-main).
- New verb **`drift promote <slug> [field]`** (mirrors `accept`): on graduation, fold the value into the normal synced flow on the next `update` and remove the in-progress entry. Until promoted, provisional values stay in the distinct store. `update` reads `in-progress.json` read-only and never writes it.

### Render integration

- `index.ts` gains a third input. Precedence: shipped synced/override stay authoritative for headline stats; in-progress surfaces only for `visibility: "public"` entries, where the UI opts in (e.g. a "currently building" badge), never silently replacing a shipped figure. `local` entries are ignored at render. Add `in-progress.schema.json` mirroring existing schema discipline; extend `types.ts` for the provisional fields that render.

**Files:** `scripts/check-drift.js`, new `src/lib/data/in-progress.json` (committed) + `in-progress.schema.json`, `src/lib/data/index.ts`, `src/lib/data/types.ts`.

**Commits:** `feat(data): in-progress store and schema`; `feat(drift): measure tracked properties on unmerged branches`; `feat(drift): detect branch->main and branch->staging->main graduation`; `feat(drift): report in-progress pipeline position`; `feat(drift): promote verb to graduate a property`; `feat(data): surface public in-progress metrics at render`.

---

## Phase 7 — `feat/drift-gum-cli`

**Goal:** the interactive layer, built on the user's existing `wot` gum idiom. `gum` is a required prerequisite; every gum call is TTY-gated with a plain fallback so non-interactive paths (pipes, CI, the optional git hook) still work.

- **Capability gate** `_driftInteractive()` mirroring `_wot-interactive` (`commands.sh:93-95`): `command -v gum && isTTY(stdin) && isTTY(stdout)`. False → plain-text path.
- **Reuse the `wot` styling helpers' shape:** a `driftChoose` wrapper matching `_wot-choose` (`commands.sh:757-763`) with the brand palette (cursor/selected `#3E7F96`, items `#B34480`), and a described-picker matching `_wot-choose-described` (`commands.sh:767-785`) for `key  description` items returning the key.
- **`gum choose`** for `accept`/`promote` when run interactively with pending conflicts/graduations and no slug given, instead of erroring on missing positionals.
- **`gum confirm`** before any `update` write (especially the all-repos form), showing the `--dry-run` diff first.
- **`gum spin`** around the parallel fingerprint pass for interactive runs; **`gum style`/`gum format`**, or pipe `--json` through `glow`, for a styled human report.
- **Document gum as a prerequisite** (it is already in the user's `_WOT_BREW_CATS` "tui" set), and have the script print a clear one-line install hint (`brew install gum`) when interactive is requested but gum is absent, then fall back to plain text rather than crashing.

**Files:** `scripts/check-drift.js`.

**Commits:** `feat(drift): TTY-gated gum capability check`; `feat(drift): gum pickers for accept/promote`; `feat(drift): gum confirm before update writes`; `feat(drift): styled report via gum/glow`.

---

## Phase 8 — `docs/drift-workflow`

**Goal:** close the documentation gap (README/CLAUDE.md currently have zero mention of drift, `sources.local.json` bootstrap, the now-removed hook, or any npm script beyond the basics).

- README "Commands" section: add the `drift*` verbs and a "Source drift" subsection explaining the synced/override/in-progress stack, the `gum` prerequisite, and that drift is now a deliberate CLI tool (no session hook).
- Fresh-machine bootstrap: install `gum`, copy `sources.local.json.example` → `sources.local.json`, fill paths, run `drift`.
- Note the optional source-repo git hook for a warm cache.
- A `mermaid` diagram of the metric precedence + graduation lifecycle (CLAUDE.md doc conventions).

**Files:** `README.md`, possibly `docs/drift.md`, top-of-file comment in `check-drift.js`.

**Commits:** `docs(drift): document CLI workflow, gum prereq, bootstrap`; `docs(drift): precedence + graduation diagram`.

---

## Cleanup: remove the hook

As part of Phase 1 (or a tiny standalone `chore/remove-drift-hook` commit), delete the `SessionStart` block from `.claude/settings.local.json:15-27`. Keep the `Bash(node scripts/check-drift.js*)` permission allow-entry so manual invocation stays frictionless.

---

## Testing / verification

The script is currently untested. Add Vitest coverage as phases land (`tests/fixtures/<module>.ts` pattern per CLAUDE.md):

- **Unit:** `defaultBranch` resolution; null-safe field-merge; graduation detection (both topologies); discriminated `git()` result; multi-repo aggregation. Mock git via fixture command outputs.
- **Integration:** build a throwaway temp git repo (init, commit on `main`, branch, commit, merge) and assert graduation flips at the right moment. Critical-path test for Phase 6.
- **Manual smoke per phase:**
  - P1: `drift`, `drift --help`, `drift update --help`, `drift --json | jq`, `NO_COLOR=1 drift | cat` (no escapes), `drift --check; echo $?`.
  - P2: time warm-cache vs cold; confirm `--no-cache` forces a full pass.
  - P3: drop an `index.lock` in a repo, run `drift update --dry-run` then `update`, confirm no null clobber.
  - P4: confirm a multi-repo slug sums both repos; dirty a tree and confirm the flag.
  - P5: park a repo on a feature branch, confirm the report measures `main` not the branch.
  - P6: on `lyra-rose` (live feature work), add an in-progress entry, confirm provisional value surfaces distinctly for `public`, hidden for `local`; merge the branch, confirm graduation announced and `drift promote` folds it in.
  - P7: run interactively (gum pickers/confirm appear); run `| cat` (plain, no prompts); temporarily shadow `gum` off PATH and confirm graceful fallback + install hint.
- **Regression:** `npm run check` and `npm run test` green after each phase (Phases 5-6 touch `index.ts`/`types.ts`).

---

## Suggested sequencing

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8`. Phases 1-4 are independently shippable and low-risk. Phase 5 is a prerequisite for Phase 6 (the headline feature). Phase 7 depends on the CLI seams from Phase 1 and the verbs from Phases 1/3/6. Phase 8 last. Each phase is its own branch with atomic commits per CLAUDE.md conventions.

## Unresolved questions

Both have sensible defaults to pick at implementation time.

1. **Cache file location:** default `src/lib/data/.drift-cache.json` (next to the data, gitignored) vs OS temp. Leaning to the data dir for discoverability.
2. **CLI binary name:** keep invoking via `npm run drift` / `node scripts/check-drift.js`, or add a thin `drift` shell shim (matching the `wot` ergonomics) sourced from terminal-config? The plan assumes `npm run` verbs; a shim is a small add if wanted.
