<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { flightsCollection } from '../../../../collections/useFlights';
	import type { Flight } from '../../../../collections/useFlights';
	import { aircraftCollection } from '../../../../collections/useAircraft';
	import { useCollection } from '$lib/useCollection.svelte';
	import {
		resolveOooiTimes,
		calculateBlockTime,
		formatDecimalHours,
		parseDecimalHours,
		toZuluDisplay
	} from '$lib/flights/oooi';
	import AircraftPicker from '$lib/components/AircraftPicker.svelte';

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
		aircraftCollection
			.get()
			.insert({ id, tail_number: tailNumber, createdAt: now, updatedAt: now });
		return Promise.resolve(id);
	}

	// Edit mode state
	let editing = $state(false);
	let confirmingDelete = $state(false);
	let submitting = $state(false);
	let deleting = $state(false);
	let error = $state('');

	// Form state
	let flightDate = $state('');
	let flightNumber = $state('');
	let aircraftId = $state('');
	let depAirport = $state('');
	let arrAirport = $state('');

	let timeOut = $state('');
	let timeOff = $state('');
	let timeOn = $state('');
	let timeIn = $state('');

	let totalTimeInput = $state('');
	let totalTimeOverride = $state(false);
	let picTimeInput = $state('');
	let picTimeOverride = $state(false);

	let dayLandings = $state(0);
	let nightLandings = $state(0);

	let approachType = $state('');
	let approachRunway = $state('');
	let approachAirport = $state('');

	let remarks = $state('');

	// Populate form state when flight data loads or when entering edit mode
	let populatedFor = $state('');

	$effect(() => {
		if (flight && populatedFor !== flight.id) {
			populateForm(flight);
			populatedFor = flight.id;
		}
	});

	function populateForm(data: Flight) {
		flightDate = data.flight_date;
		flightNumber = data.flight_number ?? '';
		aircraftId = data.aircraft_id ?? '';
		depAirport = data.dep_airport ?? '';
		arrAirport = data.arr_airport ?? '';
		timeOut = toZuluDisplay(data.time_out);
		timeOff = toZuluDisplay(data.time_off);
		timeOn = toZuluDisplay(data.time_on);
		timeIn = toZuluDisplay(data.time_in);

		if (data.total_time != null) {
			totalTimeInput = formatDecimalHours(data.total_time);
			totalTimeOverride = true;
		} else {
			totalTimeInput = '';
			totalTimeOverride = false;
		}

		if (data.pic_time != null) {
			picTimeInput = formatDecimalHours(data.pic_time);
			picTimeOverride = true;
		} else {
			picTimeInput = '';
			picTimeOverride = false;
		}

		const dayEntry = data.landings?.find((l) => l.type === 'day');
		const nightEntry = data.landings?.find((l) => l.type === 'night');
		dayLandings = dayEntry?.count ?? 0;
		nightLandings = nightEntry?.count ?? 0;

		const firstApproach = data.approaches?.[0];
		approachType = firstApproach?.type ?? '';
		approachRunway = firstApproach?.runway ?? '';
		approachAirport = firstApproach?.airport ?? '';

		remarks = data.remarks ?? '';
	}

	// Derived time calculations (same as new flight form)
	const resolvedTimes = $derived(
		resolveOooiTimes(flightDate, { out: timeOut, off: timeOff, on: timeOn, in: timeIn })
	);
	const blockMinutes = $derived(calculateBlockTime(resolvedTimes.time_out, resolvedTimes.time_in));
	const calculatedTotalTime = $derived(formatDecimalHours(blockMinutes));

	const displayTotalTime = $derived(totalTimeOverride ? totalTimeInput : calculatedTotalTime);
	const displayPicTime = $derived(picTimeOverride ? picTimeInput : displayTotalTime);

	function handleTotalTimeInput(e: Event) {
		const target = e.target as HTMLInputElement;
		totalTimeInput = target.value;
		totalTimeOverride = true;
	}

	function handlePicTimeInput(e: Event) {
		const target = e.target as HTMLInputElement;
		picTimeInput = target.value;
		picTimeOverride = true;
	}

	function startEditing() {
		if (flight) {
			populateForm(flight);
		}
		editing = true;
		confirmingDelete = false;
		error = '';
	}

	function cancelEditing() {
		editing = false;
		error = '';
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		submitting = true;
		error = '';

		try {
			const resolved = resolveOooiTimes(flightDate, {
				out: timeOut,
				off: timeOff,
				on: timeOn,
				in: timeIn
			});

			let totalMinutes: number | undefined;
			if (totalTimeOverride && totalTimeInput) {
				totalMinutes = parseDecimalHours(totalTimeInput) ?? undefined;
			} else if (blockMinutes != null) {
				totalMinutes = blockMinutes;
			}

			let picMinutes: number | undefined;
			if (picTimeOverride && picTimeInput) {
				picMinutes = parseDecimalHours(picTimeInput) ?? undefined;
			} else {
				picMinutes = totalMinutes;
			}

			const landings: Array<{ type: string; count: number }> = [];
			if (dayLandings > 0) landings.push({ type: 'day', count: dayLandings });
			if (nightLandings > 0) landings.push({ type: 'night', count: nightLandings });

			const approaches: Array<{ type: string; runway: string; airport: string }> = [];
			if (approachType || approachRunway || approachAirport) {
				approaches.push({
					type: approachType,
					runway: approachRunway,
					airport: approachAirport
				});
			}

			flightsCollection.get().update(flightId, (draft) => {
				draft.flight_date = flightDate;
				draft.landings = landings;
				draft.approaches = approaches;
				draft.updatedAt = Date.now();
				if (flightNumber) draft.flight_number = flightNumber;
				if (aircraftId) draft.aircraft_id = aircraftId;
				if (depAirport) draft.dep_airport = depAirport;
				if (arrAirport) draft.arr_airport = arrAirport;
				if (resolved.time_out) draft.time_out = resolved.time_out;
				if (resolved.time_off) draft.time_off = resolved.time_off;
				if (resolved.time_on) draft.time_on = resolved.time_on;
				if (resolved.time_in) draft.time_in = resolved.time_in;
				if (totalMinutes != null) draft.total_time = totalMinutes;
				if (picMinutes != null) draft.pic_time = picMinutes;
				if (remarks) draft.remarks = remarks;
			});

			editing = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update flight';
		} finally {
			submitting = false;
		}
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

		{#if error}
			<p role="alert" style="color: red;">{error}</p>
		{/if}

		<form onsubmit={handleSubmit}>
			<fieldset disabled={submitting}>
				<div>
					<label for="flight-date">Zulu Date</label>
					<input id="flight-date" type="date" bind:value={flightDate} required />
				</div>

				<div>
					<label for="flight-number">Flight Number</label>
					<input id="flight-number" type="text" bind:value={flightNumber} placeholder="DL1234" />
				</div>

				<div>
					<label for="aircraft-id">Aircraft</label>
					<AircraftPicker
						aircraftList={aircraftStore.data.map((a) => ({
							_id: a.id,
							tail_number: a.tail_number
						}))}
						bind:value={aircraftId}
						oncreate={createAircraft}
					/>
					{#if aircraftId}
						<a href={resolve('/app/aircraft')} style="font-size: 0.85em;">Edit Aircraft Details</a>
					{/if}
				</div>

				<div>
					<label for="dep-airport">From</label>
					<input
						id="dep-airport"
						type="text"
						bind:value={depAirport}
						placeholder="KATL"
						maxlength="4"
						style="text-transform: uppercase;"
					/>
				</div>

				<div>
					<label for="arr-airport">To</label>
					<input
						id="arr-airport"
						type="text"
						bind:value={arrAirport}
						placeholder="KJFK"
						maxlength="4"
						style="text-transform: uppercase;"
					/>
				</div>

				<fieldset>
					<legend>OOOI Times (Zulu)</legend>

					<div>
						<label for="time-out">Out</label>
						<input
							id="time-out"
							type="text"
							bind:value={timeOut}
							placeholder="2350"
							maxlength="4"
							inputmode="numeric"
						/>
					</div>

					<div>
						<label for="time-off">Off</label>
						<input
							id="time-off"
							type="text"
							bind:value={timeOff}
							placeholder="0005"
							maxlength="4"
							inputmode="numeric"
						/>
					</div>

					<div>
						<label for="time-on">On</label>
						<input
							id="time-on"
							type="text"
							bind:value={timeOn}
							placeholder="0230"
							maxlength="4"
							inputmode="numeric"
						/>
					</div>

					<div>
						<label for="time-in">In</label>
						<input
							id="time-in"
							type="text"
							bind:value={timeIn}
							placeholder="0240"
							maxlength="4"
							inputmode="numeric"
						/>
					</div>
				</fieldset>

				<div>
					<label for="total-time">Total Time (decimal hours)</label>
					<input
						id="total-time"
						type="text"
						value={displayTotalTime}
						oninput={handleTotalTimeInput}
						placeholder="2.3"
						inputmode="decimal"
					/>
				</div>

				<div>
					<label for="pic-time">PIC Time (decimal hours)</label>
					<input
						id="pic-time"
						type="text"
						value={displayPicTime}
						oninput={handlePicTimeInput}
						placeholder="2.3"
						inputmode="decimal"
					/>
				</div>

				<fieldset>
					<legend>Landings</legend>

					<div>
						<label for="day-landings">Day</label>
						<input id="day-landings" type="number" bind:value={dayLandings} min="0" />
					</div>

					<div>
						<label for="night-landings">Night</label>
						<input id="night-landings" type="number" bind:value={nightLandings} min="0" />
					</div>
				</fieldset>

				<fieldset>
					<legend>Approaches</legend>

					<div>
						<label for="approach-type">Type</label>
						<input id="approach-type" type="text" bind:value={approachType} placeholder="ILS" />
					</div>

					<div>
						<label for="approach-runway">Runway</label>
						<input id="approach-runway" type="text" bind:value={approachRunway} placeholder="27L" />
					</div>

					<div>
						<label for="approach-airport">Airport</label>
						<input
							id="approach-airport"
							type="text"
							bind:value={approachAirport}
							placeholder="KJFK"
							maxlength="4"
						/>
					</div>
				</fieldset>

				<div>
					<label for="remarks">Remarks</label>
					<textarea id="remarks" bind:value={remarks} rows="3"></textarea>
				</div>

				<div>
					<button type="submit" disabled={submitting}>
						{submitting ? 'Saving...' : 'Save Changes'}
					</button>
					<button type="button" onclick={cancelEditing} disabled={submitting}>Cancel</button>
				</div>
			</fieldset>
		</form>
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
				<dd>{formatDecimalHours(flight.total_time)}</dd>
			{/if}

			{#if flight.pic_time != null}
				<dt>PIC Time</dt>
				<dd>{formatDecimalHours(flight.pic_time)}</dd>
			{/if}

			{#if flight.sic_time != null}
				<dt>SIC Time</dt>
				<dd>{formatDecimalHours(flight.sic_time)}</dd>
			{/if}

			{#if flight.night_time != null}
				<dt>Night Time</dt>
				<dd>{formatDecimalHours(flight.night_time)}</dd>
			{/if}

			{#if flight.instrument_time != null}
				<dt>Instrument Time</dt>
				<dd>{formatDecimalHours(flight.instrument_time)}</dd>
			{/if}

			{#if flight.cross_country_time != null}
				<dt>Cross Country Time</dt>
				<dd>{formatDecimalHours(flight.cross_country_time)}</dd>
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
