<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import {
		resolveOooiTimes,
		calculateBlockTime,
		formatDecimalHours,
		parseDecimalHours
	} from '$lib/flights/oooi';
	import AircraftPicker from '$lib/components/AircraftPicker.svelte';

	const client = useConvexClient();
	const aircraftList = useQuery(api.aircraft.list, {});
	const aircraftTypesList = useQuery(api.aircraft.listTypes, {});

	async function createAircraft(tailNumber: string, aircraftTypeId: string): Promise<string> {
		const id = await client.mutation(api.aircraft.create, {
			tail_number: tailNumber,
			aircraft_type_id: aircraftTypeId as Id<'aircraft_types'>
		});
		return id;
	}

	const now = new Date();
	const todayUtc = now.toISOString().slice(0, 10);

	let flightDate = $state(todayUtc);
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

	let submitting = $state(false);
	let error = $state('');

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

			await client.mutation(api.flights.create, {
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

			await goto(resolve('/app/flights'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save flight';
		} finally {
			submitting = false;
		}
	}
</script>

<div>
	<h1>New Flight</h1>

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
					{submitting ? 'Saving...' : 'Save Flight'}
				</button>
				<a href={resolve('/app/flights')}>Cancel</a>
			</div>
		</fieldset>
	</form>
</div>
