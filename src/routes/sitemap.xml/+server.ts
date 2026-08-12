import type { RequestHandler } from './$types';
import { getAllProjects } from '$lib/data/queries.js';
import { SITE_URL } from '$lib/config.js';

export const prerender = true;

const staticPaths = ['/', '/projects', '/map', '/timeline', '/toolkit', '/about', '/drift-engine'];

export const GET: RequestHandler = () => {
	const projectPaths = getAllProjects().map((project) => ({
		path: `/projects/${project.slug}`,
		lastmod: project.commitAnyLast
	}));

	const urls = [...staticPaths.map((path) => ({ path, lastmod: undefined })), ...projectPaths];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		({ path, lastmod }) =>
			`	<url>\n		<loc>${SITE_URL}${path}</loc>${lastmod ? `\n		<lastmod>${lastmod}</lastmod>` : ''}\n	</url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
