import { getTechAdoption } from '$lib/data/adoption.js';
import { getThemes } from '$lib/data/theme-queries.js';
import sourcesManifest from '$lib/data/sources.json';

export function load() {
	return {
		adoption: getTechAdoption(),
		themes: getThemes(),
		provisional: sourcesManifest.firstCommitProvisional === true
	};
}
