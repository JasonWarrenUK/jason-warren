---
name: 'Verify: All'
description: 'Verify both surfaces of this repo, the portfolio site and the Drift CLI engine, by running verify-portfolio and verify-cli in turn'
when_to_use: "When a change (or the state of the repo generally) isn't clearly scoped to one surface, or before a PR that touches both. If a change only touches one surface, invoke verify-portfolio or verify-cli directly instead."
model: sonnet
effort: low
disable-model-invocation: true
---

# Verifying the whole repo

This repo is two things: a SvelteKit **portfolio site** and a standalone
**Drift CLI** engine (`scripts/check-drift.js`). They're independent
surfaces with independent drivers — this skill just runs both.

1. Run `verify-portfolio` — launches the dev server, drives it with
   Playwright, checks console noise, runs `bun run check` / `bun run lint`.
2. Run `verify-cli` — drives `scripts/check-drift.js` against an isolated
   sandbox via `.claude/skills/verify-cli/driver.sh`, runs `bun run test`.

If a change only touches one surface (e.g. a component under `src/lib/`, or
`scripts/check-drift.js` with no site changes), invoke that skill directly
instead — no need to pay for both passes.
