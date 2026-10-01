import { test } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { getBySlug } from '$lib/data/queries.js';
import type { ProjectSlug } from '$lib/data/types.js';
import { projectToOgCard, renderOgCard, type Variant, type OgCard } from './proto.js';

const SLUGS = (
	process.env.SLUGS ?? 'cogni,rhea,kitchen-gremlin,beacons,nib,wyrd-tui,the-work'
).split(',');
const VARIANTS = (
	process.env.VARIANTS ?? 'baseline,visible,emblem,compound,atlas-light,atlas-dark'
).split(',') as Variant[];

test('sheet', async () => {
	const out = process.env.OUT!;
	for (const variant of VARIANTS) {
		mkdirSync(`${out}/${variant}`, { recursive: true });
		const cards: [string, OgCard][] = [
			...SLUGS.map((s) => [s, projectToOgCard(getBySlug(s as ProjectSlug)!)] as [string, OgCard]),
			['default', { eyebrow: 'Developer', title: 'Jason Warren', seed: 'jason-warren' }]
		];
		for (const [name, card] of cards) {
			writeFileSync(`${out}/${variant}/${name}.png`, await renderOgCard(card, variant));
		}
	}
}, 600000);
