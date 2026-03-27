import { getConvexClient } from '$lib/convex';
import type { FunctionReference } from 'convex/server';

/**
 * Reconcile a Replicate collection with the Convex main table.
 *
 * Deletes from the Convex dashboard bypass Replicate's CRDT event log,
 * leaving ghost documents in the local cache. This function compares
 * local CRDT items with the authoritative server-side IDs and removes
 * orphaned local documents through the normal Replicate delete path
 * (which creates proper CRDT delete deltas for all peers).
 */
export async function reconcileCollection<T extends { id: string }>(
	collection: { values(): Iterable<T>; delete(key: string): void },
	listDocIdsRef: FunctionReference<'query'>
): Promise<number> {
	const client = getConvexClient();
	const serverIds: string[] = await client.query(listDocIdsRef, {});
	const serverIdSet = new Set(serverIds);

	let deletedCount = 0;
	for (const item of collection.values()) {
		if (!serverIdSet.has(item.id)) {
			collection.delete(item.id);
			deletedCount++;
		}
	}

	if (deletedCount > 0) {
		console.warn(`[reconcile] Removed ${deletedCount} orphaned document(s) from local cache`);
	}

	return deletedCount;
}
