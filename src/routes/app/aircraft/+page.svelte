<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { aircraftCollection } from '../../../collections/useAircraft';
	import type { Aircraft } from '../../../collections/useAircraft';
	import { useCollection } from '$lib/useCollection.svelte';
	import { getConvexClient } from '$lib/convex';
	import { api } from '../../../convex/_generated/api';

	const aircraftStore = useCollection(aircraftCollection.get());

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

	let editingId = $state<string | null>(null);
	let editTailNumber = $state('');
	let editAircraftTypeId = $state('');
	let editNotes = $state('');
	let saving = $state(false);
	let deleting = $state<string | null>(null);
	let error = $state('');

	const typesById = $derived(new Map(aircraftTypes.map((t) => [t._id, t])));

	function formatType(typeId: string | undefined): string {
		if (!typeId) return '--';
		const t = typesById.get(typeId);
		if (!t) return '--';
		return `${t.designator} - ${t.make} ${t.model}`;
	}

	function startEdit(ac: Aircraft) {
		editingId = ac.id;
		editTailNumber = ac.tail_number;
		editAircraftTypeId = ac.aircraft_type_id ?? '';
		editNotes = ac.notes ?? '';
		error = '';
	}

	function cancelEdit() {
		editingId = null;
		error = '';
	}

	async function saveEdit() {
		if (!editingId || saving) return;
		saving = true;
		error = '';

		try {
			aircraftCollection.get().update(editingId, (draft) => {
				draft.tail_number = editTailNumber;
				draft.aircraft_type_id = editAircraftTypeId || undefined;
				draft.notes = editNotes || undefined;
				draft.updatedAt = Date.now();
			});
			editingId = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save changes';
		} finally {
			saving = false;
		}
	}

	async function handleDelete(id: string, tailNumber: string) {
		if (!confirm(`Delete aircraft ${tailNumber}? This cannot be undone.`)) return;
		deleting = id;
		error = '';

		try {
			aircraftCollection.get().delete(id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete aircraft';
		} finally {
			deleting = null;
		}
	}
</script>

<div>
	<header style="display: flex; justify-content: space-between; align-items: center;">
		<h1>Aircraft</h1>
		<a href={resolve('/app/aircraft/new')}>New Aircraft</a>
	</header>

	{#if error}
		<p role="alert" style="color: red;">{error}</p>
	{/if}

	{#if aircraftStore.data.length > 0}
		<table>
			<thead>
				<tr>
					<th>Tail Number</th>
					<th>Aircraft Type</th>
					<th>Notes</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each aircraftStore.data as ac (ac.id)}
					{#if editingId === ac.id}
						<tr>
							<td>
								<input
									type="text"
									bind:value={editTailNumber}
									required
									style="text-transform: uppercase; width: 8em;"
								/>
							</td>
							<td>
								<select bind:value={editAircraftTypeId}>
									<option value="">-- None --</option>
									{#each aircraftTypes as t (t._id)}
										<option value={t._id}>{t.designator} - {t.make} {t.model}</option>
									{/each}
								</select>
							</td>
							<td>
								<input
									type="text"
									bind:value={editNotes}
									placeholder="Notes"
									style="width: 12em;"
								/>
							</td>
							<td>
								<button onclick={saveEdit} disabled={saving}>
									{saving ? 'Saving...' : 'Save'}
								</button>
								<button onclick={cancelEdit} disabled={saving}>Cancel</button>
							</td>
						</tr>
					{:else}
						<tr>
							<td>{ac.tail_number}</td>
							<td>{formatType(ac.aircraft_type_id)}</td>
							<td>{ac.notes ?? ''}</td>
							<td>
								<button onclick={() => startEdit(ac)}>Edit</button>
								<button
									onclick={() => handleDelete(ac.id, ac.tail_number)}
									disabled={deleting === ac.id}
								>
									{deleting === ac.id ? 'Deleting...' : 'Delete'}
								</button>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{:else}
		<p>No aircraft yet. <a href={resolve('/app/aircraft/new')}>Add your first aircraft</a>.</p>
	{/if}
</div>
