import { collection } from '@trestleinc/replicate/client';
import { z } from 'zod';
import { api } from '../convex/_generated/api';
import { createPersistence } from '$lib/persistence';
import { getConvexClient } from '$lib/convex';

const landingSchema = z.object({
	type: z.string(),
	count: z.number()
});

const approachSchema = z.object({
	type: z.string(),
	runway: z.string(),
	airport: z.string()
});

export const flightSchema = z.object({
	id: z.string(),
	ownerId: z.string().optional(),
	flight_date: z.string(),
	flight_number: z.string().optional(),
	aircraft_id: z.string().optional(),
	aircraft_type_id: z.string().optional(),
	dep_airport: z.string().optional(),
	arr_airport: z.string().optional(),
	time_out: z.string().optional(),
	time_off: z.string().optional(),
	time_on: z.string().optional(),
	time_in: z.string().optional(),
	total_time: z.number().optional(),
	pic_time: z.number().optional(),
	sic_time: z.number().optional(),
	night_time: z.number().optional(),
	instrument_time: z.number().optional(),
	cross_country_time: z.number().optional(),
	landings: z.array(landingSchema),
	approaches: z.array(approachSchema),
	remarks: z.string().optional(),
	createdAt: z.number(),
	updatedAt: z.number()
});

export type Flight = z.infer<typeof flightSchema>;

export const flightsCollection = collection.create({
	persistence: createPersistence,
	config: () => ({
		convexClient: getConvexClient(),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		api: (api as any).flights.flights,
		schema: flightSchema,
		getKey: (flight: Flight) => flight.id
	})
});
