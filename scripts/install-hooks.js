/**
 * Installs the pre-commit formatting gate so it actually fires.
 *
 * Two cases, detected via `git config core.hooksPath`:
 *
 * 1. No override — standard case. Symlink scripts/pre-commit straight into
 *    .git/hooks/pre-commit, same as any other repo.
 * 2. A global core.hooksPath override is set (e.g. a personal machine-wide
 *    hooks directory unrelated to this project) — that path silently
 *    overrides .git/hooks for EVERY repo on the machine, so a plain symlink
 *    there would run this repo's Prettier check against every other repo's
 *    commits too. Instead, install a small REPO-SCOPED DISPATCHER at
 *    <hooksPath>/pre-commit: it resolves the current repo root and only
 *    delegates to that repo's own scripts/pre-commit if one exists, then
 *    exits cleanly for every other repo. If a dispatcher is already present
 *    (installed by another project using this same convention, or hand-
 *    authored), it's left untouched — the last thing to touch it wins by
 *    whichever ran `bun install` most recently, which is an acceptable
 *    trade-off for a best-effort convenience install.
 *
 * Re-run on every `bun install` via the "prepare" script rather than once
 * manually, since .git/hooks and any global hooksPath dir are both outside
 * version control.
 */

import { existsSync, symlinkSync, unlinkSync, chmodSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const source = join(repoRoot, 'scripts', 'pre-commit');

function globalHooksPath() {
	try {
		const value = execSync('git config --global core.hooksPath', {
			cwd: repoRoot,
			encoding: 'utf8'
		}).trim();
		return value.length > 0 ? value : null;
	} catch {
		return null; // not set — exits non-zero when the key is absent
	}
}

const DISPATCHER = `#!/bin/sh
# Repo-scoped pre-commit dispatcher, shared across every repo on this
# machine via a global core.hooksPath override. Delegates to the current
# repo's own scripts/pre-commit when one exists; otherwise a no-op, so repos
# without this convention are unaffected. Reinstalled by each repo's own
# \`bun run prepare\` — see scripts/install-hooks.js in this repo for the
# source of this file.
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
hook="$repo_root/scripts/pre-commit"
[ -x "$hook" ] && exec "$hook"
exit 0
`;

const override = globalHooksPath();

if (override) {
	const target = join(override, 'pre-commit');
	try {
		if (!existsSync(override)) {
			// A configured-but-missing hooksPath dir isn't this script's problem
			// to create — leave it for the user's own tooling to manage.
			process.exit(0);
		}
		writeFileSync(target, DISPATCHER, { mode: 0o755 });
	} catch (error) {
		console.warn(`Skipping pre-commit hook install (global hooksPath): ${error.message}`);
	}
} else {
	const hooksDir = join(repoRoot, '.git', 'hooks');
	const target = join(hooksDir, 'pre-commit');
	if (!existsSync(hooksDir)) process.exit(0); // not a git checkout
	try {
		if (existsSync(target)) unlinkSync(target);
		symlinkSync(source, target);
		chmodSync(source, 0o755);
	} catch (error) {
		console.warn(`Skipping pre-commit hook install: ${error.message}`);
	}
}
