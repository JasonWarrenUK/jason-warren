import type { Project } from '../types.js';

export const schemaForge: Project = {
	slug: 'schema-forge',
	name: 'Schema Forge',
	tagline:
		'An XSD-driven schema system for TypeScript: parse XSD files into queryable registries, then validate data, map CSV rows to nested schema objects, and generate valid XML.',
	description:
		'[Placeholder] Schema Forge is the library that crystallised the XSD validation approach used across the Iris ILR toolkit. It separates the XSD parsing concern (building a schema registry with element trees and lookup maps) from the application concerns (validation, CSV mapping, XML generation). The 17+ built-in transforms cover the most common data-normalisation operations.',
	kind: 'library',
	contribution: { role: 'solo' },
	status: 'wip',
	repoUrl: 'https://github.com/JasonWarrenUK/schema-forge',
	highlights: [
		'XSD parsing into SchemaRegistry objects with element trees, lookup maps, and full constraint metadata.',
		'Data validation against XSD-defined constraints: types, patterns, cardinality, ranges, enumerations.',
		'CSV-to-schema mapping: flat CSV columns to nested XSD paths with optional named transforms.',
		'XML generation from data objects using the schema structure and namespace information.',
		'17+ built-in transformation functions for type conversion, string formatting, and date handling.'
	],
	relationships: [
		{
			kind: 'related',
			target: 'iris',
			note: 'The XSD parsing and validation approach here informed and relates to the schema system in Iris.'
		}
	],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Bun', kind: 'runtime' },
		{ label: 'XML / XSD', kind: 'tool' }
	],
	lastCommit: '2026-03-12',
	metrics: {
		commits: 4
	}
};
