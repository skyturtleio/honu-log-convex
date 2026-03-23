// Shared TypeScript types for flight logbook documents.
// Used by both server functions (convex/) and client collections.

export interface Landing {
	type: string; // "day", "night"
	count: number;
}

export interface Approach {
	type: string; // "ILS", "Visual", "RNAV", etc.
	runway: string;
	airport: string;
}

export interface Flight {
	id: string;
	ownerId?: string;
	flight_date: string; // "YYYY-MM-DD"
	flight_number?: string;
	aircraft_id?: string; // UUID ref to aircraft.id
	aircraft_type_id?: string;
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
	landings: Landing[];
	approaches: Approach[];
	remarks?: string;
	createdAt: number;
	updatedAt: number;
}

export interface Aircraft {
	id: string;
	ownerId?: string;
	tail_number: string;
	aircraft_type_id?: string;
	notes?: string;
	createdAt: number;
	updatedAt: number;
}
