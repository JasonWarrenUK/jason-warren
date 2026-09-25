<script lang="ts">
	import { page } from '$app/stores';
	import { SITE_URL, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from '$lib/config.js';

	interface Props {
		/** Full document title, including the "| Jason Warren" suffix. */
		title: string;
		description: string;
		/** Absolute Open Graph image URL. Defaults to the site card. */
		image?: string;
		/**
		 * Pixel dimensions of a supplied `image`. Only the OG card renderer's
		 * output is guaranteed to be 1200x630; an `image` override with no
		 * matching dimensions omits og:image:width/height rather than mislabel
		 * it.
		 */
		imageWidth?: number;
		imageHeight?: number;
		/** Open Graph type. "website" for index pages, "article" for project pages. */
		type?: 'website' | 'article';
	}

	let { title, description, image, imageWidth, imageHeight, type = 'website' }: Props = $props();

	const resolvedImage = $derived(image ?? `${SITE_URL}/og/default.png`);
	// Dimensions are only known for the OG card renderer's fixed 1200x630
	// output: the default card, or an explicit override that states its own.
	// An `image` override with no dimensions given emits neither meta tag,
	// rather than describing a picture that may not be 1200x630.
	const resolvedWidth = $derived(image === undefined ? OG_IMAGE_WIDTH : imageWidth);
	const resolvedHeight = $derived(image === undefined ? OG_IMAGE_HEIGHT : imageHeight);

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
	<meta property="og:image" content={resolvedImage} />
	{#if resolvedWidth !== undefined}
		<meta property="og:image:width" content={String(resolvedWidth)} />
	{/if}
	{#if resolvedHeight !== undefined}
		<meta property="og:image:height" content={String(resolvedHeight)} />
	{/if}
	<meta property="og:image:type" content="image/png" />
	<meta property="og:type" content={type} />
</svelte:head>
