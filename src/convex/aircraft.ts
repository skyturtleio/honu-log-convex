import { replicate } from '@trestleinc/replicate/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { components } from './_generated/api';
import { getUserId } from './model/auth';
import { ownerIsolatedHooks } from './model/replicateAuth';
import type { Aircraft } from './types';

const r = replicate(components.replicate);

// --- Replicate-managed aircraft collection ---

const _aircraft = r<Aircraft>({
	collection: 'aircraft',
	hooks: ownerIsolatedHooks('aircraft', 'aircraft')
});

export const { stream, material, recovery, insert, update, remove, mark, compact } = _aircraft;

// --- Vanilla Convex: aircraft_types (reference data) ---

export const listTypes = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getUserId(ctx);
		const shared = await ctx.db
			.query('aircraft_types')
			.withIndex('by_user', (q) => q.eq('user_id', undefined))
			.collect();
		const custom = await ctx.db
			.query('aircraft_types')
			.withIndex('by_user', (q) => q.eq('user_id', userId))
			.collect();
		return [...shared, ...custom];
	}
});

export const createType = mutation({
	args: {
		designator: v.string(),
		make: v.string(),
		model: v.string(),
		category: v.string(),
		class: v.string(),
		engine_type: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		return await ctx.db.insert('aircraft_types', {
			...args,
			user_id: userId
		});
	}
});
