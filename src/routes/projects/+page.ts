import { getAllProjects, getAllTags } from '$lib/data/queries.js';

export function load() {
	return {
		projects: getAllProjects(),
		allTags: getAllTags()
	};
}
