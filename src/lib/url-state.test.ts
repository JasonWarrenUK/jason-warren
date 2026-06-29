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
import {
	parseSet,
	serialiseSet,
	encodeTechLabel,
	decodeTechLabel,
	encodeTagSet,
	decodeTagSet
} from './url-state.js';

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
		// Input order must not matter: output is always sorted.
		expect(serialiseSet(parseSet('library,app'))).toBe('app,library');
	});
});

// ---------------------------------------------------------------------------
// encodeTechLabel
// ---------------------------------------------------------------------------

describe('encodeTechLabel', () => {
	it('encodes a plain label unchanged', () => {
		expect(encodeTechLabel('Svelte')).toBe('Svelte');
	});

	it('encodes # so it is not read as a URL fragment', () => {
		expect(encodeTechLabel('C#')).toBe('C%23');
	});

	it('encodes spaces', () => {
		expect(encodeTechLabel('POSIX shell')).toBe('POSIX%20shell');
	});

	it('encodes dots (safe in practice, but consistent)', () => {
		// Dots are not percent-encoded by encodeURIComponent but this asserts
		// the function does not accidentally break labels that contain them.
		expect(encodeTechLabel('Node.js')).toBe('Node.js');
		expect(encodeTechLabel('.NET 8')).toBe('.NET%208');
	});
});

// ---------------------------------------------------------------------------
// decodeTechLabel
// ---------------------------------------------------------------------------

describe('decodeTechLabel', () => {
	const knownLabels = ['C#', 'Node.js', '.NET 8', 'POSIX shell', 'Svelte'];

	it('returns null for a null (absent) param', () => {
		expect(decodeTechLabel(null, knownLabels)).toBeNull();
	});

	it('decodes C%23 back to C# and validates against known labels', () => {
		expect(decodeTechLabel('C%23', knownLabels)).toBe('C#');
	});

	it('decodes .NET%208 back to .NET 8', () => {
		expect(decodeTechLabel('.NET%208', knownLabels)).toBe('.NET 8');
	});

	it('decodes POSIX%20shell back to POSIX shell', () => {
		expect(decodeTechLabel('POSIX%20shell', knownLabels)).toBe('POSIX shell');
	});

	it('decodes Node.js (no encoding needed) correctly', () => {
		expect(decodeTechLabel('Node.js', knownLabels)).toBe('Node.js');
	});

	it('returns null for a label not in the known set (stale-pin guard)', () => {
		expect(decodeTechLabel('Bogus', knownLabels)).toBeNull();
	});

	it('returns null for an encoded label not in the known set', () => {
		expect(decodeTechLabel('C%23invalid', knownLabels)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Round-trip (encode → decode)
// ---------------------------------------------------------------------------

describe('tech-label round-trip', () => {
	const knownLabels = ['C#', 'Node.js', '.NET 8', 'POSIX shell'];

	it.each([['C#'], ['Node.js'], ['.NET 8'], ['POSIX shell']])(
		'encodeTechLabel → decodeTechLabel round-trips %s',
		(label) => {
			const encoded = encodeTechLabel(label);
			expect(decodeTechLabel(encoded, knownLabels)).toBe(label);
		}
	);
});

// ---------------------------------------------------------------------------
// encodeTagSet
// ---------------------------------------------------------------------------

describe('encodeTagSet', () => {
	it('returns null for an empty set', () => {
		expect(encodeTagSet(new Set())).toBeNull();
	});

	it('percent-encodes a label containing #', () => {
		const result = encodeTagSet(new Set(['C#']));
		expect(result).toBe('C%23');
	});

	it('percent-encodes a label containing a space', () => {
		const result = encodeTagSet(new Set(['POSIX shell']));
		expect(result).toBe('POSIX%20shell');
	});

	it('encodes multiple labels and sorts them', () => {
		const result = encodeTagSet(new Set(['Svelte', 'C#']));
		// C%23 sorts before Svelte
		expect(result).toBe('C%23,Svelte');
	});

	it('produces the same output regardless of insertion order', () => {
		const a = encodeTagSet(new Set(['Svelte', 'TypeScript']));
		const b = encodeTagSet(new Set(['TypeScript', 'Svelte']));
		expect(a).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// decodeTagSet
// ---------------------------------------------------------------------------

describe('decodeTagSet', () => {
	it('returns an empty set for null (param absent)', () => {
		expect(decodeTagSet(null)).toEqual(new Set());
	});

	it('returns an empty set for an empty string', () => {
		expect(decodeTagSet('')).toEqual(new Set());
	});

	it('decodes a single percent-encoded label', () => {
		expect(decodeTagSet('C%23')).toEqual(new Set(['C#']));
	});

	it('decodes multiple comma-separated encoded labels', () => {
		expect(decodeTagSet('C%23,Svelte')).toEqual(new Set(['C#', 'Svelte']));
	});

	it('drops empty tokens', () => {
		expect(decodeTagSet('C%23,,Svelte')).toEqual(new Set(['C#', 'Svelte']));
	});
});

// ---------------------------------------------------------------------------
// Tag-set round-trip
// ---------------------------------------------------------------------------

describe('tag-set round-trip', () => {
	it.each([
		[new Set(['TypeScript'])],
		[new Set(['C#', 'Node.js'])],
		[new Set(['.NET 8', 'POSIX shell', 'Svelte'])]
	])('encodeTagSet → decodeTagSet round-trips %s', (tags) => {
		const encoded = encodeTagSet(tags);
		expect(decodeTagSet(encoded)).toEqual(tags);
	});
});
