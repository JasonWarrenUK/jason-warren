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
import type { Project } from './types.js';

export type { Project };
export * from './types.js';

export const projects: Project[] = [
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
