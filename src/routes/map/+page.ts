import {
	getProjectGraph,
	getSharedTechEdges,
	getThemeEdges,
	computeForceLayout,
	computeStackLayout,
	selectLabelledSlugs,
	getHubSlugs,
	getStackGroups
} from '$lib/data/graph.js';
import { getTechNodes, getTechCoEdges, computeTechLayout } from '$lib/data/tech-graph.js';
import { techRelationships } from '$lib/data/tech-relationships.js';
import { themes } from '$lib/data/themes.js';

export function load() {
	const graph = getProjectGraph();
	const sharedEdges = getSharedTechEdges();
	const themeEdges = getThemeEdges();
	const labelled = selectLabelledSlugs();
	const hubSlugs = getHubSlugs();

	// Build tech-graph data for the Technologies mode.
	const techNodes = getTechNodes();
	const techCoEdges = getTechCoEdges();

	// Relationships mode: curated + theme edges drive the layout.
	const relationshipsLayout = computeForceLayout(graph, themeEdges);
	// Stack mode: shared-tech edges are the primary clustering signal.
	const stackLayout = computeStackLayout(graph, sharedEdges);
	// Technologies mode: tech nodes, co-occurrence edges.
	const techLayout = computeTechLayout(techNodes, techCoEdges, techRelationships);

	// Flatten each graph node into the MapNode shape, once per project mode.
	const toNodes = (layout: typeof relationshipsLayout) =>
		graph.nodes.map((node) => {
			const point = layout.positions.get(node.slug);
			return {
				slug: node.slug,
				name: node.project.name,
				tagline: node.project.tagline,
				track: node.project.track,
				progress: node.project.progress,
				released: node.project.released,
				retired: node.project.retired,
				deployed: node.project.deployed,
				stageProvisional: !node.project.trackAuthored,
				kind: node.project.kind,
				tags: node.project.tags,
				hub: hubSlugs.has(node.slug),
				labelled: labelled.has(node.slug),
				commitAnyLast: node.project.commitAnyLast ?? null,
				commitsAny: node.project.metrics?.commitsAny ?? null,
				linesAny: node.project.metrics?.linesAny ?? null,
				x: point?.x ?? layout.width / 2,
				y: point?.y ?? layout.height / 2
			};
		});

	// Flatten tech nodes with their baked layout positions.
	const toTechNodes = (layout: typeof techLayout) =>
		techNodes.map((node) => {
			const point = layout.positions.get(node.label);
			return {
				label: node.label,
				kind: node.kind,
				projectCount: node.projectCount,
				x: point?.x ?? layout.width / 2,
				y: point?.y ?? layout.height / 2
			};
		});

	// Territory membership for the relationships-mode hulls: id/name/slugs
	// only — the hull itself is computed client-side from live node positions.
	const territories = themes.map((theme) => ({
		id: theme.id,
		name: theme.name,
		slugs: theme.slugs
	}));

	// Stack-mode cluster grouping: each project's dominant tech category, so the
	// stack graph can anchor by shared technology the way relationships anchors by theme.
	const stackGroups = Array.from(getStackGroups(), ([slug, category]) => ({ slug, category }));

	return {
		relationshipsNodes: toNodes(relationshipsLayout),
		stackNodes: toNodes(stackLayout),
		techNodes: toTechNodes(techLayout),
		edges: graph.edges,
		sharedEdges,
		themeEdges,
		techCoEdges,
		territories,
		stackGroups,
		size: relationshipsLayout.width
	};
}
