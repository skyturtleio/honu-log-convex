import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getUserId } from './model/auth';

const landing = v.object({
	type: v.string(),
	count: v.number()
});

const approach = v.object({
	type: v.string(),
	runway: v.string(),
	airport: v.string()
});

export const list = query({
	args: {
		limit: v.optional(v.number()),
		cursor: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const limit = args.limit ?? 50;

		const q = ctx.db
			.query('flights')
			.withIndex('by_user_date', (q) => q.eq('user_id', userId))
			.order('desc');

		const flights = await q.take(limit + 1);

		const hasMore = flights.length > limit;
		const page = hasMore ? flights.slice(0, limit) : flights;

		return {
			flights: page,
			hasMore,
			cursor: hasMore ? page[page.length - 1]._id : undefined
		};
	}
});

export const get = query({
	args: { id: v.id('flights') },
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const flight = await ctx.db.get(args.id);
		if (!flight || flight.user_id !== userId) {
			return null;
		}
		return flight;
	}
});

export const create = mutation({
	args: {
		flight_date: v.string(),
		flight_number: v.optional(v.string()),
		aircraft_id: v.optional(v.string()),
		aircraft_type_id: v.optional(v.string()),
		dep_airport: v.optional(v.string()),
		arr_airport: v.optional(v.string()),
		time_out: v.optional(v.string()),
		time_off: v.optional(v.string()),
		time_on: v.optional(v.string()),
		time_in: v.optional(v.string()),
		total_time: v.optional(v.number()),
		pic_time: v.optional(v.number()),
		sic_time: v.optional(v.number()),
		night_time: v.optional(v.number()),
		instrument_time: v.optional(v.number()),
		cross_country_time: v.optional(v.number()),
		landings: v.array(landing),
		approaches: v.array(approach),
		remarks: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		return await ctx.db.insert('flights', {
			...args,
			user_id: userId
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('flights'),
		flight_date: v.optional(v.string()),
		flight_number: v.optional(v.string()),
		aircraft_id: v.optional(v.string()),
		aircraft_type_id: v.optional(v.string()),
		dep_airport: v.optional(v.string()),
		arr_airport: v.optional(v.string()),
		time_out: v.optional(v.string()),
		time_off: v.optional(v.string()),
		time_on: v.optional(v.string()),
		time_in: v.optional(v.string()),
		total_time: v.optional(v.number()),
		pic_time: v.optional(v.number()),
		sic_time: v.optional(v.number()),
		night_time: v.optional(v.number()),
		instrument_time: v.optional(v.number()),
		cross_country_time: v.optional(v.number()),
		landings: v.optional(v.array(landing)),
		approaches: v.optional(v.array(approach)),
		remarks: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const { id, ...fields } = args;

		const existing = await ctx.db.get(id);
		if (!existing || existing.user_id !== userId) {
			throw new Error('Flight not found');
		}

		// Only patch provided fields
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
	args: { id: v.id('flights') },
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const flight = await ctx.db.get(args.id);
		if (!flight || flight.user_id !== userId) {
			throw new Error('Flight not found');
		}
		await ctx.db.delete(args.id);
	}
});
