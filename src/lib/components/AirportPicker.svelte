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

	// Duplicate detection: show match confirmation when user types an existing code
	let matchSuggestion = $state<Airport | null>(null);
	let selectedFromDropdown = $state(false);

	// Custom airport creation
	let showCreateForm = $state(false);
	let createIcao = $state('');
	let createName = $state('');
	let creating = $state(false);
	let createError = $state('');

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
		matchSuggestion = null;
		showCreateForm = false;
		selectedFromDropdown = false;
		scheduleSearch(searchText);
	}

	function handleFocus() {
		searchText = value || '';
		showDropdown = true;
		matchSuggestion = null;
		showCreateForm = false;
		selectedFromDropdown = false;
		if (searchText.length >= 2) {
			scheduleSearch(searchText);
		}
	}

	async function handleBlur() {
		// Delay to allow click events on dropdown items to fire
		setTimeout(async () => {
			showDropdown = false;
			const trimmed = searchText.trim().toUpperCase();

			if (trimmed.length === 4 && /^[A-Z]{4}$/.test(trimmed)) {
				if (selectedFromDropdown) {
					searchText = '';
					return;
				}

				// Check if this code matches an existing airport
				try {
					const existing = await getConvexClient().query(api.airports.getByIcao, {
						icao: trimmed
					});
					if (existing) {
						matchSuggestion = existing as Airport;
						value = trimmed;
						searchText = '';
						return;
					}
				} catch {
					// If lookup fails, just accept the code
				}

				// No match found — offer to create a custom airport
				value = trimmed;
				searchText = '';
				showCreateForm = true;
				createIcao = trimmed;
				createName = '';
				createError = '';
			} else if (!trimmed) {
				value = '';
				searchText = '';
			} else {
				searchText = '';
			}
		}, 200);
	}

	function selectAirport(airport: Airport) {
		value = airport.icao;
		searchText = '';
		showDropdown = false;
		matchSuggestion = null;
		showCreateForm = false;
		selectedFromDropdown = true;
	}

	function confirmMatch() {
		matchSuggestion = null;
	}

	function dismissMatch() {
		// User wants a custom airport — show create form
		const icao = matchSuggestion?.icao ?? value;
		matchSuggestion = null;
		showCreateForm = true;
		createIcao = icao;
		createName = '';
		createError = '';
	}

	function cancelCreate() {
		showCreateForm = false;
		createError = '';
	}

	async function submitCreate() {
		if (!createName.trim()) {
			createError = 'Name is required';
			return;
		}
		creating = true;
		createError = '';
		try {
			await getConvexClient().mutation(api.airports.create, {
				icao: createIcao,
				name: createName.trim()
			});
			value = createIcao;
			showCreateForm = false;
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create airport';
		} finally {
			creating = false;
		}
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

	{#if matchSuggestion}
		<div class="match-suggestion">
			<span>Did you mean <strong>{formatAirport(matchSuggestion)}</strong>?</span>
			<div class="match-actions">
				<button type="button" onclick={confirmMatch}>Use this airport</button>
				<button type="button" class="dismiss" onclick={dismissMatch}>No, create custom</button>
			</div>
		</div>
	{/if}

	{#if showCreateForm}
		<div class="create-form">
			<div class="create-header">
				Create custom airport <strong>{createIcao}</strong>
			</div>
			<div class="create-field">
				<label for="create-airport-name">Name</label>
				<input
					id="create-airport-name"
					type="text"
					bind:value={createName}
					placeholder="Airport name"
					disabled={creating}
				/>
			</div>
			{#if createError}
				<small style="color: red;">{createError}</small>
			{/if}
			<div class="create-actions">
				<button type="button" onclick={submitCreate} disabled={creating}>
					{creating ? 'Creating...' : 'Create'}
				</button>
				<button type="button" class="dismiss" onclick={cancelCreate} disabled={creating}>
					Cancel
				</button>
			</div>
		</div>
	{/if}

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

<style>
	.match-suggestion {
		margin-top: 0.25rem;
		padding: 0.5rem;
		background: #fffbe6;
		border: 1px solid #e6d84c;
		border-radius: 4px;
		font-size: 0.9em;
	}
	.match-actions,
	.create-actions {
		margin-top: 0.25rem;
		display: flex;
		gap: 0.5rem;
	}
	.match-actions button,
	.create-actions button {
		font-size: 0.85em;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
	}
	.match-actions .dismiss,
	.create-actions .dismiss {
		background: none;
		border: 1px solid #ccc;
		color: #666;
	}
	.create-form {
		margin-top: 0.25rem;
		padding: 0.5rem;
		background: #f0f8ff;
		border: 1px solid #b0d0e8;
		border-radius: 4px;
		font-size: 0.9em;
	}
	.create-header {
		margin-bottom: 0.25rem;
	}
	.create-field {
		margin-bottom: 0.25rem;
	}
	.create-field label {
		display: block;
		font-size: 0.85em;
		color: #666;
	}
	.create-field input {
		width: 100%;
		padding: 0.2rem 0.4rem;
	}
</style>
