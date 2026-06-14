import adapter from '@sveltejs/adapter-static';

const dev = process.argv.includes('dev');

/**
 * Deployed to GitHub Pages at /jason-warren/. The base path is only applied
 * to production builds so local dev serves from the root.
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	kit: {
		adapter: adapter({
			fallback: '404.html'
		}),
		paths: {
			base: dev ? '' : '/jason-warren'
		}
	}
};

export default config;
