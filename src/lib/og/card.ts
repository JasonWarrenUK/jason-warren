/**
 * Open Graph card renderer. Produces a 1200x630 PNG from a procedurally
 * generated template using satori (layout to SVG) and resvg (SVG to PNG).
 * Runs only at build time, since the OG endpoint is prerendered, so reading
 * the bundled fonts off disk is safe.
 *
 * The card is a deterministic graphic, not prose. Four project dimensions
 * each drive one visual variable:
 *   - background colour  ← project kind
 *   - language glyphs     ← one per curated language tag (the significance gate)
 *   - background geometry ← runtime (a categorical archetype)
 *   - the name's typeface  ← data/persistence model (a categorical archetype)
 *
 * Identical input always yields an identical PNG, so the prerendered cards are
 * reproducible across builds.
 *
 * Language glyph paths come from simple-icons (CC0-1.0, public domain).
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
	siTypescript,
	siJavascript,
	siPython,
	siGo,
	siRust,
	siSharp,
	siGnubash,
	siCss,
	siHtml5,
	siC,
	siCplusplus,
	siLua,
	siKotlin,
	siSwift,
	siRuby,
	siPhp,
	siElixir,
	siHaskell,
	siScala,
	siDart,
	siZig,
	siOcaml,
	siR,
	siJulia
} from 'simple-icons';
import type { Project, ProjectKind } from '$lib/data/types.js';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Fonts. Inter carries the eyebrow/footer; the project name is set in a face
// chosen by data model (see dataModelFont).
// ---------------------------------------------------------------------------

function loadFont(pkg: string, file: string): Buffer {
	return readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`));
}

const fonts = [
	{
		name: 'Inter',
		data: loadFont('inter', 'inter-latin-400-normal.woff'),
		weight: 400,
		style: 'normal'
	},
	{
		name: 'Inter',
		data: loadFont('inter', 'inter-latin-700-normal.woff'),
		weight: 700,
		style: 'normal'
	},
	{
		name: 'IBM Plex Sans',
		data: loadFont('ibm-plex-sans', 'ibm-plex-sans-latin-700-normal.woff'),
		weight: 700,
		style: 'normal'
	},
	// Source Serif 4 is the Atlas display face; satori needs a static woff, so
	// this reads the non-variable @fontsource/source-serif-4 at build time (the
	// browser still gets the variable package via the root layout). Two
	// treatments — upright 700 and italic 600 — carry two data models below.
	{
		name: 'Source Serif 4',
		data: loadFont('source-serif-4', 'source-serif-4-latin-700-normal.woff'),
		weight: 700,
		style: 'normal'
	},
	{
		name: 'Source Serif 4',
		data: loadFont('source-serif-4', 'source-serif-4-latin-600-italic.woff'),
		weight: 600,
		style: 'italic'
	},
	{
		name: 'JetBrains Mono',
		data: loadFont('jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff'),
		weight: 700,
		style: 'normal'
	},
	{
		name: 'JetBrains Mono',
		data: loadFont('jetbrains-mono', 'jetbrains-mono-latin-700-italic.woff'),
		weight: 700,
		style: 'italic'
	}
] as const;

const WIDTH = 1200;
const HEIGHT = 630;

// ---------------------------------------------------------------------------
// Dimension 1: background colour ← project kind.
// Each entry pairs a dark background with a vivid, complementary accent used
// for the language glyph and the background geometry, so every card reads as
// one cohesive, legible scheme.
// ---------------------------------------------------------------------------

interface Palette {
	bg: string;
	accent: string;
}

const INK = '#f4f6fb';

const kindPalette: Record<ProjectKind, Palette> = {
	app: { bg: '#0c1626', accent: '#5b9dff' },
	game: { bg: '#1a0f24', accent: '#c084fc' },
	website: { bg: '#07211d', accent: '#2dd4bf' },
	toy: { bg: '#241603', accent: '#fbbf24' },
	library: { bg: '#06231a', accent: '#34d399' },
	tool: { bg: '#240f16', accent: '#fb7185' },
	tui: { bg: '#0f1908', accent: '#a3e635' },
	// Neutral dark background for repos that haven't been editorially categorised yet.
	repo: { bg: '#13171d', accent: '#8aa0b8' }
};

const defaultPalette: Palette = { bg: '#11161f', accent: '#6ea8ff' };

const kindLabel: Record<ProjectKind, string> = {
	app: 'App',
	game: 'Game',
	website: 'Website',
	toy: 'Toy',
	library: 'Library',
	tool: 'Tool',
	tui: 'TUI',
	repo: 'Repo'
};

// ---------------------------------------------------------------------------
// Dimension 2: one glyph per language tag (the significance gate).
// The curated `language` tags select which of a repo's many languages are worth
// surfacing; each maps to a filled glyph, rendered as a row on the card.
// ---------------------------------------------------------------------------

/**
 * Filled 24x24 glyph path per language label. Keyed by the canonical tag-label
 * spelling. Covers the registry's curated languages plus the wider vocabulary
 * curation may add; anything unmapped falls back to the angle-brackets glyph.
 */
