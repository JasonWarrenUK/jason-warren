import {
	getProjectGraph,
	getSharedTechEdges,
	computeForceLayout,
	selectLabelledSlugs,
	getHubSlugs
} from '$lib/data/graph.js';

export function load() {
	const graph = getProjectGraph();
	const sharedEdges = getSharedTechEdges();
	const layout = computeForceLayout(graph, sharedEdges);
	const labelled = selectLabelledSlugs();
	const hubSlugs = getHubSlugs();

	const nodes = graph.nodes.map((node) => {
		const point = layout.positions.get(node.slug);
		return {
			slug: node.slug,
			name: node.project.name,
			tagline: node.project.tagline,
			status: node.project.status,
			kind: node.project.kind,
			hub: hubSlugs.has(node.slug),
			labelled: labelled.has(node.slug),
			lastCommit: node.project.lastCommit ?? null,
			commits: node.project.metrics?.commits ?? null,
			linesOfCode: node.project.metrics?.linesOfCode ?? null,
			x: point?.x ?? layout.width / 2,
			y: point?.y ?? layout.height / 2
		};
	});

	return {
		nodes,
		edges: graph.edges,
		sharedEdges,
		size: layout.width
	};
}
