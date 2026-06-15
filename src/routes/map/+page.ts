import { getProjectGraph, computeLayout } from '$lib/data/graph.js';

export function load() {
	const graph = getProjectGraph();
	const layout = computeLayout(graph);

	const nodes = graph.nodes.map((node) => {
		const point = layout.positions.get(node.slug);
		return {
			slug: node.slug,
			name: node.project.name,
			tagline: node.project.tagline,
			status: node.project.status,
			kind: node.project.kind,
			flagship: node.project.flagship === true,
			x: point?.x ?? layout.width / 2,
			y: point?.y ?? layout.height / 2
		};
	});

	return {
		nodes,
		edges: graph.edges,
		size: layout.width
	};
}
