import { collection } from '@trestleinc/replicate/client';
import { api } from '../../convex/_generated/api';
import { createPersistence } from '$lib/persistence';
import { getConvexClient } from '$lib/convex';
import { flightSchema, type Flight } from '../../schemas/flight';

export { flightSchema };
export type { Flight } from '../../schemas/flight';

export const flightsCollection = collection.create({
	persistence: createPersistence,
	config: () => ({
		convexClient: getConvexClient(),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		api: (api as any).flights,
		schema: flightSchema,
		getKey: (flight: Flight) => flight.id
	})
});
