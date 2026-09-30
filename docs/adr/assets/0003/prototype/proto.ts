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
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '$lib/config.js';

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
	},
	// SPIKE: Atlas type roles (visual-direction.md §2).
	{
		name: 'Source Serif 4',
		data: loadFont('source-serif-4', 'source-serif-4-latin-600-normal.woff'),
		weight: 600,
		style: 'normal'
	},
	{
		name: 'Source Serif 4',
		data: loadFont('source-serif-4', 'source-serif-4-latin-500-normal.woff'),
		weight: 500,
		style: 'normal'
	},
	{
		name: 'IBM Plex Sans',
		data: loadFont('ibm-plex-sans', 'ibm-plex-sans-latin-500-normal.woff'),
		weight: 500,
		style: 'normal'
	},
	{
		name: 'IBM Plex Sans',
		data: loadFont('ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff'),
		weight: 600,
		style: 'normal'
	},
	{
		name: 'JetBrains Mono',
		data: loadFont('jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff'),
		weight: 500,
		style: 'normal'
	}
] as const;

const WIDTH = OG_IMAGE_WIDTH;
const HEIGHT = OG_IMAGE_HEIGHT;

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

// ---------------------------------------------------------------------------
// SPIKE: variant mechanics
// ---------------------------------------------------------------------------

export type Variant =
	| 'baseline'
	| 'visible'
	| 'emblem'
	| 'compound'
	| 'atlas-light'
	| 'atlas-dark'
	| 'emblem-light'
	| 'emblem-dark'
	| 'symbology-light'
	| 'symbology-dark'
	| 'combined-light'
	| 'combined-dark'
	| 'type-roles-light'
	| 'type-legend-light'
	| 'type-italic-light';

/** Seeded PRNG (mulberry32): deterministic per slug. */
function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const toUri = (svg: string): string =>
	`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** Fade mask: motif strongest on the right, clear behind the title on the left. */
const fadeDefs = `<defs><linearGradient id="f" x1="0" x2="1" y1="0" y2="0"><stop offset="0.15" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.75" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#f)"/></mask></defs>`;

/** V1: the same tiling, made legible (opacity, stroke) and faded away from the title. */
function visibleMotif(archetype: Archetype, accent: string, seed: number): string {
	const step = 132;
	const r = step * 0.34;
	const phase = seed % step;
	const angle = (seed % 360) - 180;
	const cells: string[] = [];
	for (let y = -step * 2 + phase; y < HEIGHT + step * 2; y += step) {
		for (let x = -step * 2 + phase; x < WIDTH + step * 2; x += step) {
			cells.push(cell(archetype, x, y, r));
		}
	}
	return toUri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${fadeDefs}<g mask="url(#m)"><g transform="rotate(${angle} ${WIDTH / 2} ${HEIGHT / 2})" stroke="${accent}" stroke-width="4" color="${accent}" opacity="0.42">${cells.join('')}</g></g></svg>`
	);
}

