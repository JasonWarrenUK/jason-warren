#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Opt-in source-repo git hook: keep portfolio fingerprints warm after commits.
#
# USAGE
#   Copy this file into the source repo's .git/hooks/ directory as either
#   post-commit or post-merge, then make it executable:
#
#     cp drift-post-commit-hook.example.sh /path/to/source-repo/.git/hooks/post-commit
#     chmod +x /path/to/source-repo/.git/hooks/post-commit
#
# This hook is NOT auto-installed. It is entirely opt-in per source repo.
# It runs `drift update <slug>` which writes only that one slug's entry in
# sources.json. Run `drift` afterwards to review the change.
#
# VARIABLES (edit before installing)
#   PORTFOLIO_ROOT  — absolute path to your portfolio repo
#   SLUG            — the slug key for this repo in sources.json
# ---------------------------------------------------------------------------

PORTFOLIO_ROOT="${HOME}/Code/personal/portfolio"
SLUG="your-repo-slug"

DRIFT="${PORTFOLIO_ROOT}/scripts/check-drift.js"

if [ ! -f "${DRIFT}" ]; then
	echo "[drift hook] check-drift.js not found at ${DRIFT} — skipping" >&2
	exit 0
fi

bun run "${DRIFT}" update "${SLUG}"
