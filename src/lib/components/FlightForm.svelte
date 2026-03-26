<script lang="ts">
	import type { Flight } from '$lib/collections/useFlights';
	import type { FlightFormData, FlightFormInput } from '$lib/flights/validation';
	import { flightFormSchema, validateCrossField, clampPicTime } from '$lib/flights/validation';
	import {
		resolveOooiTimes,
		calculateBlockTime,
		formatPlusMinutes,
		parseDuration,
		toZuluDisplay,
		inferZuluTime,
		formatLocalTime
	} from '$lib/flights/oooi';
	import { getConvexClient } from '$lib/convex';
	import { api } from '../../convex/_generated/api';
	import { errorMessage } from '$lib/errorMessage';
	import AircraftPicker from './AircraftPicker.svelte';
	import AirportPicker from './AirportPicker.svelte';

	interface Props {
		flight?: Flight;
		aircraftList: Array<{ _id: string; tail_number: string }>;
		oncreateaircraft: (tailNumber: string) => Promise<string>;
		onsave: (data: FlightFormData) => Promise<void>;
		oncancel?: () => void;
		submitLabel?: string;
	}

	let {
		flight,
		aircraftList,
		oncreateaircraft,
		onsave,
		oncancel,
		submitLabel = 'Save Flight'
	}: Props = $props();

	const todayUtc = new Date().toISOString().slice(0, 10);

	// Form state
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
	let sicTimeInput = $state('');
	let nightTimeInput = $state('');
	let instrumentTimeInput = $state('');
	let crossCountryTimeInput = $state('');

	let dayLandings = $state(0);
	let nightLandings = $state(0);

	let approaches = $state<Array<{ type: string; runway: string; airport: string }>>([
		{ type: '', runway: '', airport: '' }
	]);

	let remarks = $state('');

	let submitting = $state(false);
	let error = $state('');
	let fieldErrors = $state<Record<string, string>>({});

	// Airport timezone data for local time display
	let depTimezone = $state<string | undefined>();
	let arrTimezone = $state<string | undefined>();

	// Fetch departure airport timezone when ICAO changes
	$effect(() => {
		const icao = depAirport;
		if (!icao || icao.length !== 4) {
			depTimezone = undefined;
			return;
		}
		getConvexClient()
			.query(api.airports.getByIcao, { icao })
			.then((airport) => {
				if (depAirport === icao) depTimezone = airport?.timezone;
			})
			.catch(() => {});
	});

	// Fetch arrival airport timezone when ICAO changes
	$effect(() => {
		const icao = arrAirport;
		if (!icao || icao.length !== 4) {
			arrTimezone = undefined;
			return;
		}
		getConvexClient()
			.query(api.airports.getByIcao, { icao })
			.then((airport) => {
				if (arrAirport === icao) arrTimezone = airport?.timezone;
			})
			.catch(() => {});
	});

	// Populate from flight prop (edit mode)
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
			totalTimeInput = formatPlusMinutes(data.total_time);
			totalTimeOverride = true;
		} else {
			totalTimeInput = '';
			totalTimeOverride = false;
		}

		if (data.pic_time != null) {
			picTimeInput = formatPlusMinutes(data.pic_time);
			picTimeOverride = true;
		} else {
			picTimeInput = '';
			picTimeOverride = false;
		}

		sicTimeInput = data.sic_time != null ? formatPlusMinutes(data.sic_time) : '';
		nightTimeInput = data.night_time != null ? formatPlusMinutes(data.night_time) : '';
		instrumentTimeInput =
			data.instrument_time != null ? formatPlusMinutes(data.instrument_time) : '';
		crossCountryTimeInput =
			data.cross_country_time != null ? formatPlusMinutes(data.cross_country_time) : '';

		const dayEntry = data.landings?.find((l) => l.type === 'day');
		const nightEntry = data.landings?.find((l) => l.type === 'night');
		dayLandings = dayEntry?.count ?? 0;
		nightLandings = nightEntry?.count ?? 0;

		approaches =
			data.approaches && data.approaches.length > 0
				? data.approaches.map((a) => ({ ...a }))
				: [{ type: '', runway: '', airport: '' }];

		remarks = data.remarks ?? '';
		fieldErrors = {};
		error = '';
	}

	// --- Time calculations ---

	const resolvedTimes = $derived(
		resolveOooiTimes(flightDate, { out: timeOut, off: timeOff, on: timeOn, in: timeIn })
	);
	const blockMinutes = $derived(calculateBlockTime(resolvedTimes.time_out, resolvedTimes.time_in));

	// Manual total from user override input
	const manualTotalMinutes = $derived(
		totalTimeOverride && totalTimeInput ? parseDuration(totalTimeInput) : null
	);

	// Effective total: manual override wins, then block calculation
	const effectiveTotalMinutes = $derived(manualTotalMinutes ?? blockMinutes);

	// Display values using plus format
	const calculatedTotalTime = $derived(formatPlusMinutes(blockMinutes));
	const displayTotalTime = $derived(totalTimeOverride ? totalTimeInput : calculatedTotalTime);
	const displayPicTime = $derived(
		picTimeOverride ? picTimeInput : formatPlusMinutes(effectiveTotalMinutes)
	);

	// --- PIC clamping: PIC must never exceed total ---
	$effect(() => {
		if (picTimeOverride && picTimeInput && displayTotalTime) {
			const clamped = clampPicTime(picTimeInput, displayTotalTime);
			if (clamped !== null) {
				picTimeInput = clamped;
			}
		}
	});

	// --- Smart time inference ---

	// Infer In from Out + manual Total
	const inferredTimeIn = $derived.by(() => {
		if (timeIn || !timeOut || manualTotalMinutes == null) return null;
		return inferZuluTime(timeOut, manualTotalMinutes, true);
	});

	// Infer Out from In + manual Total
	const inferredTimeOut = $derived.by(() => {
		if (timeOut || !timeIn || manualTotalMinutes == null) return null;
		return inferZuluTime(timeIn, manualTotalMinutes, false);
	});

	const displayTimeOut = $derived(timeOut || inferredTimeOut || '');
	const displayTimeIn = $derived(timeIn || inferredTimeIn || '');

	// Local time displays: dep timezone for Out/Off, arr timezone for On/In
	const localTimeOut = $derived(
		depTimezone && displayTimeOut ? formatLocalTime(displayTimeOut, flightDate, depTimezone) : null
	);
	const localTimeOff = $derived(
		depTimezone && timeOff ? formatLocalTime(timeOff, flightDate, depTimezone) : null
	);
	const localTimeOn = $derived(
		arrTimezone && timeOn ? formatLocalTime(timeOn, flightDate, arrTimezone) : null
	);
	const localTimeIn = $derived(
		arrTimezone && displayTimeIn ? formatLocalTime(displayTimeIn, flightDate, arrTimezone) : null
	);

	// Conflict: user set Out, In, AND Total manually, but they disagree
	const timeConflict = $derived.by(() => {
		if (!timeOut || !timeIn || !totalTimeOverride || !totalTimeInput) return null;
		const overrideMinutes = parseDuration(totalTimeInput);
		if (overrideMinutes == null || blockMinutes == null) return null;
		if (Math.abs(overrideMinutes - blockMinutes) > 1) {
			return `Out/In block time is ${formatPlusMinutes(blockMinutes)}, but Total is ${totalTimeInput}`;
		}
		return null;
	});

	// Cross-field warnings (durations exceeding total)
	const crossFieldWarnings = $derived(
		validateCrossField({
			flightDate,
			flightNumber,
			aircraftId,
			depAirport,
			arrAirport,
			timeOut: displayTimeOut,
			timeOff,
			timeOn,
			timeIn: displayTimeIn,
			totalTimeInput: displayTotalTime,
			picTimeInput: displayPicTime,
			sicTimeInput,
			nightTimeInput,
			instrumentTimeInput,
			crossCountryTimeInput,
			dayLandings,
			nightLandings,
			approaches,
			remarks
		})
	);

	// --- Approach handlers ---

	function addApproach() {
		approaches = [...approaches, { type: '', runway: '', airport: '' }];
	}

	function removeApproach(index: number) {
		approaches = approaches.filter((_, i) => i !== index);
	}

	// --- Input handlers ---

	function handleTimeOutInput(e: Event) {
		timeOut = (e.target as HTMLInputElement).value;
		// Last-write-wins: editing Out means total should recalculate from block time
		totalTimeOverride = false;
		totalTimeInput = '';
		clearFieldError('timeOut');
	}

	function handleTimeInInput(e: Event) {
		timeIn = (e.target as HTMLInputElement).value;
		// Last-write-wins: editing In means total should recalculate from block time
		totalTimeOverride = false;
		totalTimeInput = '';
		clearFieldError('timeIn');
	}

	// When user focuses an inferred field, promote the inferred value so they can edit from it
	// and clear the total override so total recalculates from block time
	function handleTimeOutFocus() {
		if (!timeOut && inferredTimeOut) {
			timeOut = inferredTimeOut;
			totalTimeOverride = false;
			totalTimeInput = '';
		}
	}

	function handleTimeInFocus() {
		if (!timeIn && inferredTimeIn) {
			timeIn = inferredTimeIn;
			totalTimeOverride = false;
			totalTimeInput = '';
		}
	}

	function handleTotalTimeInput(e: Event) {
		totalTimeInput = (e.target as HTMLInputElement).value;
		totalTimeOverride = true;
		clearFieldError('totalTimeInput');
	}

	function handlePicTimeInput(e: Event) {
		picTimeInput = (e.target as HTMLInputElement).value;
		picTimeOverride = true;
		clearFieldError('picTimeInput');
	}

	function clearFieldError(field: string) {
		if (fieldErrors[field]) {
			const next = { ...fieldErrors };
			delete next[field];
			fieldErrors = next;
		}
	}

	// --- Submit ---

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;

		// Use effective values including inferred times
		const effectiveTimeOut = timeOut || inferredTimeOut || '';
		const effectiveTimeIn = timeIn || inferredTimeIn || '';

		const input: FlightFormInput = {
			flightDate,
			flightNumber,
			aircraftId,
			depAirport,
			arrAirport,
			timeOut: effectiveTimeOut,
			timeOff,
			timeOn,
			timeIn: effectiveTimeIn,
			totalTimeInput: displayTotalTime,
			picTimeInput: displayPicTime,
			sicTimeInput,
			nightTimeInput,
			instrumentTimeInput,
			crossCountryTimeInput,
			dayLandings,
			nightLandings,
			approaches,
			remarks
		};

		const result = flightFormSchema.safeParse(input);
		if (!result.success) {
			const errors: Record<string, string> = {};
			for (const issue of result.error.issues) {
				const key = issue.path[0] as string;
				if (!errors[key]) errors[key] = issue.message;
			}
			fieldErrors = errors;
			return;
		}

		fieldErrors = {};
		submitting = true;
		error = '';

		try {
			const resolved = resolveOooiTimes(flightDate, {
				out: effectiveTimeOut,
				off: timeOff,
				on: timeOn,
				in: effectiveTimeIn
			});

			let totalMinutes: number | undefined;
			if (totalTimeOverride && totalTimeInput) {
				totalMinutes = parseDuration(totalTimeInput) ?? undefined;
			} else if (blockMinutes != null) {
				totalMinutes = blockMinutes;
			} else if (manualTotalMinutes != null) {
				totalMinutes = manualTotalMinutes;
			}

			let picMinutes: number | undefined;
			if (picTimeOverride && picTimeInput) {
				picMinutes = parseDuration(picTimeInput) ?? undefined;
			} else {
				picMinutes = totalMinutes;
			}

			const sicMinutes = sicTimeInput ? (parseDuration(sicTimeInput) ?? undefined) : undefined;
			const nightMinutes = nightTimeInput
				? (parseDuration(nightTimeInput) ?? undefined)
				: undefined;
			const instrumentMinutes = instrumentTimeInput
				? (parseDuration(instrumentTimeInput) ?? undefined)
				: undefined;
			const crossCountryMinutes = crossCountryTimeInput
				? (parseDuration(crossCountryTimeInput) ?? undefined)
				: undefined;

			const landings: Array<{ type: string; count: number }> = [];
			if (dayLandings > 0) landings.push({ type: 'day', count: dayLandings });
			if (nightLandings > 0) landings.push({ type: 'night', count: nightLandings });

			const filteredApproaches = approaches.filter((a) => a.type || a.runway || a.airport);

			const data: FlightFormData = {
				flight_date: flightDate,
				landings,
				approaches: filteredApproaches,
				...(flightNumber ? { flight_number: flightNumber } : {}),
				...(aircraftId ? { aircraft_id: aircraftId } : {}),
				...(depAirport ? { dep_airport: depAirport } : {}),
				...(arrAirport ? { arr_airport: arrAirport } : {}),
				...(resolved.time_out ? { time_out: resolved.time_out } : {}),
				...(resolved.time_off ? { time_off: resolved.time_off } : {}),
				...(resolved.time_on ? { time_on: resolved.time_on } : {}),
				...(resolved.time_in ? { time_in: resolved.time_in } : {}),
				...(totalMinutes != null ? { total_time: totalMinutes } : {}),
				...(picMinutes != null ? { pic_time: picMinutes } : {}),
				...(sicMinutes != null ? { sic_time: sicMinutes } : {}),
				...(nightMinutes != null ? { night_time: nightMinutes } : {}),
				...(instrumentMinutes != null ? { instrument_time: instrumentMinutes } : {}),
				...(crossCountryMinutes != null ? { cross_country_time: crossCountryMinutes } : {}),
				...(remarks ? { remarks } : {})
			};

			await onsave(data);
		} catch (err) {
			error = errorMessage(err, 'Failed to save flight');
		} finally {
			submitting = false;
		}
	}
