import { browser } from '$app/environment';
import { ConvexClient } from 'convex/browser';
import { PUBLIC_CONVEX_URL } from '$env/static/public';

let _client: ConvexClient | null = null;

/**
 * Get the shared ConvexClient singleton.
 * Auth is configured via setAuth() in the root layout.
 * Browser-only — throws during SSR.
 */
export function getConvexClient(): ConvexClient {
	if (!browser) {
		throw new Error('getConvexClient() can only be called in the browser');
	}
	if (!_client) {
		_client = new ConvexClient(PUBLIC_CONVEX_URL);
	}
	return _client;
}
