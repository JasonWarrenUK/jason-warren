/**
 * OG image coverage tests (4QU.4).
 *
 * These are structural, not behavioural: they assert that every route and
 * project actually gets a card, and that the two independent places a slug
 * has to resolve (the OG endpoint's own prerender list, and the on-page
 * <img> src in ExpandableCard/the project banner) can never diverge. A
 * failing test here means a route or project fell out of sync, not that
 * the renderer itself is broken.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllProjects } from '$lib/data/queries.js';
import { entries as ogEntries } from './[slug].png/+server.js';
import { entries as projectPageEntries } from '../projects/[slug]/+page.js';

describe('OG card coverage', () => {
	const projectSlugs = new Set(getAllProjects().map((p) => p.slug));

	it("includes the 'default' card for non-project pages", async () => {
		const ogSlugs = new Set((await ogEntries()).map((e) => e.slug));
		expect(ogSlugs.has('default')).toBe(true);
	});

	it('has an OG entry for every project, and no orphan entries', async () => {
		const ogSlugs = new Set((await ogEntries()).map((e) => e.slug));
		const ogProjectSlugs = new Set([...ogSlugs].filter((slug) => slug !== 'default'));
		expect(ogProjectSlugs).toEqual(projectSlugs);
	});

	it('agrees with the project page entry list, so the meta-tag path (SITE_URL) and the on-page <img> path (base) can never diverge', async () => {
		const ogSlugs = new Set((await ogEntries()).map((e) => e.slug));
		const pageSlugs = new Set((await projectPageEntries()).map((e) => e.slug));
		const ogProjectSlugs = new Set([...ogSlugs].filter((slug) => slug !== 'default'));
		expect(ogProjectSlugs).toEqual(pageSlugs);
	});
});

describe('sitemap route coverage', () => {
	// Route directories that are NOT a static page: dynamic params (need
	// per-entry sitemap handling, not a static path) and +server.ts-only
	// endpoints (not indexable HTML pages). Kept explicit and commented so a
	// new endpoint under src/routes/ fails this test loudly instead of being
	// silently skipped.
	const nonPageRouteDirs = new Set([
		'projects/[slug]', // dynamic: project paths are added separately, from getAllProjects()
		'og/[slug].png', // +server.ts only: the image endpoint itself, not a page
		'sitemap.xml' // +server.ts only: the sitemap endpoint itself
	]);

	function findPageRouteDirs(): string[] {
		const routesDir = join(fileURLToPath(import.meta.url), '../../../routes');
		const found: string[] = [];

		// The walk only descends into subdirectories, so the root route's own
		// +page.svelte is invisible to it. Seed '/' explicitly.
		if (readdirSync(routesDir).includes('+page.svelte')) {
			found.push('/');
		}

		function walk(dir: string, relative: string): void {
			for (const entry of readdirSync(dir)) {
				const entryRelative = relative ? `${relative}/${entry}` : entry;
				const fullPath = join(dir, entry);
				if (!statSync(fullPath).isDirectory()) continue;
				if (nonPageRouteDirs.has(entryRelative)) continue;
				if (readdirSync(fullPath).includes('+page.svelte')) {
					found.push(`/${entryRelative}`);
				}
				walk(fullPath, entryRelative);
			}
		}

		walk(routesDir, '');
		return found;
	}

	it('lists every static page route in the sitemap (the /hire regression)', async () => {
		const { GET } = await import('../sitemap.xml/+server.js');
		// GET ignores its event entirely (see +server.ts); a minimal stub
		// satisfies the RequestHandler signature without a real request.
		const response = await GET({} as Parameters<typeof GET>[0]);
		const body = await response.text();

		const pageRoutes = findPageRouteDirs();
		expect(pageRoutes.length).toBeGreaterThan(0);

		for (const route of pageRoutes) {
			expect(body, `sitemap.xml is missing ${route}`).toContain(
				`<loc>https://jason-warren.vercel.app${route}</loc>`
			);
		}
	});
});
