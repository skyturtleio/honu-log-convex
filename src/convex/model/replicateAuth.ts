import type { GenericMutationCtx, GenericQueryCtx, GenericDataModel } from 'convex/server';

type Ctx = GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>;

export async function requireAuth(ctx: Ctx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error('Not authenticated');
	return identity;
}

/**
 * Create standard Replicate auth hooks for an owner-isolated collection.
 * @param tableName - The Convex table name (e.g. 'aircraft', 'flights')
 * @param entityLabel - Human-readable label for error messages (e.g. 'aircraft', 'flight')
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ownerIsolatedHooks(tableName: string, entityLabel: string): any {
	return {
		evalRead: async (ctx: Ctx) => {
			await requireAuth(ctx);
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		evalWrite: async (ctx: Ctx, doc: any) => {
			const identity = await requireAuth(ctx);
			if (doc.ownerId && doc.ownerId !== identity.subject) {
				throw new Error(`Forbidden: cannot write another user's ${entityLabel}`);
			}
		},
		evalRemove: async (ctx: Ctx, docId: string) => {
			const identity = await requireAuth(ctx);
			const existing = await (ctx as GenericMutationCtx<GenericDataModel>).db
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.query(tableName as any)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.withIndex('by_doc_id', (q: any) => q.eq('id', docId))
				.first();
			if (
				existing &&
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(existing as any).ownerId &&
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(existing as any).ownerId !== identity.subject
			) {
				throw new Error(`Forbidden: cannot delete another user's ${entityLabel}`);
			}
		}
	};
}
