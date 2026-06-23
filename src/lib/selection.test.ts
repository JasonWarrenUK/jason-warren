import { describe, it, expect } from 'vitest';
import { validatePin, nextPinValue, projectHref, viewHref } from './selection.js';

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
