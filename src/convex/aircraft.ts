import { replicate } from '@trestleinc/replicate/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { GenericMutationCtx, GenericQueryCtx, GenericDataModel } from 'convex/server';
import { components } from './_generated/api';
import { getUserId } from './model/auth';
import type { Aircraft } from './types';

const r = replicate(components.replicate);

async function requireAuth(
	ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>
) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error('Not authenticated');
	return identity;
}

// --- Replicate-managed aircraft collection ---

const _aircraft = r<Aircraft>({
	collection: 'aircraft',
	hooks: {
		evalRead: async (ctx) => {
			await requireAuth(ctx);
		},
		evalWrite: async (ctx, doc) => {
			const identity = await requireAuth(ctx);
			if (doc.ownerId && doc.ownerId !== identity.subject) {
				throw new Error("Forbidden: cannot write another user's aircraft");
			}
		},
		evalRemove: async (ctx, docId) => {
			const identity = await requireAuth(ctx);
			const existing = await (ctx as GenericMutationCtx<GenericDataModel>).db
				.query('aircraft')
				.withIndex('by_doc_id', (q) => q.eq('id', docId))
				.first();
			if (existing && existing.ownerId && existing.ownerId !== identity.subject) {
				throw new Error("Forbidden: cannot delete another user's aircraft");
			}
		}
	}
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
