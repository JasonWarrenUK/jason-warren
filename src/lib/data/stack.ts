/**
 * Hero stack groups: the "wide toolkit" claim on the homepage, derived from the
 * project registry instead of hand-curated. Pure derivation over `projects`, in
 * the style of `getTechNodes` in tech-graph.ts.
 *
 * Drift detects languages, runtimes, frameworks, and databases from repo
 * manifests, so those three groups are fully derived. There is no manifest
 * signal for developer tooling (CI, test runners, deploy targets), so the
 * Tooling & platforms group is derived from authored `tool` tags filtered
 * through a small allowlist — an item still only appears when at least one
 * project actually carries it, so the group can never claim tooling no
 * project uses; the allowlist only decides which real tags count as platform
 * signal versus incidental detail (e.g. "CLI", "Monorepo").
 */

import { projects } from './index.js';
import type { TagKind } from './types.js';

export interface StackGroup {
	label: string;
	items: string[];
}

/** Authored `tool` tags that read as platform/tooling signal on the hero. */
const PLATFORM_TOOLS = new Set([
	'Vitest',
	'Playwright',
	'Docker',
	'GitHub Actions',
	'Vercel',
	'Git'
]);

/**
 * `data`-kind tags that name an actual database/storage technology, as
 * opposed to a data-shape descriptor (e.g. "Document / JSON", "No
 * persistence") that isn't a stack claim. Kept as an allowlist rather than a
 * denylist so a new descriptor tag doesn't silently leak onto the hero.
 */
const DATA_TECH = new Set([
	'Neo4j',
	'PostgreSQL',
	'Supabase',
	'SQLite',
	'pgvector',
	'RxDB',
	'Entity Framework Core',
	'Graph databases'
]);

/**
 * Markup/scripting languages that sit on nearly every project and would
 * otherwise crowd out the breadth signal (Go, Rust, C#) the Languages group
 * exists to show.
 */
const LANGUAGE_EXCLUDE = new Set(['HTML', 'CSS', 'Shell']);

interface GroupSpec {
	label: string;
	kinds: TagKind[];
	/**
	 * Optional per-kind allowlist: when a kind has an entry here, only those
	 * labels of that kind qualify. Kinds absent from this map pass unfiltered.
	 */
	allowByKind?: Partial<Record<TagKind, Set<string>>>;
	/** Optional denylist excluding labels that would otherwise qualify. */
	exclude?: Set<string>;
}

const GROUPS: GroupSpec[] = [
	{ label: 'Languages', kinds: ['language'], exclude: LANGUAGE_EXCLUDE },
	{ label: 'Frameworks', kinds: ['framework'] },
	{ label: 'Runtimes & data', kinds: ['runtime', 'data'], allowByKind: { data: DATA_TECH } },
	{ label: 'Tooling & platforms', kinds: ['tool'], allowByKind: { tool: PLATFORM_TOOLS } }
];

/**
 * Returns the hero's stack groups, each populated with the technologies
 * actually carried by at least one project, ordered by project count
 * (descending) then label, capped to `perGroup` items. Groups with no
 * qualifying items are omitted. Deterministic across calls for prerender.
 */
export function getStackGroups(opts?: { perGroup?: number }): StackGroup[] {
	const perGroup = opts?.perGroup ?? 6;

	// label -> { kind, projectCount }, counting each project once per label.
	const countByLabel = new Map<string, { kind: TagKind; count: number }>();
	for (const project of projects) {
		const seenInProject = new Set<string>();
		for (const tag of project.tags) {
			if (seenInProject.has(tag.label)) continue;
			seenInProject.add(tag.label);
			const existing = countByLabel.get(tag.label);
			if (existing) {
				existing.count += 1;
			} else {
				countByLabel.set(tag.label, { kind: tag.kind, count: 1 });
			}
		}
	}

	const groups: StackGroup[] = [];
	for (const spec of GROUPS) {
		const kinds = new Set(spec.kinds);
		const candidates = [...countByLabel.entries()]
			.filter(([label, entry]) => {
				if (!kinds.has(entry.kind)) return false;
				if (spec.exclude?.has(label)) return false;
				const allow = spec.allowByKind?.[entry.kind];
				if (allow && !allow.has(label)) return false;
				return true;
			})
			.sort(([labelA, a], [labelB, b]) => b.count - a.count || labelA.localeCompare(labelB))
			.map(([label]) => label)
			.slice(0, perGroup);

		if (candidates.length > 0) {
			groups.push({ label: spec.label, items: candidates });
		}
	}

	return groups;
}
