import type { Project } from '../types.js';

export const sakura: Project = {
	slug: 'sakura',
	name: 'Sakura',
	tagline:
		'A colour-palette manager with a hex-to-name matching engine, built on ASP.NET Core and Entity Framework.',
	description:
		'[Placeholder] Sakura is a colour-collection application: an ASP.NET Core 8 and Entity Framework Core API backed by PostgreSQL, paired with a React and Material UI frontend (companion repo). Users collect and organise colour palettes with privacy controls. Jason led the API, designing the data model, the privacy-aware collection endpoints, and a colour-matching engine that converts between hex, RGB and HSL to resolve colours by name.',
	kind: 'app',
	contribution: {
		role: 'lead',
		contributionNote:
			'Jason led the ASP.NET Core API, designing the Entity Framework Core data model, the privacy-filtered collections endpoints, and the colour-matching engine in ColourSearch.cs that converts between hex, RGB and HSL to resolve colours by name.',
		team: 'Founders and Coders'
	},
	status: 'finished',
	repoUrl: 'https://github.com/fac30/sakura-api',
	secondaryRepoUrl: 'https://github.com/fac30/sakura-front',
	highlights: [
		'Colour-matching engine (ColourSearch.cs): hex to RGB to HSL conversion with validation and nearest-colour name resolution, letting the app name arbitrary hex codes.',
		'Entity Framework Core data model with a ColourCollection join table, explicit ordering, and a full migrations history.',
		'Privacy-filtered collections-by-user endpoints: public/private visibility per collection, scoped to the authenticated user.',
		'Colour DTOs enabling dynamic palette generation driven from the React frontend.',
		'Swagger-documented REST API on ASP.NET Core 8 with ASP.NET Identity authentication.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'C#', kind: 'language' },
		{ label: 'ASP.NET Core', kind: 'framework' },
		{ label: 'Entity Framework Core', kind: 'domain' },
		{ label: 'PostgreSQL', kind: 'domain' },
		{ label: 'React', kind: 'framework' },
		{ label: '.NET 8', kind: 'runtime' }
	],
	metrics: {
		commits: 159,
		mergedPrs: 20,
		linesAdded: 5092
	}
};
