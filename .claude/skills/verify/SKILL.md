---
name: verify
description: Launch and drive this SvelteKit app to verify a change end-to-end
disable-model-invocation: true
---

# Verifying changes in this app

## Launch

```bash
bun run dev
```

Vite defaults to port 5173 but falls back (5174, 5175...) if occupied — read
the `Local:` line from stdout/log rather than assuming the port. Bun scripts
(`bun run dev`) run fine in the background via the shell tool's
`run_in_background`; redirect to a logfile and grep the chosen port out of it.

## Drive it

Claude-in-Chrome may not be connected (extension/session issue). Fall back to
the Playwright MCP plugin tools (`mcp__plugin_playwright_playwright__*`) —
load them via `ToolSearch` with `select:mcp__plugin_playwright_playwright__browser_navigate,...`.
They drive a separate, real Chromium instance (not the user's logged-in
Chrome), which is actually preferable for this app since nothing here needs
authentication.

- `browser_navigate` to `http://localhost:<port>/<route>`
- `browser_take_screenshot` (full page or viewport) is the fastest way to
  *see* a layout/visual change — read the saved PNG with the Read tool.
- `browser_snapshot` gives the accessibility tree, which is the fast way to
  confirm ARIA roles/labels moved where a fix intended (e.g. confirming an
  interactive `role="button"` sits on a specific SVG child, not its parent).
- `browser_click` takes a CSS selector as `target` (its `ref` param wants a
  snapshot ref ID, not a raw selector — passing a selector there errors).
  Prefer a real `browser_click` with a precise CSS selector over
  `browser_evaluate`-dispatched synthetic events: Playwright's click does real
  hit-testing (actionability checks), so it will itself refuse to click
  something covered by `pointer-events: none` or another element — that
  refusal is often the verification. A raw `dispatchEvent` synthetic click
  bypasses hit-testing and can give a false negative/positive.
- For keyboard-path checks (e.g. "does Tab reach this element and does
  Enter/Space activate it"), `browser_evaluate` to call `.focus()` on the
  target element then `browser_press_key` for `Enter`/`Space`/`Escape` is
  reliable and matches real keyboard-only usage.
- `browser_console_messages` (level `warning` or `error`) after driving a
  flow — this app has zero tolerance for console noise; anything here is a
  finding.

## Useful checks beyond the running app

- `bun run check` (svelte-check + tsc) catches a11y issues Svelte's compiler
  knows about (e.g. `<g>` with pointer handlers needing an ARIA role) that
  won't show up as a runtime error — cheap to run after any markup change,
  but it is not a substitute for actually looking at the rendered page.
- `bun test <path>` for the drift CLI (`scripts/check-drift.js`) — it's a
  subprocess-driven test suite (spawns the real CLI against temp fixture
  dirs), which is itself a form of runtime verification for that surface;
  see `scripts/check-drift.test.ts`'s `makeOverlaySandbox`/`runVerbInSandbox`
  helpers for the pattern if verifying a new `drift` verb by hand in a
  scratch directory (`DRIFT_CONFIG=<path-to-drift.config.mjs> bun run
  scripts/check-drift.js <verb> ...`).

## Cleanup

Kill the dev server (`pkill -f "vite dev"` or the backgrounded PID) and
delete any screenshot/`.playwright-mcp/` artefacts written into the repo
root when done — they're scratch output, not part of the project.
