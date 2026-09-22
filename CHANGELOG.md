<!-- doc-changelog: generated 2026-08-26. Delete this line once you hand-edit this file. -->

# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

[Unreleased]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.2.1...HEAD
[8.2.1]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.2.0...v8.2.1
[8.2.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.1.0...v8.2.0
[8.1.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v8.0.0...v8.1.0
[8.0.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.2.1...v8.0.0
[7.2.1]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.2.0...v7.2.1
[7.2.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.1.0...v7.2.0
