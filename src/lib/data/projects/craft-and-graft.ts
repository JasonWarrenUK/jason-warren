import type { Project } from '../types.js';

export const craftAndGraft: Project = {
	slug: 'craft-and-graft',
	name: 'Craft and Graft',
	tagline:
		'A team-built e-commerce storefront with session-based authentication and a PostgreSQL product catalogue.',
	description:
		'[Placeholder] Craft and Graft is an e-commerce application built by a three-person FAC team: an Express and PostgreSQL API with bcrypt/session authentication, and a React and Tailwind storefront. Jason led the frontend, building the authentication flow, the database-driven product views, and the Netlify deployment pipeline. The companion API repo handles the server-side product and session logic.',
	kind: 'app',
	contribution: {
		role: 'lead',
		contributionNote:
			'Jason led the React storefront, building the authentication flow, the database-driven product views, the Netlify continuous-deployment pipeline, and the team\'s GitHub Actions automation (stale-issue bot, first-contributor greeter).',
		team: 'Founders and Coders'
	},
	status: 'finished',
	repoUrl: 'https://github.com/fac30/craft-and-graft-front',
	secondaryRepoUrl: 'https://github.com/fac30/craft-and-graft-api',
	highlights: [
		'Full session-based auth: bcrypt-hashed passwords, PostgreSQL-backed sessions via connect-pg-simple, with login/signup/logout controllers in the API.',
		'React storefront where nav and views adapt to login status, with products fetched live from the Express API companion repo.',
		'Netlify continuous deployment wired up from pull requests via CD pipeline.',
		'Team GitHub Actions automation: stale-issue bot and first-contributor greeter — Jason set up the team\'s CI ergonomics.',
		'PostgreSQL schema and seed scripts driving a product catalogue with an ERD for reference.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'React', kind: 'framework' },
		{ label: 'Vite', kind: 'framework' },
		{ label: 'Express', kind: 'framework' },
		{ label: 'PostgreSQL', kind: 'domain' },
		{ label: 'Node.js', kind: 'runtime' }
	],
	metrics: {
		commits: 92,
		mergedPrs: 32
	}
};
