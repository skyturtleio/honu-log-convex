<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';

	const client = useConvexClient();
	const aircraftTypes = useQuery(api.aircraft.listTypes, {});

	let tailNumber = $state('');
	let aircraftTypeId = $state('');
	let notes = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		if (!aircraftTypeId) {
			error = 'Please select an aircraft type.';
			return;
		}

		submitting = true;
		error = '';

		try {
			await client.mutation(api.aircraft.create, {
				tail_number: tailNumber.toUpperCase(),
				aircraft_type_id: aircraftTypeId as Id<'aircraft_types'>,
				...(notes ? { notes } : {})
			});

			await goto(resolve('/app/aircraft'));
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create aircraft';
		} finally {
			submitting = false;
		}
	}
</script>

<div>
	<h1>New Aircraft</h1>

	{#if error}
		<p role="alert" style="color: red;">{error}</p>
	{/if}

	<form onsubmit={handleSubmit}>
		<fieldset disabled={submitting}>
			<div>
				<label for="tail-number">Tail Number</label>
				<input
					id="tail-number"
					type="text"
					bind:value={tailNumber}
					required
					placeholder="N12345"
					style="text-transform: uppercase;"
				/>
			</div>

			<div>
				<label for="aircraft-type">Aircraft Type</label>
				{#if aircraftTypes.isLoading}
					<p>Loading types...</p>
				{:else if aircraftTypes.error}
					<p style="color: red;">Error loading types: {aircraftTypes.error.message}</p>
				{:else}
					<select id="aircraft-type" bind:value={aircraftTypeId} required>
						<option value="" disabled>Select a type...</option>
						{#each aircraftTypes.data ?? [] as t (t._id)}
							<option value={t._id}>{t.designator} - {t.make} {t.model}</option>
						{/each}
					</select>
				{/if}
			</div>

			<div>
				<label for="notes">Notes</label>
				<textarea id="notes" bind:value={notes} rows="3" placeholder="Optional notes"></textarea>
			</div>

			<div>
				<button type="submit" disabled={submitting}>
					{submitting ? 'Saving...' : 'Save Aircraft'}
				</button>
				<a href={resolve('/app/aircraft')}>Cancel</a>
			</div>
		</fieldset>
	</form>
</div>