/** V2: one large emblem on the right, seeded scale, count and rotation. */
function emblemMotif(archetype: Archetype, accent: string, seed: number): string {
	const rand = prng(seed);
	const cx = WIDTH * (0.74 + rand() * 0.1);
	const cy = HEIGHT * (0.3 + rand() * 0.4);
	const count = 4 + Math.floor(rand() * 5);
	const base = 60 + rand() * 40;
	const growth = 1.28 + rand() * 0.2;
	const twist = rand() * 30 - 15;
	const layers: string[] = [];
	let r = base;
	for (let i = 0; i < count; i++) {
		layers.push(
			`<g transform="rotate(${(twist * i).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" opacity="${(0.75 - i * 0.07).toFixed(2)}">${cell(archetype === 'dot' ? 'deno' : archetype, cx, cy, r)}</g>`
		);
		r *= growth;
	}
	return toUri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><g stroke="${accent}" stroke-width="3.5" color="${accent}" fill="none" opacity="0.55">${layers.join('')}</g></svg>`
	);
}

/**
 * V3: runtime still picks the cell shape; the data model picks how cells
 * connect (graph: seeded edges; relational: ruled rows; document: stacked
 * offsets; ephemeral: dashed; none: isolated). Kind drives density.
 */
function compoundMotif(
	archetype: Archetype,
	model: DataModel,
	kind: ProjectKind | undefined,
	accent: string,
	seed: number
): string {
	const rand = prng(seed);
	const density: Record<string, number> = {
		app: 110,
		game: 150,
		tool: 96,
		library: 170,
		tui: 120,
		toy: 140,
		website: 130
	};
	const step = density[kind ?? 'app'] ?? 132;
	const r = step * 0.3;
	const pts: [number, number][] = [];
	for (let y = step / 2; y < HEIGHT + step; y += step) {
		for (
			let x = step / 2 + ((y / step) % 2) * (model === 'document' ? step / 2 : 0);
			x < WIDTH + step;
			x += step
		) {
			pts.push([x + (rand() - 0.5) * step * 0.25, y + (rand() - 0.5) * step * 0.25]);
		}
	}
	const links: string[] = [];
	if (model === 'graph') {
		for (const [x, y] of pts) {
			for (const [x2, y2] of pts) {
				const d = Math.hypot(x2 - x, y2 - y);
				if (d > 0 && d < step * 1.5 && rand() < 0.35 && x2 > x) {
					links.push(
						`<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`
					);
				}
			}
		}
	} else if (model === 'relational') {
		for (let y = step / 2; y < HEIGHT + step; y += step) {
			links.push(
				`<line x1="0" y1="${(y + step / 2).toFixed(1)}" x2="${WIDTH}" y2="${(y + step / 2).toFixed(1)}"/>`
			);
		}
	}
	const dash = model === 'ephemeral' ? ' stroke-dasharray="6 8"' : '';
	const shape = archetype === 'dot' ? 'deno' : archetype;
	return toUri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${fadeDefs}<g mask="url(#m)" stroke="${accent}" color="${accent}" fill="none" opacity="0.45"><g stroke-width="1.6" opacity="0.7">${links.join('')}</g><g stroke-width="3.5"${dash}>${pts.map(([x, y]) => cell(shape, x, y, r)).join('')}</g></g></svg>`
	);
}

/**
 * V4/V5: Atlas survey sheet. Graticule plus seeded contour lines (a
 * topographic "hill" per card), with the runtime drawn as a survey station
 * mark at the summit.
 */
