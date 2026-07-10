import { describe, it, expect } from 'vitest';
import {
	validatePin,
	nextPinValue,
	projectHref,
	viewHref,
	projectsByTagHref,
	techViewHref
} from './selection.js';

describe('validatePin', () => {
	const isKnown = (slug: string) => ['drift', 'epoch', 'kamino'].includes(slug);

	it('returns null for null input', () => {
		expect(validatePin(null, isKnown)).toBeNull();
	});

	it('returns null for an unknown slug (stale pin)', () => {
		expect(validatePin('nonexistent-project', isKnown)).toBeNull();
	});

	it('returns the slug when it is known', () => {
		expect(validatePin('drift', isKnown)).toBe('drift');
	});

	it('returns the slug when it is known — another entry', () => {
		expect(validatePin('epoch', isKnown)).toBe('epoch');
	});
});

describe('nextPinValue', () => {
	it('returns null when clicking the already-pinned slug (toggle off)', () => {
		expect(nextPinValue('drift', 'drift')).toBeNull();
	});

	it('returns the clicked slug when nothing is pinned', () => {
		expect(nextPinValue(null, 'epoch')).toBe('epoch');
	});

	it('returns the clicked slug when a different project is pinned (switch)', () => {
		expect(nextPinValue('drift', 'epoch')).toBe('epoch');
	});
});

describe('projectHref', () => {
	it('builds a bare project detail href with empty base', () => {
		expect(projectHref('', 'drift')).toBe('/projects/drift');
	});

	it('builds a bare project detail href with a non-empty base', () => {
		expect(projectHref('/portfolio', 'epoch')).toBe('/portfolio/projects/epoch');
	});
});

describe('viewHref', () => {
	it('builds a map href with ?project= pin (empty base)', () => {
		expect(viewHref('', 'map', 'drift')).toBe('/map?project=drift');
	});

	it('builds a timeline href with ?project= pin (empty base)', () => {
		expect(viewHref('', 'timeline', 'epoch')).toBe('/timeline?project=epoch');
	});

	it('builds a toolkit href with ?project= pin (empty base)', () => {
		expect(viewHref('', 'toolkit', 'kamino')).toBe('/toolkit?project=kamino');
	});

	it('prepends a non-empty base', () => {
		expect(viewHref('/portfolio', 'map', 'drift')).toBe('/portfolio/map?project=drift');
	});

	it('percent-encodes special characters in the slug', () => {
		// Slugs are kebab-case so this is unlikely in practice, but the
		// encoding contract should hold for anything exotic.
		expect(viewHref('', 'map', 'my project')).toBe('/map?project=my%20project');
	});
});

describe('projectsByTagHref', () => {
	it('builds a /projects href with a single-tag ?tags= filter (empty base)', () => {
		expect(projectsByTagHref('', 'Svelte 5')).toBe('/projects?tags=Svelte%205');
	});

	it('prepends a non-empty base', () => {
		expect(projectsByTagHref('/portfolio', 'Bun')).toBe('/portfolio/projects?tags=Bun');
	});

	it('percent-encodes characters that are unsafe in a URL, notably #', () => {
		// # is especially dangerous: browsers treat it as a fragment delimiter
		// and silently discard everything after it if left unencoded.
		expect(projectsByTagHref('', 'C#')).toBe('/projects?tags=C%23');
	});

	it('matches the ?tags= codec /projects actually reads (decodeTagSet)', () => {
		// Regression guard for the AdoptionTimeline bug: the link used to build
		// a singular ?tag= param that /projects never read, landing on an
		// unfiltered page. This asserts the plural param name directly.
		expect(projectsByTagHref('', 'Deno')).toContain('?tags=');
	});
});

describe('techViewHref', () => {
	it('builds a map href with ?mode=technologies&tech= (empty base)', () => {
		expect(techViewHref('', 'map', 'Bun')).toBe('/map?mode=technologies&tech=Bun');
	});

	it('builds a toolkit href with ?tech= only, no mode param', () => {
		expect(techViewHref('', 'toolkit', 'Bun')).toBe('/toolkit?tech=Bun');
	});

	it('prepends a non-empty base', () => {
		expect(techViewHref('/portfolio', 'map', 'Bun')).toBe(
			'/portfolio/map?mode=technologies&tech=Bun'
		);
	});

	it('percent-encodes special characters in the label', () => {
		expect(techViewHref('', 'toolkit', 'C#')).toBe('/toolkit?tech=C%23');
	});
});
