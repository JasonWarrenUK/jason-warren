#!/bin/zsh
# Drift Engine sandbox driver.
#
# Creates an isolated dataDir (own projects/, tech-overlays.ts, sources.json,
# overrides.json, excluded.json, in-progress.json) and runs a `drift` verb
# against it via DRIFT_CONFIG, exactly the way scripts/check-drift.test.ts's
# makeOverlaySandbox/runVerbInSandbox helpers do. Nothing under the sandbox
# touches the real src/lib/data/ manifests.
#
# Usage:
#   .claude/skills/verify-cli/driver.sh <verb> [args...]
#   .claude/skills/verify-cli/driver.sh --keep <verb> [args...]   # print sandbox path, skip cleanup
#
# Examples:
#   .claude/skills/verify-cli/driver.sh tech set svelte --first-used 2024-01-01 --note "test"
#   .claude/skills/verify-cli/driver.sh tech list
#   .claude/skills/verify-cli/driver.sh audit --json
#   .claude/skills/verify-cli/driver.sh author some-project
#
# Portable verbs only: tech, tag, relate, flag, author, audit, promote.
# report/sync/enrich need a real sources.local.json with populated repo paths
# and are NOT reproducible via this driver — see SKILL.md.

set -euo pipefail

REPO_ROOT="${0:A:h:h:h:h}"
CHECK_DRIFT="$REPO_ROOT/scripts/check-drift.js"

KEEP=0
if [[ "${1:-}" == "--keep" ]]; then
	KEEP=1
	shift
fi

if [[ $# -eq 0 ]]; then
	echo "usage: driver.sh [--keep] <verb> [args...]" >&2
	exit 1
fi

SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/drift-verify-XXXXXX")
mkdir -p "$SANDBOX/projects"

cat > "$SANDBOX/drift.config.mjs" <<CONFIG
export default { dataDir: "$SANDBOX" };
CONFIG

cat > "$SANDBOX/types.js" <<'TYPES'
export const noop = true;
TYPES

cat > "$SANDBOX/tech-overlays.ts" <<'OVERLAYS'
import type { TechOverlay } from './types.js';
export const techOverlays: TechOverlay[] = [];
OVERLAYS

cat > "$SANDBOX/sources.json" <<'SOURCES'
{ "$schema": "../../scripts/sources.schema.json", "lastSyncedAt": "2026-01-01", "sources": {} }
SOURCES

cat > "$SANDBOX/overrides.json" <<'OVERRIDES'
{ "overrides": {} }
OVERRIDES

cat > "$SANDBOX/excluded.json" <<'EXCLUDED'
{ "slugs": [], "repoNames": [] }
EXCLUDED

cat > "$SANDBOX/in-progress.json" <<'INPROGRESS'
{}
INPROGRESS

echo "sandbox: $SANDBOX" >&2

cleanup() {
	if [[ $KEEP -eq 0 ]]; then
		rm -rf "$SANDBOX"
	else
		echo "kept: $SANDBOX" >&2
	fi
}
trap cleanup EXIT

DRIFT_CONFIG="$SANDBOX/drift.config.mjs" EDITOR='' VISUAL='' \
	bun run "$CHECK_DRIFT" "$@" --no-color
