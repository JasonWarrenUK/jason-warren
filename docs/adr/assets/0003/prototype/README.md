# OG card prototype (ADR-003)

The throwaway renderer behind the comparison sheets in [ADR-003](../../../0003-og-cards.md). Kept as reference for 8DE.2 to 8DE.4; it is not part of the build and nothing imports it.

- `proto.ts`: a fork of `src/lib/og/card.ts` with every variant as a parameter. `renderAtlasCard` is the round 7 candidate; `renderOgCard(card, variant)` covers rounds 1 to 5.
- `sheet.test.ts`: renders rounds 1 to 5 (`VARIANTS`, `SLUGS`, `OUT` environment variables).
- `sheet6.test.ts`: renders rounds 6 and 7 (`COMBOS` as `layout-glyphs-ink`, `SLUGS`, `OUT`).

Vitest only collects tests under `src/` and `scripts/`, so to run a sheet, copy this folder to `src/lib/og/_spike/` and point `OUT` at a scratch directory:

```sh
OUT=/tmp/og SLUGS=cogni,nib COMBOS=plate-labels-stage bunx vitest run src/lib/og/_spike/sheet6.test.ts
```

Delete the copy afterwards; it is not meant to live in `src/`.
