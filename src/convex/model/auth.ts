import type { QueryCtx, MutationCtx } from '../_generated/server';

export async function getAuthUser(ctx: QueryCtx | MutationCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error('Not authenticated');
	}
	return identity;
}

export async function getUserId(ctx: QueryCtx | MutationCtx) {
	const identity = await getAuthUser(ctx);
	return identity.subject;
}
