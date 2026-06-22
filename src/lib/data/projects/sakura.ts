import type { AuthoredProject } from '../types.js';

export const sakura: AuthoredProject = {
	slug: 'sakura',
	name: 'Sakura',
	tagline:
		'A colour-palette manager with a hex-to-name matching engine, built on ASP.NET Core and Entity Framework.',
	blurb: 'A colour-palette manager with a hex-to-name matching engine.',
	description:
		'A colour-palette manager where users collect and organise palettes with per-collection privacy controls, built on an ASP.NET Core 8 and Entity Framework Core API backed by PostgreSQL, paired with a React frontend in a companion repo. Jason led the API, designing the Entity Framework Core data model (including a ColourCollection join table with explicit ordering and a full migrations history) and the privacy-filtered collections-by-user endpoints scoped to the authenticated user. The centrepiece is the colour-matching engine in ColourSearch.cs, which converts between hex, RGB, and HSL with validation to resolve arbitrary hex codes to the nearest named colour. The REST API is documented with Swagger and secured with ASP.NET Identity authentication.',
	kind: 'app',
	contribution: {
		role: 'lead',
		collaboration: { team: 'FAC-30 cohort', employer: 'Founders and Coders' },
		contributionNote:
			"Led the ASP.NET Core API on a FAC-30 cohort project: a colour-matching engine (hex/RGB/HSL conversion, nearest-colour name resolution), Entity Framework Core data model with a ColourCollection join table, privacy-filtered collections endpoints scoped to the authenticated user, and Swagger-documented REST with ASP.NET Identity auth.",
	},
	status: 'finished',
	repoUrl: 'https://github.com/fac30/sakura-api',
	secondaryRepoUrl: 'https://github.com/fac30/sakura-front',
	highlights: [
		'Colour-matching engine (ColourSearch.cs): hex to RGB to HSL conversion with validation and nearest-colour name resolution, letting the app name arbitrary hex codes.',
		'Entity Framework Core data model with a ColourCollection join table, explicit ordering, and a full migrations history.',
		'Privacy-filtered collections-by-user endpoints: public/private visibility per collection, scoped to the authenticated user.',
		'Colour DTOs with serialisation for frontend consumption, enabling colour operations to be driven from the React UI without coupling the API to presentation logic.',
		'Swagger-documented REST API on ASP.NET Core 8 with ASP.NET Identity authentication.'
	],
	relationships: [],
	tags: [
		{ label: 'C#', kind: 'language' },
		{ label: 'ASP.NET Core', kind: 'framework' },
		{ label: 'Entity Framework Core', kind: 'data' },
		{ label: 'PostgreSQL', kind: 'data' },
		{ label: 'React', kind: 'framework' },
		{ label: '.NET 8', kind: 'runtime' }
	],
	lastCommit: '2024-11-21',
	metrics: {
		commits: 159,
		mergedPrs: 20,
		linesAdded: 5092
	}
};
