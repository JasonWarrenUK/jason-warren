# Jason Warren, portfolio

The source for [jason-warren.vercel.app](https://jason-warren.vercel.app): a developer portfolio where the code itself is part of the exhibit. Built with SvelteKit 2, Svelte 5 (runes), TypeScript in strict mode, and a single small colour dependency.

The site is fully prerendered and ships a no-JavaScript content baseline. Every interactive view (the project map, the timeline) renders as static SVG first; JavaScript only enhances it.

## Stack

- **SvelteKit 2 / Svelte 5** with runes, no stores
- **TypeScript** strict; interfaces over types; discriminated unions
- **Vite 7** build, **Vitest** for tests
- **adapter-vercel**, prerendered (static output)
- **Reasonable Colors** via semantic CSS tokens; no CSS framework
- **satori + resvg** to generate Open Graph images at build time

## Architecture

### Data is the source of truth

Every project is a typed object under `src/lib/data/projects/`. The model lives in `src/lib/data/types.ts` and leans on the type system to keep the data honest:

- `ProjectSlug` is a string-literal union, so every cross-link between projects is checked at compile time.
- `Contribution` is a discriminated union that forces a `contributionNote` on team projects.
- Relationships (`powers`, `extracted-from`, `related`) are first-class data, which is what makes the connection views possible.

`src/lib/data/queries.ts` holds pure query helpers; `src/lib/data/graph.ts` normalises the relationship data into a single graph (collapsing reciprocal edges) and computes a deterministic layout. Both are covered by structural tests in `src/lib/data/*.test.ts`.

### The connection views

The relationship graph is presented three ways, all built from `graph.ts`:

- **`/map`** plots every project, clustered by kind, with edges for the engine-extraction lineage and related links.
- **`/timeline`** orders projects by activity and draws extraction lineages as curves across time.
- Each project page shows a **local neighbourhood graph** of its immediate connections.

### Adding a project

1. Create `src/lib/data/projects/<slug>.ts` exporting a `Project`.
2. Add its slug to the `ProjectSlug` union in `types.ts` and register it in `index.ts`.
3. Run `npm run test`; the data-integrity tests will tell you if anything (a dangling relationship, a missing note) is off.

## Commands

```sh
npm run dev        # development server
npm run build      # production build (prerenders pages, OG images, sitemap)
npm run preview    # preview the production build
npm run test       # Vitest
npm run check      # svelte-check (strict types)
npm run lint       # prettier --check
npm run format     # prettier --write
```

## Conventions

British English throughout, tabs for indentation, Conventional Commits. See [`CLAUDE.md`](./CLAUDE.md) for the full house style.
