/**
 * Date formatting for authored/derived ISO dates.
 *
 * A hardcoded English month table, deliberately: Intl.DateTimeFormat can
 * disagree between the prerendering Node ICU and the browser's, and
 * `new Date(iso)` parses as UTC so a midnight date can shift across a month
 * boundary in local time. String slicing keeps server and client output
 * byte-identical, per the SSR determinism contract.
 */

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/**
 * "2020-06-15" → "June 2020". Month + year only: curated adoption dates are
 * mid-month approximations, so day-level output would imply false precision.
 * Throws on a malformed ISO string so bad data fails the build rather than
 * rendering nonsense.
 */
export function formatMonthYear(iso: string): string {
	const month = Number(iso.slice(5, 7));
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || month < 1 || month > 12) {
		throw new Error(`formatMonthYear: invalid ISO date "${iso}"`);
	}
	return `${MONTH_NAMES[month - 1]} ${iso.slice(0, 4)}`;
}
