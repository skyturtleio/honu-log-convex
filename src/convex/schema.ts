import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// --- Embedded sub-schemas ---

/** A landing entry embedded in a flight */
const landing = v.object({
	type: v.string(), // "day", "night", future: "carrier_day", "carrier_night", etc.
	count: v.number()
});

/** An approach entry embedded in a flight */
const approach = v.object({
	type: v.string(), // "ILS", "Visual", "RNAV", "VOR", "LOC", etc.
	runway: v.string(), // e.g. "22L"
	airport: v.string() // ICAO code, e.g. "KLGA"
});

// --- Schema ---

export default defineSchema({
	aircraft_types: defineTable({
		user_id: v.optional(v.string()), // null = shared reference data
		designator: v.string(), // ICAO type designator, e.g. "BCS3"
		make: v.string(), // e.g. "Airbus"
		model: v.string(), // e.g. "A220-300"
		category: v.string(), // e.g. "airplane"
		class: v.string(), // e.g. "multi-engine land"
		engine_type: v.string() // e.g. "jet"
	})
		.index('by_user', ['user_id'])
		.index('by_designator', ['designator']),

	aircraft: defineTable({
		user_id: v.string(),
		tail_number: v.string(), // e.g. "N839DN"
		aircraft_type_id: v.optional(v.id('aircraft_types')),
		notes: v.optional(v.string())
	})
		.index('by_user', ['user_id'])
		.index('by_user_tail', ['user_id', 'tail_number'])
		.index('by_aircraft_type', ['aircraft_type_id']),

	airports: defineTable({
		user_id: v.optional(v.string()), // null = global reference data
		icao: v.string(), // e.g. "KLGA"
		iata: v.optional(v.string()), // e.g. "LGA"
		name: v.string(), // e.g. "LaGuardia Airport"
		city: v.optional(v.string()),
		country: v.optional(v.string()),
		latitude: v.optional(v.float64()), // for night time calc
		longitude: v.optional(v.float64())
	})
		.index('by_icao', ['icao'])
		.index('by_iata', ['iata'])
		.index('by_user', ['user_id']),

	flights: defineTable({
		user_id: v.string(),
		flight_date: v.string(), // "2024-03-15" plain date
		flight_number: v.optional(v.string()), // e.g. "DL1234"
		aircraft_id: v.optional(v.id('aircraft')),
		aircraft_type_id: v.optional(v.id('aircraft_types')), // denormalized from aircraft
		dep_airport: v.optional(v.string()), // ICAO code
		arr_airport: v.optional(v.string()), // ICAO code

		// OOOI times — ISO 8601 UTC strings
		time_out: v.optional(v.string()),
		time_off: v.optional(v.string()),
		time_on: v.optional(v.string()),
		time_in: v.optional(v.string()),

		// Durations — integer minutes
		total_time: v.optional(v.number()), // block time (Out to In), or manual
		pic_time: v.optional(v.number()), // defaults to total_time
		sic_time: v.optional(v.number()),
		night_time: v.optional(v.number()), // auto-calc from sunrise/sunset, editable
		instrument_time: v.optional(v.number()),
		cross_country_time: v.optional(v.number()),

		// Embedded arrays
		landings: v.array(landing),
		approaches: v.array(approach),

		remarks: v.optional(v.string())
	})
		.index('by_user_date', ['user_id', 'flight_date'])
		.index('by_user', ['user_id'])
		.index('by_aircraft', ['aircraft_id'])
});
