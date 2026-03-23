import type { ConvexCollection } from '@trestleinc/replicate/client';

/**
 * Creates a reactive wrapper around a Replicate collection.
 * Uses Svelte 5 runes for reactivity.
 * Must be called at component initialization time (not inside effects).
 */
export function useCollection<T extends object>(col: ConvexCollection<T>) {
	let items = $state<T[]>([...col.values()]);

	col.subscribeChanges(() => {
		items = [...col.values()];
	});

	return {
		get data(): T[] {
			return items;
		}
	};
}
