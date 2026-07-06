/**
 * Query helpers for theme territories.
 *
 * Split out of themes.ts so the static `themes` array stays free of any
 * dependency on the project registry: `graph.ts` and `graph-style.ts` only
 * need the authored slugs, not resolved Project objects, and importing
 * `queries.js` there would re-enter `index.ts` mid-initialisation (`projects`
 * isn't assigned yet), throwing `Cannot access 'projects' before initialization`
 * under bun's test runner. Resolving slugs to full Project objects belongs
 * here instead, alongside the other project-registry query helpers.
 */

import { getBySlug } from './queries.js';
import { themes } from './themes.js';
import type { ThemeWithProjects } from './themes.js';

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
