<script lang="ts">
	import { resolve } from '$app/paths';
	import { flightsCollection } from '../../../collections/useFlights';
	import { aircraftCollection } from '../../../collections/useAircraft';
	import { useCollection } from '$lib/useCollection.svelte';

	const flightsStore = useCollection(flightsCollection.get());
	const aircraftStore = useCollection(aircraftCollection.get());

	const sortedFlights = $derived(
		[...flightsStore.data].sort((a, b) => b.flight_date.localeCompare(a.flight_date))
	);

	const aircraftById = $derived(new Map(aircraftStore.data.map((a) => [a.id, a.tail_number])));

	function formatTime(minutes: number | undefined): string {
		if (minutes == null) return '--';
		return (minutes / 60).toFixed(1);
	}
</script>

<div>
	<header style="display: flex; justify-content: space-between; align-items: center;">
		<h1>Flights</h1>
		<a href={resolve('/app/flights/new')}>New Flight</a>
	</header>

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
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p>No flights recorded yet. <a href={resolve('/app/flights/new')}>Add your first flight</a>.</p>
	{/if}
</div>
