<!-- doc-changelog: generated 2026-08-26. Delete this line once you hand-edit this file. -->

# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [8.4.1] - 2026-09-25

### Fixed

- `/hire` is now listed in the sitemap. It was prerendered and indexable but missing from the hand-maintained static path list.
- Open Graph images now declare their width, height and type, so link previews render at the correct size instead of guessing.
- An overridden Open Graph image no longer claims the default card's dimensions when its own differ.

## [8.4.0] - 2026-09-24

### Added

- Retired technologies keep their lineage instead of disappearing from the adoption timeline. A tech overlay can now declare `lastUsed`, and the timeline and adoption modal render a retirement date for anything that's left the codebase.
- New `drift tech set --last-used` flag authors a retirement date directly on a tech overlay.

### Fixed

- A retired technology's timeline rail now ends at its actual retirement date instead of running through to the present.
- Kind resolution for synced-only tech now prefers the carried kind over the taxonomy tiebreak, and a technology that retired with no overlay of its own is anchored correctly.
- `drift` now refuses a tech-set edit that would break an overlay's date invariants, rather than writing an inconsistent record.

## [8.3.0] - 2026-09-23

### Added

- `drift new`: reports newly-discovered repos under `scanRoot` without running the full drift/conflict report. Writes nothing, and shares its scan with `drift report`'s own "new repos" section, so the two can never disagree.
- Adoption history now survives a major tech migration instead of being erased. When a detected technology leaves detection (a Svelte 4 to 5 upgrade, for example), `drift sync` keeps its original `detectedTechFirstSeen` date and adds a `detectedTechLastSeen` date recording when it retired, rather than dropping all record it was ever used.

### Changed

- `drift enrich` fetches GitHub repo metadata concurrently instead of one repo at a time, cutting wall-clock time on a large tracked set. Pool size is configurable via `drift.config.ts`'s new `enrichConcurrency` (default 4).

### Fixed

- `drift.config.ts` values for `scanDepth` and `enrichConcurrency` are now validated: an unparseable, zero, negative or non-finite value falls back to the built-in default instead of silently breaking the repo scan or the enrich pool.

## [8.2.1] - 2026-09-22

### Added

- Drift consumer documentation suite under `docs/drift/`: what Drift touches in a host repo and what it leaves alone, a CLI reference with the config resolution order, the data contracts it reads and writes, framework integration and a build guide. The root README is recentred on Drift adopters as the suite's entry point.

### Changed

- Project data refreshed from a full `drift sync`: code-arcana now reports Svelte 5, and commit, line and activity metrics across every tracked repo reflect current history.

## [8.2.0] - 2026-09-17

### Added

- New `drift enrich` verb: opt-in, `gh`-backed enrichment that fetches GitHub's own archived flag and homepage URL for every tracked repo and writes them into a new `enriched` section of `sources.json`. Requires the GitHub CLI, authenticated. `drift sync` never reads or writes this section and stays fully offline; `enrich` is the engine's only network-touching verb, and it never runs automatically.

## [8.1.0] - 2026-09-17

### Added

- Project data now carries three intra-span activity metrics (`spanMonthsActive`, `spanMonthsAll`, `spanGapMaxDays`), showing how work was distributed across a project's lifetime rather than just its start and end. Data-layer only for now: no visual reads them yet, and a manual override on any of the three is validated the same way as the existing synced fields.

## [8.0.0] - 2026-09-15

### Breaking

- The built-in default bot pattern no longer matches `noreply@anthropic.com`; it now only matches generic CI bots (`[bot]`, `github-actions`). A config that omits `botPattern` will count AI-agent commits as human unless the pattern is set explicitly.

### Fixed

- `drift init` now scaffolds `author.botPattern` in the generated config, with a comment showing how to add AI-agent identities, instead of silently inheriting the hidden default.

## [7.2.1] - 2026-08-27

### Fixed

- The project detail page's metrics panel now labels `linesAny` "Lines of code" instead of "Source files", which was measuring lines, not files.
- The `/drift-engine` page's metric-precedence diagram now shows the correct three tiers (override, synced, provisional), matching the prose beside it; the fourth "authored" tier it drew doesn't exist for metrics.

## [7.2.0] - 2026-08-26

### Added

- The by-stack map view now lists a project's tags for the active connection categories, both on hover and in the selection modal, so isolating (say) runtime and framework on a node shows exactly its runtime and framework tags.

### Fixed

- Graph edges are no longer dropped in a way that fragments the map into disconnected islands. The per-node edge cap now bridges back any cluster it would otherwise sever, so shared-tech, theme, and technology-landscape views stay one connected graph instead of splitting into isolated groups.

[Unreleased]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.3.0...HEAD
[8.3.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.2.1...v8.3.0
[8.2.1]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.2.0...v8.2.1
[8.2.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.1.0...v8.2.0
[8.1.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.0.0...v8.1.0
[8.0.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.2.1...v8.0.0
[7.2.1]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.2.0...v7.2.1
[7.2.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.1.0...v7.2.0
