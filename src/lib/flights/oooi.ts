/**
 * OOOI time parsing — converts 4-digit Zulu strings to ISO 8601 UTC timestamps.
 *
 * Parsing rule: each OOOI time resolves relative to the previous one.
 * If the entered time is numerically less than the previous, it crossed midnight — add one day.
 * OUT anchors to flight_date.
 */

/**
 * Parse a 4-digit Zulu string (e.g. "2350") into hours and minutes.
 * Returns null for invalid input.
 */
export function parseZulu(input: string): { hours: number; minutes: number } | null {
	const cleaned = input.replace(/[:\s]/g, '');
	if (!/^\d{4}$/.test(cleaned)) return null;

	const hours = parseInt(cleaned.slice(0, 2), 10);
	const minutes = parseInt(cleaned.slice(2), 10);

	if (hours > 23 || minutes > 59) return null;
	return { hours, minutes };
}

/**
 * Convert a flight_date + 4 OOOI Zulu strings to ISO 8601 UTC timestamps.
 * Each time resolves relative to the previous; midnight crossing adds a day.
 *
 * @param flightDate - Plain date string "YYYY-MM-DD"
 * @param times - Object with out/off/on/in as 4-digit Zulu strings (any may be empty)
 * @returns Object with ISO 8601 strings for each provided time
 */
export function resolveOooiTimes(
	flightDate: string,
	times: { out?: string; off?: string; on?: string; in?: string }
): {
	time_out?: string;
	time_off?: string;
	time_on?: string;
	time_in?: string;
} {
	const result: {
		time_out?: string;
		time_off?: string;
		time_on?: string;
		time_in?: string;
	} = {};

	const baseDate = new Date(flightDate + 'T00:00:00Z');
	if (isNaN(baseDate.getTime())) return result;

	let prevTotalMinutes = -1;
	let dayOffset = 0;

	const keys = ['out', 'off', 'on', 'in'] as const;
	const resultKeys = ['time_out', 'time_off', 'time_on', 'time_in'] as const;

	for (let i = 0; i < keys.length; i++) {
		const raw = times[keys[i]];
		if (!raw) continue;

		const parsed = parseZulu(raw);
		if (!parsed) continue;

		const totalMinutes = parsed.hours * 60 + parsed.minutes;

		// Midnight crossing: if this time is earlier than the previous, we crossed midnight
		if (prevTotalMinutes >= 0 && totalMinutes < prevTotalMinutes) {
			dayOffset++;
		}
		prevTotalMinutes = totalMinutes;

		const ts = new Date(baseDate);
		ts.setUTCDate(ts.getUTCDate() + dayOffset);
		ts.setUTCHours(parsed.hours, parsed.minutes, 0, 0);

		result[resultKeys[i]] = ts.toISOString();
	}

	return result;
}

/**
 * Calculate block time (Out to In) in minutes.
 * Returns null if either time is missing.
 */
export function calculateBlockTime(timeOut?: string, timeIn?: string): number | null {
	if (!timeOut || !timeIn) return null;

	const out = new Date(timeOut);
	const inTime = new Date(timeIn);
	if (isNaN(out.getTime()) || isNaN(inTime.getTime())) return null;

	const diffMs = inTime.getTime() - out.getTime();
	if (diffMs < 0) return null;

	return Math.round(diffMs / 60000);
}

/**
 * Format minutes as decimal hours for display (e.g. 135 → "2.3")
 */
export function formatDecimalHours(minutes: number | null | undefined): string {
	if (minutes == null) return '';
	return (minutes / 60).toFixed(1);
}

/**
 * Format minutes as hours+minutes for display (e.g. 135 → "2+15")
 */
export function formatPlusMinutes(minutes: number | null | undefined): string {
	if (minutes == null) return '';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h}+${m.toString().padStart(2, '0')}`;
}

/**
 * Parse duration input to minutes. Accepts:
 * - Decimal hours: "2.3" → 138
 * - Plus-minutes:  "2+06" → 126
 */
export function parseDuration(input: string): number | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Reject if contains '+' but doesn't match plus-minutes format
	if (trimmed.includes('+')) {
		const plusMatch = trimmed.match(/^(\d+)\+(\d{1,2})$/);
		if (!plusMatch) return null;
		const hours = parseInt(plusMatch[1], 10);
		const mins = parseInt(plusMatch[2], 10);
		if (mins > 59) return null;
		return hours * 60 + mins;
	}

	// Decimal hours: "2.3", "1.0", "0"
	const num = parseFloat(trimmed);
	if (isNaN(num) || num < 0) return null;
	return Math.round(num * 60);
}

/**
 * Parse decimal hours input to minutes (e.g. "2.3" → 138, "2+06" → 126)
 * @deprecated Use parseDuration instead
 */
export function parseDecimalHours(input: string): number | null {
	return parseDuration(input);
}

/**
 * Extract 4-digit Zulu display from ISO 8601 string (e.g. "2024-03-15T23:50:00.000Z" → "2350")
 */
export function toZuluDisplay(iso?: string): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (isNaN(d.getTime())) return '';
	const h = d.getUTCHours().toString().padStart(2, '0');
	const m = d.getUTCMinutes().toString().padStart(2, '0');
	return h + m;
}
