#!/bin/sh
# Runs check-drift.test.ts and tolerates ONLY vitest's internal worker RPC
# heartbeat timeout ("[vitest-worker]: Timeout calling onTaskUpdate") — a
# reporting-channel hiccup, not a test failure, seen on CI's slower/more
# constrained runners even with this file isolated to its own vitest
# invocation (see the comment atop check-drift.test.ts and the
# vitest-rpc-timeout-flake project memory for the full history).
#
# Every other non-zero exit — a real assertion failure, a crash, vitest
# itself failing to start — still fails this script. The check requires
# BOTH: (1) the exact vitest RPC timeout signature in the captured output,
# and (2) a clean "Tests N passed (N)" summary with no "failed" anywhere in
# that line, so a mixed pass/fail run (vitest prints
# "Tests N failed | M passed (N+M)") is never masked.

set -u

# NO_COLOR=1: vitest's ANSI colour codes land BETWEEN "passed" and "(N)" in
# CI's captured output (e.g. "passed\x1b[39m\x1b[22m\x1b[90m (165)"), which
# silently broke the tolerate-detection grep below on the first real CI
# run — confirmed by pulling the raw `gh run view --log` output. Plain text
# keeps the pattern match reliable regardless of terminal/CI colour support.
output=$(NO_COLOR=1 bunx vitest run scripts/check-drift.test.ts 2>&1)
status=$?

echo "$output"

if [ "$status" -eq 0 ]; then
	exit 0
fi

tests_line=$(echo "$output" | grep -E '^\s*Tests\s')

if echo "$output" | grep -q '\[vitest-worker\]: Timeout calling "onTaskUpdate"' &&
	echo "$tests_line" | grep -qE '\bpassed \([0-9]+\)\s*$' &&
	! echo "$tests_line" | grep -q 'failed'; then
	echo ""
	echo "Tolerating a known vitest worker RPC heartbeat timeout (all tests passed; see scripts/run-drift-tests.sh)."
	exit 0
fi

exit "$status"
