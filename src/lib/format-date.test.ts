import { describe, it, expect } from 'vitest';
import { formatMonthYear } from './format-date.js';

describe('formatMonthYear', () => {
	it('formats a mid-year date', () => {
		expect(formatMonthYear('2020-06-15')).toBe('June 2020');
	});

	it('handles the year boundaries', () => {
		expect(formatMonthYear('2024-01-01')).toBe('January 2024');
		expect(formatMonthYear('2024-12-31')).toBe('December 2024');
	});

	it('throws on malformed input', () => {
		expect(() => formatMonthYear('2024-13-01')).toThrow(/invalid ISO date/);
		expect(() => formatMonthYear('2024-00-01')).toThrow(/invalid ISO date/);
		expect(() => formatMonthYear('June 2024')).toThrow(/invalid ISO date/);
		expect(() => formatMonthYear('')).toThrow(/invalid ISO date/);
	});
});
