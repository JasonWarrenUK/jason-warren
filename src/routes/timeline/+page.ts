import { getAllProjectsByRecency } from '$lib/data/queries.js';
import { getProjectGraph } from '$lib/data/graph.js';

export function load() {
	const ordered = getAllProjectsByRecency();

	const rows = ordered.map((project) => ({
		slug: project.slug,
		name: project.name,
		status: project.status,
		year: project.lastCommit ? project.lastCommit.slice(0, 4) : null
	}));

	const indexBySlug = new Map(ordered.map((project, index) => [project.slug, index]));

	// Extraction lineages, expressed as pairs of row indices for the connector curves.
	const connectors = getProjectGraph()
		.edges.filter((edge) => edge.kind === 'extraction')
		.map((edge) => ({
			from: indexBySlug.get(edge.source) ?? 0,
			to: indexBySlug.get(edge.target) ?? 0
		}));

	return { rows, connectors };
}
