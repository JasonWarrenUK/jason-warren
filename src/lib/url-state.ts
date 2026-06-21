/**
 * Pure URL search-param helpers for set-valued filter state.
 *
 * These are intentionally framework-free (no Svelte, no $app imports) so they
 * are easy to unit-test and safe to call from any context.
 */

/**
 * Decode a comma-joined param value into a typed Set.
 *
 * `null` (param absent) and `''` (param present but empty) both produce an
 * empty set. Duplicate entries and empty tokens are silently dropped.
 */
export function parseSet<T extends string>(raw: string | null): Set<T> {
	if (!raw) return new Set<T>();
	return new Set<T>(raw.split(',').filter((v): v is T => v.length > 0) as T[]);
}

/**
 * Encode a Set into a canonical, sorted comma-joined string suitable for a URL
 * search param, or `null` when the set is empty.
 *
 * Returning `null` signals that the caller should delete the param rather than
 * write an empty string, keeping URLs clean (never `?hide-kinds=`).
 *
 * Values are sorted so the same logical filter always produces the same string —
 * useful for stable URLs and avoids churn when using replaceState.
 */
export function serialiseSet(values: Set<string>): string | null {
	if (values.size === 0) return null;
	return [...values].sort().join(',');
}
