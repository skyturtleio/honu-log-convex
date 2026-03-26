<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getConvexClient } from '$lib/convex';
	import { flightsCollection } from '$lib/collections/useFlights';
	import { aircraftCollection } from '$lib/collections/useAircraft';

	let { children } = $props();

	let ready = $state(false);

	async function fetchToken() {
		const res = await fetch('/api/convex-token');
		if (!res.ok) return null;
		const data = await res.json();
		return data.token;
	}

	onMount(async () => {
		const client = getConvexClient();

		if (page.data.user) {
			client.setAuth(fetchToken);
		}

		await Promise.all([flightsCollection.init(), aircraftCollection.init()]);

		ready = true;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if ready}
	{@render children()}
{:else}
	<span>Loading...</span>
{/if}
