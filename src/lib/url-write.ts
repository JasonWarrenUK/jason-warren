import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { get } from 'svelte/store';

/**
 * Write a single URL search param. Uses replaceState so selection/filter
 * changes don't clutter browser history, and keepFocus so the control that
 * triggered the change keeps focus (important for keyboard users).
 *
 * `null` deletes the param, keeping URLs clean (never a bare `?project=`).
 *
 * Reads the current URL from the page store via get(), so callers don't need
 * to thread $page through. MUST only be called from a browser event handler,
 * never during SSR/prerender — the one-shot get() avoids a leaked subscription.
 */
export function writeParam(key: string, value: string | null): void {
	const url = new URL(get(page).url);
	if (value === null) {
		url.searchParams.delete(key);
	} else {
		url.searchParams.set(key, value);
	}
	goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
}
