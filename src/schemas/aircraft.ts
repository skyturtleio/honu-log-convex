import { z } from 'zod';

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
