import { describe, expect, it } from 'vitest';
import {
	parseZulu,
	resolveOooiTimes,
	calculateBlockTime,
	formatDecimalHours,
	formatPlusMinutes,
	parseDuration,
	parseDecimalHours,
	toZuluDisplay
} from './oooi';

describe('parseZulu', () => {
	it('parses valid 4-digit Zulu times', () => {
		expect(parseZulu('0000')).toEqual({ hours: 0, minutes: 0 });
		expect(parseZulu('2350')).toEqual({ hours: 23, minutes: 50 });
		expect(parseZulu('1234')).toEqual({ hours: 12, minutes: 34 });
	});

	it('rejects invalid input', () => {
		expect(parseZulu('')).toBeNull();
		expect(parseZulu('123')).toBeNull();
		expect(parseZulu('12345')).toBeNull();
		expect(parseZulu('2460')).toBeNull(); // invalid minutes
		expect(parseZulu('2500')).toBeNull(); // invalid hours
		expect(parseZulu('abcd')).toBeNull();
	});

	it('strips colons and spaces', () => {
		expect(parseZulu('23:50')).toEqual({ hours: 23, minutes: 50 });
		expect(parseZulu('23 50')).toEqual({ hours: 23, minutes: 50 });
	});
});

describe('resolveOooiTimes', () => {
	it('resolves simple same-day OOOI times', () => {
		const result = resolveOooiTimes('2024-03-15', {
			out: '1200',
			off: '1215',
			on: '1430',
			in: '1445'
		});

		expect(result.time_out).toBe('2024-03-15T12:00:00.000Z');
		expect(result.time_off).toBe('2024-03-15T12:15:00.000Z');
		expect(result.time_on).toBe('2024-03-15T14:30:00.000Z');
		expect(result.time_in).toBe('2024-03-15T14:45:00.000Z');
	});

	it('handles midnight crossing (Out late, In early)', () => {
		const result = resolveOooiTimes('2024-03-15', {
			out: '2350',
			off: '0005',
			on: '0230',
			in: '0240'
		});

		expect(result.time_out).toBe('2024-03-15T23:50:00.000Z');
		expect(result.time_off).toBe('2024-03-16T00:05:00.000Z');
		expect(result.time_on).toBe('2024-03-16T02:30:00.000Z');
		expect(result.time_in).toBe('2024-03-16T02:40:00.000Z');
	});

	it('handles partial OOOI times', () => {
		const result = resolveOooiTimes('2024-03-15', {
			out: '1200',
			in: '1445'
		});

		expect(result.time_out).toBe('2024-03-15T12:00:00.000Z');
		expect(result.time_off).toBeUndefined();
		expect(result.time_on).toBeUndefined();
		expect(result.time_in).toBe('2024-03-15T14:45:00.000Z');
	});

	it('returns empty object for invalid date', () => {
		const result = resolveOooiTimes('not-a-date', { out: '1200' });
		expect(result).toEqual({});
	});

	it('skips invalid time entries', () => {
		const result = resolveOooiTimes('2024-03-15', {
			out: '1200',
			off: 'bad',
			on: '1430',
			in: '1445'
		});

		expect(result.time_out).toBe('2024-03-15T12:00:00.000Z');
		expect(result.time_off).toBeUndefined();
		expect(result.time_on).toBe('2024-03-15T14:30:00.000Z');
		expect(result.time_in).toBe('2024-03-15T14:45:00.000Z');
	});
});

describe('calculateBlockTime', () => {
	it('calculates block time in minutes', () => {
		expect(calculateBlockTime('2024-03-15T12:00:00.000Z', '2024-03-15T14:30:00.000Z')).toBe(150);
	});

	it('handles midnight crossing', () => {
		expect(calculateBlockTime('2024-03-15T23:50:00.000Z', '2024-03-16T02:40:00.000Z')).toBe(170);
	});

	it('returns null for missing times', () => {
		expect(calculateBlockTime(undefined, '2024-03-15T14:30:00.000Z')).toBeNull();
		expect(calculateBlockTime('2024-03-15T12:00:00.000Z', undefined)).toBeNull();
		expect(calculateBlockTime(undefined, undefined)).toBeNull();
	});
});

