import { getAllProjects, getAllKinds, getAllStatuses, getTagsByKind } from '$lib/data/queries.js';

export function load() {
	return {
		projects: getAllProjects(),
		kinds: getAllKinds(),
		statuses: getAllStatuses(),
		tagsByKind: getTagsByKind()
	};
}
