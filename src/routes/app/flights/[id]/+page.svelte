<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const flightId = $derived(page.params.id);
</script>

<div>
	<a href={resolve('/app/flights')}>Back to Flights</a>
	<h1>Flight Details</h1>
	<p>Flight: {flightId}</p>
	<p>Detail view coming soon.</p>
</div>
