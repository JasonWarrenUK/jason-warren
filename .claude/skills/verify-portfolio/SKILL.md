---
name: 'Verify: Portfolio'
description: 'Launch and drive the SvelteKit portfolio site end-to-end: dev server, routes, screenshots, console noise'
when_to_use: 'When a change touches the portfolio site (src/, routes, components) and needs verifying in a real running browser, not just type-checked or unit-tested. Not for the Drift CLI engine — see verify-cli.'
model: sonnet
effort: low
disable-model-invocation: true
---

# Verifying changes in the portfolio site

For the Drift CLI engine (`scripts/check-drift.js`), use `verify-cli` instead.
For both surfaces in one pass, use `verify-all`.

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
  _see_ a layout/visual change — read the saved PNG with the Read tool.
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
- `bun run lint` (`prettier --check .`) checks the whole repo, not just your
  diff — run it before opening a PR even if your files pass a scoped check.
- Verifying the Drift CLI itself (not this app) is a separate surface — see
  `verify-cli`.

## Cleanup

Kill the dev server (`pkill -f "vite dev"` or the backgrounded PID).

The Playwright MCP screenshot tool writes into the repo despite naming
`.playwright-mcp/` as an allowed root in its error message: a bare filename
(e.g. `page.png`) lands at **repo root**, not inside `.playwright-mcp/`.
Writing to an absolute path outside the repo (e.g. the scratchpad) is
rejected outright. Check both the repo root and `.playwright-mcp/` for
stray screenshots and delete them when done — they're scratch output, not
part of the project.
