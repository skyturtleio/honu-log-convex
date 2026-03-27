<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getConvexClient } from '$lib/convex';
	import { flightsCollection } from '$lib/collections/useFlights';
	import { aircraftCollection } from '$lib/collections/useAircraft';
	import { reconcileCollection } from '$lib/reconcile';
	import { api } from '../convex/_generated/api';

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

		// Reconcile local CRDT cache with server after init (non-blocking).
		// Catches ghost documents left by direct Convex dashboard deletions.
		if (page.data.user) {
			Promise.all([
				reconcileCollection(aircraftCollection.get(), api.aircraft.listDocIds),
				reconcileCollection(flightsCollection.get(), api.flights.listDocIds)
			]).catch((err) => console.error('[reconcile] Failed:', err));
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if ready}
	{@render children()}
{:else}
	<span>Loading...</span>
{/if}
