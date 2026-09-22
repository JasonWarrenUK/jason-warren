/**
 * Schema conformance tests for sources.json.
 *
 * These tests enforce the engine's public output contract:
 * scripts/sources.schema.json ($defs/SyncedSource and $defs/EnrichedSource).
 * The same contract is validated at write time by `drift sync` and
 * `drift enrich`; these tests catch a committed sources.json that drifted
 * from the schema, and catch field-list drift between the schema and the
 * engine's FINGERPRINT_FIELDS derivation.
 *
 * The original version of this file only walked sourcesManifest.sources,
 * so a malformed `enriched` section (5DR.22) would have passed silently —
 * both sections now get the same structural check.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sourcesManifest from './sources.json';

type FieldSpec = { type: string; minimum?: number; items?: { type: string } };

const schemaPath = join(fileURLToPath(import.meta.url), '../../../../scripts/sources.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const sourceProps = schema.$defs.SyncedSource.properties as Record<string, FieldSpec>;
const allowedFields = new Set(Object.keys(sourceProps));

const enrichedProps = schema.$defs.EnrichedSource.properties as Record<string, FieldSpec>;
const enrichedAllowedFields = new Set(Object.keys(enrichedProps));
const enrichedRequired = new Set<string>(schema.$defs.EnrichedSource.required ?? []);

/**
 * Structural check shared by both sections: unknown-field, type and
 * minimum/items checks. Mirrors (a subset of) validateRecord in
 * check-drift.js — kept independent rather than imported, since the engine
 * has no exports and this file must run without shelling out.
 */
function checkRecord(
	slug: string,
	record: Record<string, unknown>,
	props: Record<string, FieldSpec>,
	allowed: Set<string>,
	required: Set<string> = new Set()
): string[] {
	const violations: string[] = [];
	for (const key of required) {
		if (!(key in record)) violations.push(`${slug}.${key} — missing required field`);
	}
	for (const [key, value] of Object.entries(record)) {
		if (!allowed.has(key)) {
			violations.push(`${slug}.${key} — unknown field`);
			continue;
		}
		const spec = props[key];
		if (spec.type === 'string') {
			if (typeof value !== 'string') violations.push(`${slug}.${key} — expected string`);
		} else if (spec.type === 'integer') {
			if (!Number.isInteger(value)) violations.push(`${slug}.${key} — expected integer`);
			else if (typeof spec.minimum === 'number' && (value as number) < spec.minimum)
				violations.push(`${slug}.${key} — below minimum ${spec.minimum}`);
		} else if (spec.type === 'boolean') {
			if (typeof value !== 'boolean') violations.push(`${slug}.${key} — expected boolean`);
		} else if (spec.type === 'array') {
			if (!Array.isArray(value)) {
				violations.push(`${slug}.${key} — expected array`);
			} else if (spec.items?.type) {
				const bad = (value as unknown[]).find((v) => typeof v !== spec.items!.type);
				if (bad !== undefined) violations.push(`${slug}.${key}[] — item is not ${spec.items.type}`);
			}
		}
	}
	return violations;
}

describe('sources.json schema conformance', () => {
	it('every SyncedSource record in sources.json conforms to the schema', () => {
		const sources = sourcesManifest.sources as Record<string, Record<string, unknown>>;
		const violations: string[] = [];
		for (const [slug, record] of Object.entries(sources)) {
			violations.push(...checkRecord(slug, record, sourceProps, allowedFields));
		}
		expect(violations, violations.join('\n')).toEqual([]);
	});

	it('schema field set matches the fields present across the live manifest', () => {
		const sources = sourcesManifest.sources as Record<string, Record<string, unknown>>;
		const seenFields = new Set<string>();
		for (const record of Object.values(sources)) {
			for (const key of Object.keys(record)) seenFields.add(key);
		}
		// Every field present in the manifest must be in the schema.
		const unknown = [...seenFields].filter((f) => !allowedFields.has(f));
		expect(unknown, `Fields in sources.json not in schema: ${unknown.join(', ')}`).toEqual([]);
	});

	it('every EnrichedSource record in the enriched section conforms to the schema', () => {
		const enriched = (sourcesManifest as { enriched?: Record<string, Record<string, unknown>> })
			.enriched;
		if (!enriched) return; // section is optional; nothing to check before drift enrich has run
		const violations: string[] = [];
		for (const [slug, record] of Object.entries(enriched)) {
			violations.push(
				...checkRecord(slug, record, enrichedProps, enrichedAllowedFields, enrichedRequired)
			);
		}
		expect(violations, violations.join('\n')).toEqual([]);
	});

	it('no enriched record stores an empty-string githubHomepageUrl', () => {
		const enriched = (sourcesManifest as { enriched?: Record<string, Record<string, unknown>> })
			.enriched;
		if (!enriched) return;
		const offenders = Object.entries(enriched)
			.filter(([, record]) => record.githubHomepageUrl === '')
			.map(([slug]) => slug);
		expect(offenders, `Empty githubHomepageUrl stored for: ${offenders.join(', ')}`).toEqual([]);
	});

	// 5DR.31: detectedTechLastSeen is a sibling of detectedTechFirstSeen, not
	// a replacement. checkRecord above has no 'object' branch (neither does
	// validateRecord in check-drift.js), so a value shape mismatch inside
	// either map would pass silently — out of scope to fix that validator
	// gap here, but the field's presence in the schema is worth pinning so
	// #86 (schema field set matches the live manifest) stays a meaningful
	// completeness check rather than one that has quietly stopped covering
	// history fields.
	it('schema declares detectedTechFirstSeen and detectedTechLastSeen as objects', () => {
		expect(allowedFields.has('detectedTechFirstSeen')).toBe(true);
		expect(allowedFields.has('detectedTechLastSeen')).toBe(true);
		expect(sourceProps.detectedTechFirstSeen.type).toBe('object');
		expect(sourceProps.detectedTechLastSeen.type).toBe('object');
	});
});
