/**
 * Central project registry.
 * Import from this module to access the full project list.
 */

import { iris } from './projects/iris.js';
import { wyrdTui } from './projects/wyrd-tui.js';
import { rhea } from './projects/rhea.js';
import { epoch } from './projects/epoch.js';
import { theTongue } from './projects/the-tongue.js';
import { cogni } from './projects/cogni.js';
import { sparker } from './projects/sparker.js';
import { theWork } from './projects/the-work.js';
import { flyt } from './projects/flyt.js';
import { thoseWhoCameBefore } from './projects/those-who-came-before.js';
import { historia } from './projects/historia.js';
import { topGirls } from './projects/top-girls.js';
import { grumble } from './projects/grumble.js';
import { codeArcana } from './projects/code-arcana.js';
import { babyNames } from './projects/baby-names.js';
import { nib } from './projects/nib.js';
import { riffle } from './projects/riffle.js';
import { schemaForge } from './projects/schema-forge.js';
import { kamino } from './projects/kamino.js';
import { lyraRose } from './projects/lyra-rose.js';
import { kitchenGremlin } from './projects/kitchen-gremlin.js';
import { workwise } from './projects/workwise.js';
import { commonsTraybake } from './projects/commons-traybake.js';
import { psyche } from './projects/psyche.js';
import { thingsWeDo } from './projects/things-we-do.js';
import { guardrails } from './projects/guardrails.js';
import { redot } from './projects/redot.js';
import { chirpdb } from './projects/chirpdb.js';
import { facCra } from './projects/fac-cra.js';
import { beacons } from './projects/beacons.js';
import { craftAndGraft } from './projects/craft-and-graft.js';
import { sakura } from './projects/sakura.js';
import { rimewarden } from './projects/rimewarden.js';
import sourcesManifest from './sources.json';
import type { Project, ProjectMetrics } from './types.js';

export type { Project };
export * from './types.js';

/**
 * One synced fingerprint from the drift manifest. Every field is optional: the
 * manifest is populated incrementally by `scripts/check-drift.js --update`, so
 * a freshly added repo may only carry a subset of fields until the next full sync.
 * Field naming mirrors ProjectMetrics exactly; `commitsAll` is omitted here
 * because it is produced by the curation gate, not stored in the manifest.
 */
interface SyncedSource {
	head?: string;
	// Commit grid
	commits?: number;
	commitsRecentAll?: number;
	commitsMine?: number;
	commitsRecent?: number;
	// Dates
	lastCommit?: string;
	firstCommit?: string;
	// Languages (advisory; not overlaid onto tags — tags are hand-curated)
	languages?: string[];
	// Codebase size
	linesOfCode?: number;
	// Churn grid
	linesAdded?: number;
	linesRemoved?: number;
	linesAddedAll?: number;
	linesRemovedAll?: number;
	linesAddedRecent?: number;
	linesRemovedRecent?: number;
	linesAddedRecentAll?: number;
	linesRemovedRecentAll?: number;
}

const sources = sourcesManifest.sources as Record<string, SyncedSource>;

/**
 * Overlays synced git metrics from `sources.json` onto a curated project so the
 * render reads real numbers without hand-transcription. Curation is the gate:
 * only curated projects exist, and the manifest contributes numbers only, never
 * a project or a tag. Precedence is synced-wins-when-present, with the authored
 * `.ts` value as fallback, so nothing regresses before the next drift update.
 *
 * ### Curation gate — commit headline
 *
 * The `commits` field written into the merged metrics is role-keyed:
 *
 * - **solo** — Jason IS all authors, so the headline is the all-authors lifetime
 *   count (`synced.commits`). No `commitsAll` context field is set.
 * - **lead / collaborator** — the headline is Jason's scoped count (`synced.commitsMine`,
 *   falling back to the authored value which is already Jason-scoped by convention).
 *   The all-authors total is exposed as `commitsAll` for "N mine of M total" UI.
 *
 * All other fields (churn, loc, dates) are overlaid unconditionally.
 */
function withSyncedMetrics(project: Project): Project {
	const synced = sources[project.slug];
	if (!synced) return project;

	const authored = project.metrics;
	const isSolo = project.contribution.role === 'solo';

	// Role-keyed commit headline
	const headlineCommits = isSolo
		? (synced.commits ?? authored?.commits) // all-authors for solo
		: (synced.commitsMine ?? authored?.commits); // Jason-scoped for team
	const contextCommits = isSolo
		? undefined // no "of N total" needed for solo
		: (synced.commits ?? undefined); // all-authors total as context for team

	const merged: ProjectMetrics = {
		...authored,
		// Gated headline
		commits: headlineCommits,
		// Gate context (team projects only)
		commitsAll: contextCommits,
		// Full commit grid (available for future use)
		commitsRecentAll: synced.commitsRecentAll ?? authored?.commitsRecentAll,
		commitsMine: synced.commitsMine ?? authored?.commitsMine,
		commitsRecent: synced.commitsRecent ?? authored?.commitsRecent,
		// Codebase size
		linesOfCode: synced.linesOfCode ?? authored?.linesOfCode,
		// Full churn grid
		linesAdded: synced.linesAdded ?? authored?.linesAdded,
		linesRemoved: synced.linesRemoved ?? authored?.linesRemoved,
		linesAddedAll: synced.linesAddedAll ?? authored?.linesAddedAll,
		linesRemovedAll: synced.linesRemovedAll ?? authored?.linesRemovedAll,
		linesAddedRecent: synced.linesAddedRecent ?? authored?.linesAddedRecent,
		linesRemovedRecent: synced.linesRemovedRecent ?? authored?.linesRemovedRecent,
		linesAddedRecentAll: synced.linesAddedRecentAll ?? authored?.linesAddedRecentAll,
		linesRemovedRecentAll: synced.linesRemovedRecentAll ?? authored?.linesRemovedRecentAll
	};

	// Drop keys that resolved to undefined so the metrics object stays tidy
	// (and absent entirely when there is nothing to show).
	for (const key of Object.keys(merged) as (keyof ProjectMetrics)[]) {
		if (merged[key] === undefined) delete merged[key];
	}

	return {
		...project,
		lastCommit: synced.lastCommit ?? project.lastCommit,
		firstCommit: synced.firstCommit ?? project.firstCommit,
		metrics: Object.keys(merged).length > 0 ? merged : undefined
	};
}

const curatedProjects: Project[] = [
	// Solo flagships
	iris,
	wyrdTui,
	rhea,
	epoch,
	theTongue,
	cogni,
	sparker,
	// Solo narrative / games
	theWork,
	flyt,
	thoseWhoCameBefore,
	historia,
	topGirls,
	grumble,
	codeArcana,
	babyNames,
	// Solo libraries
	nib,
	riffle,
	schemaForge,
	// Solo tooling / WIP
	kamino,
	lyraRose,
	kitchenGremlin,
	// Team projects
	workwise,
	commonsTraybake,
	psyche,
	thingsWeDo,
	guardrails,
	redot,
	chirpdb,
	facCra,
	// New entries
	beacons,
	craftAndGraft,
	sakura,
	rimewarden
];

export const projects: Project[] = curatedProjects.map(withSyncedMetrics);
