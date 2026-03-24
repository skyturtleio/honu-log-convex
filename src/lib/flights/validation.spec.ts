import { describe, expect, it } from 'vitest';
import { flightFormSchema, validateCrossField, type FlightFormInput } from './validation';

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
