/**
 * Build-time syntax highlighting via Shiki.
 *
 * Runs only during prerender — this module never ships to the browser.
 * The highlighter is created once per build process and reused across
 * all calls (singleton promise). Vitesse light/dark, defaultColor:false
 * so the site's own CSS drives which colour set is active per theme.
 */
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/** Languages bundled into this highlighter. Extend the union and the langs array together. */
export type CodeLang = 'typescript' | 'json';

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
	highlighterPromise ??= createHighlighterCore({
		themes: [import('@shikijs/themes/vitesse-light'), import('@shikijs/themes/vitesse-dark')],
		langs: [import('@shikijs/langs/typescript'), import('@shikijs/langs/json')],
		// JavaScript regex engine: no WASM binary, synchronous engine creation,
		// fully supports TypeScript and JSON grammars.
		engine: createJavaScriptRegexEngine()
	});
	return highlighterPromise;
}

/**
 * Highlight a code snippet to a static HTML string.
 *
 * With defaultColor:false, every token span carries paired CSS custom
 * properties (--shiki for light, --shiki-dark for dark) but no concrete
 * colour. The tokens.css dual-theme rules decide which set is visible,
 * mirroring the site's [data-theme='dark'] / prefers-color-scheme pattern.
 *
 * Safe to call with {@html} in +page.svelte: all input is build-time
 * hardcoded literals, never user data.
 */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(code, {
		lang,
		themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
		defaultColor: false
	});
}
