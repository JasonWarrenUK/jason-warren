import type { Project } from '../types.js';

export const kamino: Project = {
	slug: 'kamino',
	name: 'Kamino',
	tagline:
		'A universal project template for apprenticeship work: Claude Code config, git hooks for KSB evidence extraction, docs scaffolding, and a /project/init command that wires everything up.',
	description:
		'A universal project template that serves as the starting point for apprenticeship work, with stack-agnostic Claude Code config that clones cleanly via degit. The value is in the automation: a post-commit hook auto-extracts KSB (Knowledge, Skills, Behaviours) portfolio evidence from commit messages, a docs hook reminds you to sync documentation when source changes, and a pre-push hook validates that tests pass before any remote push. The interactive /project/init skill ties it together, scaffolding MCP server connections, a roadmap, and the first ADR.',
	kind: 'tool',
	contribution: { role: 'solo' },
	status: 'finished',
	repoUrl: 'https://github.com/JasonWarrenUK/kamino',
	highlights: [
		'Post-commit hook auto-extracts KSB portfolio evidence from commit messages.',
		'post-commit-docs hook reminds to sync documentation when source changes.',
		'pre-push hook validates tests pass before remote pushes.',
		'/project/init interactive skill: scaffolds MCP servers, roadmap, first ADR.',
		'Degit-cloneable template with stack-agnostic Claude Code config.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'Shell', kind: 'language' },
		{ label: 'Claude Code', kind: 'ai' },
		{ label: 'Developer Tooling', kind: 'concept' }
	],
	lastCommit: '2026-01-09',
	metrics: {
		commits: 1
	}
};
