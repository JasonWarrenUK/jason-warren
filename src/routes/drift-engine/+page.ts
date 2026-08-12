/**
 * Build-time data load for the Drift Engine page.
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
import sourcesManifest from '$lib/data/sources.json';

// — src/lib/data/types.ts ————————————————————————————————————————————————
// The Contribution discriminated union. The role field determines shape;
// collaboration.team is required on both variants (always defaulted by
// inferContribution); contributionNote is optional and enforced on authored
// team projects by a data test, not the compiler.
const contributionSnippet = `interface Collaboration {
	team: string;         // who the work was built with
	employer?: string;    // the org Jason was employed by
	client?: string;      // the end client, when distinct
}

interface SoloContribution {
	role: 'solo';
	collaboration: Collaboration;
}

interface TeamContribution {
	role: 'lead' | 'collaborator';
	collaboration: Collaboration;
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

// — scripts/check-drift.js ———————————————————————————————————————————————
// The validation gate: the engine assembles a full SyncedSource record,
// validates it against sources.schema.json (draft-07, additionalProperties:
// false) and only then writes. A violation is a programming error in the
// engine — so it throws and writes nothing (fail-closed). The Svelte
// integration layer never sees a partial or off-contract manifest.
const driftSnippet = `// Validate the fully-assembled manifest against the engine's public schema
// before the single sanctioned write. A violation is a programming error:
// throw and write nothing (fail-closed).
const violations = validateManifest(manifest);
if (violations.length > 0) {
	for (const v of violations) {
		process.stderr.write(\`drift: schema violation: \${v}\\n\`);
	}
	throw new Error(
		\`sources.json failed validation (\${violations.length}); nothing written.\`
	);
}

writeJson(sourcesPath, manifest); // the only write to sources.json`;

// — src/lib/data/index.ts ————————————————————————————————————————————————
// The metric precedence chain in withSyncedMetrics. Every field follows the
// same pattern: override > synced > provisional. Once a branch lands and
// drift sync runs, the synced value naturally shadows any provisional
// figure — promotion is self-healing, no stale leak.
const precedenceSnippet = `// Precedence: override > synced > provisional.
// prov(field) returns the in-progress tracked value, or undefined.
const prov = (field: keyof ProjectMetrics) =>
	provisional?.tracked?.[field]?.value;

commitsMe:
	ov?.commitsMe?.value ?? synced?.commitsMe ?? prov('commitsMe'),
linesAny:
	ov?.linesAny?.value ?? synced?.linesAny ?? prov('linesAny'),
// ...every metric field follows the same three-tier chain

// Scope stays honest: commitsAny is always all-authors and commitsMe is
// always Jason, whatever the project's role. The role-keyed figure the
// page actually shows is a separate field, so nothing reading a scoped
// fact silently gets the other scope's number.
commitsHeadline: isSolo ? synced?.commitsAny : synced?.commitsMe,
commitsHeadlineScope: isSolo ? 'any' : 'me',`;

// — src/lib/data/sources.json ————————————————————————————————————————————
// One entry from the drift manifest. Written only by drift sync, and only
// after passing schema validation. Read directly from the manifest so the
// example changes whenever Drift syncs the underlying fingerprint.
const sourcesSnippet = JSON.stringify({ chirpdb: sourcesManifest.sources.chirpdb }, null, '\t');

export async function load() {
	const [contribution, slug, threads, drift, precedence, sources] = await Promise.all([
		highlight(contributionSnippet, 'typescript'),
		highlight(slugSnippet, 'typescript'),
		highlight(threadsSnippet, 'typescript'),
		highlight(driftSnippet, 'typescript'),
		highlight(precedenceSnippet, 'typescript'),
		highlight(sourcesSnippet, 'json')
	]);

	return {
		snippets: { contribution, slug, threads, drift, precedence, sources }
	};
}
