import type { Project } from '../types.js';

export const kitchenGremlin: Project = {
	slug: 'kitchen-gremlin',
	name: 'Kitchen Gremlin',
	tagline: 'A TypeScript monorepo. Under active construction.',
	description:
		'A TypeScript monorepo under active construction, organised into apps/ and packages/ workspaces. It is configured with ESLint, TypeScript, and Bun workspaces, with more to follow as the project takes shape.',
	kind: 'app',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/kitchen-gremlin',
	highlights: [
		'TypeScript monorepo with apps/ and packages/ workspaces.',
		'Configured with ESLint, TypeScript, and Bun workspaces.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'Monorepo', kind: 'tool' },
		{ label: 'No persistence', kind: 'data' }
	],
	lastCommit: '2026-04-28',
	metrics: {
		commits: 18
	}
};
