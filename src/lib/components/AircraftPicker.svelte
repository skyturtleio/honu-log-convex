<script lang="ts">
	interface Aircraft {
		_id: string;
		tail_number: string;
	}

	interface AircraftType {
		_id: string;
		designator: string;
		make: string;
		model: string;
	}

	interface Props {
		aircraftList: Aircraft[];
		aircraftTypesList: AircraftType[];
		value: string;
		oncreate: (tailNumber: string, aircraftTypeId: string) => Promise<string>;
	}

	let { aircraftList, aircraftTypesList, value = $bindable(), oncreate }: Props = $props();

	let query = $state('');
	let showDropdown = $state(false);
	let showCreateForm = $state(false);
	let selectedTypeId = $state('');
	let creating = $state(false);

	let selectedAircraft = $derived(aircraftList.find((a) => a._id === value));

	let filteredAircraft = $derived(
		query.trim()
			? aircraftList.filter((a) => a.tail_number.toLowerCase().includes(query.trim().toLowerCase()))
			: aircraftList
	);

	let hasExactMatch = $derived(
		filteredAircraft.some((a) => a.tail_number.toLowerCase() === query.trim().toLowerCase())
	);

	function selectAircraft(aircraft: Aircraft) {
		value = aircraft._id;
		query = aircraft.tail_number;
		showDropdown = false;
		showCreateForm = false;
	}

	function clearSelection() {
		value = '';
		query = '';
		showCreateForm = false;
	}

	function openCreateForm() {
		showCreateForm = true;
		selectedTypeId = aircraftTypesList[0]?._id ?? '';
	}

	async function handleCreate() {
		const tailNumber = query.trim().toUpperCase();
		if (!tailNumber || !selectedTypeId) return;
		creating = true;
		try {
			const newId = await oncreate(tailNumber, selectedTypeId);
			value = newId;
			query = tailNumber;
			showDropdown = false;
			showCreateForm = false;
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
		showCreateForm = false;
	}

	function handleBlur() {
		// Delay to allow click events on dropdown items to fire
		setTimeout(() => {
			showDropdown = false;
			showCreateForm = false;
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

				{#if query.trim() && !hasExactMatch}
					{#if !showCreateForm}
						<button
							type="button"
							style="display: block; width: 100%; text-align: left; padding: 0.5rem; border: none; background: none; cursor: pointer; font-style: italic;"
							onmousedown={openCreateForm}
						>
							Add "{query.trim().toUpperCase()}" as new aircraft
						</button>
					{:else}
						<div style="padding: 0.5rem; border-top: 1px solid #ccc;">
							<div style="margin-bottom: 0.5rem;">
								<label>
									Tail Number
									<input type="text" value={query.trim().toUpperCase()} readonly />
								</label>
							</div>
							<div style="margin-bottom: 0.5rem;">
								<label>
									Aircraft Type
									<select bind:value={selectedTypeId}>
										{#each aircraftTypesList as aircraftType (aircraftType._id)}
											<option value={aircraftType._id}>
												{aircraftType.designator} - {aircraftType.make}
												{aircraftType.model}
											</option>
										{/each}
									</select>
								</label>
							</div>
							<button type="button" disabled={creating} onmousedown={handleCreate}>
								{creating ? 'Creating...' : 'Create'}
							</button>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	{/if}
</div>
