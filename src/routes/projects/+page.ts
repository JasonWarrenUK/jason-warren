import {
	getAllProjectsByRecency,
	getAllKinds,
	getAllStatuses,
	getTagsByKind
} from '$lib/data/queries.js';

export function load() {
	return {
		projects: getAllProjectsByRecency(),
		kinds: getAllKinds(),
		statuses: getAllStatuses(),
		tagsByKind: getTagsByKind()
	};
}
