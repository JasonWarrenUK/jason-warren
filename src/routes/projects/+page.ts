import {
	getAllProjectsByRecency,
	getAllKinds,
	anyProjectHasFlag,
	getTagsByKind
} from '$lib/data/queries.js';

export function load() {
	return {
		projects: getAllProjectsByRecency(),
		kinds: getAllKinds(),
		// Flag chips only render when the registry has something to show for them.
		presentFlags: {
			deployed: anyProjectHasFlag('deployed'),
			retired: anyProjectHasFlag('retired')
		},
		tagsByKind: getTagsByKind()
	};
}
