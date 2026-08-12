# Portfolio MVP: Roadmap Overview

**55 tasks across 6 milestones.** Files: `.claude/roadmaps.json` (machine-readable), `docs/roadmaps/mvp.md` (full task list with Mermaid dependency diagram).

> Migrated from the old single-file roadmap format on 17 July 2026. The narrative sections below are synthesised from the milestone goals in the source; they are stubs for fleshing out, not authored rationale.

---

## What we're building

_Stub — flesh out._ The site is live and substantially built: full routes, the graph/timeline/map/toolkit views, 30+ typed projects and the Drift CLI. This phase deepens the site as an artefact and decouples Drift's engine from its portfolio-specific couplings so it could power any frontend.

## Milestone sequence and the reasoning behind it

_Stub — synthesised from the milestone goals._

- **M1 Content Depth & Polish** (done): make the written substance match the engineering; every entry flagship-ready, connective copy carrying voice and intent.
- **M2 Exploration & New Features** (done): more ways into the work — search, deep-linkable selections, multi-select filters, polished interactions, the tech-stack constellation.
- **M3 Design & Interaction Polish** (done): a distinct visual identity, with the direction decision (3DE.0) gating every other polish task.
- **M4 Quality & Reach**: accessibility, discoverability, test coverage. Was gated on M3 so audits run against the settled design; now that M3 has landed, 4QU.5 is the one task gating the rest.
- **M5 Drift Decoupling: Engine & Verbs** (two verbs remaining): the config-driven engine/integration split; the unbuilt verb backlog lands inside the decoupled design.
- **M6 Drift: Tests & Docs**: lock the stable engine down; gated on M3 and M5, so with M3 done it now waits on M5's enrichment verbs alone.

## Decisions that shaped the structure

_Stub — flesh out._ Notable from the source: analytics are deliberately excluded (tracker-free is a statement); performance folds into the SEO pass because the site is already fully prerendered; Drift packaging and distribution are beyond this phase.

## External blockers (flag early)

None modelled — the phase has no external gates.

---

## Beyond MVP

Ideas parked until the milestones above settle (carried over from the old roadmap):

- **Drift distribution:** package the CLI (`bin` entry, npm/bun distributable), dogfood this portfolio onto the published package, publish to a registry
- Drift as a hosted service (point it at a GitHub org, get a portfolio)
- RSS / now-page / writing surface on the site
- Interactive playground embeds for the toy/game projects
- Internationalised copy
- Generative OG variants per theme

## Links

- Live site: [jason-warren.vercel.app](https://jason-warren.vercel.app)
- Drift build history and decisions: [`docs/drift-improvement-plan.md`](../drift-improvement-plan.md)
- Data model: [`src/lib/data/types.ts`](../../src/lib/data/types.ts)
- House style: [`CLAUDE.md`](../../CLAUDE.md)
