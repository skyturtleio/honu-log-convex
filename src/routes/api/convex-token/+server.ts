import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const logtoClient = locals.logtoClient;

	// Get access token scoped to the Convex API Resource
	// The resource identifier must match LOGTO_API_IDENTIFIER in Convex env
	try {
		const token = await logtoClient.getAccessToken('https://honu-log-api.dev');
		if (!token) throw error(401, 'No access token available');
		return json({ token });
	} catch (err) {
		throw error(401, 'Not authenticated or token expired');
	}
};
