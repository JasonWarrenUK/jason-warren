import type { AuthoredProject } from '../types.js';

export const craftAndGraft: AuthoredProject = {
	slug: 'craft-and-graft',
	name: 'Craft and Graft',
	tagline:
		'A team-built e-commerce storefront with session-based authentication and a PostgreSQL product catalogue.',
	blurb: 'A team-built e-commerce storefront on PostgreSQL.',
	description:
		"A team-built e-commerce storefront pairing an Express and PostgreSQL API with a React and Tailwind frontend. Session-based authentication uses bcrypt-hashed passwords and PostgreSQL-backed sessions via connect-pg-simple, with login, signup, and logout controllers in the API and a storefront whose navigation and views adapt to login status, fetching products live from the companion API repo. Jason led the React storefront, building the authentication flow, the database-driven product views, and the Netlify continuous-deployment pipeline wired up from pull requests, and set up the team's GitHub Actions automation including a stale-issue bot and a first-contributor greeter.",
	kind: 'app',
	contribution: {
		role: 'lead',
		collaboration: { team: 'FAC-30 cohort', employer: 'Founders and Coders' },
		contributionNote:
			'Led the React storefront on a FAC-30 cohort e-commerce project: session-based auth with bcrypt and connect-pg-simple, product views fetched live from an Express/PostgreSQL API, Netlify CD pipeline and two GitHub Actions bots covering CI ergonomics from the first sprint.'
	},
	status: 'finished',
	repoUrl: 'https://github.com/fac30/craft-and-graft-front',
	secondaryRepoUrl: 'https://github.com/fac30/craft-and-graft-api',
	highlights: [
		'Full session-based auth: bcrypt-hashed passwords, PostgreSQL-backed sessions via connect-pg-simple, with login/signup/logout controllers in the API.',
		'React storefront where nav and views adapt to login status, with products fetched live from the Express API companion repo.',
		'Netlify continuous deployment wired up from pull requests via CD pipeline.',
		'Team GitHub Actions automation: a stale-issue bot and first-contributor greeter, covering CI ergonomics from the start.',
		'PostgreSQL schema and seed scripts driving a product catalogue with an ERD for reference.'
	],
	relationships: [],
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'React', kind: 'framework' },
		{ label: 'Vite', kind: 'framework' },
		{ label: 'Express', kind: 'framework' },
		{ label: 'PostgreSQL', kind: 'data' },
		{ label: 'Node.js', kind: 'runtime' }
	],
	lastCommit: '2024-10-31',
	metrics: {
		commits: 92,
		mergedPrs: 32
	}
};
