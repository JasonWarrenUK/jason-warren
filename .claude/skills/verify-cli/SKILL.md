---
name: 'Verify: CLI'
description: "Drive the Drift CLI engine (scripts/check-drift.js) against an isolated sandbox: tech/tag/author/audit overlays, plus what report/sync need that a sandbox can't provide"
when_to_use: 'When a change touches scripts/check-drift.js and needs exercising as a real subprocess, not just its own test suite. Not for the portfolio site — see verify-portfolio.'
model: sonnet
effort: low
disable-model-invocation: true
---

# Verifying changes in the Drift CLI

For the portfolio site itself, use `verify-portfolio`. For both surfaces in
one pass, use `verify-all`.

Drift (`scripts/check-drift.js`, aliased as `./drift` at repo root) is a
plain Node/Bun script with no exports — the only way to exercise it is a
subprocess invocation, which is exactly what its own test suite does
(`scripts/check-drift.test.ts`'s `makeOverlaySandbox`/`runVerbInSandbox`
helpers). This skill's driver reuses that pattern.

## Run this first: the driver

```bash
.claude/skills/verify-cli/driver.sh <verb> [args...]
```

It creates a throwaway `dataDir` (own `projects/`, `tech-overlays.ts`,
`sources.json`, `overrides.json`, `excluded.json`, `in-progress.json`),
points `DRIFT_CONFIG` at it, runs the verb, prints the sandbox path to
stderr, and deletes the sandbox on exit. Nothing under the sandbox touches
the real `src/lib/data/` manifests.

Verified this session:

```bash
$ .claude/skills/verify-cli/driver.sh tech set svelte --first-used 2024-01-01 --note "driver test"
sandbox: /var/folders/.../drift-verify-aJ98Sx
Using 'Svelte' for 'svelte'.
Set: overlay for 'Svelte'.
Rebuild the site to apply.

$ .claude/skills/verify-cli/driver.sh audit --json
sandbox: /var/folders/.../drift-verify-ekUN8p
{ "summary": { "Full": 0, "Partial": 0, "Thin": 0, "volatile": 0 }, "entries": [] }
```

Pass `--keep` before the verb to skip cleanup and print the kept sandbox
path, so you can inspect the overlay files it wrote:

```bash
$ .claude/skills/verify-cli/driver.sh --keep author driver-test-2
sandbox: /var/folders/.../drift-verify-ur7YBm
created /var/folders/.../projects/driver-test-2.ts
Edit the file directly: /var/folders/.../projects/driver-test-2.ts
kept: /var/folders/.../drift-verify-ur7YBm
```

Remember to `rm -rf` a kept sandbox yourself when you're done with it.

## Portable verbs (sandbox-driven, work anywhere)

`tech list|set|hide|unhide`, `tag list|add|hide|unhide`, `relate project|tech`,
`flag`, `author`, `audit [--json]`, `promote`. All exercised through the
driver above.

## Machine-local verbs (need a real, populated `sources.local.json`)

`report`, `report --full`, `report --check`, `sync`, `enrich`. These read
`sources.local.json` (gitignored, per-machine paths into real git repos
under `~/Code`) — the driver's sandbox cannot fabricate this credibly, and
a fresh container won't have it at all. On a machine that does:

```bash
$ bun run scripts/check-drift.js report --no-color
# ...
New repos not yet in portfolio (22):
  ...
Repos without local paths (3):
  fac-cra: path not found or not a git repo: /Users/jasonwarren/Code/apps/fac-cra
  ...

$ bun run scripts/check-drift.js report --check --no-color; echo "EXIT: $?"
EXIT: 1
```

`--check` exits 1 whenever the report finds _anything_ to flag (drift, new
repos, missing paths) — a non-zero exit here is not necessarily a bug, read
the report body before treating it as a failure.

## Test suite

```bash
bun run test
```

runs the whole suite including `scripts/check-drift.test.ts`, which is
itself a subprocess-driven integration suite (spawns the real CLI against
temp fixtures) — a second, independent form of runtime verification for
this surface. Don't run `check-drift.test.ts` with a plain `vitest run`:
its heavy `spawnSync` calls (up to 30s each) can miss vitest's internal
worker heartbeat, so `package.json`'s `test` script isolates that file into
its own vitest invocation wrapped by `scripts/run-drift-tests.sh`, which
tolerates _only_ that exact RPC-timeout-with-a-clean-summary failure
signature and still fails on any real test failure. Folding it back into
the main `vitest run` reintroduces the flake in CI (seen there at ~79s wall
time vs ~40-60s locally — CI is slower and hits the heartbeat harder).

## Gotchas

- `drift.config.mjs`'s `dataDir` string must be interpolated as a plain
  double-quoted shell string (`"$SANDBOX"`). Zsh's `${VAR@Q}` quote-flag
  produces empty output when heredoc'd this way — the driver avoids it.
- `EDITOR=''` and `VISUAL=''` in the env stop `drift author` from trying to
  open a real editor; it just prints the scaffolded file's path instead.
- `tech list` reads from a canonical tech taxonomy baked into the script
  itself, not just the sandbox — the sandbox's `tech-overlays.ts` only
  supplies the overlay note/date shown alongside a taxonomy entry, so an
  unrecognised label won't appear no matter what the sandbox contains.
