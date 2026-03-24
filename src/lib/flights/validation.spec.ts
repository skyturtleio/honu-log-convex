import { describe, expect, it } from 'vitest';
import {
	flightFormSchema,
	validateCrossField,
	clampPicTime,
	type FlightFormInput
} from './validation';

function makeInput(overrides: Partial<FlightFormInput> = {}): FlightFormInput {
	return {
		flightDate: '2024-03-15',
		flightNumber: '',
		aircraftId: '',
		depAirport: '',
		arrAirport: '',
		timeOut: '',
		timeOff: '',
		timeOn: '',
		timeIn: '',
		totalTimeInput: '',
		picTimeInput: '',
		sicTimeInput: '',
		nightTimeInput: '',
		instrumentTimeInput: '',
		crossCountryTimeInput: '',
		dayLandings: 0,
		nightLandings: 0,
		approachType: '',
		approachRunway: '',
		approachAirport: '',
		remarks: '',
		...overrides
	};
}

describe('flightFormSchema', () => {
	it('accepts valid minimal input', () => {
		const result = flightFormSchema.safeParse(makeInput());
		expect(result.success).toBe(true);
	});

	it('requires flight date', () => {
		const result = flightFormSchema.safeParse(makeInput({ flightDate: '' }));
		expect(result.success).toBe(false);
	});

	it('validates Zulu time format', () => {
		expect(flightFormSchema.safeParse(makeInput({ timeOut: '2350' })).success).toBe(true);
		expect(flightFormSchema.safeParse(makeInput({ timeOut: '2500' })).success).toBe(false);
		expect(flightFormSchema.safeParse(makeInput({ timeOut: 'abc' })).success).toBe(false);
		// Empty is fine (optional)
		expect(flightFormSchema.safeParse(makeInput({ timeOut: '' })).success).toBe(true);
	});

	it('validates duration format', () => {
		expect(flightFormSchema.safeParse(makeInput({ totalTimeInput: '2+30' })).success).toBe(true);
		expect(flightFormSchema.safeParse(makeInput({ totalTimeInput: '2.5' })).success).toBe(true);
		expect(flightFormSchema.safeParse(makeInput({ totalTimeInput: 'abc' })).success).toBe(false);
		expect(flightFormSchema.safeParse(makeInput({ totalTimeInput: '' })).success).toBe(true);
	});

	it('validates airport codes', () => {
		expect(flightFormSchema.safeParse(makeInput({ depAirport: 'KATL' })).success).toBe(true);
		expect(flightFormSchema.safeParse(makeInput({ depAirport: '' })).success).toBe(true);
		expect(flightFormSchema.safeParse(makeInput({ depAirport: '12AB' })).success).toBe(false);
		expect(flightFormSchema.safeParse(makeInput({ depAirport: 'TOOLONG' })).success).toBe(false);
	});

	it('validates landing counts are non-negative', () => {
		expect(flightFormSchema.safeParse(makeInput({ dayLandings: 1 })).success).toBe(true);
		expect(flightFormSchema.safeParse(makeInput({ dayLandings: -1 })).success).toBe(false);
	});
});

describe('validateCrossField', () => {
	it('returns no warnings for valid input', () => {
		const warnings = validateCrossField(
			makeInput({ totalTimeInput: '2+30', picTimeInput: '2+30' })
		);
		expect(warnings).toEqual([]);
	});

	it('warns when duration exceeds total time', () => {
		const warnings = validateCrossField(
			makeInput({ totalTimeInput: '2+00', picTimeInput: '3+00' })
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('PIC time');
	});

	it('warns for multiple exceeding durations', () => {
		const warnings = validateCrossField(
			makeInput({
				totalTimeInput: '1+00',
				nightTimeInput: '2+00',
				instrumentTimeInput: '1+30'
			})
		);
		expect(warnings).toHaveLength(2);
	});

	it('returns no warnings when total is empty', () => {
		const warnings = validateCrossField(makeInput({ picTimeInput: '5+00' }));
		expect(warnings).toEqual([]);
	});
});

describe('PIC time validation (bead 82p)', () => {
	it('PIC defaults to total (no warning when equal)', () => {
		// When PIC == Total, no warning
		const warnings = validateCrossField(
			makeInput({ totalTimeInput: '2+30', picTimeInput: '2+30' })
		);
		expect(warnings).toEqual([]);
	});

	it('PIC can be lower than total (no warning)', () => {
		const warnings = validateCrossField(
			makeInput({ totalTimeInput: '2+30', picTimeInput: '1+00' })
		);
		expect(warnings).toEqual([]);
	});

	it('PIC exceeding total produces warning', () => {
		const warnings = validateCrossField(
			makeInput({ totalTimeInput: '2+00', picTimeInput: '3+00' })
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('PIC time');
		expect(warnings[0]).toContain('exceeds total');
	});

	it('PIC exceeding total by 1 minute produces warning', () => {
		const warnings = validateCrossField(makeInput({ totalTimeInput: '2+00', picTimeInput: '2.1' }));
		// 2.1 hours = 126 min, 2+00 = 120 min → 126 > 120 → warning
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('PIC time');
	});

	it('no PIC warning when PIC is empty (defaults to total)', () => {
		const warnings = validateCrossField(makeInput({ totalTimeInput: '2+30', picTimeInput: '' }));
		expect(warnings).toEqual([]);
	});

	it('SIC alone does not trigger PIC warning', () => {
		const warnings = validateCrossField(
			makeInput({ totalTimeInput: '2+00', sicTimeInput: '3+00' })
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('SIC time');
		expect(warnings[0]).not.toContain('PIC');
	});
});

describe('clampPicTime', () => {
	it('returns null when PIC <= total (no clamping needed)', () => {
		expect(clampPicTime('2+00', '2+30')).toBeNull();
		expect(clampPicTime('2+30', '2+30')).toBeNull();
	});

	it('clamps PIC to total when PIC > total', () => {
		expect(clampPicTime('3+00', '2+30')).toBe('2+30');
	});

	it('clamps with decimal format inputs', () => {
		// PIC=3.0 (180min) > Total=2.5 (150min) → clamp to 2+30
		expect(clampPicTime('3.0', '2.5')).toBe('2+30');
	});

	it('returns null for empty/invalid inputs', () => {
		expect(clampPicTime('', '2+30')).toBeNull();
		expect(clampPicTime('2+00', '')).toBeNull();
		expect(clampPicTime('abc', '2+30')).toBeNull();
		expect(clampPicTime('2+00', 'xyz')).toBeNull();
	});

	it('clamps to zero when total is zero', () => {
		expect(clampPicTime('1+00', '0')).toBe('0+00');
	});
});
