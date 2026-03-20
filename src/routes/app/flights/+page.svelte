<script lang="ts">
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';

	let user = $derived(page.data.user);
	const identity = useQuery(api.debug.whoami, {});
</script>

<h1>Flight Logbook</h1>

{#if user}
	<section>
		<h2>User Info (Server)</h2>
		<ul>
			{#each Object.entries(user) as [key, value] (key)}
				<li>{key}: {value}</li>
			{/each}
		</ul>
	</section>
{/if}

<section>
	<h2>Convex Identity (debug.whoami)</h2>
	{#if identity.isLoading}
		<p>Loading Convex identity...</p>
	{:else if identity.error}
		<p>Error: {identity.error.message}</p>
	{:else if identity.data}
		<ul>
			{#each Object.entries(identity.data) as [key, value] (key)}
				<li>{key}: {JSON.stringify(value)}</li>
			{/each}
		</ul>
	{:else}
		<p>Not authenticated with Convex (whoami returned null)</p>
	{/if}
</section>
