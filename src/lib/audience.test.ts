import { describe, expect, it } from 'vitest';
import { parseAudience, DEFAULT_AUDIENCE } from './audience.js';

describe('parseAudience', () => {
	it('returns each valid audience unchanged', () => {
		expect(parseAudience('developer')).toBe('developer');
		expect(parseAudience('everyone')).toBe('everyone');
	});

	it('falls back to the default for absent values', () => {
		expect(parseAudience(null)).toBe(DEFAULT_AUDIENCE);
		expect(parseAudience(undefined)).toBe(DEFAULT_AUDIENCE);
		expect(parseAudience('')).toBe(DEFAULT_AUDIENCE);
	});

	it('falls back to the default for unrecognised values', () => {
		expect(parseAudience('Developer')).toBe(DEFAULT_AUDIENCE);
		expect(parseAudience('everybody')).toBe(DEFAULT_AUDIENCE);
	});
});
