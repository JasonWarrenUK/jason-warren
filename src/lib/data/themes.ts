/**
 * Theme territories: the recurring concerns the work returns to.
 *
 * Unlike tags (which describe what a project is built with), themes describe
 * what a project is *about*. They are authored, not derived, because the
 * interesting groupings cut across kind and stack: a Cypher TUI and a Neo4j
 * web app share a way of thinking, not a toolchain. Membership uses ProjectSlug
 * so a typo fails the build, exactly like relationship targets.
 *
 * Projects deliberately appear in more than one territory; that overlap is the
 * narrative, surfaced by the cross-highlight interaction on /toolkit.
 */

import { getBySlug } from './queries.js';
import type { Project, ProjectSlug } from './types.js';

export interface Theme {
	/** Stable id, used for keys and anchors. */
	id: string;
	/** Display name. */
	name: string;
	/** One honest sentence on what binds these projects. */
	blurb: string;
	/** Member projects, by slug. Compile-time checked. */
	slugs: ProjectSlug[];
}

export interface ThemeWithProjects {
	id: string;
	name: string;
	blurb: string;
	projects: Project[];
}

/**
 * The curated territories. Ordered as a narrative arc: from making stories and
 * worlds, through the data shapes and intelligence behind them, to where they
 * run and who they serve.
 */
export const themes: Theme[] = [
	{
		id: 'interactive-fiction',
		name: 'Interactive Fiction & Narrative Systems',
		blurb:
			'Branching stories and the engines that run them: a Norse flyting duel, an overnight thesis game, a reactive card-engine and the minimal Ink runtime extracted out of them.',
		slugs: ['the-work', 'flyt', 'riffle', 'nib', 'epoch', 'those-who-came-before', 'psyche']
	},
	{
		id: 'procedural-generation',
		name: 'Procedural & Generative Systems',
		blurb:
			'Systems that generate rather than store: an evolving proto-language, procedurally surfaced archaeology, a life-timeline assembled from real history and generative visual art.',
		slugs: ['the-tongue', 'those-who-came-before', 'epoch', 'lyra-rose']
	},
	{
		id: 'human-history',
		name: 'History & the Past Made Navigable',
		blurb:
			'Projects that work with real human history as their material: an animated atlas of early-medieval kingdoms, a fictional life mapped against Wikipedia-sourced events and a procedural archaeology of invented artefacts.',
		slugs: ['historia', 'epoch', 'those-who-came-before']
	},
	{
		id: 'graph-native',
		name: 'Graph-Native Data',
		blurb:
			'Problems modelled as graphs first: Neo4j-backed apps, a flat-file property graph with a custom Cypher engine and content mapped as navigable edge networks.',
		slugs: ['wyrd-tui', 'beacons', 'sparker', 'code-arcana', 'rimewarden']
	},
	{
		id: 'ai-language-tooling',
		name: 'AI & Language Tooling',
		blurb:
			'Tools that treat language and meaning as something computable: curriculum generation, automated documentation, retrieval experiments, PII redaction, semantic search, colour-name resolution and free-text parsed into a queryable grammar.',
		slugs: ['rhea', 'redot', 'commons-traybake', 'guardrails', 'chirpdb', 'sakura', 'beacons']
	},
	{
		id: 'terminal-native',
		name: 'Terminal & Native Interfaces',
		blurb:
			'Software that lives in the terminal and on the desktop: a Go productivity TUI with a custom graph engine, a TypeScript core driving CLI, TUI and Tauri native builds and the XSD schema library extracted from it.',
		slugs: ['iris', 'wyrd-tui', 'schema-forge']
	},
	{
		id: 'human-centred',
		name: 'Accessibility & Human-Centred Tools',
		blurb:
			'Tools built around how people actually think and feel: a neurodivergent workplace passport, a mood-and-coping PWA, an SEN behaviour tracker and a developer-cognition compass.',
		slugs: ['workwise', 'things-we-do', 'sparker', 'cogni', 'beacons']
	}
];

/**
 * Themes with their slugs resolved to full Project objects, in authored order.
 * Throws if a slug does not resolve, so a bad reference fails loudly at build
 * time rather than rendering an empty card.
 */
export function getThemes(): ThemeWithProjects[] {
	return themes.map((theme) => ({
		id: theme.id,
		name: theme.name,
		blurb: theme.blurb,
		projects: theme.slugs.map((slug) => {
			const project = getBySlug(slug);
			if (!project) {
				throw new Error(`Theme "${theme.id}" references unknown project slug "${slug}"`);
			}
			return project;
		})
	}));
}
