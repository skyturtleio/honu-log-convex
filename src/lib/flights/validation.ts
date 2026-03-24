import { z } from 'zod';
import { parseZulu, parseDuration } from './oooi';

const zuluTime = z
	.string()
	.refine((v) => !v || parseZulu(v) !== null, 'Invalid time (use 4-digit Zulu like 2350)');

const duration = z
	.string()
	.refine((v) => !v || parseDuration(v) !== null, 'Invalid duration (use 2+30 or 2.5)');

export const flightFormSchema = z.object({
	flightDate: z.string().min(1, 'Date is required'),
	flightNumber: z.string(),
	aircraftId: z.string(),
	depAirport: z
		.string()
		.refine((v) => !v || /^[A-Za-z]{1,4}$/.test(v), 'Use 1-4 letter airport code'),
	arrAirport: z
		.string()
		.refine((v) => !v || /^[A-Za-z]{1,4}$/.test(v), 'Use 1-4 letter airport code'),
	timeOut: zuluTime,
	timeOff: zuluTime,
	timeOn: zuluTime,
	timeIn: zuluTime,
	totalTimeInput: duration,
	picTimeInput: duration,
	sicTimeInput: duration,
	nightTimeInput: duration,
	instrumentTimeInput: duration,
	crossCountryTimeInput: duration,
	dayLandings: z.number().int().min(0, 'Must be 0 or more'),
	nightLandings: z.number().int().min(0, 'Must be 0 or more'),
	approachType: z.string(),
	approachRunway: z.string(),
	approachAirport: z.string(),
	remarks: z.string()
});

export type FlightFormInput = z.infer<typeof flightFormSchema>;

/** Cross-field validation: check durations don't exceed total time. */
export function validateCrossField(input: FlightFormInput): string[] {
	const warnings: string[] = [];

	const totalStr = input.totalTimeInput;
	if (!totalStr) return warnings;

	const totalMinutes = parseDuration(totalStr);
	if (totalMinutes == null) return warnings;

	const checks = [
		['PIC time', input.picTimeInput],
		['SIC time', input.sicTimeInput],
		['Night time', input.nightTimeInput],
		['Instrument time', input.instrumentTimeInput],
		['Cross country time', input.crossCountryTimeInput]
	] as const;

	for (const [name, value] of checks) {
		if (!value) continue;
		const mins = parseDuration(value);
		if (mins != null && mins > totalMinutes) {
			warnings.push(`${name} exceeds total time`);
		}
	}

	return warnings;
}

/** Data returned from FlightForm after parsing, ready for insert/update. */
export interface FlightFormData {
	flight_date: string;
	flight_number?: string;
	aircraft_id?: string;
	dep_airport?: string;
	arr_airport?: string;
	time_out?: string;
	time_off?: string;
	time_on?: string;
	time_in?: string;
	total_time?: number;
	pic_time?: number;
	sic_time?: number;
	night_time?: number;
	instrument_time?: number;
	cross_country_time?: number;
	landings: Array<{ type: string; count: number }>;
	approaches: Array<{ type: string; runway: string; airport: string }>;
	remarks?: string;
}
