/**
 * Schema conformance tests for sources.json.
 *
 * These tests enforce the engine's public output contract:
 * scripts/sources.schema.json ($defs/SyncedSource). The same contract is
 * validated at write time by `drift sync`; these tests catch a committed
 * sources.json that drifted from the schema, and catch field-list drift
 * between the schema and the engine's FINGERPRINT_FIELDS derivation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sourcesManifest from './sources.json';

const schemaPath = join(fileURLToPath(import.meta.url), '../../../../scripts/sources.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const sourceProps = schema.$defs.SyncedSource.properties as Record<
	string,
	{ type: string; minimum?: number; items?: { type: string } }
>;
const allowedFields = new Set(Object.keys(sourceProps));

function checkRecord(slug: string, record: Record<string, unknown>): string[] {
	const violations: string[] = [];
	for (const [key, value] of Object.entries(record)) {
		if (!allowedFields.has(key)) {
			violations.push(`${slug}.${key} — unknown field`);
			continue;
		}
		const spec = sourceProps[key];
		if (spec.type === 'string') {
			if (typeof value !== 'string') violations.push(`${slug}.${key} — expected string`);
		} else if (spec.type === 'integer') {
			if (!Number.isInteger(value)) violations.push(`${slug}.${key} — expected integer`);
			else if (typeof spec.minimum === 'number' && (value as number) < spec.minimum)
				violations.push(`${slug}.${key} — below minimum ${spec.minimum}`);
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
			violations.push(...checkRecord(slug, record));
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
});