</script>

{#if error}
	<p role="alert" style="color: red;">{error}</p>
{/if}

{#if timeConflict}
	<p role="status" style="color: orange;">{timeConflict}</p>
{/if}

{#if crossFieldWarnings.length > 0}
	{#each crossFieldWarnings as warning (warning)}
		<p role="status" style="color: orange;">{warning}</p>
	{/each}
{/if}

<form onsubmit={handleSubmit}>
	<fieldset disabled={submitting}>
		<div>
			<label for="flight-date">Zulu Date</label>
			<input id="flight-date" type="date" bind:value={flightDate} required />
			{#if fieldErrors.flightDate}<small style="color: red;">{fieldErrors.flightDate}</small>{/if}
		</div>

		<div>
			<label for="flight-number">Flight Number</label>
			<input id="flight-number" type="text" bind:value={flightNumber} placeholder="DL1234" />
		</div>

		<div>
			<label for="aircraft-id">Aircraft</label>
			<AircraftPicker {aircraftList} bind:value={aircraftId} oncreate={oncreateaircraft} />
		</div>

		<div>
			<label for="dep-airport">From</label>
			<AirportPicker bind:value={depAirport} placeholder="KATL" />
			{#if fieldErrors.depAirport}<small style="color: red;">{fieldErrors.depAirport}</small>{/if}
		</div>

		<div>
			<label for="arr-airport">To</label>
			<AirportPicker bind:value={arrAirport} placeholder="KJFK" />
			{#if fieldErrors.arrAirport}<small style="color: red;">{fieldErrors.arrAirport}</small>{/if}
		</div>

		<fieldset>
			<legend>OOOI Times (Zulu)</legend>

			<div>
				<label for="time-out">Out</label>
				<input
					id="time-out"
					type="text"
					value={displayTimeOut}
					oninput={handleTimeOutInput}
					onfocus={handleTimeOutFocus}
					placeholder="2350"
					maxlength="4"
					inputmode="numeric"
					class:inferred={!timeOut && !!inferredTimeOut}
				/>
				{#if localTimeOut}
					<small class="local-time">{localTimeOut}</small>
				{/if}
				{#if !timeOut && inferredTimeOut}
					<small style="color: gray; font-style: italic;">inferred from In + Total</small>
				{/if}
				{#if fieldErrors.timeOut}<small style="color: red;">{fieldErrors.timeOut}</small>{/if}
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
				{#if localTimeOff}
					<small class="local-time">{localTimeOff}</small>
				{/if}
				{#if fieldErrors.timeOff}<small style="color: red;">{fieldErrors.timeOff}</small>{/if}
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
				{#if localTimeOn}
					<small class="local-time">{localTimeOn}</small>
				{/if}
				{#if fieldErrors.timeOn}<small style="color: red;">{fieldErrors.timeOn}</small>{/if}
			</div>

			<div>
				<label for="time-in">In</label>
				<input
					id="time-in"
					type="text"
					value={displayTimeIn}
					oninput={handleTimeInInput}
					onfocus={handleTimeInFocus}
					placeholder="0240"
					maxlength="4"
					inputmode="numeric"
					class:inferred={!timeIn && !!inferredTimeIn}
				/>
				{#if localTimeIn}
					<small class="local-time">{localTimeIn}</small>
				{/if}
				{#if !timeIn && inferredTimeIn}
					<small style="color: gray; font-style: italic;">inferred from Out + Total</small>
				{/if}
				{#if fieldErrors.timeIn}<small style="color: red;">{fieldErrors.timeIn}</small>{/if}
			</div>
		</fieldset>

		<div>
			<label for="total-time">Total Time</label>
			<input
				id="total-time"
				type="text"
				value={displayTotalTime}
				oninput={handleTotalTimeInput}
				placeholder="2+30 or 2.5"
			/>
			{#if fieldErrors.totalTimeInput}<small style="color: red;">{fieldErrors.totalTimeInput}</small
				>{/if}
		</div>

		<div>
			<label for="pic-time">PIC Time</label>
			<input
				id="pic-time"
				type="text"
				value={displayPicTime}
				oninput={handlePicTimeInput}
				placeholder="2+30 or 2.5"
			/>
			{#if fieldErrors.picTimeInput}<small style="color: red;">{fieldErrors.picTimeInput}</small
				>{/if}
		</div>

		<div>
			<label for="sic-time">SIC Time</label>
			<input
				id="sic-time"
				type="text"
				bind:value={sicTimeInput}
				placeholder="2+30 or 2.5"
				oninput={() => clearFieldError('sicTimeInput')}
			/>
			{#if fieldErrors.sicTimeInput}<small style="color: red;">{fieldErrors.sicTimeInput}</small
				>{/if}
		</div>

		<div>
			<label for="night-time">Night Time</label>
			<input
				id="night-time"
				type="text"
				bind:value={nightTimeInput}
				placeholder="2+30 or 2.5"
				oninput={() => clearFieldError('nightTimeInput')}
			/>
			{#if fieldErrors.nightTimeInput}<small style="color: red;">{fieldErrors.nightTimeInput}</small
				>{/if}
		</div>

		<div>
			<label for="instrument-time">Instrument Time</label>
			<input
				id="instrument-time"
				type="text"
				bind:value={instrumentTimeInput}
				placeholder="2+30 or 2.5"
				oninput={() => clearFieldError('instrumentTimeInput')}
			/>
			{#if fieldErrors.instrumentTimeInput}<small style="color: red;"
					>{fieldErrors.instrumentTimeInput}</small
				>{/if}
		</div>

		<div>
			<label for="xc-time">Cross Country Time</label>
			<input
				id="xc-time"
				type="text"
				bind:value={crossCountryTimeInput}
				placeholder="2+30 or 2.5"
				oninput={() => clearFieldError('crossCountryTimeInput')}
			/>
			{#if fieldErrors.crossCountryTimeInput}<small style="color: red;"
					>{fieldErrors.crossCountryTimeInput}</small
				>{/if}
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

			{#each approaches as approach, i (i)}
				<div class="approach-row">
					<div>
						<label for="approach-type-{i}">Type</label>
						<input
							id="approach-type-{i}"
							type="text"
							bind:value={approach.type}
							placeholder="ILS"
						/>
					</div>

					<div>
						<label for="approach-runway-{i}">Runway</label>
						<input
							id="approach-runway-{i}"
							type="text"
							bind:value={approach.runway}
							placeholder="27L"
						/>
					</div>

					<div>
						<label for="approach-airport-{i}">Airport</label>
						<AirportPicker bind:value={approach.airport} placeholder="KJFK" />
					</div>

					{#if approaches.length > 1}
						<button type="button" class="remove-approach" onclick={() => removeApproach(i)}>
							Remove
						</button>
					{/if}
				</div>
			{/each}

			<button type="button" onclick={addApproach}>Add Approach</button>
		</fieldset>

		<div>
			<label for="remarks">Remarks</label>
			<textarea id="remarks" bind:value={remarks} rows="3"></textarea>
		</div>

		<div>
			<button type="submit" disabled={submitting}>
				{submitting ? 'Saving...' : submitLabel}
			</button>
			{#if oncancel}
				<button type="button" onclick={oncancel} disabled={submitting}>Cancel</button>
			{/if}
		</div>
	</fieldset>
</form>

<style>
	.inferred {
		color: gray;
		font-style: italic;
	}
	.local-time {
		color: #666;
		font-size: 0.85em;
		margin-left: 0.5em;
	}
	.approach-row {
		margin-bottom: 0.5rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #eee;
	}
	.remove-approach {
		font-size: 0.85em;
		color: #c00;
		background: none;
		border: 1px solid #ccc;
		cursor: pointer;
		margin-top: 0.25rem;
	}
</style>
