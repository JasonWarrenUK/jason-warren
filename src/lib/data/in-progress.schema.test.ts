/**
 * Schema conformance tests for in-progress.json.
 *
 * Enforces the contract defined in src/lib/data/in-progress.schema.json:
 *   - Every entry has required fields: branch, pipeline, visibility, tracked.
 *   - pipeline is non-empty; branch matches pipeline[0].
 *   - visibility is exactly 'public' or 'local'.
 *   - Every tracked key maps to an object with integer value/baseOnMain ≥ 0.
 *   - Every tracked key is a valid ProjectMetrics / SyncedSource field (verified
 *     against sources.schema.json to keep the constraint in one place).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import inProgressManifest from './in-progress.json';

const schemaDir = fileURLToPath(new URL('.', import.meta.url));
const sourcesSchemaPath = join(schemaDir, '../../../scripts/sources.schema.json');
const sourcesSchema = JSON.parse(readFileSync(sourcesSchemaPath, 'utf8'));
const validMetricFields = new Set<string>(
	Object.keys(sourcesSchema.$defs.SyncedSource.properties as Record<string, unknown>)
);

type InProgressRaw = {
	branch?: unknown;
	pipeline?: unknown;
	visibility?: unknown;
	tracked?: unknown;
};
type TrackedRaw = Record<string, { value?: unknown; baseOnMain?: unknown }>;

describe('in-progress.json schema conformance', () => {
	const entries = Object.entries(
		inProgressManifest.inProgress as Record<string, InProgressRaw>
	);

	it('parses without error and has an inProgress key', () => {
		expect(inProgressManifest).toHaveProperty('inProgress');
		expect(typeof inProgressManifest.inProgress).toBe('object');
	});

	if (entries.length === 0) {
		it('empty inProgress map is valid (no entries to validate)', () => {
			expect(entries).toHaveLength(0);
		});
	} else {
		it('every entry has required fields: branch, pipeline, visibility, tracked', () => {
			const missing: string[] = [];
			for (const [slug, entry] of entries) {
				for (const field of ['branch', 'pipeline', 'visibility', 'tracked'] as const) {
					if (entry[field] === undefined) missing.push(`${slug}.${field}`);
				}
			}
			expect(missing, `Missing required fields: ${missing.join(', ')}`).toHaveLength(0);
		});

		it('pipeline is an array with at least one element', () => {
			const violations: string[] = [];
			for (const [slug, entry] of entries) {
				if (!Array.isArray(entry.pipeline) || entry.pipeline.length === 0) {
					violations.push(`${slug}.pipeline — must be a non-empty array`);
				}
			}
			expect(violations, violations.join('\n')).toHaveLength(0);
		});

		it('branch matches pipeline[0]', () => {
			const violations: string[] = [];
			for (const [slug, entry] of entries) {
				const pipeline = Array.isArray(entry.pipeline) ? entry.pipeline : [];
				if (entry.branch !== pipeline[0]) {
					violations.push(
						`${slug} — branch '${entry.branch}' !== pipeline[0] '${pipeline[0]}'`
					);
				}
			}
			expect(violations, violations.join('\n')).toHaveLength(0);
		});

		it('visibility is "public" or "local"', () => {
			const violations: string[] = [];
			for (const [slug, entry] of entries) {
				if (entry.visibility !== 'public' && entry.visibility !== 'local') {
					violations.push(`${slug}.visibility — invalid: '${String(entry.visibility)}'`);
				}
			}
			expect(violations, violations.join('\n')).toHaveLength(0);
		});

		it('every tracked key is a valid metric field (present in sources.schema.json)', () => {
			const violations: string[] = [];
			for (const [slug, entry] of entries) {
				const tracked = (entry.tracked ?? {}) as TrackedRaw;
				for (const field of Object.keys(tracked)) {
					if (!validMetricFields.has(field)) {
						violations.push(
							`${slug}.tracked.${field} — not a recognised metric field`
						);
					}
				}
			}
			expect(violations, violations.join('\n')).toHaveLength(0);
		});

		it('every tracked field has integer value and baseOnMain >= 0', () => {
			const violations: string[] = [];
			for (const [slug, entry] of entries) {
				const tracked = (entry.tracked ?? {}) as TrackedRaw;
				for (const [field, tf] of Object.entries(tracked)) {
					if (!Number.isInteger(tf.value) || (tf.value as number) < 0) {
						violations.push(`${slug}.tracked.${field}.value — must be integer >= 0`);
					}
					if (!Number.isInteger(tf.baseOnMain) || (tf.baseOnMain as number) < 0) {
						violations.push(`${slug}.tracked.${field}.baseOnMain — must be integer >= 0`);
					}
				}
			}
			expect(violations, violations.join('\n')).toHaveLength(0);
		});
	}
});
