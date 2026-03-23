import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getUserId } from './model/auth';

// --- Aircraft Types ---

export const listTypes = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getUserId(ctx);
		// Return shared reference types (user_id undefined) + user's custom types
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

// --- Aircraft ---

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getUserId(ctx);
		return await ctx.db
			.query('aircraft')
			.withIndex('by_user', (q) => q.eq('user_id', userId))
			.collect();
	}
});

export const get = query({
	args: { id: v.id('aircraft') },
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const aircraft = await ctx.db.get(args.id);
		if (!aircraft || aircraft.user_id !== userId) {
			return null;
		}
		return aircraft;
	}
});

export const create = mutation({
	args: {
		tail_number: v.string(),
		aircraft_type_id: v.string(),
		notes: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		return await ctx.db.insert('aircraft', {
			...args,
			user_id: userId
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('aircraft'),
		tail_number: v.optional(v.string()),
		aircraft_type_id: v.optional(v.string()),
		notes: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const { id, ...fields } = args;

		const existing = await ctx.db.get(id);
		if (!existing || existing.user_id !== userId) {
			throw new Error('Aircraft not found');
		}

		const patch: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(fields)) {
			if (value !== undefined) {
				patch[key] = value;
			}
		}

		await ctx.db.patch(id, patch);
		return id;
	}
});

export const remove = mutation({
	args: { id: v.id('aircraft') },
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const aircraft = await ctx.db.get(args.id);
		if (!aircraft || aircraft.user_id !== userId) {
			throw new Error('Aircraft not found');
		}
		await ctx.db.delete(args.id);
	}
});
