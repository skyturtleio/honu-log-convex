<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>Flight Logbook</h1>

{#if data.user}
	<p><a href={resolve('/app/flights')}>Go to Logbook</a></p>
	<form method="POST" action="?/signOut">
		<button type="submit">Sign Out</button>
	</form>
{:else}
	<form method="POST" action="?/signIn">
		<button type="submit">Sign In</button>
	</form>
{/if}
