import type { AuthoredProject } from '../types.js';

export const sakura: AuthoredProject = {
	slug: 'sakura',
	tagline:
		'A colour-palette manager with a hex-to-name matching engine, built on ASP.NET Core and Entity Framework.',
	blurb: 'A colour-palette manager with a hex-to-name matching engine.',
	description:
		'A colour-palette manager where users collect and organise palettes with per-collection privacy controls, built on an ASP.NET Core 8 and Entity Framework Core API backed by PostgreSQL, paired with a React frontend in a companion repo. I led the API, designing the Entity Framework Core data model (including a ColourCollection join table with explicit ordering and a full migrations history) and the privacy-filtered collections-by-user endpoints scoped to the authenticated user. ColourSearch.cs is the part I am most proud of: type "bright light reddish orange" and it returns the correct hex. It converts between hex, RGB and HSL, then traverses the named-colour space by perceptual distance to resolve any description to its nearest match. The REST API is documented with Swagger and secured with ASP.NET Identity authentication.',
	kind: 'app',
	contribution: {
		role: 'lead',
		collaboration: { team: 'FAC-30 cohort', employer: 'Founders and Coders' },
		contributionNote:
			'Led the ASP.NET Core API on a FAC-30 cohort project: a colour-matching engine (hex/RGB/HSL conversion, nearest-colour name resolution), Entity Framework Core data model with a ColourCollection join table, privacy-filtered collections endpoints scoped to the authenticated user and Swagger-documented REST with ASP.NET Identity auth.'
	},
	track: 'product',
	progress: 'complete',
	highlights: [
		'Colour-matching engine (ColourSearch.cs): hex to RGB to HSL conversion with validation and nearest-colour name resolution, letting the app name arbitrary hex codes.',
		'Entity Framework Core data model with a ColourCollection join table, explicit ordering, and a full migrations history.',
		'Privacy-filtered collections-by-user endpoints: public/private visibility per collection, scoped to the authenticated user.',
		'Colour DTOs with serialisation for frontend consumption, enabling colour operations to be driven from the React UI without coupling the API to presentation logic.',
		'Swagger-documented REST API on ASP.NET Core 8 with ASP.NET Identity authentication.'
	],
	relationships: [],
	tags: []
};
