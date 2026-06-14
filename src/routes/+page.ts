import { getFlagships, getFeatured } from '$lib/data/queries.js';
import { getEngineThreads } from '$lib/data/threads.js';

export function load() {
	return {
		flagships: getFlagships(),
		featured: getFeatured(),
		engineThreads: getEngineThreads()
	};
}
