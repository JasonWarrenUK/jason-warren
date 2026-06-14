<script lang="ts">
	import { base } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="{base}/favicon.png" />
	<meta name="author" content="Jason Warren" />
</svelte:head>

{@render children()}
