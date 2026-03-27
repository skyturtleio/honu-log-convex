import { replicate } from '@trestleinc/replicate/server';
import { components } from './_generated/api';
import { query } from './_generated/server';
import { getUserId } from './model/auth';
import { ownerIsolatedHooks } from './model/replicateAuth';
import type { Flight } from './types';

const r = replicate(components.replicate);

const _flights = r<Flight>({
	collection: 'flights',
	hooks: ownerIsolatedHooks('flights', 'flight')
});

export const { stream, material, recovery, insert, update, remove, mark, compact } = _flights;

/** Returns document IDs that actually exist in the main table for the current user. */
export const listDocIds = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getUserId(ctx);
		const docs = await ctx.db
			.query('flights')
			.withIndex('by_owner', (q) => q.eq('ownerId', userId))
			.collect();
		return docs.map((d) => d.id);
	}
});
