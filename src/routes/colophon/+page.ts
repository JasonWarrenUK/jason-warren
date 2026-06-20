/**
 * Build-time data load for the Colophon page.
 *
 * Because the route inherits prerender:true from +layout.ts, this load
 * runs exactly once — at build time — during prerendering. The Shiki
 * highlighter calls are async but settle on the build machine; the browser
 * receives only the serialised HTML strings. No Shiki ships to the client.
 *
 * Snippet strings live here rather than in the component so they can be
 * highlighted before the component renders. They are trimmed copies of the
 * real source; the file path beside each one is where they actually live.
 */
import { highlight } from '$lib/code/highlight.js';

// — src/lib/data/types.ts ————————————————————————————————————————————————
// The Contribution discriminated union. The role field determines shape;
// contributionNote is optional on team projects because manifest-derived
// entries can be auto-listed before an editorial note is authored.
const contributionSnippet = `interface SoloContribution {
	role: 'solo';
}

interface TeamContribution {
	role: 'lead' | 'collaborator';
	/**
	 * Specific verified contributions. Optional: manifest-derived team
	 * projects may have role inferred from commit share but no authored
	 * note yet. Present once editorially authored.
	 */
	contributionNote?: string;
}

export type Contribution = SoloContribution | TeamContribution;`;

// — src/lib/data/types.ts ————————————————————————————————————————————————
// ProjectSlug is now a plain string — slugs are discovered dynamically
// at build time from the manifest, so a closed union is not maintainable.
// Cross-link safety is enforced at build time by two other mechanisms.
const slugSnippet = `/**
 * Previously a hand-maintained string-literal union. Now a plain string:
 * slugs are discovered dynamically and cannot be enumerated in a closed union.
 *
 * Type safety is preserved at build time through two mechanisms:
 *   1. themes.ts throws during prerender when a relationship target is
 *      not in the project registry (the build fails on dangling links).
 *   2. data.test.ts asserts that every relationship target is a known slug
 *      (the test suite fails on typos before the build runs).
 */
export type ProjectSlug = string;

export interface ProjectRelationship {
	kind: 'extracted-from' | 'powers' | 'related';
	target: ProjectSlug;
	note?: string;
}`;

// — src/lib/data/threads.ts ——————————————————————————————————————————————
// Engine-thread derivation: walks the relationship graph to find every
// library→consumer pair. Nothing is declared by hand here.
const threadsSnippet = `export function getEngineThreads(): EngineThread[] {
	const projectBySlug = new Map(projects.map((p) => [p.slug, p]));
	const threads: EngineThread[] = [];

	for (const project of projects) {
		for (const rel of project.relationships) {
			if (rel.kind !== 'powers') continue;

			const consumer = projectBySlug.get(rel.target);
			if (!consumer) continue;

			threads.push({ library: project, consumer, note: rel.note ?? '' });
		}
	}

	return threads;
}`;

// — src/lib/data/sources.json ————————————————————————————————————————————
// One entry from the drift manifest. Every field is a measurement from git,
// never a number typed by hand.
const sourcesSnippet = `"chirpdb": {
	"head": "dc05eaf",
	"commits": 354,
	"commitsMine": 53,
	"lastCommit": "2026-06-18",
	"firstCommit": "2026-02-23",
	"languages": ["Python", "SQL", "Shell"],
	"linesOfCode": 15694
}`;

// — scripts/check-drift.js ———————————————————————————————————————————————
// The fingerprint diff: field-level comparison of a saved entry against
// the live git state. Called per-repo in the bounded worker pool.
const driftSnippet = `async function getFingerprint(repoPath) {
	const [commits, commitsMine, lastCommit, firstCommit, listing] =
		await Promise.all([
			countCommits(repoPath),
			countCommits(repoPath, { mine: true }),
			git(['log', '-1', '--format=%cs'], repoPath),
			getFirstCommit(repoPath),
			listFiles(repoPath)
		]);

	return {
		head, commits, commitsMine, lastCommit, firstCommit,
		languages: detectLanguages(listing),
		linesOfCode: countLinesOfCode(repoPath, listing),
		// ...churn grid, remote, runtime, framework, database
	};
}`;

export async function load() {
	const [contribution, slug, threads, sources, drift] = await Promise.all([
		highlight(contributionSnippet, 'typescript'),
		highlight(slugSnippet, 'typescript'),
		highlight(threadsSnippet, 'typescript'),
		highlight(sourcesSnippet, 'json'),
		highlight(driftSnippet, 'typescript')
	]);

	return {
		snippets: { contribution, slug, threads, sources, drift }
	};
}
