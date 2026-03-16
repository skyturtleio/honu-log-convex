<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>

<form method="POST" action="?/{data.user ? 'signOut' : 'signIn'}">
	<button type="submit">Sign {data.user ? 'out' : 'in'}</button>
</form>

{#if data.user}
	<ul>
		{#each Object.entries(data.user) as [key, value] (key)}
			<li>{key}: {value}</li>
		{/each}
	</ul>
{/if}
