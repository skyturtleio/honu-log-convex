<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import {
		resolveOooiTimes,
		calculateBlockTime,
		formatDecimalHours,
		parseDecimalHours,
		toZuluDisplay
	} from '$lib/flights/oooi';
	import AircraftPicker from '$lib/components/AircraftPicker.svelte';

	const client = useConvexClient();
	const flightId = $derived(page.params.id);
	const flight = useQuery(api.flights.get, () => ({ id: flightId as Id<'flights'> }));
	const aircraftList = useQuery(api.aircraft.list, {});
	const aircraftTypesList = useQuery(api.aircraft.listTypes, {});

	async function createAircraft(tailNumber: string, aircraftTypeId: string): Promise<string> {
		const id = await client.mutation(api.aircraft.create, {
			tail_number: tailNumber,
			aircraft_type_id: aircraftTypeId as Id<'aircraft_types'>
		});
		return id;
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
		const data = flight.data;
		if (data && populatedFor !== data._id) {
			populateForm(data);
			populatedFor = data._id;
		}
	});

	function populateForm(data: NonNullable<typeof flight.data>) {
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

	// Resolve aircraft tail number for display
	const aircraftTail = $derived.by(() => {
		const data = flight.data;
		if (!data?.aircraft_id) return undefined;
		const list = aircraftList.data ?? [];
		const found = list.find((a) => a._id === data.aircraft_id);
		return found?.tail_number;
	});

	function startEditing() {
		if (flight.data) {
			populateForm(flight.data);
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

			await client.mutation(api.flights.update, {
				id: flightId as Id<'flights'>,
				flight_date: flightDate,
				landings,
				approaches,
				...(flightNumber ? { flight_number: flightNumber } : {}),
				...(aircraftId ? { aircraft_id: aircraftId as Id<'aircraft'> } : {}),
				...(depAirport ? { dep_airport: depAirport } : {}),
				...(arrAirport ? { arr_airport: arrAirport } : {}),
				...(resolved.time_out ? { time_out: resolved.time_out } : {}),
				...(resolved.time_off ? { time_off: resolved.time_off } : {}),
				...(resolved.time_on ? { time_on: resolved.time_on } : {}),
				...(resolved.time_in ? { time_in: resolved.time_in } : {}),
				...(totalMinutes != null ? { total_time: totalMinutes } : {}),
				...(picMinutes != null ? { pic_time: picMinutes } : {}),
				...(remarks ? { remarks } : {})
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
			await client.mutation(api.flights.remove, {
				id: flightId as Id<'flights'>
			});
			await goto(resolve('/app/flights'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete flight';
			deleting = false;
		}
	}
</script>

<div>
	<a href={resolve('/app/flights')}>Back to Flights</a>

	{#if flight.isLoading}
		<h1>Flight Details</h1>
		<p>Loading flight...</p>
	{:else if flight.error}
		<h1>Flight Details</h1>
		<p role="alert" style="color: red;">Error loading flight: {flight.error.message}</p>
	{:else if !flight.data}
		<h1>Flight Details</h1>
		<p>Flight not found.</p>
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
						aircraftList={aircraftList.data ?? []}
						aircraftTypesList={aircraftTypesList.data ?? []}
						bind:value={aircraftId}
						oncreate={createAircraft}
					/>
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
			<dd>{flight.data.flight_date}</dd>

			{#if flight.data.flight_number}
				<dt>Flight Number</dt>
				<dd>{flight.data.flight_number}</dd>
			{/if}

			{#if aircraftTail}
				<dt>Aircraft</dt>
				<dd>{aircraftTail}</dd>
			{/if}

			{#if flight.data.dep_airport || flight.data.arr_airport}
				<dt>Route</dt>
				<dd>{flight.data.dep_airport ?? '--'} &rarr; {flight.data.arr_airport ?? '--'}</dd>
			{/if}

			{#if flight.data.time_out}
				<dt>Out</dt>
				<dd>{toZuluDisplay(flight.data.time_out)}Z</dd>
			{/if}

			{#if flight.data.time_off}
				<dt>Off</dt>
				<dd>{toZuluDisplay(flight.data.time_off)}Z</dd>
			{/if}

			{#if flight.data.time_on}
				<dt>On</dt>
				<dd>{toZuluDisplay(flight.data.time_on)}Z</dd>
			{/if}

			{#if flight.data.time_in}
				<dt>In</dt>
				<dd>{toZuluDisplay(flight.data.time_in)}Z</dd>
			{/if}

			{#if flight.data.total_time != null}
				<dt>Total Time</dt>
				<dd>{formatDecimalHours(flight.data.total_time)}</dd>
			{/if}

			{#if flight.data.pic_time != null}
				<dt>PIC Time</dt>
				<dd>{formatDecimalHours(flight.data.pic_time)}</dd>
			{/if}

			{#if flight.data.sic_time != null}
				<dt>SIC Time</dt>
				<dd>{formatDecimalHours(flight.data.sic_time)}</dd>
			{/if}

			{#if flight.data.night_time != null}
				<dt>Night Time</dt>
				<dd>{formatDecimalHours(flight.data.night_time)}</dd>
			{/if}

			{#if flight.data.instrument_time != null}
				<dt>Instrument Time</dt>
				<dd>{formatDecimalHours(flight.data.instrument_time)}</dd>
			{/if}

			{#if flight.data.cross_country_time != null}
				<dt>Cross Country Time</dt>
				<dd>{formatDecimalHours(flight.data.cross_country_time)}</dd>
			{/if}

			{#if flight.data.landings && flight.data.landings.length > 0}
				<dt>Landings</dt>
				<dd>
					{#each flight.data.landings as landing, i (i)}
						<span>{landing.type}: {landing.count}</span>
					{/each}
				</dd>
			{/if}

			{#if flight.data.approaches && flight.data.approaches.length > 0}
				<dt>Approaches</dt>
				<dd>
					{#each flight.data.approaches as approach, i (i)}
						<span>
							{approach.type}
							{#if approach.runway}RWY {approach.runway}{/if}
							{#if approach.airport}@ {approach.airport}{/if}
						</span>
					{/each}
				</dd>
			{/if}

			{#if flight.data.remarks}
				<dt>Remarks</dt>
				<dd>{flight.data.remarks}</dd>
			{/if}
		</dl>
	{/if}
</div>
