<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { flightsCollection } from '../../../../collections/useFlights';
	import { aircraftCollection } from '../../../../collections/useAircraft';
	import { useCollection } from '$lib/useCollection.svelte';
	import { formatPlusMinutes, toZuluDisplay } from '$lib/flights/oooi';
	import FlightForm from '$lib/components/FlightForm.svelte';
	import type { FlightFormData } from '$lib/flights/validation';

	const flightsStore = useCollection(flightsCollection.get());
	const aircraftStore = useCollection(aircraftCollection.get());

	const flightId = $derived(page.params.id as string);
	const flight = $derived(flightsStore.data.find((f) => f.id === flightId) ?? null);
	const aircraftById = $derived(new Map(aircraftStore.data.map((a) => [a.id, a.tail_number])));
	const aircraftTail = $derived(
		flight?.aircraft_id ? (aircraftById.get(flight.aircraft_id) ?? undefined) : undefined
	);

	// Support ?edit=true query param to open in edit mode
	$effect(() => {
		if (flight && page.url.searchParams.get('edit') === 'true' && !editing) {
			startEditing();
		}
	});

	function createAircraft(tailNumber: string): Promise<string> {
		const now = Date.now();
		const id = crypto.randomUUID();
		aircraftCollection.get().insert({
			id,
			tail_number: tailNumber,
			ownerId: page.data.user?.sub,
			createdAt: now,
			updatedAt: now
		});
		return Promise.resolve(id);
	}

	let editing = $state(false);
	let confirmingDelete = $state(false);
	let deleting = $state(false);
	let error = $state('');

	function startEditing() {
		editing = true;
		confirmingDelete = false;
		error = '';
	}

	function cancelEditing() {
		editing = false;
		error = '';
	}

	async function handleSave(data: FlightFormData) {
		flightsCollection.get().update(flightId, (draft) => {
			draft.flight_date = data.flight_date;
			draft.landings = data.landings;
			draft.approaches = data.approaches;
			draft.updatedAt = Date.now();
			draft.flight_number = data.flight_number;
			draft.aircraft_id = data.aircraft_id;
			draft.dep_airport = data.dep_airport;
			draft.arr_airport = data.arr_airport;
			draft.time_out = data.time_out;
			draft.time_off = data.time_off;
			draft.time_on = data.time_on;
			draft.time_in = data.time_in;
			draft.total_time = data.total_time;
			draft.pic_time = data.pic_time;
			draft.sic_time = data.sic_time;
			draft.night_time = data.night_time;
			draft.instrument_time = data.instrument_time;
			draft.cross_country_time = data.cross_country_time;
			draft.remarks = data.remarks;
		});
		editing = false;
	}

	async function handleDelete() {
		if (deleting) return;
		deleting = true;
		error = '';

		try {
			flightsCollection.get().delete(flightId);
			await goto(resolve('/app/flights'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete flight';
			deleting = false;
		}
	}
</script>

<div>
	<a href={resolve('/app/flights')}>Back to Flights</a>

	{#if flight === null && flightId}
		<h1>Flight Details</h1>
		<p>Flight not found.</p>
	{:else if flight === null}
		<h1>Flight Details</h1>
		<p>Loading flight...</p>
	{:else if editing}
		<h1>Edit Flight</h1>

		<FlightForm
			{flight}
			aircraftList={aircraftStore.data.map((a) => ({
				_id: a.id,
				tail_number: a.tail_number
			}))}
			oncreateaircraft={createAircraft}
			onsave={handleSave}
			oncancel={cancelEditing}
			submitLabel="Save Changes"
		/>
	{:else}
		<header style="display: flex; justify-content: space-between; align-items: center;">
			<h1>Flight Details</h1>
			<div style="display: flex; gap: 0.5rem;">
				<button type="button" onclick={startEditing}>Edit</button>
				{#if confirmingDelete}
					<button type="button" onclick={handleDelete} disabled={deleting} style="color: red;">
						{deleting ? 'Deleting...' : 'Confirm Delete'}
					</button>
					<button type="button" onclick={() => (confirmingDelete = false)} disabled={deleting}>
						Cancel
					</button>
				{:else}
					<button type="button" onclick={() => (confirmingDelete = true)}>Delete</button>
				{/if}
			</div>
		</header>

		{#if error}
			<p role="alert" style="color: red;">{error}</p>
		{/if}

		<dl>
			<dt>Date</dt>
			<dd>{flight.flight_date}</dd>

			{#if flight.flight_number}
				<dt>Flight Number</dt>
				<dd>{flight.flight_number}</dd>
			{/if}

			{#if aircraftTail}
				<dt>Aircraft</dt>
				<dd>
					{aircraftTail}
					<a href={resolve('/app/aircraft')} style="margin-left: 0.5rem; font-size: 0.85em;"
						>Edit Aircraft</a
					>
				</dd>
			{/if}

			{#if flight.dep_airport || flight.arr_airport}
				<dt>Route</dt>
				<dd>{flight.dep_airport ?? '--'} &rarr; {flight.arr_airport ?? '--'}</dd>
			{/if}

			{#if flight.time_out}
				<dt>Out</dt>
				<dd>{toZuluDisplay(flight.time_out)}Z</dd>
			{/if}

			{#if flight.time_off}
				<dt>Off</dt>
				<dd>{toZuluDisplay(flight.time_off)}Z</dd>
			{/if}

			{#if flight.time_on}
				<dt>On</dt>
				<dd>{toZuluDisplay(flight.time_on)}Z</dd>
			{/if}

			{#if flight.time_in}
				<dt>In</dt>
				<dd>{toZuluDisplay(flight.time_in)}Z</dd>
			{/if}

			{#if flight.total_time != null}
				<dt>Total Time</dt>
				<dd>{formatPlusMinutes(flight.total_time)}</dd>
			{/if}

			{#if flight.pic_time != null}
				<dt>PIC Time</dt>
				<dd>{formatPlusMinutes(flight.pic_time)}</dd>
			{/if}

			{#if flight.sic_time != null}
				<dt>SIC Time</dt>
				<dd>{formatPlusMinutes(flight.sic_time)}</dd>
			{/if}

			{#if flight.night_time != null}
				<dt>Night Time</dt>
				<dd>{formatPlusMinutes(flight.night_time)}</dd>
			{/if}

			{#if flight.instrument_time != null}
				<dt>Instrument Time</dt>
				<dd>{formatPlusMinutes(flight.instrument_time)}</dd>
			{/if}

			{#if flight.cross_country_time != null}
				<dt>Cross Country Time</dt>
				<dd>{formatPlusMinutes(flight.cross_country_time)}</dd>
			{/if}

			{#if flight.landings && flight.landings.length > 0}
				<dt>Landings</dt>
				<dd>
					{#each flight.landings as landing, i (i)}
						<span>{landing.type}: {landing.count}</span>
					{/each}
				</dd>
			{/if}

			{#if flight.approaches && flight.approaches.length > 0}
				<dt>Approaches</dt>
				<dd>
					{#each flight.approaches as approach, i (i)}
						<span>
							{approach.type}
							{#if approach.runway}RWY {approach.runway}{/if}
							{#if approach.airport}@ {approach.airport}{/if}
						</span>
					{/each}
				</dd>
			{/if}

			{#if flight.remarks}
				<dt>Remarks</dt>
				<dd>{flight.remarks}</dd>
			{/if}
		</dl>
	{/if}
</div>
