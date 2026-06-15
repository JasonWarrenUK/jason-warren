/**
 * Open Graph card renderer. Produces a 1200x630 PNG from a small, fixed
 * template using satori (layout to SVG) and resvg (SVG to PNG). Runs only at
 * build time, since the OG endpoint is prerendered, so reading the bundled
 * Inter fonts off disk is safe.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadFont(file: string): Buffer {
	return readFileSync(require.resolve(`@fontsource/inter/files/${file}`));
}

const fontRegular = loadFont('inter-latin-400-normal.woff');
const fontBold = loadFont('inter-latin-700-normal.woff');

export interface OgCard {
	/** Large heading, e.g. the project name or the site name. */
	title: string;
	/** Supporting line, e.g. the tagline. */
	subtitle: string;
	/** Small uppercase eyebrow, e.g. "Project" or the section. */
	eyebrow: string;
}

const WIDTH = 1200;
const HEIGHT = 630;

export async function renderOgCard(card: OgCard): Promise<Buffer> {
	const svg = await satori(
		{
			type: 'div',
			props: {
				style: {
					width: '100%',
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
					padding: '80px',
					background: '#11161f',
					color: '#f4f6fb',
					fontFamily: 'Inter'
				},
				children: [
					{
						type: 'div',
						props: {
							style: {
								fontSize: 28,
								fontWeight: 700,
								letterSpacing: '0.12em',
								textTransform: 'uppercase',
								color: '#6ea8ff'
							},
							children: card.eyebrow
						}
					},
					{
						type: 'div',
						props: {
							style: { display: 'flex', flexDirection: 'column', gap: '24px' },
							children: [
								{
									type: 'div',
									props: {
										style: { fontSize: 76, fontWeight: 700, lineHeight: 1.05 },
										children: card.title
									}
								},
								{
									type: 'div',
									props: {
										style: { fontSize: 36, lineHeight: 1.35, color: '#aeb9cc' },
										children: card.subtitle
									}
								}
							]
						}
					},
					{
						type: 'div',
						props: {
							style: { fontSize: 28, fontWeight: 700, color: '#f4f6fb' },
							children: 'Jason Warren'
						}
					}
				]
			}
		},
		{
			width: WIDTH,
			height: HEIGHT,
			fonts: [
				{ name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
				{ name: 'Inter', data: fontBold, weight: 700, style: 'normal' }
			]
		}
	);

	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
	return Buffer.from(resvg.render().asPng());
}
