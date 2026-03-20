<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { setupConvex, useConvexClient } from 'convex-svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);
	const client = useConvexClient();

	async function fetchToken() {
		const res = await fetch('/api/convex-token');
		if (!res.ok) return null;
		const data = await res.json();
		return data.token;
	}

	// Only set auth when user is logged in to avoid 401 noise
	let hasUser = $derived(!!page.data.user);
	$effect(() => {
		if (hasUser) {
			client.setAuth(fetchToken);
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
