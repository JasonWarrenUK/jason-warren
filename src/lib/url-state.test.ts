/**
 * Unit tests for the URL search-param set codec.
 *
 * Tests cover:
 * - parseSet: null/empty → empty set; comma-joined string → set; drops empties
 *   and duplicates
 * - serialiseSet: empty set → null; values → sorted string
 * - Round-trip canonical ordering
 */

import { describe, expect, it } from 'vitest';
import { parseSet, serialiseSet } from './url-state.js';

// ---------------------------------------------------------------------------
// parseSet
// ---------------------------------------------------------------------------

describe('parseSet', () => {
	it('returns an empty set for null (param absent)', () => {
		expect(parseSet(null)).toEqual(new Set());
	});

	it('returns an empty set for an empty string (param present but blank)', () => {
		expect(parseSet('')).toEqual(new Set());
	});

	it('parses a single value', () => {
		expect(parseSet('app')).toEqual(new Set(['app']));
	});

	it('parses multiple comma-joined values', () => {
		expect(parseSet('app,library')).toEqual(new Set(['app', 'library']));
	});

	it('drops empty tokens from double commas', () => {
		expect(parseSet('app,,library')).toEqual(new Set(['app', 'library']));
	});

	it('deduplicates repeated values', () => {
		expect(parseSet('app,app')).toEqual(new Set(['app']));
	});

	it('preserves the generic type', () => {
		const result = parseSet<'app' | 'library'>('app,library');
		expect(result.has('app')).toBe(true);
		expect(result.has('library')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// serialiseSet
// ---------------------------------------------------------------------------

describe('serialiseSet', () => {
	it('returns null for an empty set', () => {
		expect(serialiseSet(new Set())).toBeNull();
	});

	it('returns the single value for a singleton', () => {
		expect(serialiseSet(new Set(['app']))).toBe('app');
	});

	it('returns a sorted, comma-joined string', () => {
		expect(serialiseSet(new Set(['library', 'app']))).toBe('app,library');
	});

	it('sorts alphabetically so output is canonical regardless of insertion order', () => {
		const a = serialiseSet(new Set(['z', 'a', 'm']));
		const b = serialiseSet(new Set(['m', 'z', 'a']));
		expect(a).toBe(b);
		expect(a).toBe('a,m,z');
	});
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip', () => {
	it('parseSet(serialiseSet(s)) reproduces the original set', () => {
		const original = new Set(['library', 'app']);
		const encoded = serialiseSet(original);
		expect(parseSet(encoded)).toEqual(original);
	});

	it('serialiseSet(parseSet(s)) produces canonical ordering', () => {
		// Input order must not matter — output is always sorted.
		expect(serialiseSet(parseSet('library,app'))).toBe('app,library');
	});
});
