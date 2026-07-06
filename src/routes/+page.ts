import sources from '$lib/data/sources.json';
import { getHeroPool, HERO_COUNT } from '$lib/data/queries.js';
import { getEngineThreads } from '$lib/data/threads.js';
import { getThemes } from '$lib/data/theme-queries.js';

export function load() {
	// Use the last-synced timestamp as the reference point for recency decay.
	// This keeps prerender output byte-stable across re-runs of the same build
	// (rather than using Date.now() which would change on every invocation).
	const now = Date.parse(sources.lastSyncedAt);

	return {
		heroPool: getHeroPool(now),
		heroCount: HERO_COUNT,
		engineThreads: getEngineThreads(),
		themes: getThemes()
	};
}
