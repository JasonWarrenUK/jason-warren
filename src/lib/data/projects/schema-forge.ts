import type { AuthoredProject } from '../types.js';

export const schemaForge: AuthoredProject = {
	slug: 'schema-forge',
	tagline:
		'An XSD-driven schema system for TypeScript: parse XSD files into queryable registries, then validate data, map CSV rows to nested schema objects, and generate valid XML.',
	blurb: 'An XSD-driven schema system for validating data and generating XML.',
	description:
		'An XSD-driven schema system for TypeScript that crystallised the validation approach used across the Iris ILR toolkit. It separates the parsing concern, building SchemaRegistry objects with element trees, lookup maps, and full constraint metadata, from the application concerns of validation, CSV mapping, and XML generation. Data is validated against XSD-defined types, patterns, cardinality, ranges, and enumerations; flat CSV columns map to nested XSD paths with optional named transforms; and XML is generated from data objects using the schema structure and namespace information. Over 17 built-in transformation functions cover common type conversion, string formatting, and date handling.',
	kind: 'library',
	contribution: { role: 'solo' },
	status: 'wip',
	track: 'product',
	progress: 'in-progress',
	highlights: [
		'XSD parsing into SchemaRegistry objects with element trees, lookup maps, and full constraint metadata.',
		'Data validation against XSD-defined constraints: types, patterns, cardinality, ranges, enumerations.',
		'CSV-to-schema mapping: flat CSV columns to nested XSD paths with optional named transforms.',
		'XML generation from data objects using the schema structure and namespace information.',
		'17+ built-in transformation functions for type conversion, string formatting, and date handling.'
	],
	relationships: [
		{
			kind: 'powers',
			target: 'iris',
			note: 'The XSD parsing and validation core was the general problem hiding inside Iris; Schema Forge is that core on its own, reusable by anything that speaks XSD.'
		}
	],
	tags: [
		{ label: 'XML / XSD', kind: 'tool' },
		{ label: 'No persistence', kind: 'data' }
	]
};