function atlasMotif(
	archetype: Archetype,
	grid: string,
	contour: string,
	mark: string,
	seed: number
): string {
	const rand = prng(seed);
	const cx = WIDTH * (0.68 + rand() * 0.18);
	const cy = HEIGHT * (0.3 + rand() * 0.4);
	const harmonics = Array.from({ length: 4 }, (_, i) => ({
		k: i + 2,
		a: rand() * 0.14,
		p: rand() * Math.PI * 2
	}));
	const rings: string[] = [];
	for (let i = 1; i <= 11; i++) {
		const base = i * (34 + rand() * 4);
		const d: string[] = [];
		for (let s = 0; s <= 96; s++) {
			const t = (s / 96) * Math.PI * 2;
			const wobble =
				1 + harmonics.reduce((sum, h) => sum + h.a * Math.sin(h.k * t + h.p + i * 0.12), 0);
			const rr = base * wobble;
			d.push(
				`${s ? 'L' : 'M'}${(cx + rr * Math.cos(t)).toFixed(1)} ${(cy + rr * 0.8 * Math.sin(t)).toFixed(1)}`
			);
		}
		rings.push(`<path d="${d.join('')}Z" stroke-width="${i % 5 === 0 ? 2.4 : 1.2}"/>`);
	}
	const lines: string[] = [];
	for (let x = 0; x <= WIDTH; x += 100)
		lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}"/>`);
	for (let y = 15; y <= HEIGHT; y += 100)
		lines.push(`<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}"/>`);
	const station = cell(archetype === 'dot' ? 'deno' : archetype, cx, cy, 22);
	return toUri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${fadeDefs}<g stroke="${grid}" stroke-width="1" fill="none">${lines.join('')}</g><g mask="url(#m)" stroke="${contour}" fill="none">${rings.join('')}</g><g stroke="${mark}" color="${mark}" stroke-width="3.5" fill="none">${station}</g></svg>`
	);
}

/** Seeded regular polygon: the no-runtime fallback, so 'dot' cards stop matching. */
function seededPolygon(cx: number, cy: number, r: number, sides: number, turn: number): string {
	const pts = Array.from({ length: sides }, (_, i) => {
		const a = ((2 * Math.PI) / sides) * i + turn;
		return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
	});
	return `<polygon points="${pts.join(' ')}" fill="none" />`;
}

/** Nested emblem at (cx, cy): runtime shape, seeded count, growth and twist. */
function emblemAt(
	archetype: Archetype,
	cx: number,
	cy: number,
	rand: () => number,
	maxR: number
): string {
	const deno = archetype === 'deno';
	const count = deno ? 3 : 3 + Math.floor(rand() * 4);
	const growth = deno ? 1.75 : 1.35 + rand() * 0.2;
	const twist = rand() * 30 - 15;
	const sides = [5, 7, 8, 9][Math.floor(rand() * 4)];
	const turn = rand() * Math.PI;
	let r = 16 + rand() * 8;
	const layers: string[] = deno
		? [
				`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="currentColor" stroke="none" />`
			]
		: [];
	for (let i = 0; i < count && (i === 0 || r <= maxR); i++) {
		const shape =
			archetype === 'dot'
				? seededPolygon(cx, cy, r, sides, turn)
				: archetype === 'deno'
					? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" />`
					: cell(archetype, cx, cy, r);
		layers.push(
			`<g transform="rotate(${(twist * i).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})">${shape}</g>`
		);
		r *= growth;
	}
	return layers.join('');
}

interface ContourStyle {
	peaks: number;
	samples: number;
	wobble: number;
	square: boolean;
	dash?: string;
	doubled?: boolean;
	/** Short outward ticks on each ring: the cartographic hachure. */
	hachure?: boolean;
	/** Radial routes out from the summit. */
	spokes?: boolean;
}

/** Kind → contour symbology: the mark class carries kind, never the hue. */
const kindContour: Record<ProjectKind, ContourStyle> = {
	app: { peaks: 1, samples: 96, wobble: 1, square: false },
	game: { peaks: 2, samples: 96, wobble: 1, square: false },
	tool: { peaks: 1, samples: 7, wobble: 1, square: false },
	library: { peaks: 1, samples: 96, wobble: 0.35, square: false, hachure: true },
	tui: { peaks: 1, samples: 96, wobble: 0.4, square: true },
	toy: { peaks: 1, samples: 96, wobble: 1, square: false, dash: '0.1 9' },
	website: { peaks: 1, samples: 96, wobble: 1, square: false, spokes: true },
	repo: { peaks: 0, samples: 96, wobble: 1, square: false }
};

/** Contour rings round one or more seeded summits. */
function contours(
	style: ContourStyle,
	rand: () => number,
	minX: number
): { svg: string; summits: [number, number][] } {
	const clampX = (x: number): number => Math.min(WIDTH - 70, Math.max(minX, x));
	const summits: [number, number][] = Array.from({ length: style.peaks }, (_, p) => [
		style.peaks === 2
			? clampX(p === 0 ? minX : Math.max(minX + 230, WIDTH * 0.87))
			: clampX(WIDTH * (0.68 + rand() * 0.18)),
		HEIGHT * (style.peaks === 2 ? 0.3 + p * 0.4 : 0.3 + rand() * 0.4)
	]);
	return contoursAt(style, summits, rand);
}

