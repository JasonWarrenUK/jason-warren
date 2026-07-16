# Visual Direction — 3DE.0 (signed off)

> Decision document for the portfolio's visual identity. Explored as three candidate moods (Instrument, Atlas, Signal); **Atlas** chosen. Companion to [`visual-direction-brief.md`](./visual-direction-brief.md). Rendered exploration artefacts live in the Claude Design project (`Visual Direction - Atlas.dc.html`, runner-up archived).

## Verdict

**Atlas** — a cartographic, archival identity. Projects are surveyed places, connections are plotted routes, theme clusters are territories. The register is a working survey sheet: warm paper, ink, exact plotted marks.

**Why this, not Instrument (runner-up):** Instrument (instrument-panel precision: cool greys, hairlines, mono chrome) proves rigour but borrows a register any dev-tool brand can claim. Atlas is the reading specific to this body of work — an animated atlas of Anglo-Saxon kingdoms, theme _territories_, extraction _lineages_, a schedule view where time is displaced space. Precision doesn't leave; it changes instrument, from the oscilloscope to the theodolite. **Signal** (brutalist graph-native) was eliminated first: boldest, but tips into gimmick and taxes long-form legibility.

**The test for every element:** would it look at home on a well-made survey sheet? If not, it's decoration.

## 1. Mood

- Charted · Warm · Exact.
- Warmth carries the distinctiveness; precision lives in the drawing conventions (graticule, plotted routes, survey marks), not in coldness of palette.
- Both themes equal weight: paper (light) and lamplit dark.

## 2. Type

| Role    | Face                                     | Source                                                     | Usage                                                                                      |
| ------- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Display | **Source Serif 4** (variable, opsz 8–60) | `@fontsource-variable/source-serif-4` — **new dependency** | Headings, hero, pull-quotes; _italic_ for territory names in graph views. Weights 500/600. |
| Body    | **IBM Plex Sans**                        | already installed                                          | Prose, taglines, descriptions. 400/500/600, line-height 1.65, max 64ch measure.            |
| Mono    | **JetBrains Mono**                       | already installed                                          | Code (Shiki), coordinates, legends, dates, status marks, graph labels. 400/500/600.        |

- Retire the `sora` and `space-grotesk` fontsource packages.
- Rationale: the serif/sans split is the atlas convention itself — names in serif, apparatus in sans. Prose stays sans so the site reads working-document, not period piece. Mono keeps the data unmistakably modern; it's what stops warm paper drifting into nostalgia.
- Source Serif 4 is the one "something new" purchase: none of the four installed faces is a serif, and the optical-size axis holds from 80px hero to 18px pull-quote.

