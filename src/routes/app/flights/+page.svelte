<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { flightsCollection } from '$lib/collections/useFlights';
	import { aircraftCollection } from '$lib/collections/useAircraft';
	import { useCollection } from '$lib/useCollection.svelte';
	import { errorMessage } from '$lib/errorMessage';

	let deletingId = $state<string | null>(null);
	let error = $state('');

	const flightsStore = useCollection(flightsCollection.get());
	const aircraftStore = useCollection(aircraftCollection.get());

	const sortedFlights = $derived(
		[...flightsStore.data].sort((a, b) => b.flight_date.localeCompare(a.flight_date))
	);

	const aircraftById = $derived(new Map(aircraftStore.data.map((a) => [a.id, a.tail_number])));

	function goToEdit(id: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is used, query param appended after
		goto(resolve('/app/flights/[id]', { id }) + '?edit=true');
	}

	function formatTime(minutes: number | undefined): string {
		if (minutes == null) return '--';
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return `${h}+${m.toString().padStart(2, '0')}`;
	}

	async function handleDelete(id: string) {
		try {
			error = '';
			await flightsCollection.get().delete(id);
		} catch (e) {
			error = errorMessage(e, 'Failed to delete flight');
		} finally {
			deletingId = null;
		}
	}
</script>

<div>
	<header style="display: flex; justify-content: space-between; align-items: center;">
		<h1>Flights</h1>
		<a href={resolve('/app/flights/new')}>New Flight</a>
	</header>

	{#if error}
		<p role="alert" style="color: red;">{error}</p>
	{/if}

	{#if sortedFlights.length > 0}
		<table>
			<thead>
				<tr>
					<th>Date</th>
					<th>Flight #</th>
					<th>Aircraft</th>
					<th>Route</th>
					<th>Total Time</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each sortedFlights as flight (flight.id)}
					<tr>
						<td>{flight.flight_date}</td>
						<td>{flight.flight_number ?? '--'}</td>
						<td>{flight.aircraft_id ? (aircraftById.get(flight.aircraft_id) ?? '--') : '--'}</td>
						<td>
							{#if flight.dep_airport && flight.arr_airport}
								{flight.dep_airport} &rarr; {flight.arr_airport}
							{:else if flight.dep_airport}
								{flight.dep_airport} &rarr; --
							{:else if flight.arr_airport}
								-- &rarr; {flight.arr_airport}
							{:else}
								--
							{/if}
						</td>
						<td>{formatTime(flight.total_time)}</td>
						<td>
							<a href={resolve('/app/flights/[id]', { id: flight.id })}>View</a>
							<button type="button" onclick={() => goToEdit(flight.id)}>Edit</button>
							{#if deletingId === flight.id}
								<button type="button" onclick={() => handleDelete(flight.id)} style="color: red;"
									>Confirm</button
								>
								<button type="button" onclick={() => (deletingId = null)}>Cancel</button>
							{:else}
								<button type="button" onclick={() => (deletingId = flight.id)}>Delete</button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p>No flights recorded yet. <a href={resolve('/app/flights/new')}>Add your first flight</a>.</p>
	{/if}
</div>