/** Contour rings round the given summits. */
function contoursAt(
	style: ContourStyle,
	summits: [number, number][],
	rand: () => number
): { svg: string; summits: [number, number][] } {
	const rings: string[] = [];
	for (const [cx, cy] of summits) {
		const harmonics = Array.from({ length: 4 }, (_, i) => ({
			k: i + 2,
			a: rand() * 0.14 * style.wobble,
			p: rand() * Math.PI * 2
		}));
		const turn = rand() * Math.PI;
		const ringCount = style.peaks === 2 ? 7 : 11;
		for (let i = 1; i <= ringCount; i++) {
			const base = i * (34 + rand() * 4);
			const d: string[] = [];
			for (let s = 0; s <= style.samples; s++) {
				const t = (s / style.samples) * Math.PI * 2 + turn;
				const wobble =
					1 + harmonics.reduce((sum, h) => sum + h.a * Math.sin(h.k * t + h.p + i * 0.12), 0);
				// Superellipse for TUI: rectilinear contours, like a character grid.
				const c = Math.cos(t);
				const sn = Math.sin(t);
				const ex = style.square ? Math.sign(c) * Math.abs(c) ** 0.25 : c;
				const ey = style.square ? Math.sign(sn) * Math.abs(sn) ** 0.25 : sn;
				const rr = base * wobble;
				d.push(`${s ? 'L' : 'M'}${(cx + rr * ex).toFixed(1)} ${(cy + rr * 0.8 * ey).toFixed(1)}`);
			}
			const width = i % 5 === 0 ? 2.4 : 1.2;
			const dash = style.dash ? ` stroke-dasharray="${style.dash}" stroke-linecap="round"` : '';
			const strokeWidth = style.dash ? width * 2.2 : width;
			if (style.hachure && i % 2 === 1) {
				for (let s = 0; s < 96; s += 4) {
					const t = (s / 96) * Math.PI * 2 + turn;
					const wobble =
						1 + harmonics.reduce((sum, h) => sum + h.a * Math.sin(h.k * t + h.p + i * 0.12), 0);
					const r1 = base * wobble;
					const r2 = r1 + 12;
					rings.push(
						`<line x1="${(cx + r1 * Math.cos(t)).toFixed(1)}" y1="${(cy + r1 * 0.8 * Math.sin(t)).toFixed(1)}" x2="${(cx + r2 * Math.cos(t)).toFixed(1)}" y2="${(cy + r2 * 0.8 * Math.sin(t)).toFixed(1)}" stroke-width="1.4"/>`
					);
				}
			}
			rings.push(`<path d="${d.join('')}Z" stroke-width="${strokeWidth}"${dash}/>`);
			if (style.doubled && i % 2 === 0) {
				rings.push(
					`<path d="${d.join('')}Z" stroke-width="${width}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(0.94) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})"/>`
				);
			}
		}
	}
	if (style.spokes) {
		for (const [cx, cy] of summits) {
			const spokeCount = 5 + Math.floor(rand() * 3);
			for (let k = 0; k < spokeCount; k++) {
				const t = ((2 * Math.PI) / spokeCount) * k + rand() * 0.4;
				rings.push(
					`<line x1="${(cx + 40 * Math.cos(t)).toFixed(1)}" y1="${(cy + 40 * Math.sin(t)).toFixed(1)}" x2="${(cx + 900 * Math.cos(t)).toFixed(1)}" y2="${(cy + 900 * Math.sin(t)).toFixed(1)}" stroke-width="2.4" stroke-dasharray="18 6"/>`
				);
			}
		}
	}
	return { svg: rings.join(''), summits };
}

