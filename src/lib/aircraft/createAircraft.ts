import { aircraftCollection } from '$lib/collections/useAircraft';

/**
 * Create a new aircraft in the local CRDT collection.
 * Centralizes aircraft creation so all call sites (aircraft/new, flights/new, flights/[id])
 * produce consistent records.
 */
export function createAircraft(
	ownerId: string,
	tailNumber: string,
	opts?: { aircraft_type_id?: string; notes?: string }
): string {
	const id = crypto.randomUUID();
	const now = Date.now();
	aircraftCollection.get().insert({
		id,
		ownerId,
		tail_number: tailNumber.toUpperCase(),
		...(opts?.aircraft_type_id ? { aircraft_type_id: opts.aircraft_type_id } : {}),
		...(opts?.notes ? { notes: opts.notes } : {}),
		createdAt: now,
		updatedAt: now
	});
	return id;
}
