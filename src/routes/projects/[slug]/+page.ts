import { error } from '@sveltejs/kit';
import { getBySlug, getAllProjects } from '$lib/data/queries.js';
import type { ProjectSlug } from '$lib/data/types.js';

export function entries() {
	return getAllProjects().map((p) => ({ slug: p.slug }));
}

export function load({ params }) {
	const project = getBySlug(params.slug as ProjectSlug);
	if (!project) {
		error(404, `Project "${params.slug}" not found`);
	}
	return { project };
}