const languageIcon: Record<string, string> = {
	TypeScript: siTypescript.path,
	JavaScript: siJavascript.path,
	Python: siPython.path,
	Go: siGo.path,
	Rust: siRust.path,
	// No CC0 C# brand mark exists; the musical sharp is an apt, on-brand stand-in.
	'C#': siSharp.path,
	Shell: siGnubash.path,
	CSS: siCss.path,
	HTML: siHtml5.path,
	C: siC.path,
	'C++': siCplusplus.path,
	Lua: siLua.path,
	Kotlin: siKotlin.path,
	Swift: siSwift.path,
	Ruby: siRuby.path,
	PHP: siPhp.path,
	Elixir: siElixir.path,
	Haskell: siHaskell.path,
	Scala: siScala.path,
	Dart: siDart.path,
	Zig: siZig.path,
	OCaml: siOcaml.path,
	R: siR.path,
	Julia: siJulia.path
};

/** How many language glyphs the card shows before stopping, to avoid clutter. */
const MAX_LANGUAGE_GLYPHS = 5;

// Generic angle-brackets fallback. Every project has a covered language, so
// this is only a safety net.
const fallbackIcon =
	'M8.6 5.4 3 11l5.6 5.6 1.5-1.5L5.9 11l4.2-4.1zm6.8 0-1.5 1.5L18.1 11l-4.2 4.1 1.5 1.5L21 11z';

// ---------------------------------------------------------------------------
// Dimension 4: the name's typeface ← data/persistence model.
// A project may carry several data tags; precedence picks the single face,
// most distinctive first.
// ---------------------------------------------------------------------------

type DataModel = 'graph' | 'document' | 'vector' | 'relational' | 'ephemeral' | 'none';

const dataModelOrder: DataModel[] = [
	'graph',
	'document',
	'vector',
	'relational',
	'ephemeral',
	'none'
];

/** One name typeface treatment: family + weight + style, resolved by satori. */
interface FontTreatment {
	family: string;
	weight: number;
	style: 'normal' | 'italic';
}

/**
 * Data model → name typeface. Five distinguishable treatments across the three
 * Atlas faces (Source Serif 4, JetBrains Mono, IBM Plex Sans), split by
 * weight/style so each model still reads as its own mark:
 *   - graph      → serif italic  (the most distinctive; echoes the graph views'
 *                  italic-serif territory names)
 *   - relational → serif upright (structured, persistent)
 *   - document   → mono upright  (data-shaped)
 *   - vector     → mono italic   (data-shaped sibling)
 *   - ephemeral/none → sans      (the plain default)
 */
const dataModelFont: Record<DataModel, FontTreatment> = {
	graph: { family: 'Source Serif 4', weight: 600, style: 'italic' },
	document: { family: 'JetBrains Mono', weight: 700, style: 'normal' },
	vector: { family: 'JetBrains Mono', weight: 700, style: 'italic' },
	relational: { family: 'Source Serif 4', weight: 700, style: 'normal' },
	ephemeral: { family: 'IBM Plex Sans', weight: 700, style: 'normal' },
	none: { family: 'IBM Plex Sans', weight: 700, style: 'normal' }
};

/** Classify one data-tag label into a model class. */
function classifyDataLabel(label: string): DataModel | null {
	const l = label.toLowerCase();
	if (
		l.includes('neo4j') ||
		l.includes('cypher') ||
		(l.includes('graph') && !l.includes('graphql'))
	) {
		return 'graph';
	}
	if (l.includes('document') || l.includes('json') || l.includes('rxdb')) return 'document';
	if (l.includes('vector') || l.includes('pgvector')) return 'vector';
	if (
		l.includes('postgres') ||
		l.includes('supabase') ||
		l.includes('entity framework') ||
		l.includes('relational') ||
		l.includes('sql')
	) {
		return 'relational';
	}
	if (l.includes('ephemeral') || l.includes('in-memory')) return 'ephemeral';
	if (l.includes('no persistence')) return 'none';
	return null;
}

