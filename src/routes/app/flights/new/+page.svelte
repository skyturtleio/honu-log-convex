<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { flightsCollection } from '../../../../collections/useFlights';
	import { aircraftCollection } from '../../../../collections/useAircraft';
	import { useCollection } from '$lib/useCollection.svelte';
	import FlightForm from '$lib/components/FlightForm.svelte';
	import { createAircraft } from '$lib/aircraft/createAircraft';
	import type { FlightFormData } from '$lib/flights/validation';

	const aircraftStore = useCollection(aircraftCollection.get());

	async function handleCreateAircraft(tailNumber: string): Promise<string> {
		return createAircraft(page.data.user?.sub, tailNumber);
	}

	async function handleSave(data: FlightFormData) {
		const id = crypto.randomUUID();
		const now = Date.now();
		flightsCollection.get().insert({
			id,
			ownerId: page.data.user?.sub,
			createdAt: now,
			updatedAt: now,
			...data
		});
		await goto(resolve('/app/flights'));
	}
</script>

<div>
	<h1>New Flight</h1>

	<FlightForm
		aircraftList={aircraftStore.data.map((a) => ({ _id: a.id, tail_number: a.tail_number }))}
		oncreateaircraft={handleCreateAircraft}
		onsave={handleSave}
	/>

	<div>
		<a href={resolve('/app/flights')}>Cancel</a>
	</div>
</div>
