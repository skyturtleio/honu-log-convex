import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getUserId } from './model/auth';

export const search = query({
	args: {
		query: v.string(),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const limit = args.limit ?? 10;
		const q = args.query.toUpperCase();

		// Search by ICAO code first (exact prefix match)
		const byIcao = await ctx.db
			.query('airports')
			.withIndex('by_icao')
			.filter((f) =>
				f.and(
					f.gte(f.field('icao'), q),
					f.lt(f.field('icao'), q + '\uffff'),
					f.or(f.eq(f.field('user_id'), undefined), f.eq(f.field('user_id'), userId))
				)
			)
			.take(limit);

		if (byIcao.length >= limit) return byIcao;

		// Also search by IATA
		const byIata = await ctx.db
			.query('airports')
			.withIndex('by_iata')
			.filter((f) =>
				f.and(
					f.gte(f.field('iata'), q),
					f.lt(f.field('iata'), q + '\uffff'),
					f.or(f.eq(f.field('user_id'), undefined), f.eq(f.field('user_id'), userId))
				)
			)
			.take(limit);

		// Deduplicate by _id
		const seen = new Set(byIcao.map((a) => a._id));
		const combined = [...byIcao];
		for (const a of byIata) {
			if (!seen.has(a._id)) {
				combined.push(a);
				seen.add(a._id);
			}
		}

		return combined.slice(0, limit);
	}
});

export const getByIcao = query({
	args: { icao: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('airports')
			.withIndex('by_icao', (q) => q.eq('icao', args.icao.toUpperCase()))
			.first();
	}
});

export const create = mutation({
	args: {
		icao: v.string(),
		iata: v.optional(v.string()),
		name: v.string(),
		city: v.optional(v.string()),
		country: v.optional(v.string()),
		latitude: v.optional(v.float64()),
		longitude: v.optional(v.float64())
	},
	handler: async (ctx, args) => {
		const userId = await getUserId(ctx);
		const doc: {
			icao: string;
			name: string;
			user_id: string;
			iata?: string;
			city?: string;
			country?: string;
			latitude?: number;
			longitude?: number;
		} = {
			...args,
			icao: args.icao.toUpperCase(),
			user_id: userId
		};
		if (args.iata) {
			doc.iata = args.iata.toUpperCase();
		}
		return await ctx.db.insert('airports', doc);
	}
});