/** The project's resolved data model, by precedence over its data tags. */
function getDataModel(project: Project): DataModel {
	const models = new Set<DataModel>();
	for (const tag of project.tags) {
		if (tag.kind !== 'data') continue;
		const model = classifyDataLabel(tag.label);
		if (model) models.add(model);
	}
	return dataModelOrder.find((m) => models.has(m)) ?? 'none';
}

/** Every curated language label, in tag order: the gate the card renders. */
function getLanguages(project: Project): string[] {
	return project.tags.filter((t) => t.kind === 'language').map((t) => t.label);
}

function getRuntime(project: Project): string | undefined {
	return project.tags.find((t) => t.kind === 'runtime')?.label;
}

// ---------------------------------------------------------------------------
// Dimension 3: background geometry ← runtime (categorical archetype).
// The runtime selects a motif; a slug-seeded hash rotates and offsets it for
// per-card uniqueness while staying deterministic.
// ---------------------------------------------------------------------------

type Archetype = 'bun' | 'deno' | 'node' | 'python' | 'go' | 'dotnet' | 'shell' | 'dot';

function runtimeArchetype(runtime: string | undefined): Archetype {
	if (!runtime) return 'dot';
	const r = runtime.toLowerCase();
	if (r.includes('bun')) return 'bun';
	if (r.includes('deno')) return 'deno';
	if (r.includes('node')) return 'node';
	if (r.includes('python')) return 'python';
	if (r === 'go') return 'go';
	if (r.includes('.net') || r.includes('dotnet')) return 'dotnet';
	if (r.includes('shell') || r.includes('posix') || r.includes('bash')) return 'shell';
	return 'dot';
}

