/**
 * WCAG contrast assertions for the Atlas warm-neutral palette.
 *
 * tokens.css derives every neutral surface/border/text alias via
 * `color-mix(in oklab, ...)` over Reasonable Colors variables (see the
 * --warmth knob and its comment there). Because the mix ratio is asserted
 * rather than eyeballed, this test resolves the actual CSS — parsing
 * tokens.css's custom-property declarations and the Reasonable Colors
 * palette, then reproducing the oklab color-mix maths in code — so a future
 * change to --warmth, a shade, or a token wiring is caught here rather than
 * shipped as an invisible contrast regression.
 *
 * Mirrors the pattern in data.test.ts: collect every failing pair into an
 * array and assert its length, so one run reports every offender at once.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { converter, wcagContrast, formatHex, type Oklab } from 'culori';

const TOKENS_PATH = fileURLToPath(new URL('./tokens.css', import.meta.url));
const RC_PATH = fileURLToPath(
	new URL('../../../node_modules/reasonable-colors/reasonable-colors.css', import.meta.url)
);

const toOklab = converter('oklab');

/** Parses `--name: value;` declarations out of one `{ ... }` block's body. */
function parseDeclarations(blockBody: string): Map<string, string> {
	const decls = new Map<string, string>();
	// Declarations can themselves contain parens (color-mix(...)) so match up
	// to the *matching* top-level semicolon by tracking paren depth.
	const re = /--([a-zA-Z0-9-]+)\s*:\s*/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(blockBody))) {
		const name = `--${match[1]}`;
		let i = re.lastIndex;
		let depth = 0;
		let value = '';
		for (; i < blockBody.length; i++) {
			const ch = blockBody[i];
			if (ch === '(') depth++;
			else if (ch === ')') depth--;
			else if (ch === ';' && depth === 0) break;
			value += ch;
		}
		decls.set(name, value.trim());
		re.lastIndex = i;
	}
	return decls;
}

/** Extracts the first top-level `{ ... }` block body following `selector`. */
function extractBlock(css: string, selectorPattern: RegExp): string {
	const m = selectorPattern.exec(css);
	if (!m) throw new Error(`Selector not found: ${selectorPattern}`);
	const start = m.index + m[0].length;
	let depth = 1;
	let i = start;
	for (; i < css.length && depth > 0; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}') depth--;
	}
	return css.slice(start, i - 1);
}

