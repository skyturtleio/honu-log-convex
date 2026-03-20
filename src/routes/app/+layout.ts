import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const ssr = false;

const CACHED_USER_KEY = 'honu_cached_user';

export const load: LayoutLoad = async ({ parent }) => {
	const { user } = await parent();

	if (user) {
		localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
		return { user };
	}

	// Offline fallback: check localStorage
	const stored = localStorage.getItem(CACHED_USER_KEY);
	if (stored) {
		try {
			return { user: JSON.parse(stored) };
		} catch {
			// fall through to redirect
		}
	}

	redirect(302, '/');
};
