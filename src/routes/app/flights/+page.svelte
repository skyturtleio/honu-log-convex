<script lang="ts">
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';

	const flights = useQuery(api.flights.list, {});

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

	{#if flights.isLoading}
		<p>Loading flights...</p>
	{:else if flights.error}
		<p>Error loading flights: {flights.error.message}</p>
	{:else if flights.data && flights.data.flights.length > 0}
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
				{#each flights.data.flights as flight (flight._id)}
					<tr>
						<td>{flight.flight_date}</td>
						<td>{flight.flight_number ?? '--'}</td>
						<td>{flight.aircraft_id ?? '--'}</td>
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
							<a href={resolve('/app/flights/[id]', { id: flight._id })}>View</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if flights.data.hasMore}
			<p>Showing first page of results.</p>
		{/if}
	{:else}
		<p>No flights recorded yet. <a href={resolve('/app/flights/new')}>Add your first flight</a>.</p>
	{/if}
</div>
