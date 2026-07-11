# Handoff: Atlas Visual Direction (3DE.1)

Implementation package for the signed-off **Atlas** visual direction on Jason Warren's portfolio (`jason-warren.vercel.app`, SvelteKit 2 / Svelte 5 / TypeScript).

## Overview

The site's structure, data model, and components are done; this handoff restyles them to the Atlas direction: a cartographic, archival identity — warm paper neutrals derived from Reasonable Colors, a serif display face, mono "apparatus" layer, and graph views drawn as surveys (graticule, survey-mark nodes, plotted routes, territory hulls).

The authoritative spec is **`visual-direction.md`** in this folder (also destined for `docs/design/visual-direction.md` in the repo). This README translates it into sequenced, reviewable changes against the existing codebase.

## About the Design Files

The files in `designs/` are **design references created in HTML** — prototypes showing intended look and behaviour, NOT production code. The task is to **recreate these designs inside the existing SvelteKit codebase** using its established patterns: semantic tokens in `src/lib/styles/tokens.css`, global type in `src/lib/styles/typography.css`, graph presentation helpers in `src/lib/components/graph/graph-style.ts`, and the existing Svelte components. Do not port React/DC idioms; the prototypes' inline styles are the source of exact values only.

Open the `.dc.html` files directly in a browser (keep `support.js` beside them):

- `Visual Direction - Atlas.dc.html` — the full decision document with live specimens (type, motion, graph, colour) and implementation notes. Has a light/dark toggle.
- `Atlas Home.dc.html` — homepage re-skin (header, intro, HeroBreadth, HeroRotation cards, EngineThreads, themes teaser, footer).
- `Atlas Project.dc.html` — project detail page re-skin (Iris), incl. the sidebar neighbourhood graph in survey style.
- `Atlas Map.dc.html` — `/map` re-skin: interactive survey-sheet graph with mode tabs, territories, focus/dim states, collision-aware focus annotation.

## Fidelity

**High-fidelity.** Colours, type, spacing, and interaction values are final and should be matched exactly — with one deliberate exception: the prototypes hard-code resolved hex values (e.g. surface `#faf7f2`); the implementation must instead **derive** those values via the `color-mix` rule below. Small rendering differences from the derivation are expected and fine.

## Sequenced implementation (suggested commits)

### 1. Fonts

- `npm rm @fontsource/sora @fontsource/space-grotesk` (if present); `npm i @fontsource-variable/source-serif-4`.
- Import in root layout: `@fontsource-variable/source-serif-4`, keep `@fontsource/ibm-plex-sans` (400/500/600) and `@fontsource/jetbrains-mono` (400/500/600).
- `tokens.css`:
  ```css
  --font-display: 'Source Serif 4 Variable', serif;
  --font-sans: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  ```
- `typography.css`: body uses `--font-sans`; all `h1–h4` use `--font-display` weight 600 (h1 letter-spacing −0.015em); code/pre use `--font-mono`.
- Site-wide conventions from the prototypes:
  - Eyebrows/legends/metadata/status text: mono, 10–11px, weight 500–600, uppercase, letter-spacing 0.08–0.14em.
  - Territory names and the "extracted into" divider label: display face *italic*.
  - Body: 15–16px, line-height 1.65–1.7, max measure 64ch.

### 2. Colour — derived warm neutrals

In `tokens.css` `:root` (light theme):

```css
--warmth: 12%; /* the one knob */
--color-surface:        color-mix(in oklab, var(--color-gray-1) calc(100% - var(--warmth)), var(--color-cinnamon-1));
--color-surface-sunken: color-mix(in oklab, var(--color-gray-2) calc(100% - var(--warmth)), var(--color-cinnamon-2));
--color-border:         color-mix(in oklab, var(--color-gray-3) calc(100% - var(--warmth)), var(--color-cinnamon-3));
--color-text:           color-mix(in oklab, var(--color-gray-6) calc(100% - var(--warmth)), var(--color-cinnamon-6));
/* apply the same pattern to any other neutral aliases (raised, muted, subtle, border-strong) using their current gray shade number */

--color-primary: var(--color-blue-4);     /* ink (was azure) */
--color-accent:  var(--color-cinnamon-4); /* oxide — survey-mark red */
```

- **Edge-token change:** cinnamon is currently assigned to the interactive-fiction theme edge in `graph-style.ts` / tokens; reassign that edge to the unclaimed `--color-red-4` so no edge shares a hue with the accent.
- **Dark theme:** apply the same mix rule to the existing hand-set dark surfaces, e.g. `color-mix(in oklab, #1a1b1e 88%, var(--color-cinnamon-6))`; primary/accent flip to their lighter RC shades (blue-2-equivalent ≈ `#7aa7d4`, cinnamon light ≈ `#d97a4e` in the prototypes).
- **Contrast test:** add a Vitest data test that resolves each body text/surface pair and asserts WCAG ≥ 4.5:1 (7:1 target for body on surface), alongside the existing structural tests. Use a `color-mix`-capable resolver (e.g. compute the mix in oklab manually or via `culori`).
- Reference hexes the light derivation should land near (from the prototypes): surface `#faf7f2`, sunken `#f1ece2`, raised `#fffdf9`, border `#e6dfd2`, border-strong `#d2c8b6`, text `#211c14`, subtle `#5a5245`, muted `#988d7b`, primary `#2e5d8c`, primary-soft `#e9eff5`, accent `#b0512a`.

### 3. Motion tokens

Replace the ad-hoc `--transition-*` tokens:

