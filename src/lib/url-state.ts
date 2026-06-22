/**
 * Pure URL search-param helpers for set-valued filter state and tech-label
 * encoding.
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
 * Values are sorted so the same logical filter always produces the same string,
 * which keeps URLs stable and avoids churn when using replaceState.
 */
export function serialiseSet(values: Set<string>): string | null {
	if (values.size === 0) return null;
	return [...values].sort().join(',');
}

// ---------------------------------------------------------------------------
// Tech-label codec
//
// Technology labels (e.g. "C#", "Node.js", ".NET 8", "POSIX shell") contain
// characters that are unsafe in URL search params. `#` is especially dangerous
// because browsers strip everything from `#` onward as a fragment, silently
// discarding the value. encodeURIComponent handles all of these correctly.
// ---------------------------------------------------------------------------

/**
 * Encode a technology label for the `?tech=` URL search param.
 * Handles `#`, spaces, dots, and other unsafe characters.
 */
export function encodeTechLabel(label: string): string {
	return encodeURIComponent(label);
}

/**
 * Decode a `?tech=` search-param value and validate it against the set of
 * labels actually present in the current view.
 *
 * Returns `null` when:
 * - the raw param is absent (`null`)
 * - the decoded label is not found in `known` (stale-pin guard — a dead link
 *   must never dim the whole chart with nothing highlighted)
 */
export function decodeTechLabel(raw: string | null, known: Iterable<string>): string | null {
	if (raw === null) return null;
	const decoded = decodeURIComponent(raw);
	for (const label of known) {
		if (label === decoded) return decoded;
	}
	return null;
}
