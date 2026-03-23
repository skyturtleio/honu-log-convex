import { collection } from '@trestleinc/replicate/client';
import { z } from 'zod';
import { api } from '../convex/_generated/api';
import { createPersistence } from '$lib/persistence';
import { getConvexClient } from '$lib/convex';

export const aircraftSchema = z.object({
	id: z.string(),
	ownerId: z.string().optional(),
	tail_number: z.string(),
	aircraft_type_id: z.string().optional(),
	notes: z.string().optional(),
	createdAt: z.number(),
	updatedAt: z.number()
});

export type Aircraft = z.infer<typeof aircraftSchema>;

export const aircraftCollection = collection.create({
	persistence: createPersistence,
	config: () => ({
		convexClient: getConvexClient(),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		api: (api as any).aircraft,
		schema: aircraftSchema,
		getKey: (aircraft: Aircraft) => aircraft.id
	})
});
