import type { RequestHandler, EntryGenerator } from './$types';
import { getAllProjects, getBySlug } from '$lib/data/queries.js';
import type { ProjectSlug } from '$lib/data/types.js';
import { renderOgCard, projectToOgCard, type OgCard } from '$lib/og/card.js';

export const prerender = true;

/** One card per project, plus a default card for non-project pages. */
export const entries: EntryGenerator = () => {
	return [{ slug: 'default' }, ...getAllProjects().map((project) => ({ slug: project.slug }))];
};

export const GET: RequestHandler = async ({ params }) => {
	const card: OgCard | null =
		params.slug === 'default'
			? { eyebrow: 'Developer', title: 'Jason Warren', seed: 'jason-warren' }
			: (() => {
					const project = getBySlug(params.slug as ProjectSlug);
					return project ? projectToOgCard(project) : null;
				})();

	if (!card) {
		return new Response('Not found', { status: 404 });
	}

	const png = await renderOgCard(card);

	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=604800, immutable'
		}
	});
};
