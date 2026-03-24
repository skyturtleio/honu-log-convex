import { collection } from '@trestleinc/replicate/client';
import { api } from '../convex/_generated/api';
import { createPersistence } from '$lib/persistence';
import { getConvexClient } from '$lib/convex';
import { aircraftSchema, type Aircraft } from '../schemas/aircraft';

export { aircraftSchema };
export type { Aircraft } from '../schemas/aircraft';

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
