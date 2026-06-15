import { getAllProjectsByInception } from '$lib/data/queries.js';
import { getProjectGraph } from '$lib/data/graph.js';

export function load() {
	const ordered = getAllProjectsByInception();

	const rows = ordered.map((project) => {
		const inception = project.firstCommit ?? project.lastCommit;
		return {
			slug: project.slug,
			name: project.name,
			status: project.status,
			year: inception ? inception.slice(0, 4) : null
		};
	});

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
