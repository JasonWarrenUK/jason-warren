import type { Project } from '../types.js';

export const kitchenGremlin: Project = {
	slug: 'kitchen-gremlin',
	name: 'Kitchen Gremlin',
	tagline: 'A TypeScript monorepo. Under active construction.',
	description: '[Placeholder] A monorepo project. Details to follow as it takes shape.',
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
		{ label: 'Monorepo', kind: 'domain' }
	],
	metrics: {
		commits: 18
	}
};