/** Deterministic 32-bit string hash. */
function hash(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** One motif cell centred at (cx, cy) with radius r, as an SVG fragment. */
function cell(archetype: Archetype, cx: number, cy: number, r: number): string {
	switch (archetype) {
		case 'bun': {
			const pts = Array.from({ length: 6 }, (_, i) => {
				const a = (Math.PI / 3) * i - Math.PI / 6;
				return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
			});
			return `<polygon points="${pts.join(' ')}" fill="none" />`;
		}
		case 'deno':
			return [r, r * 0.62, r * 0.28]
				.map((rr) => `<circle cx="${cx}" cy="${cy}" r="${rr.toFixed(1)}" fill="none" />`)
				.join('');
		case 'node': {
			const pts = Array.from({ length: 3 }, (_, i) => {
				const a = ((2 * Math.PI) / 3) * i - Math.PI / 2;
				return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
			});
			return `<polygon points="${pts.join(' ')}" fill="none" />`;
		}
		case 'python': {
			const o = r * 0.42;
			return (
				`<circle cx="${(cx - o).toFixed(1)}" cy="${cy}" r="${(r * 0.7).toFixed(1)}" fill="none" />` +
				`<circle cx="${(cx + o).toFixed(1)}" cy="${cy}" r="${(r * 0.7).toFixed(1)}" fill="none" />`
			);
		}
		case 'go': {
			const s = r * 1.3;
			return `<rect x="${(cx - s / 2).toFixed(1)}" y="${(cy - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(r * 0.32).toFixed(1)}" fill="none" />`;
		}
		case 'dotnet': {
			const pts = [
				`${cx},${(cy - r).toFixed(1)}`,
				`${(cx + r).toFixed(1)},${cy}`,
				`${cx},${(cy + r).toFixed(1)}`,
				`${(cx - r).toFixed(1)},${cy}`
			];
			return `<polygon points="${pts.join(' ')}" fill="none" />`;
		}
		case 'shell': {
			const w = r * 0.7;
			return `<polyline points="${(cx - w).toFixed(1)},${(cy - r * 0.7).toFixed(1)} ${(cx + w * 0.4).toFixed(1)},${cy} ${(cx - w).toFixed(1)},${(cy + r * 0.7).toFixed(1)}" fill="none" /><line x1="${(cx + w * 0.2).toFixed(1)}" y1="${(cy + r * 0.7).toFixed(1)}" x2="${(cx + w).toFixed(1)}" y2="${(cy + r * 0.7).toFixed(1)}" />`;
		}
		case 'dot':
		default:
			return `<circle cx="${cx}" cy="${cy}" r="${(r * 0.32).toFixed(1)}" fill="${'currentColor'}" stroke="none" />`;
	}
}

/** Build the full-canvas motif as a base64 SVG data URI. */
function motifDataUri(archetype: Archetype, accent: string, seed: number): string {
	const step = 132;
	const r = step * 0.34;
	const phase = seed % step;
	const angle = (seed % 360) - 180;

	const cells: string[] = [];
	for (let y = -step + (phase % step); y < HEIGHT + step; y += step) {
		for (let x = -step + (phase % step); x < WIDTH + step; x += step) {
			cells.push(cell(archetype, x, y, r));
		}
	}

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
		`<g transform="rotate(${angle} ${WIDTH / 2} ${HEIGHT / 2})" stroke="${accent}" stroke-width="2.2" color="${accent}" opacity="0.13">` +
		cells.join('') +
		`</g></svg>`;

	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** A single language glyph as a tinted base64 SVG data URI. */
function iconDataUri(path: string, colour: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${colour}"><path d="${path}"/></svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Card model
// ---------------------------------------------------------------------------

export interface OgCard {
	/** Small uppercase eyebrow, e.g. the kind label or "Developer". */
	eyebrow: string;
	/** Large heading: the project or site name. */
	title: string;
	/** Project kind, drives the palette. Omitted for the default site card. */
	kind?: ProjectKind;
	/** Curated language labels, one glyph each. */
	languages?: string[];
	/** Runtime label, drives the background geometry. */
	runtime?: string;
	/** Resolved data model, drives the name typeface. */
	dataModel?: DataModel;
	/** Stable seed for the geometry; the slug for projects. */
	seed: string;
}

/** Derive an OgCard from a project. */
export function projectToOgCard(project: Project): OgCard {
	return {
		eyebrow: kindLabel[project.kind],
		title: project.name,
		kind: project.kind,
		languages: getLanguages(project),
		runtime: getRuntime(project),
		dataModel: getDataModel(project),
		seed: project.slug
	};
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export async function renderOgCard(card: OgCard): Promise<Buffer> {
	const palette = card.kind ? kindPalette[card.kind] : defaultPalette;
	const seed = hash(card.seed);
	const archetype = runtimeArchetype(card.runtime);
	const nameTreatment = dataModelFont[card.dataModel ?? 'none'];
	const iconPaths = (card.languages ?? [])
		.slice(0, MAX_LANGUAGE_GLYPHS)
		.map((language) => languageIcon[language] ?? fallbackIcon);

	const svg = await satori(
		{
			type: 'div',
			props: {
				style: {
					position: 'relative',
					width: '100%',
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
					padding: '80px',
					background: palette.bg,
					color: INK,
					fontFamily: 'Inter'
				},
				children: [
					// Procedural background geometry (runtime archetype).
					{
						type: 'img',
						props: {
							src: motifDataUri(archetype, palette.accent, seed),
							width: WIDTH,
							height: HEIGHT,
							style: { position: 'absolute', top: 0, left: 0 }
						}
					},
					// Eyebrow (kind label).
					{
						type: 'div',
						props: {
							style: {
								fontSize: 28,
								fontWeight: 700,
								letterSpacing: '0.14em',
								textTransform: 'uppercase',
								color: palette.accent
							},
							children: card.eyebrow
						}
					},
					// Name, set in the data-model typeface.
					{
						type: 'div',
						props: {
							style: { display: 'flex', flexDirection: 'column' },
							children: {
								type: 'div',
								props: {
									style: {
										fontSize: 92,
										fontWeight: nameTreatment.weight,
										fontStyle: nameTreatment.style,
										lineHeight: 1.05,
										fontFamily: nameTreatment.family
									},
									children: card.title
								}
							}
						}
					},
					// Footer: signature + language glyph.
					{
						type: 'div',
						props: {
							style: {
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between'
							},
							children: [
								// The signature is redundant on the author's own card,
								// where the title is already the name.
								{
									type: 'div',
									props: {
										style: { fontSize: 28, fontWeight: 700, color: INK },
										children: card.kind ? 'Jason Warren' : ''
									}
								},
								// One glyph per curated language, right-aligned.
								{
									type: 'div',
									props: {
										style: { display: 'flex', alignItems: 'center', gap: '20px' },
										children: iconPaths.map((path) => ({
											type: 'img',
											props: {
												src: iconDataUri(path, palette.accent),
												width: 64,
												height: 64
											}
										}))
									}
								}
							]
						}
					}
				]
			}
		},
		{ width: WIDTH, height: HEIGHT, fonts: fonts as never }
	);

	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
	return Buffer.from(resvg.render().asPng());
}
