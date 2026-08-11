import type { AuthoredProject } from '../types.js';

export const cogni: AuthoredProject = {
	slug: 'cogni',
	tagline:
		'A developer cognition self-assessment: map your style across 17 two-axis compasses, then see which methodologies (TDD, Shape Up, Kanban…) fit you and why.',
	blurb: 'A self-assessment that maps your developer style to methodologies.',
	description:
		'Most advice on choosing a methodology ignores how the person actually thinks, so this maps developer cognition first. Seventeen two-axis compasses, organised across three tiers, capture style choices like risk tolerance, collaboration, and abstraction preference, with constraint propagation crosshatching any quadrant that would contradict a position already set. From that profile it evaluates more than ten methodologies (TDD, Scrum, Shape Up, Kanban, XP and others), explaining per-methodology why each one fits or causes friction, and exports the result as portable Markdown for 1:1s, job evaluations and retrospectives.',
	kind: 'app',
	highlights: [
		'17 two-axis compasses organised in three tiers; constraint propagation crosshatches quadrants that would contradict already-set positions.',
		'10+ methodology evaluations (TDD, Scrum, Shape Up, Kanban, XP, etc.) with per-methodology friction explanations.',
		'Core logic (constraint propagation, method evaluation, profile synthesis, import/export) covered by Vitest unit tests.',
		'Export as portable Markdown for use in 1:1s, job evaluations, and retrospectives; localStorage persistence between sessions.',
		'Constraint propagation: selecting a position in one compass crosshatches incompatible quadrants in correlated compasses, preventing contradictory profiles.'
	],
	relationships: [],
	tags: [
		{ label: 'Vitest', kind: 'tool' },
		{ label: 'Document / JSON', kind: 'data' }
	]
};
