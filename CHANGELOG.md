<!-- doc-changelog: generated 2026-08-26. Delete this line once you hand-edit this file. -->

# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [7.2.1] - 2026-08-27

### Fixed

- The project detail page's metrics panel now labels `linesAny` "Lines of code" instead of "Source files", which was measuring lines, not files.
- The `/drift-engine` page's metric-precedence diagram now shows the correct three tiers (override, synced, provisional), matching the prose beside it; the fourth "authored" tier it drew doesn't exist for metrics.

## [7.2.0] - 2026-08-26

### Added

- The by-stack map view now lists a project's tags for the active connection categories, both on hover and in the selection modal, so isolating (say) runtime and framework on a node shows exactly its runtime and framework tags.

### Fixed

- Graph edges are no longer dropped in a way that fragments the map into disconnected islands. The per-node edge cap now bridges back any cluster it would otherwise sever, so shared-tech, theme, and technology-landscape views stay one connected graph instead of splitting into isolated groups.

[Unreleased]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.2.1...HEAD
[7.2.1]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.2.0...v7.2.1
[7.2.0]: https://github.com/JasonWarrenUK/jason-warren/compare/v7.1.0...v7.2.0
