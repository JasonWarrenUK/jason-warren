/**
 * Site navigation links. Single source of truth for both the desktop row
 * and the mobile hamburger panel in +layout.svelte.
 *
 * Paths are base-relative (e.g. '/projects'); the layout prefixes `base`
 * from `$app/paths` at render time so a non-root deployment base still works.
 */

export interface NavLink {
	path: string;
	label: string;
}

export const navLinks: NavLink[] = [
	{ path: '/projects', label: 'Projects' },
	{ path: '/map', label: 'Map' },
	{ path: '/timeline', label: 'Timeline' },
	{ path: '/toolkit', label: 'Toolkit' },
	{ path: '/about', label: 'About' },
	{ path: '/hire', label: 'Hire' },
	{ path: '/colophon', label: 'Colophon' }
];
