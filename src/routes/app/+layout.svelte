<script lang="ts">
	import { resolve } from '$app/paths';

	let { children } = $props();
</script>

<nav>
	<a href={resolve('/app/flights')}>Flights</a>
</nav>
{@render children()}
