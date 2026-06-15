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
 * a freshly added repo may only carry `head`/`commits`/`lastCommit` until the
 * next full sync.
 */
interface SyncedSource {
	head?: string;
	commits?: number;
	lastCommit?: string;
	firstCommit?: string;
	languages?: string[];
	linesOfCode?: number;
	commitsRecent?: number;
	linesAdded?: number;
	linesRemoved?: number;
}

const sources = sourcesManifest.sources as Record<string, SyncedSource>;

/**
 * Overlays synced git metrics from `sources.json` onto a curated project so the
 * render reads real numbers without hand-transcription. Curation is the gate:
 * only curated projects exist, and the manifest contributes numbers only, never
 * a project or a tag. Precedence is synced-wins-when-present, with the authored
 * `.ts` value as fallback, so nothing regresses before the next drift update.
 */
function withSyncedMetrics(project: Project): Project {
	const synced = sources[project.slug];
	if (!synced) return project;

	const authored = project.metrics;
	const merged: ProjectMetrics = {
		...authored,
		commits: synced.commits ?? authored?.commits,
		linesOfCode: synced.linesOfCode ?? authored?.linesOfCode,
		linesAdded: synced.linesAdded ?? authored?.linesAdded,
		linesRemoved: synced.linesRemoved ?? authored?.linesRemoved,
		commitsRecent: synced.commitsRecent ?? authored?.commitsRecent
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
