import { replicate } from '@trestleinc/replicate/server';
import type { GenericMutationCtx, GenericQueryCtx, GenericDataModel } from 'convex/server';
import { components } from './_generated/api';
import type { Flight } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const r = replicate((components as any).replicate);

async function requireAuth(
	ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>
) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error('Not authenticated');
	return identity;
}

export const flights = r<Flight>({
	collection: 'flights',
	hooks: {
		evalRead: async (ctx) => {
			await requireAuth(ctx);
		},
		evalWrite: async (ctx, doc) => {
			const identity = await requireAuth(ctx);
			if (doc.ownerId && doc.ownerId !== identity.subject) {
				throw new Error("Forbidden: cannot write another user's flight");
			}
		},
		evalRemove: async (ctx, docId) => {
			const identity = await requireAuth(ctx);
			const existing = await (ctx as GenericMutationCtx<GenericDataModel>).db
				.query('flights')
				.withIndex('by_doc_id', (q) => q.eq('id', docId))
				.first();
			if (existing && existing.ownerId && existing.ownerId !== identity.subject) {
				throw new Error("Forbidden: cannot delete another user's flight");
			}
		}
	}
});
