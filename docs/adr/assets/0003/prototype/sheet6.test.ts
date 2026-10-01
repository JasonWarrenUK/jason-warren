import { test } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { getBySlug } from '$lib/data/queries.js';
import type { ProjectSlug } from '$lib/data/types.js';
import { projectToOgCard, renderAtlasCard, type AtlasOptions, type OgCard } from './proto.js';

const SLUGS = (
	process.env.SLUGS ??
	'cogni,kitchen-gremlin,commons-traybake,code-arcana,the-work,those-who-came-before,redot'
).split(',');
// Each combo: layout-glyphs-ink
const COMBOS = (
	process.env.COMBOS ??
	'stack-tiles-oxide,plate-tiles-oxide,plate-subtle-oxide,plate-labels-oxide,plate-labels-stage,plate-labels-seeded'
).split(',');

test('sheet6', async () => {
	const out = process.env.OUT!;
	for (const combo of COMBOS) {
		const [layout, glyphs, ink] = combo.split('-') as [
			AtlasOptions['layout'],
			AtlasOptions['glyphs'],
			AtlasOptions['ink']
		];
		mkdirSync(`${out}/${combo}`, { recursive: true });
		const cards: [string, OgCard][] = [
			...SLUGS.map((s) => [s, projectToOgCard(getBySlug(s as ProjectSlug)!)] as [string, OgCard]),
			['default', { eyebrow: 'Developer', title: 'Jason Warren', seed: 'jason-warren' }]
		];
		for (const [name, card] of cards) {
			writeFileSync(
				`${out}/${combo}/${name}.png`,
				await renderAtlasCard(card, { layout, glyphs, ink })
			);
		}
	}
}, 900000);
