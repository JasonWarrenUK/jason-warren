<script lang="ts">
	import { page } from '$app/stores';
	import { SITE_URL } from '$lib/config.js';

	interface Props {
		/** Full document title, including the "| Jason Warren" suffix. */
		title: string;
		description: string;
		/** Absolute Open Graph image URL. Defaults to the site card. */
		image?: string;
		/** Open Graph type. "website" for index pages, "article" for project pages. */
		type?: 'website' | 'article';
	}

	let {
		title,
		description,
		image = `${SITE_URL}/og/default.png`,
		type = 'website'
	}: Props = $props();

	// Canonical URL from the current path, without query strings.
	const canonical = $derived(`${SITE_URL}${$page.url.pathname}`);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />

	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={image} />
	<meta property="og:type" content={type} />
</svelte:head>