```css
--ease-standard: cubic-bezier(.45, .05, .25, 1);
--ease-exit: cubic-bezier(.4, 0, 1, 1);
--motion-scale: 1;
--dur-micro: calc(160ms * var(--motion-scale));
--dur-base: calc(240ms * var(--motion-scale));
--dur-deliberate: calc(400ms * var(--motion-scale));
--dur-plate: calc(600ms * var(--motion-scale));

@media (prefers-reduced-motion: reduce) { :root { --motion-scale: 0; } }
```

Rules: motion only for state changes needing continuity (graph relayout, theme flip, hover/dim, modal). No scroll reveals, loops, parallax. One licence: a route may draw in along its path once on first reveal. Reduced motion = durations collapse to 0; the force sim already ticks synchronously to steady state.

### 4. Graph restyle (`ProjectMap.svelte`, `NeighbourhoodGraph.svelte`, `graph-style.ts`)

- **Canvas:** dotted graticule behind all edges — lines every ~80px (h) / ~100px (v) of the viewBox, `stroke: var(--color-border)`-weight (`--d-grid` ≈ one step lighter than border), `stroke-width: 1`, `stroke-dasharray: 1 6`, on `--color-surface-sunken`.
- **Nodes → survey marks:** open ring (`fill: none`, `stroke-width: 1.75`, stroke = status colour) + centre dot (r ≈ 2.8, filled). Keep radius formula `r = 8 + 17.5·√(w/max)`. Recency → ring opacity `0.55 + 0.45·recency`. Hubs (and the focused node) get a second outer ring at `r + 7`, `stroke-width 1.25`, opacity 0.6.
- **Edges → routes:** always curved — quadratic with control point offset perpendicular from the midpoint by `0.14 × length`. Extraction: solid 2px in `--color-accent`, with a two-stroke arrowhead (wing length 9, ±0.42 rad) at the target ring edge. Related/theme: 1.5px dashed `5 4` in category colour. `stroke-linecap: round`.
- **Territories:** hull per theme cluster (d3-polygon `polygonHull` over member node positions, padded + rounded): fill category tone at 7% opacity, boundary 1px dashed `3 5` at 50% opacity, *italic display-face* territory name (~17–19px) near the hull's upper edge.
- **Labels:** mono micro-caps — hubs 12px weight 600 letter-spacing 1.3–1.5, others 10.5px weight 400; standing set (hubs + top-N) at rest, rest on hover/focus. Label sits below the mark at `y + r + 18`.
- **Focus state:** focused mark swaps stroke to `--color-accent`; leader line (1px `--color-border-strong`, small terminal dot) to a two-line mono annotation (`NAME · hub` 12px/600; meta 10.5px in muted). **Placement must be collision-aware:** try candidate offsets (±130,−95 / ±150,+60 / 0,−130 / 0,+120), take the first ≥85px from every other node, clamp to the sheet; draw an opaque backing rect (`--color-surface-sunken` at 0.92, radius 4) behind the text.
- **Dim-others:** keep existing tokens — node 0.28, edge 0.08, label 0.32; transition `opacity var(--dur-deliberate) var(--ease-standard)`.

### 5. Page-level restyle

Reference `Atlas Home.dc.html` / `Atlas Project.dc.html` for exact values. Highlights:

- Header: raised surface at ~88% + `backdrop-filter: blur(10px)`; active nav item marked by `inset 0 -2px 0 var(--color-accent)`; JW mark = 32px square, radius 4, primary bg, display face.
- Cards: raised bg, 1px border, radius 8–10; hover = border-strong + `0 4px 14px -4px rgba(60,45,20,0.14)`. Library cards in EngineThread get a 3px accent left border.
- Status/role badges: mono 10px/600 uppercase pills; status tones per prototype (`live #1e6b47/#e0eee3`, `wip #7a5416/#f3ead2`, `finished #2e5d8c/#e5ecf4`, `prototype #5b4a9d/#ebe7f5`, `archived #6a6255/#ece7de` — derive dark equivalents per prototype JS).
- Metrics: mono numerals 22–24px/600 in primary on sunken panels.
- Highlight bullets: accent `→` glyph in a 16–20px column, grid layout.
- EngineThread divider: dashed 1.5px border-strong rules flanking a mono uppercase "extracted into" label; arrow glyph in accent.
- Theme list items: italic display face name + mono count, raised card, radius 8.

## State management

No new state. Existing stores/props cover theme, graph mode, and focus. The only new UI state is the focus-annotation placement, computed per render.

## Design tokens summary

See §2–3 above and `visual-direction.md` §3–4. Type scale in prototypes: h1 clamp(34–58px), h2 26–32px, h3 20–24px, body 15–16px, small 13–13.5px, mono meta 10–12px. Radii: 4 (chips/marks), 6 (buttons/panels), 8–10 (cards), 999 (pills). Spacing rhythm: sections 48px vertical with 1px border-top separators; card padding 20–26px.

## Assets

No new images. OG-card placeholders in the prototypes (diagonal-stripe blocks) stand in for the existing generated OG images. Fonts via fontsource (prototypes use Google Fonts CDN only because they're standalone).

## Files

- `visual-direction.md` — the signed-off spec (copy to `docs/design/visual-direction.md`).
- `designs/Visual Direction - Atlas.dc.html` — decision document with live specimens.
- `designs/Atlas Home.dc.html`, `designs/Atlas Project.dc.html`, `designs/Atlas Map.dc.html` — screen references.
- `designs/support.js` — runtime the design files need to render; not part of the implementation.
