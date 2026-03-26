import { describe, expect, it } from 'vitest';
import {
	parseZulu,
	resolveOooiTimes,
	calculateBlockTime,
	formatDecimalHours,
	formatPlusMinutes,
	parseDuration,
	parseDecimalHours,
	toZuluDisplay,
	inferZuluTime,
	formatLocalTime
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

describe('inferZuluTime', () => {
	it('adds minutes to a Zulu time (Out + Total → In)', () => {
		expect(inferZuluTime('2350', 170, true)).toBe('0240'); // midnight crossing
		expect(inferZuluTime('1200', 150, true)).toBe('1430');
		expect(inferZuluTime('0000', 60, true)).toBe('0100');
	});

	it('subtracts minutes from a Zulu time (In - Total → Out)', () => {
		expect(inferZuluTime('0240', 170, false)).toBe('2350'); // reverse midnight crossing
		expect(inferZuluTime('1430', 150, false)).toBe('1200');
		expect(inferZuluTime('0100', 60, false)).toBe('0000');
	});

	it('handles wrap-around correctly', () => {
		expect(inferZuluTime('2300', 120, true)).toBe('0100'); // 23:00 + 2h = 01:00
		expect(inferZuluTime('0030', 60, false)).toBe('2330'); // 00:30 - 1h = 23:30
	});

	it('returns null for invalid input', () => {
		expect(inferZuluTime('', 60, true)).toBeNull();
		expect(inferZuluTime('bad', 60, true)).toBeNull();
		expect(inferZuluTime('2500', 60, true)).toBeNull();
	});
});

describe('parseDuration round-trip with formatDecimalHours', () => {
	it('decimal → minutes → decimal round-trips accurately', () => {
		const mins = parseDuration('2.5');
		expect(mins).toBe(150);
		expect(formatDecimalHours(mins)).toBe('2.5');
	});

	it('plus-minutes → minutes → plus-minutes round-trips accurately', () => {
		const mins = parseDuration('2+30');
		expect(mins).toBe(150);
		expect(formatPlusMinutes(mins)).toBe('2+30');
	});

	it('handles zero in both formats', () => {
		expect(parseDuration('0')).toBe(0);
		expect(parseDuration('0+00')).toBe(0);
		expect(formatDecimalHours(0)).toBe('0.0');
		expect(formatPlusMinutes(0)).toBe('0+00');
	});

	it('decimal rounding: 1.3 hours = 78 minutes', () => {
		const mins = parseDuration('1.3');
		expect(mins).toBe(78);
		expect(formatDecimalHours(mins)).toBe('1.3');
	});

	it('decimal rounding: 1.1 hours = 66 minutes', () => {
		const mins = parseDuration('1.1');
		expect(mins).toBe(66);
		expect(formatDecimalHours(mins)).toBe('1.1');
	});
});

describe('edge case: very short and very long flights', () => {
	it('zero-length flight (Out == In)', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '1200', in: '1200' });
		const block = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(block).toBe(0);
	});

	it('one-minute flight', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '1200', in: '1201' });
		const block = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(block).toBe(1);
	});

	it('long-haul flight (15+ hours, no midnight crossing)', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '0100', in: '1600' });
		const block = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(block).toBe(900); // 15 hours
		expect(formatPlusMinutes(block)).toBe('15+00');
		expect(formatDecimalHours(block)).toBe('15.0');
	});

	it('long-haul flight crossing midnight', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '1400', in: '0600' });
		const block = calculateBlockTime(resolved.time_out, resolved.time_in);
		expect(block).toBe(960); // 16 hours
	});
});

describe('edge case: midnight boundary times', () => {
	it('Out at exactly midnight (0000)', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '0000', in: '0200' });
		expect(resolved.time_out).toBe('2024-03-15T00:00:00.000Z');
		expect(calculateBlockTime(resolved.time_out, resolved.time_in)).toBe(120);
	});

	it('In at exactly midnight (0000 next day)', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '2200', in: '0000' });
		expect(resolved.time_in).toBe('2024-03-16T00:00:00.000Z');
		expect(calculateBlockTime(resolved.time_out, resolved.time_in)).toBe(120);
	});

	it('Out at 2359, In at 0001 (2-minute flight across midnight)', () => {
		const resolved = resolveOooiTimes('2024-03-15', { out: '2359', in: '0001' });
		expect(calculateBlockTime(resolved.time_out, resolved.time_in)).toBe(2);
	});
});

describe('inferZuluTime edge cases', () => {
	it('infer with zero minutes (no change)', () => {
		expect(inferZuluTime('1200', 0, true)).toBe('1200');
		expect(inferZuluTime('1200', 0, false)).toBe('1200');
	});

	it('infer full 24h (wraps back to same time)', () => {
		expect(inferZuluTime('1200', 1440, true)).toBe('1200');
		expect(inferZuluTime('1200', 1440, false)).toBe('1200');
	});

	it('infer just under 24h', () => {
		expect(inferZuluTime('1200', 1439, true)).toBe('1159');
		expect(inferZuluTime('1200', 1439, false)).toBe('1201');
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

describe('formatLocalTime', () => {
	it('converts UTC to Eastern time', () => {
		// 1122Z on a winter date → 0622 EST
		const result = formatLocalTime('1122', '2024-01-15', 'America/New_York');
		expect(result).toBe('0622 EST');
	});

	it('handles DST correctly', () => {
		// 1122Z on a summer date → 0722 EDT
		const result = formatLocalTime('1122', '2024-07-15', 'America/New_York');
		expect(result).toBe('0722 EDT');
	});

	it('handles Pacific timezone', () => {
		const result = formatLocalTime('2000', '2024-01-15', 'America/Los_Angeles');
		expect(result).toBe('1200 PST');
	});

	it('returns null for invalid Zulu time', () => {
		expect(formatLocalTime('', '2024-01-15', 'America/New_York')).toBeNull();
		expect(formatLocalTime('abcd', '2024-01-15', 'America/New_York')).toBeNull();
	});

	it('returns null for invalid timezone', () => {
		expect(formatLocalTime('1122', '2024-01-15', 'Invalid/Timezone')).toBeNull();
	});

	it('returns null for invalid date', () => {
		expect(formatLocalTime('1122', 'bad-date', 'America/New_York')).toBeNull();
	});
});