/** Parses Reasonable Colors' `--color-{hue}-{shade}: #hex;` declarations from its stylesheet. */
function parseRcPalette(): Map<string, string> {
	const css = readFileSync(RC_PATH, 'utf8');
	const palette = new Map<string, string>();
	const re = /--(color-[a-z]+-[1-6]):\s*(#[0-9a-fA-F]{6})/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(css))) palette.set(`--${m[1]}`, m[2]);
	return palette;
}

/**
 * Resolves a token value to a concrete hex colour, given a lookup scope
 * (declarations from the active theme block, falling back to the RC
 * palette and the light-theme :root block for tokens the dark block
 * doesn't override).
 */
function resolveColour(value: string, scopes: Map<string, string>[]): string {
	const trimmed = value.trim();

	if (trimmed.startsWith('#')) return trimmed;
	if (trimmed === 'white') return '#ffffff';
	if (trimmed === 'black') return '#000000';

	const varMatch = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(trimmed);
	if (varMatch) {
		const name = varMatch[1];
		for (const scope of scopes) {
			if (scope.has(name)) return resolveColour(scope.get(name) as string, scopes);
		}
		throw new Error(`Unresolved token: ${name}`);
	}

	const mixMatch = /^color-mix\(\s*in oklab\s*,\s*([\s\S]+)\)$/.exec(trimmed);
	if (mixMatch) {
		// Split the two "colour [percentage]" arguments on the top-level comma.
		const inner = mixMatch[1];
		let depth = 0;
		let splitAt = -1;
		for (let i = 0; i < inner.length; i++) {
			if (inner[i] === '(') depth++;
			else if (inner[i] === ')') depth--;
			else if (inner[i] === ',' && depth === 0) {
				splitAt = i;
				break;
			}
		}
		if (splitAt === -1) throw new Error(`Malformed color-mix: ${trimmed}`);
		const [aRaw, aPctRaw] = splitColourAndPercent(inner.slice(0, splitAt).trim());
		const [bRaw, bPctRaw] = splitColourAndPercent(inner.slice(splitAt + 1).trim());

		const colourA = resolveColour(aRaw, scopes);
		const colourB = resolveColour(bRaw, scopes);
		const pctA = aPctRaw !== null ? resolvePercent(aPctRaw, scopes) : null;
		const pctB = bPctRaw !== null ? resolvePercent(bPctRaw, scopes) : null;
		// CSS color-mix: if only one percentage given, the other is its complement.
		const ratioA = pctA ?? (pctB !== null ? 100 - pctB : 50);

		return mixOklab(colourA, colourB, ratioA);
	}

	throw new Error(`Unresolvable colour expression: ${trimmed}`);
}

/** Splits a `color-mix` argument like `var(--x) calc(100% - var(--warmth))` into [colourExpr, percentExpr | null]. */
function splitColourAndPercent(arg: string): [string, string | null] {
	// The percentage/calc trails the colour expression, separated by whitespace
	// at depth 0 (the colour itself may be `var(--x)`, which has balanced parens).
	let depth = 0;
	for (let i = 0; i < arg.length; i++) {
		const ch = arg[i];
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		else if (ch === ' ' && depth === 0) {
			const rest = arg.slice(i + 1).trim();
			if (rest.length > 0) return [arg.slice(0, i).trim(), rest];
		}
	}
	return [arg, null];
}

/** Resolves a percentage expression, either a literal `12%` or `calc(100% - var(--warmth))`, to a number 0-100. */
function resolvePercent(expr: string, scopes: Map<string, string>[]): number {
	const literal = /^([\d.]+)%$/.exec(expr);
	if (literal) return Number(literal[1]);

	const calcMatch = /^calc\(\s*100%\s*-\s*(.+)\)$/.exec(expr);
	if (calcMatch) {
		const subExpr = calcMatch[1].trim();
		const varMatch = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(subExpr);
		if (varMatch) {
			for (const scope of scopes) {
				if (scope.has(varMatch[1]))
					return 100 - resolvePercent(scope.get(varMatch[1]) as string, scopes);
			}
		}
		const litSub = /^([\d.]+)%$/.exec(subExpr);
		if (litSub) return 100 - Number(litSub[1]);
	}
	throw new Error(`Unresolvable percentage: ${expr}`);
}

/** Reproduces CSS `color-mix(in oklab, a ratioA%, b)`: a weighted average in the oklab component space. */
function mixOklab(hexA: string, hexB: string, ratioAPercent: number): string {
	const a = toOklab(hexA) as Oklab;
	const b = toOklab(hexB) as Oklab;
	const t = ratioAPercent / 100;
	const mixed: Oklab = {
		mode: 'oklab',
		l: a.l * t + b.l * (1 - t),
		a: (a.a ?? 0) * t + (b.a ?? 0) * (1 - t),
		b: (a.b ?? 0) * t + (b.b ?? 0) * (1 - t)
	};
	return formatHex(mixed);
}

interface ThemeTokens {
	label: string;
	resolve: (name: string) => string;
}

let themes: ThemeTokens[];

beforeAll(() => {
	const css = readFileSync(TOKENS_PATH, 'utf8');
	const rcPalette = parseRcPalette();

	const rootBody = extractBlock(css, /:root\s*\{/);
	const rootDecls = parseDeclarations(rootBody);

	const darkBody = extractBlock(css, /:root\[data-theme=['"]dark['"]\]\s*\{/);
	const darkDecls = parseDeclarations(darkBody);

	themes = [
		{
			label: 'light',
			resolve: (name: string) => resolveColour(`var(${name})`, [rootDecls, rcPalette])
		},
		{
			label: 'dark',
			// Dark overrides sit in front of the light :root and the RC palette,
			// matching the cascade: :root[data-theme='dark'] only overrides a
			// subset of tokens, the rest fall through to :root.
			resolve: (name: string) => resolveColour(`var(${name})`, [darkDecls, rootDecls, rcPalette])
		}
	];
});

/**
 * Text/surface pairs to check, in [textToken, surfaceToken, minRatio] form.
 * Ratios follow how each token is actually used: --color-text is body copy
 * (AAA, 7:1), --color-text-subtle is body-adjacent prose/taglines (AA body,
 * 4.5:1), --color-text-muted is exclusively small secondary metadata/legend
 * labels in this codebase — never body text — so it's held to AA large-text
 * (3:1), the WCAG floor for that use.
 */
const BODY_PAIRS: [string, string, number][] = [
	['--color-text', '--color-surface', 7],
	['--color-text', '--color-surface-raised', 7],
	['--color-text', '--color-surface-sunken', 7],
	['--color-text-subtle', '--color-surface', 4.5],
	['--color-text-subtle', '--color-surface-raised', 4.5],
	['--color-text-subtle', '--color-surface-sunken', 4.5],
	['--color-text-muted', '--color-surface', 3],
	['--color-text-muted', '--color-surface-raised', 3],
	['--color-primary-text', '--color-primary-bg', 4.5],
	['--color-accent-text', '--color-accent-bg', 4.5],
	['--color-live-text', '--color-live-bg', 4.5],
	['--color-wip-text', '--color-wip-bg', 4.5],
	['--color-finished-text', '--color-finished-bg', 4.5],
	['--color-prototype-text', '--color-prototype-bg', 4.5],
	['--color-archived-text', '--color-archived-bg', 4.5],
	['--color-uncategorised-text', '--color-uncategorised-bg', 4.5],
	['--color-solo-text', '--color-solo-bg', 4.5],
	['--color-lead-text', '--color-lead-bg', 4.5],
	['--color-collaborator-text', '--color-collaborator-bg', 4.5]
];

describe('Atlas palette contrast', () => {
	it('resolves the warm-neutral tokens to plausible hex colours', () => {
		// Sanity check on the resolver itself, independent of the ratio
		// assertions below: every pair must resolve to a 6-digit hex.
		for (const theme of themes) {
			for (const [textToken, surfaceToken] of BODY_PAIRS) {
				const text = theme.resolve(textToken);
				const surface = theme.resolve(surfaceToken);
				expect(text, `${theme.label} ${textToken}`).toMatch(/^#[0-9a-f]{6}$/i);
				expect(surface, `${theme.label} ${surfaceToken}`).toMatch(/^#[0-9a-f]{6}$/i);
			}
		}
	});

	it('meets its WCAG contrast floor for every text/surface pair, in both themes', () => {
		const failures: string[] = [];
		for (const theme of themes) {
			for (const [textToken, surfaceToken, minRatio] of BODY_PAIRS) {
				const text = theme.resolve(textToken);
				const surface = theme.resolve(surfaceToken);
				const ratio = wcagContrast(text, surface);
				if (ratio < minRatio) {
					failures.push(
						`${theme.label}: ${textToken} (${text}) on ${surfaceToken} (${surface}) = ` +
							`${ratio.toFixed(2)}:1, needs ${minRatio}:1`
					);
				}
			}
		}
		expect(failures, failures.join('\n')).toHaveLength(0);
	});
});
