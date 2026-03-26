#!/usr/bin/env bun
/**
 * Converts OurAirports CSV to JSONL for Convex import.
 *
 * Usage:
 *   curl -sL https://davidmegginson.github.io/ourairports-data/airports.csv -o /tmp/ourairports.csv
 *   bun scripts/prepare-airports.ts /tmp/ourairports.csv > scripts/airports-seed.jsonl
 *   npx convex import --table airports scripts/airports-seed.jsonl --replace
 */

import { readFileSync } from 'fs';
import { find } from 'geo-tz';

const csvPath = process.argv[2];
if (!csvPath) {
	console.error('Usage: bun scripts/prepare-airports.ts <path-to-airports.csv>');
	process.exit(1);
}

const raw = readFileSync(csvPath, 'utf-8');
const lines = raw.split('\n');
const header = parseCSVLine(lines[0]);

// Map header names to indices
const col = Object.fromEntries(header.map((h, i) => [h, i]));

let count = 0;

for (let i = 1; i < lines.length; i++) {
	const line = lines[i].trim();
	if (!line) continue;

	const fields = parseCSVLine(line);
	const icao = fields[col['icao_code']]?.trim();
	const type = fields[col['type']]?.trim();

	// Skip airports without ICAO codes
	if (!icao) continue;

	// Include small, medium, large airports (skip heliports, seaplane bases, closed)
	if (type !== 'small_airport' && type !== 'medium_airport' && type !== 'large_airport') continue;

	const iata = fields[col['iata_code']]?.trim() || undefined;
	const name = fields[col['name']]?.trim();
	const city = fields[col['municipality']]?.trim() || undefined;
	const country = fields[col['iso_country']]?.trim() || undefined;
	const state = fields[col['iso_region']]?.trim() || undefined;
	const lat = parseFloat(fields[col['latitude_deg']]);
	const lon = parseFloat(fields[col['longitude_deg']]);
	const elev = parseFloat(fields[col['elevation_ft']]);

	if (!name) continue;

	const doc: Record<string, unknown> = {
		icao,
		name
	};
	if (iata) doc.iata = iata;
	if (city) doc.city = city;
	if (country) doc.country = country;
	if (state) doc.state = state;
	if (!isNaN(lat)) doc.latitude = lat;
	if (!isNaN(lon)) doc.longitude = lon;
	if (!isNaN(elev)) doc.elevation_ft = elev;
	if (!isNaN(lat) && !isNaN(lon)) {
		const tzs = find(lat, lon);
		if (tzs.length > 0) doc.timezone = tzs[0];
	}

	console.log(JSON.stringify(doc));
	count++;
}

console.error(`Wrote ${count} airports`);

/** Simple CSV line parser that handles quoted fields */
function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				result.push(current);
				current = '';
			} else {
				current += ch;
			}
		}
	}
	result.push(current);
	return result;
}
