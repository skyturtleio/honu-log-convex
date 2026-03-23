<script lang="ts">
	interface Aircraft {
		_id: string;
		tail_number: string;
	}

	interface Props {
		aircraftList: Aircraft[];
		value: string;
		oncreate: (tailNumber: string) => Promise<string>;
	}

	let { aircraftList, value = $bindable(), oncreate }: Props = $props();

	let query = $state('');
	let showDropdown = $state(false);
	let creating = $state(false);

	let selectedAircraft = $derived(aircraftList.find((a) => a._id === value));

	let filteredAircraft = $derived(
		query.trim()
			? aircraftList.filter((a) => a.tail_number.toLowerCase().includes(query.trim().toLowerCase()))
			: aircraftList
	);

	function selectAircraft(aircraft: Aircraft) {
		value = aircraft._id;
		query = aircraft.tail_number;
		showDropdown = false;
	}

	function clearSelection() {
		value = '';
		query = '';
	}

	async function handleCreate() {
		const tailNumber = query.trim().toUpperCase();
		if (!tailNumber) return;
		creating = true;
		try {
			const newId = await oncreate(tailNumber);
			value = newId;
			query = tailNumber;
			showDropdown = false;
		} finally {
			creating = false;
		}
	}

	function handleInputFocus() {
		if (!value) {
			showDropdown = true;
		}
	}

	function handleInputChange() {
		showDropdown = true;
	}

	function handleBlur() {
		// Delay to allow click events on dropdown items to fire
		setTimeout(() => {
			showDropdown = false;
		}, 200);
	}
</script>

<div style="position: relative;">
	{#if value && selectedAircraft}
		<div style="display: flex; align-items: center; gap: 0.5rem;">
			<input type="text" value={selectedAircraft.tail_number} readonly />
			<button type="button" onclick={clearSelection} aria-label="Clear selection">x</button>
		</div>
	{:else}
		<input
			type="text"
			bind:value={query}
			oninput={handleInputChange}
			onfocus={handleInputFocus}
			onblur={handleBlur}
			placeholder="Search tail number..."
		/>

		{#if showDropdown}
			<div
				style="position: absolute; top: 100%; left: 0; right: 0; z-index: 10; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto;"
			>
				{#each filteredAircraft as aircraft (aircraft._id)}
					<button
						type="button"
						style="display: block; width: 100%; text-align: left; padding: 0.5rem; border: none; background: none; cursor: pointer;"
						onmousedown={() => selectAircraft(aircraft)}
					>
						{aircraft.tail_number}
					</button>
				{/each}

				{#if query.trim()}
					<button
						type="button"
						style="display: block; width: 100%; text-align: left; padding: 0.5rem; border: none; background: none; cursor: pointer; font-style: italic;"
						disabled={creating}
						onmousedown={handleCreate}
					>
						{creating ? 'Adding...' : `Add "${query.trim().toUpperCase()}" as new aircraft`}
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>
