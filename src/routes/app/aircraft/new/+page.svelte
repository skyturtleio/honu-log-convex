<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { aircraftCollection } from '../../../../collections/useAircraft';
	import { getConvexClient } from '$lib/convex';
	import { api } from '../../../../convex/_generated/api';

	let aircraftTypes = $state<
		Array<{ _id: string; designator: string; make: string; model: string }>
	>([]);

	onMount(() => {
		const client = getConvexClient();
		const unsub = client.onUpdate(api.aircraft.listTypes, {}, (data) => {
			if (data) aircraftTypes = data;
		});
		return unsub;
	});

	let tailNumber = $state('');
	let selectedTypeId = $state('');
	let notes = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;

		submitting = true;
		error = '';

		try {
			const now = Date.now();
			const id = crypto.randomUUID();
			aircraftCollection.get().insert({
				id,
				tail_number: tailNumber.toUpperCase(),
				...(selectedTypeId ? { aircraft_type_id: selectedTypeId } : {}),
				...(notes ? { notes } : {}),
				createdAt: now,
				updatedAt: now
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
				<select id="aircraft-type" bind:value={selectedTypeId}>
					<option value="">Select a type...</option>
					{#each aircraftTypes as t (t._id)}
						<option value={t._id}>{t.designator} - {t.make} {t.model}</option>
					{/each}
				</select>
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