/** Round 2: the two Atlas treatments, sharing graticule and fade. */
function atlasRound2(
	mode: 'emblem' | 'symbology' | 'combined',
	archetype: Archetype,
	kind: ProjectKind | undefined,
	sheet: { grid: string; contour: string; oxide: string },
	seed: number,
	titleRight: number
): string {
	const rand = prng(seed);
	const style = mode === 'emblem' ? kindContour.app : kindContour[kind ?? 'repo'];
	// Keep summits clear of the title; emblems beside the title shrink to fit.
	const minX = Math.max(WIDTH * 0.66, titleRight + 90);
	const anchor: [number, number][] = [[Math.max(WIDTH * 0.78, minX), HEIGHT * 0.5]];
	const room = (x: number, y: number): number =>
		Math.abs(y - HEIGHT / 2) > 140 ? 170 : Math.max(26, x - titleRight - 28);
	const { svg: rings, summits } = contours(style, rand, minX);
	const lines: string[] = [];
	for (let x = 0; x <= WIDTH; x += 100)
		lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}"/>`);
	for (let y = 15; y <= HEIGHT; y += 100)
		lines.push(`<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}"/>`);
	const marks =
		mode !== 'symbology'
			? (summits.length ? summits : anchor)
					.map(([x, y]) => emblemAt(archetype, x, y, rand, room(x, y)))
					.join('')
			: (summits.length ? summits : [[WIDTH * 0.78, HEIGHT * 0.5] as [number, number]])
					.map(([x, y]) => cell(archetype === 'dot' ? 'deno' : archetype, x, y, 22))
					.join('');
	return toUri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${fadeDefs}<g stroke="${sheet.grid}" stroke-width="1" fill="none">${lines.join('')}</g><g mask="url(#m)" stroke="${sheet.contour}" fill="none">${rings}</g><g stroke="${sheet.oxide}" color="${sheet.oxide}" stroke-width="3.5" fill="none">${marks}</g></svg>`
	);
}

/** Atlas tokens, resolved from tokens.css mixes (oklab, 12% cinnamon). */
const atlas = {
	light: {
		bg: '#f7f6f6',
		text: '#25221f',
		grid: '#e2d5cc',
		contour: '#958981',
		ink: '#006dca',
		oxide: '#ac5c00'
	},
	dark: {
		bg: '#1e1c1c',
		text: '#f7f6f6',
		grid: '#2a2620',
		contour: '#958981',
		ink: '#0089fc',
		oxide: '#d57300'
	}
};

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
	/** SPIKE: stage inputs for the summit-ink experiment. */
	progress?: Project['progress'];
	released?: boolean;
	retired?: boolean;
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
		seed: project.slug,
		progress: project.progress,
		released: project.released,
		retired: project.retired
	};
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export async function renderOgCard(card: OgCard, variant: Variant = 'baseline'): Promise<Buffer> {
	const seed = hash(card.seed);
	const archetype = runtimeArchetype(card.runtime);
	const kindColours = card.kind ? kindPalette[card.kind] : defaultPalette;
	const sheet = variant.endsWith('-light')
		? atlas.light
		: variant.endsWith('-dark')
			? atlas.dark
			: null;
	// Estimated right edge of the title (80px padding, 92px type), capped at
	// the wrap width. Mono sets widest, serif narrowest.
	const typeMode = variant.startsWith('type-') ? variant.split('-')[1] : 'current';
	const atlasTitle: FontTreatment = {
		family: 'Source Serif 4',
		weight: 600,
		style: typeMode === 'italic' && card.dataModel === 'graph' ? 'italic' : 'normal'
	};
	const titleTreatment =
		typeMode === 'current' ? dataModelFont[card.dataModel ?? 'none'] : atlasTitle;
	const advance =
		titleTreatment.family === 'JetBrains Mono'
			? 0.6
			: titleTreatment.family === 'Source Serif 4'
				? 0.5
				: 0.55;
	const titleRight = Math.min(80 + card.title.length * 92 * advance, WIDTH - 80);
	const round2 = variant.startsWith('type-')
		? 'combined'
		: variant.startsWith('emblem-')
			? 'emblem'
			: variant.startsWith('symbology-')
				? 'symbology'
				: variant.startsWith('combined-')
					? 'combined'
					: null;
	const palette = sheet ? { bg: sheet.bg, accent: sheet.oxide } : kindColours;
	const INK = sheet ? sheet.text : '#f4f6fb';
	const glyphColour = sheet ? sheet.ink : palette.accent;
	const motif =
		round2 && sheet
			? atlasRound2(round2, archetype, card.kind, sheet, seed, titleRight)
			: variant === 'visible'
				? visibleMotif(archetype, palette.accent, seed)
				: variant === 'emblem'
					? emblemMotif(archetype, palette.accent, seed)
					: variant === 'compound'
						? compoundMotif(archetype, card.dataModel ?? 'none', card.kind, palette.accent, seed)
						: sheet
							? atlasMotif(archetype, sheet.grid, sheet.contour, sheet.oxide, seed)
							: motifDataUri(archetype, palette.accent, seed);
	const nameTreatment = titleTreatment;
	const atlasType = typeMode !== 'current';
	const modelLegend: Record<DataModel, string> = {
		graph: 'graph store',
		document: 'document store',
		vector: 'vector store',
		relational: 'relational',
		ephemeral: 'in-memory',
		none: 'no persistence'
	};
	const legend =
		card.kind && (typeMode === 'legend' || typeMode === 'italic')
			? [
					card.runtime && card.runtime !== 'None' ? card.runtime : 'no runtime',
					modelLegend[card.dataModel ?? 'none']
				].join('  ·  ')
			: '';
	const subtle = sheet === atlas.dark ? '#958981' : '#433d39';
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
					fontFamily: atlasType ? 'IBM Plex Sans' : 'Inter'
				},
				children: [
					// Procedural background geometry (runtime archetype).
					{
						type: 'img',
						props: {
							src: motif,
							width: WIDTH,
							height: HEIGHT,
							style: { position: 'absolute', top: 0, left: 0 }
						}
					},
					// Eyebrow (kind label).
					{
						type: 'div',
						props: {
							style: atlasType
								? {
										fontFamily: 'JetBrains Mono',
										fontSize: 24,
										fontWeight: 500,
										letterSpacing: '0.16em',
										textTransform: 'uppercase',
										color: palette.accent
									}
								: {
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
							children: [
								{
									type: 'div',
									props: {
										style: {
											fontSize: atlasType ? 96 : 92,
											fontWeight: nameTreatment.weight,
											fontStyle: nameTreatment.style,
											lineHeight: 1.05,
											...(atlasType ? { letterSpacing: '-0.015em' } : {}),
											fontFamily: nameTreatment.family
										},
										children: card.title
									}
								},
								...(legend
									? [
											{
												type: 'div',
												props: {
													style: {
														marginTop: 18,
														fontFamily: 'JetBrains Mono',
														fontSize: 24,
														fontWeight: 500,
														color: subtle
													},
													children: legend
												}
											}
										]
									: [])
							]
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
										style: atlasType
											? { fontSize: 26, fontWeight: 600, color: subtle }
											: { fontSize: 28, fontWeight: 700, color: INK },
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
												src: iconDataUri(path, glyphColour),
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

// ---------------------------------------------------------------------------
// SPIKE round 6: composition, language glyphs and summit ink, on the Atlas
// light sheet with Atlas type roles and a sized-up legend.
// ---------------------------------------------------------------------------

// @ts-expect-error: satori's opentype fork ships no types; spike only.
import * as opentype from '@shuding/opentype.js';

export interface AtlasOptions {
	layout: 'stack' | 'plate';
	glyphs: 'tiles' | 'subtle' | 'labels';
	ink: 'oxide' | 'stage' | 'seeded';
}

const serifBuffer = loadFont('source-serif-4', 'source-serif-4-latin-600-normal.woff');
const serifFace = opentype.parse(
	serifBuffer.buffer.slice(serifBuffer.byteOffset, serifBuffer.byteOffset + serifBuffer.byteLength)
);

/** Measured advance of the title, including the -0.015em tracking. */
function titleWidth(title: string, size: number): number {
	return serifFace.getAdvanceWidth(title, size) - title.length * size * 0.015;
}

/** Stage ink, the same resolution StageBadge uses: released wins, retired fades. */
function stageInk(card: OgCard): string {
	const inks = { 'in-progress': '#b01fe3', dormant: '#794aff', released: '#0061fc' };
	const faded = { 'in-progress': '#8e5e9a', dormant: '#7469a6', released: '#5670a5' };
	const key = card.released ? 'released' : (card.progress ?? 'dormant');
	return (card.retired ? faded : inks)[key];
}

/** Decorative: any census ink, picked by slug hash. Breaks the doctrine; here for comparison. */
const censusInks = ['#006dca', '#ac5c00', '#677600', '#de0051', '#b01fe3', '#794aff', '#0061fc'];

const modelLegendText: Record<DataModel, string> = {
	graph: 'graph store',
	document: 'document store',
	vector: 'vector store',
	relational: 'relational',
	ephemeral: 'in-memory',
	none: 'no persistence'
};

export async function renderAtlasCard(card: OgCard, opts: AtlasOptions): Promise<Buffer> {
	const sheet = atlas.light;
	const subtle = '#433d39';
	const seed = hash(card.seed);
	const rand = prng(seed);
	const archetype = runtimeArchetype(card.runtime);
	const plate = opts.layout === 'plate';
	const titleSize = 96;
	const maxTitle = plate ? 840 : WIDTH - 160;
	const measured = titleWidth(card.title, titleSize);
	const wraps = measured > maxTitle;
	const titleRight = 80 + Math.min(measured, maxTitle);
	// Where the title sits vertically: centred (stack) or low-left (plate).
	const titleY = plate ? HEIGHT - (wraps ? 250 : 200) : HEIGHT / 2;
	const inkColour =
		opts.ink === 'stage' && card.kind
			? stageInk(card)
			: opts.ink === 'seeded'
				? censusInks[seed % censusInks.length]
				: sheet.oxide;

	// Motif: kind contours + runtime emblem, placed clear of the title and the footer.
	const style = kindContour[card.kind ?? 'repo'];
	const minX = plate ? WIDTH * 0.62 : Math.max(WIDTH * 0.66, titleRight + 90);
	const yBand: [number, number] = plate ? [0.36, 0.52] : [0.3, 0.7];
	const clampX = (x: number): number => Math.min(WIDTH - 90, Math.max(minX, x));
	const summits: [number, number][] =
		style.peaks === 2
			? [
					[clampX(minX + 20), HEIGHT * yBand[0]],
					[clampX(Math.max(minX + 250, WIDTH * 0.88)), HEIGHT * (yBand[1] + 0.06)]
				]
			: style.peaks === 1
				? [
						[
							clampX(WIDTH * (0.7 + rand() * 0.16)),
							HEIGHT * (yBand[0] + rand() * (yBand[1] - yBand[0]))
						]
					]
				: [[clampX(WIDTH * 0.8), HEIGHT * ((yBand[0] + yBand[1]) / 2)]];
	const room = (x: number, y: number): number => {
		const besideTitle = Math.abs(y - titleY) < 150 ? x - titleRight - 40 : 170;
		const aboveFooter = HEIGHT - 150 - y;
		// Plate: keep the top band clear for the eyebrow and signature.
		const belowHeader = plate ? y - 130 : 170;
		return Math.max(
			26,
			Math.min(170, besideTitle, belowHeader, plate || opts.glyphs === 'labels' ? 170 : aboveFooter)
		);
	};
	const { svg: rings } = contoursAt(style, style.peaks ? summits : [], rand);
	const lines: string[] = [];
	for (let x = 0; x <= WIDTH; x += 100)
		lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}"/>`);
	for (let y = 15; y <= HEIGHT; y += 100)
		lines.push(`<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}"/>`);
	const marks = summits.map(([x, y]) => emblemAt(archetype, x, y, rand, room(x, y))).join('');
	const neatline = plate
		? `<rect x="28" y="28" width="${WIDTH - 56}" height="${HEIGHT - 56}" fill="none" stroke="${sheet.text}" stroke-width="2"/><rect x="36" y="36" width="${WIDTH - 72}" height="${HEIGHT - 72}" fill="none" stroke="${sheet.text}" stroke-width="0.8"/>`
		: '';
	const motif = toUri(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${fadeDefs}<g stroke="${sheet.grid}" stroke-width="1" fill="none">${lines.join('')}</g><g mask="url(#m)" stroke="${sheet.contour}" fill="none">${rings}</g><g stroke="${inkColour}" color="${inkColour}" stroke-width="3.5" fill="none">${marks}</g>${neatline}</svg>`
	);

	const languages = (card.languages ?? []).slice(
		0,
		opts.glyphs === 'labels' ? 4 : MAX_LANGUAGE_GLYPHS
	);
	const legendParts = card.kind
		? [
				card.runtime && card.runtime !== 'None' ? card.runtime : 'no runtime',
				modelLegendText[card.dataModel ?? 'none']
			]
		: [];
	const legendLines = [
		legendParts.join('  ·  '),
		opts.glyphs === 'labels' ? languages.join('  ·  ') : ''
	]
		.filter(Boolean)
		.map((text) => ({
			type: 'div',
			props: {
				style: {
					fontFamily: 'JetBrains Mono',
					fontSize: 30,
					fontWeight: 500,
					color: subtle,
					marginTop: 10
				},
				children: text
			}
		}));
	const glyphRow =
		opts.glyphs === 'labels'
			? null
			: {
					type: 'div',
					props: {
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: opts.glyphs === 'subtle' ? '16px' : '20px'
						},
						children: languages.map((language) => ({
							type: 'img',
							props: {
								src: iconDataUri(
									languageIcon[language] ?? fallbackIcon,
									opts.glyphs === 'subtle' ? subtle : sheet.ink
								),
								width: opts.glyphs === 'subtle' ? 44 : 64,
								height: opts.glyphs === 'subtle' ? 44 : 64
							}
						}))
					}
				};
	const eyebrow = {
		type: 'div',
		props: {
			style: {
				fontFamily: 'JetBrains Mono',
				fontSize: 28,
				fontWeight: 500,
				letterSpacing: '0.16em',
				textTransform: 'uppercase',
				color: sheet.oxide
			},
			children: card.eyebrow
		}
	};
	const signature = {
		type: 'div',
		props: {
			style: { fontSize: 26, fontWeight: 600, color: subtle },
			children: card.kind ? 'Jason Warren' : ''
		}
	};
	const titleBlock = {
		type: 'div',
		props: {
			style: { display: 'flex', flexDirection: 'column', maxWidth: maxTitle },
			children: [
				{
					type: 'div',
					props: {
						style: {
							fontFamily: 'Source Serif 4',
							fontSize: titleSize,
							fontWeight: 600,
							lineHeight: 1.05,
							letterSpacing: '-0.015em',
							color: sheet.text
						},
						children: card.title
					}
				},
				...legendLines
			]
		}
	};
	const row = (children: unknown[], align = 'center') => ({
		type: 'div',
		props: {
			style: { display: 'flex', justifyContent: 'space-between', alignItems: align },
			children
		}
	});
	const body = plate
		? [
				row([eyebrow, signature]),
				row([titleBlock, glyphRow ?? { type: 'div', props: {} }], 'flex-end')
			]
		: [eyebrow, titleBlock, row([signature, glyphRow ?? { type: 'div', props: {} }])];

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
					padding: plate ? '72px 80px' : '80px',
					background: sheet.bg,
					color: sheet.text,
					fontFamily: 'IBM Plex Sans'
				},
				children: [
					{
						type: 'img',
						props: {
							src: motif,
							width: WIDTH,
							height: HEIGHT,
							style: { position: 'absolute', top: 0, left: 0 }
						}
					},
					...body
				]
			}
		} as never,
		{ width: WIDTH, height: HEIGHT, fonts: fonts as never }
	);
	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
	return Buffer.from(resvg.render().asPng());
}
