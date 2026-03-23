<script lang="ts">
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<nav>
	<a href={resolve('/app/flights')}>Flights</a>
	<a href={resolve('/app/aircraft')}>Aircraft</a>
</nav>
{@render children()}
