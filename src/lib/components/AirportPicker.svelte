<script lang="ts">
	import { getConvexClient } from '$lib/convex';
	import { api } from '../../convex/_generated/api';

	interface Airport {
		_id: string;
		icao: string;
		iata?: string;
		name: string;
		city?: string;
	}

	interface Props {
		value: string;
		placeholder?: string;
	}

	let { value = $bindable(), placeholder = 'ICAO code...' }: Props = $props();

	let searchText = $state('');
	let results = $state<Airport[]>([]);
	let showDropdown = $state(false);
	let searching = $state(false);
	let debounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	// Sync input display when value is set externally (edit mode)
	let displayText = $derived(showDropdown || searchText ? searchText : value);

	function scheduleSearch(query: string) {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (query.length < 2) {
			results = [];
			return;
		}
		debounceTimer = setTimeout(async () => {
			searching = true;
			try {
				results = await getConvexClient().query(api.airports.search, { query });
			} catch {
				results = [];
			} finally {
				searching = false;
			}
		}, 200);
	}

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		searchText = input.value.toUpperCase();
		showDropdown = true;
		scheduleSearch(searchText);
	}

	function handleFocus() {
		searchText = value || '';
		showDropdown = true;
		if (searchText.length >= 2) {
			scheduleSearch(searchText);
		}
	}

	function handleBlur() {
		// Delay to allow click events on dropdown items to fire
		setTimeout(() => {
			showDropdown = false;
			// Accept direct ICAO input (4 uppercase letters) when tabbing away
			const trimmed = searchText.trim().toUpperCase();
			if (trimmed.length === 4 && /^[A-Z]{4}$/.test(trimmed)) {
				value = trimmed;
				searchText = '';
			} else if (!trimmed) {
				value = '';
				searchText = '';
			} else {
				// Revert to current value if input doesn't match a valid ICAO
				searchText = '';
			}
		}, 200);
	}

	function selectAirport(airport: Airport) {
		value = airport.icao;
		searchText = '';
		showDropdown = false;
	}

	function formatAirport(airport: Airport): string {
		let label = airport.icao + ' - ' + airport.name;
		if (airport.iata) {
			label += ' (' + airport.iata + ')';
		}
		if (airport.city) {
			label += ' - ' + airport.city;
		}
		return label;
	}
</script>

<div style="position: relative;">
	<input
		type="text"
		value={displayText}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		{placeholder}
		style="text-transform: uppercase;"
	/>

	{#if showDropdown && results.length > 0}
		<div
			style="position: absolute; top: 100%; left: 0; right: 0; z-index: 10; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto;"
		>
			{#each results as airport (airport._id)}
				<button
					type="button"
					style="display: block; width: 100%; text-align: left; padding: 0.5rem; border: none; background: none; cursor: pointer;"
					onmousedown={() => selectAirport(airport)}
				>
					{formatAirport(airport)}
				</button>
			{/each}
		</div>
	{/if}

	{#if showDropdown && searching}
		<div
			style="position: absolute; top: 100%; left: 0; right: 0; z-index: 10; background: white; border: 1px solid #ccc; padding: 0.5rem; color: #888;"
		>
			Searching...
		</div>
	{/if}
</div>