describe('formatDecimalHours', () => {
	it('formats minutes as decimal hours', () => {
		expect(formatDecimalHours(150)).toBe('2.5');
		expect(formatDecimalHours(135)).toBe('2.3'); // 2.25 rounds to 2.3
		expect(formatDecimalHours(60)).toBe('1.0');
		expect(formatDecimalHours(0)).toBe('0.0');
	});

	it('returns empty string for null/undefined', () => {
		expect(formatDecimalHours(null)).toBe('');
		expect(formatDecimalHours(undefined)).toBe('');
	});
});

describe('formatPlusMinutes', () => {
	it('formats minutes as hours+minutes', () => {
		expect(formatPlusMinutes(150)).toBe('2+30');
		expect(formatPlusMinutes(126)).toBe('2+06');
		expect(formatPlusMinutes(60)).toBe('1+00');
		expect(formatPlusMinutes(0)).toBe('0+00');
		expect(formatPlusMinutes(45)).toBe('0+45');
	});

	it('returns empty string for null/undefined', () => {
		expect(formatPlusMinutes(null)).toBe('');
		expect(formatPlusMinutes(undefined)).toBe('');
	});
});

describe('parseDuration', () => {
	it('parses decimal hours to minutes', () => {
		expect(parseDuration('2.5')).toBe(150);
		expect(parseDuration('1.0')).toBe(60);
		expect(parseDuration('0')).toBe(0);
	});

	it('parses plus-minutes format to minutes', () => {
		expect(parseDuration('2+06')).toBe(126);
		expect(parseDuration('2+30')).toBe(150);
		expect(parseDuration('0+45')).toBe(45);
		expect(parseDuration('12+00')).toBe(720);
		expect(parseDuration('1+5')).toBe(65);
	});

	it('rejects invalid plus-minutes', () => {
		expect(parseDuration('2+60')).toBeNull();
		expect(parseDuration('2+abc')).toBeNull();
		expect(parseDuration('+30')).toBeNull();
	});

	it('returns null for invalid input', () => {
		expect(parseDuration('')).toBeNull();
		expect(parseDuration('abc')).toBeNull();
		expect(parseDuration('-1')).toBeNull();
	});

	it('handles whitespace', () => {
		expect(parseDuration('  2.5  ')).toBe(150);
		expect(parseDuration('  2+06  ')).toBe(126);
	});
});

describe('parseDecimalHours (deprecated, delegates to parseDuration)', () => {
	it('parses decimal hours to minutes', () => {
		expect(parseDecimalHours('2.5')).toBe(150);
		expect(parseDecimalHours('1.0')).toBe(60);
		expect(parseDecimalHours('0')).toBe(0);
	});

	it('also parses plus-minutes format', () => {
		expect(parseDecimalHours('2+06')).toBe(126);
	});

	it('returns null for invalid input', () => {
		expect(parseDecimalHours('')).toBeNull();
		expect(parseDecimalHours('abc')).toBeNull();
		expect(parseDecimalHours('-1')).toBeNull();
	});
});

describe('toZuluDisplay', () => {
	it('extracts 4-digit Zulu from ISO string', () => {
		expect(toZuluDisplay('2024-03-15T23:50:00.000Z')).toBe('2350');
		expect(toZuluDisplay('2024-03-15T00:05:00.000Z')).toBe('0005');
	});

	it('returns empty string for empty/invalid input', () => {
		expect(toZuluDisplay('')).toBe('');
		expect(toZuluDisplay(undefined)).toBe('');
		expect(toZuluDisplay('not-a-date')).toBe('');
	});
});