```css
/* tokens.css */
--font-display: 'Source Serif 4 Variable', serif;
--font-sans: 'IBM Plex Sans', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

## 3. Colour

Everything routes through the semantic aliases, as now. Two rules:

**Chromatic tokens stay pure Reasonable Colors.**

```css
--color-primary: var(--color-blue-4); /* ink — the azure → blue shift */
--color-accent: var(--color-cinnamon-4); /* oxide — the colour of survey marks */
```

Cinnamon is currently claimed by the interactive-fiction theme edge; reassign that edge to the unclaimed `--color-red-4` so no edge shares a hue with the accent. Status, role, and edge tokens are otherwise unchanged.

**Warm neutrals are derived, never hand-picked.** Each neutral is an oklab mix of its Reasonable Colors grey with the _same-shade_ cinnamon, at one ratio:

```css
--warmth: 12%; /* the one knob */
--color-surface: color-mix(
	in oklab,
	var(--color-gray-1) calc(100% - var(--warmth)),
	var(--color-cinnamon-1)
);
--color-surface-sunken: color-mix(
	in oklab,
	var(--color-gray-2) calc(100% - var(--warmth)),
	var(--color-cinnamon-2)
);
--color-border: color-mix(
	in oklab,
	var(--color-gray-3) calc(100% - var(--warmth)),
	var(--color-cinnamon-3)
);
--color-text: color-mix(
	in oklab,
	var(--color-gray-6) calc(100% - var(--warmth)),
	var(--color-cinnamon-6)
);
```

Because both inputs share a shade, the mix stays in that shade's lightness band, so the shade-difference contrast rule (diff 2 ≈ 3:1, diff 3 ≈ 4.5:1, diff 4 ≈ 7:1) keeps holding. The dark theme applies the same rule to its existing hand-set surfaces, e.g. `color-mix(in oklab, #1a1b1e 88%, var(--color-cinnamon-6))`.

**Assert it:** add a Vitest data test that resolves each text/surface token pair and checks the WCAG ratio ≥ 4.5:1 for body pairings at build time, alongside the existing structural tests.

## 4. Motion

One curve, one exit, a four-step scale, a hard rule.

```css
--ease-standard: cubic-bezier(0.45, 0.05, 0.25, 1); /* plate turn: gathers, travels, settles */
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
--motion-scale: 1; /* → 0 under prefers-reduced-motion */
--dur-micro: calc(160ms * var(--motion-scale)); /* hover feedback, chips */
--dur-base: calc(240ms * var(--motion-scale)); /* most transitions */
--dur-deliberate: calc(400ms * var(--motion-scale)); /* theme flip, dim-others */
--dur-plate: calc(600ms * var(--motion-scale)); /* graph relayout, modal */
```

**Earns motion:** state changes needing continuity — graph relayout, theme flip, hover/dim, modal open, the graph settling on first load. Plus one Atlas-specific licence: a plotted edge may draw in along its path, once, on first reveal (that's how a route is inked).

**Stays static:** scroll-triggered reveals, decorative loops, text fades, parallax. A map does not fidget. If motion isn't carrying information, it's cut.

**Reduced motion (defined fallback, not just "respect the query"):** a single `@media (prefers-reduced-motion: reduce)` rule sets `--motion-scale: 0`, collapsing every duration; transforms become instant opacity swaps; the force simulation ticks synchronously to steady state (already implemented); routes render fully inked. No component opts in by hand. Replaces the ad-hoc `--transition-fast/base/slow` tokens.

## 5. Graph signature

Draw it as a survey, not a simulation.

- **Canvas:** dotted graticule (1px, `1 6` dash, `--color-border`-weight) on `--color-surface-sunken`, behind all edges.
- **Nodes — survey marks:** open ring + centre point, not filled blobs. Ring radius keeps the existing formula `r = 8 + 17.5·√(w/max)`; stroke = status colour; recency → ring opacity 0.55–1.0; hubs get a second outer ring.
- **Edges — routes:** always curved (quadratic, slight bow). Extraction = solid 2px; related/theme = 1.5px dashed `5 4`; tech lineage keeps arrowheads, restyled as route arrowheads. Category colour from the existing edge tokens, unchanged.
- **Territories:** convex hull per theme cluster (d3-polygon `polygonHull`, padded and rounded): 7% tint fill, dashed 1px boundary, _italic serif_ territory name at the centroid. This is the move that makes `/map` and `ThemeTerritories` unmistakably one system.
- **Labels:** project names in JetBrains Mono micro-caps (uppercase, ~1.2px tracking); standing set only (hubs + top-N) at rest, others on hover/focus.
- **Focus state:** mark swaps to the accent double-ring; leader line to a mono annotation (`WYRD · hub` / `wip · 3 routes · Go`). Dim-others reuses the existing tokens: `--dim-node: 0.28`, `--dim-edge: 0.08`, `--dim-label: 0.32`.

Implementation sites: graticule `<g>` and ring-mark nodes in `ProjectMap.svelte` / `NeighbourhoodGraph.svelte`; hulls from layout positions in `graph.ts` consumers; territory labels shared with `ThemeTerritories.svelte`.

## Sequencing

1. **3DE.1** — activate the three fonts, add motion + warmth tokens, contrast test.
2. Graph restyle (marks, routes, graticule, focus annotation).
3. Territory hulls.
4. **3DE.2** — responsive audit proceeds against this direction; nothing here introduces horizontal scroll (hulls and annotations live inside the existing square viewBox).
