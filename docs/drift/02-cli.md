# Drift Engine

> Running the engine: prerequisites, bootstrap, configuration and the verb
> surface. Config keys are summarised here and specified in full in
> [`docs/drift-engine-reference.md`](../drift-engine-reference.md); what
> each verb may write is contractually specified in
> [`docs/drift-boundary.md`](../drift-boundary.md#write-isolation-contract).

## Contents

- [Prerequisites](#prerequisites)
- [Bootstrap](#bootstrap)
- [Configuration](#configuration)
- [The report loop](#the-report-loop)
- [Verb reference](#verb-reference)
- [Flags](#flags)

---

## Prerequisites

| Dependency       | Needed for                                                               | Without it                                               |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Node or Bun      | Everything                                                               | n/a                                                      |
| Bun specifically | `drift audit` and `drift authored` (native ESM import of `.ts` overlays) | Both fail; all else runs                                 |
| `gum`            | Interactive menu, pickers, formatted output                              | Plain-text fallback for every verb                       |
| `gh` (authed)    | `drift enrich` only                                                      | `enrich` fails; sync stays fully offline                 |
| PCRE git         | `commitsHuman` / `authorsDistinctHuman` measurement                      | Those fields null; role inference degrades, never errors |
| `prettier`       | Formatting every JSON write (via `npx`)                                  | Writes land unformatted                                  |

## Bootstrap

1. Run `drift init`. Scaffolds `drift.config.ts` (per-machine, gitignored)
   and `sources.local.json`, prompting when `gum` and a TTY are available,
   writing defaults silently otherwise. Never overwrites an existing file.
2. Fill `sources.local.json` with the absolute path to each source repo on
   this machine. Declare companion-repo groupings in
   `source-topology.json` if any project spans multiple repos.
3. Run `drift sync`. Fingerprints every repo and writes `sources.json`.
4. Run `drift` for the report, or `drift snapshot` for every current
   metric.
5. Optionally run `drift enrich` for GitHub-side facts. Note the ordering
   trap: `enrich` only sees slugs already registered by `sync`, so a new
   project always needs `sync` first.

## Configuration

Resolution order: `DRIFT_CONFIG` env variable, then `<repoRoot>/drift.config.ts`,
then built-in defaults. Load failures warn once and fall back; config
loading never throws. Merge is shallow (one nested level for `author`,
`theme`, `files`); arrays replace wholesale.

The keys, tersely (full table:
[engine reference](../drift-engine-reference.md#config-reference)):

- `dataDir`: where the data files live. Default `src/lib/data`.
- `files`: per-file path overrides by logical name.
- `scanRoot` / `scanDepth`: where and how deep to look for untracked repos.
- `author.pattern`: regex over your git identities; defines every `*Me`
  metric.
- `author.recentWindow`: the trailing window for `*Recent` metrics
  (default four weeks).
- `author.botPattern`: non-human authors excluded from the human commit
  denominator. Extend with AI-agent identities if agents commit as
  themselves in your repos.
- `excludedRepoNames`: folder names the scan never surfaces.
- `theme.*`: gum colours; cosmetic.

Copy `drift.config.example.ts` for a commented template.

## The report loop

The default verb compares last-synced fingerprints against the current
state of every repo, plus a scan for new repos not yet tracked. The daily
rhythm:

```
drift              # what moved since last sync?
drift sync         # accept reality: rewrite the fingerprints
drift keep x y     # or: keep a manual pin, refresh its baseline
```

When a manual override's baseline no longer matches the synced value, the
report flags it and names the exact `drift keep` command to dismiss it.
That flag-and-dismiss cycle is the core of what Drift is for.

## Verb reference

Purpose per verb. Writes are one file per verb; the authoritative
verb-to-file table is the
[write-isolation contract](../drift-boundary.md#write-isolation-contract).

**Measurement:**

| Verb                                | Does                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `drift` / `report`                  | Compare synced fingerprints to current git state; flag stale overrides |
| `drift snapshot`                    | Show every current metric, changed and unchanged                       |
| `drift sync`                        | Rewrite `sources.json` fingerprints (schema-validated, fail-closed)    |
| `drift enrich`                      | Opt-in, `gh`-backed: GitHub's archived flag and homepage URL           |
| `drift keep <slug> <field>`         | Keep an override value, refresh its drift baseline                     |
| `drift keep --all-projects <field>` | Ditto for one field across all flagged projects                        |
| `drift keep-all`                    | Ditto for every flagged field everywhere                               |
| `drift hide <slug>`                 | Remove a slug from the public site (`excluded.json`)                   |
| `drift promote <slug>`              | Tidy away a landed in-progress entry                                   |
| `drift init`                        | Scaffold config and local paths                                        |

**Overlay (write the Engine's own overlay files under `config.paths`):**

| Verb                              | Does                                                                       |
| --------------------------------- | -------------------------------------------------------------------------- |
| `drift author <slug>`             | Scaffold `projects/<slug>.ts` from a commented template, open in `$EDITOR` |
| `drift authored`                  | Show every authored field per overlay, absences marked                     |
| `drift flag <slug> --pin\|--hide` | Flip `pin`/`hide` on an overlay                                            |
| `drift tag`                       | Add or suppress a tech tag on one project                                  |
| `drift relate`                    | Author a project-to-project or tech-to-tech edge                           |
| `drift tech`                      | Per-tech overlays: first-used date, note, kind, surface visibility         |
| `drift theme`                     | Manage theme territories                                                   |
| `drift audit`                     | Score overlays against the content-depth rubric (read-only; needs Bun)     |

Overlay-writing verbs splice named properties via the TypeScript compiler
API; none rewrites editorial prose. Your hand-written content is safe. The
per-field detail lives in
[`docs/drift-authoring.md`](../drift-authoring.md#what-will-overwrite-me).

## Flags

- `--check`: exit non-zero on any drift. This is the CI gate.
- `--json`: machine-readable report.
- `--full`: field-level diff across all repos, skipping the HEAD-sha cache
  gate.
- No flags, interactive terminal, `gum` installed: a menu.
- `drift help <verb>`: verb-specific help.
