<script lang="ts">
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';

	const client = useConvexClient();
	const aircraft = useQuery(api.aircraft.list, {});
	const aircraftTypes = useQuery(api.aircraft.listTypes, {});

	let editingId = $state<string | null>(null);
	let editTailNumber = $state('');
	let editAircraftTypeId = $state('');
	let editNotes = $state('');
	let saving = $state(false);
	let deleting = $state<string | null>(null);
	let error = $state('');

	const typesById = $derived(new Map((aircraftTypes.data ?? []).map((t) => [t._id, t])));

	function formatType(typeId: string | undefined): string {
		if (!typeId) return '--';
		const t = typesById.get(typeId as Id<'aircraft_types'>);
		if (!t) return '--';
		return `${t.designator} - ${t.make} ${t.model}`;
	}

	function startEdit(ac: {
		_id: string;
		tail_number: string;
		aircraft_type_id?: string;
		notes?: string;
	}) {
		editingId = ac._id;
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
			await client.mutation(api.aircraft.update, {
				id: editingId as Id<'aircraft'>,
				tail_number: editTailNumber,
				...(editAircraftTypeId
					? { aircraft_type_id: editAircraftTypeId as Id<'aircraft_types'> }
					: {}),
				...(editNotes ? { notes: editNotes } : {})
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
			await client.mutation(api.aircraft.remove, { id: id as Id<'aircraft'> });
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

	{#if aircraft.isLoading || aircraftTypes.isLoading}
		<p>Loading aircraft...</p>
	{:else if aircraft.error}
		<p>Error loading aircraft: {aircraft.error.message}</p>
	{:else if aircraftTypes.error}
		<p>Error loading aircraft types: {aircraftTypes.error.message}</p>
	{:else if aircraft.data && aircraft.data.length > 0}
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
				{#each aircraft.data as ac (ac._id)}
					{#if editingId === ac._id}
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
									{#each aircraftTypes.data ?? [] as t (t._id)}
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
									onclick={() => handleDelete(ac._id, ac.tail_number)}
									disabled={deleting === ac._id}
								>
									{deleting === ac._id ? 'Deleting...' : 'Delete'}
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
