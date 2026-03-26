import { defineSchema, defineTable } from 'convex/server';
import { schema } from '@trestleinc/replicate/server';
import { v } from 'convex/values';

// --- Embedded sub-validators (used in server functions) ---

export const landingValidator = v.object({
	type: v.string(), // "day", "night"
	count: v.number()
});

export const approachValidator = v.object({
	type: v.string(), // "ILS", "Visual", "RNAV", etc.
	runway: v.string(), // e.g. "22L"
	airport: v.string() // ICAO code
});

// --- Schema ---

export default defineSchema({
	// Replicate-managed collections
	// schema.table() auto-adds: timestamp (number)
	aircraft: schema.table(
		{
			id: v.string(), // UUID from client
			ownerId: v.optional(v.string()), // Logto user subject
			tail_number: v.string(),
			aircraft_type_id: v.optional(v.string()), // Convex _id of aircraft_types doc
			notes: v.optional(v.string()),
			createdAt: v.number(),
			updatedAt: v.number()
		},
		(t) => t.index('by_doc_id', ['id']).index('by_owner', ['ownerId'])
	),

	flights: schema.table(
		{
			id: v.string(), // UUID from client
			ownerId: v.optional(v.string()), // Logto user subject
			flight_date: v.string(), // "2024-03-15" plain date
			flight_number: v.optional(v.string()),
			aircraft_id: v.optional(v.string()), // UUID ref to aircraft.id
			aircraft_type_id: v.optional(v.string()), // Convex _id of aircraft_types
			dep_airport: v.optional(v.string()), // ICAO code
			arr_airport: v.optional(v.string()), // ICAO code

			// OOOI times — ISO 8601 UTC strings
			time_out: v.optional(v.string()),
			time_off: v.optional(v.string()),
			time_on: v.optional(v.string()),
			time_in: v.optional(v.string()),

			// Durations — integer minutes
			total_time: v.optional(v.number()),
			pic_time: v.optional(v.number()),
			sic_time: v.optional(v.number()),
			night_time: v.optional(v.number()),
			instrument_time: v.optional(v.number()),
			cross_country_time: v.optional(v.number()),

			// Embedded arrays
			landings: v.array(landingValidator),
			approaches: v.array(approachValidator),

			remarks: v.optional(v.string()),
			createdAt: v.number(),
			updatedAt: v.number()
		},
		(t) =>
			t
				.index('by_doc_id', ['id'])
				.index('by_owner', ['ownerId'])
				.index('by_owner_date', ['ownerId', 'flight_date'])
	),

	// Vanilla Convex (reference data, no CRDT needed)
	aircraft_types: defineTable({
		user_id: v.optional(v.string()), // null = shared reference data
		designator: v.string(),
		make: v.string(),
		model: v.string(),
		category: v.string(),
		class: v.string(),
		engine_type: v.string()
	})
		.index('by_user', ['user_id'])
		.index('by_designator', ['designator']),

	airports: defineTable({
		user_id: v.optional(v.string()), // null = global reference data
		icao: v.string(),
		iata: v.optional(v.string()),
		name: v.string(),
		city: v.optional(v.string()),
		country: v.optional(v.string()),
		state: v.optional(v.string()), // ISO 3166-2 subdivision (e.g. "US-GA")
		latitude: v.optional(v.float64()),
		longitude: v.optional(v.float64()),
		elevation_ft: v.optional(v.float64()),
		timezone: v.optional(v.string()) // IANA timezone (e.g. "America/New_York")
	})
		.index('by_icao', ['icao'])
		.index('by_iata', ['iata'])
		.index('by_user', ['user_id'])
		.searchIndex('search_name', { searchField: 'name', filterFields: ['user_id'] })
});
