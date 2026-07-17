import type { AuthoredProject } from '../types.js';

export const psyche: AuthoredProject = {
	slug: 'psyche',
	tagline:
		'A turn-based psychology RPG with no HP or stats: character is six personality attributes on 0-100 scales, each dysfunctional at both extremes.',
	blurb: 'A turn-based psychology RPG defined entirely by personality attributes.',
	description:
		"Psyche uses six personality attributes (Self-Assurance, Compassion, Ambition, Drive, Discernment, Bravery), each a 0-100 scale where both extremes are dysfunctional and balance sits around 50, rather than the hit points and strength scores most RPGs use. Narrative content is driven by a quality-based storylet engine (Emily Short's QBN model): at each step, the engine filters all storylets whose prerequisites match the current character state, orders them by priority with randomised tie-breaking, presents up to five, then applies effects and marks the chosen storylet played. Prerequisites and effects use a polymorphic interface system (attribute requirements, quality requirements, compound AND/OR logic, storylet-chaining) with JSONC-authored content deserialised through a custom polymorphic converter into a repository. The suite covers 63 storylets and an xUnit test suite spanning prerequisites, effects, the JSON repository and integration walkthroughs.",
	kind: 'app',
	contribution: { role: 'solo' },
	track: 'exploration',
	progress: 'complete',
	archived: true,
	highlights: [
		'Six-attribute personality model (Self-Assurance, Compassion, Ambition, Drive, Discernment, Bravery): no HP, no stats, both extremes dysfunctional.',
		'Quality-based-narrative storylet engine: filter by prerequisites, priority with randomised tie-breaking, apply effects, mark played.',
		'Polymorphic IPrerequisite/IEffect system: attribute/quality requirements, compound AND/OR logic, storylet-chaining.',
		'JSONC-authored content with a custom polymorphic deserialiser mapping type-discriminated JSON back to concrete C# classes.',
		'63 storylets and an xUnit suite spanning models, prerequisites, effects, the JSON repository, and end-to-end integration.'
	],
	relationships: [],
	tags: [{ label: 'Document / JSON', kind: 'data' }]
};
