/**
 * Unit tests for the manifest-to-project builder and helper functions.
 * Every function in defaults.ts is covered here.
 */

import { describe, it, expect } from 'vitest';
import {
	humaniseSlug,
	inferTags,
	inferContribution,
	defaultProjectFromManifest,
	mergeAuthored
} from './defaults.js';
import type { SyncedSource } from './index.js';
import type { AuthoredProject } from './types.js';

// ---------------------------------------------------------------------------
// humaniseSlug
// ---------------------------------------------------------------------------

describe('humaniseSlug', () => {
	it('capitalises simple hyphenated slugs', () => {
		expect(humaniseSlug('baby-names')).toBe('Baby Names');
	});

	it('applies the TUI acronym', () => {
		expect(humaniseSlug('wyrd-tui')).toBe('Wyrd TUI');
	});

	it('applies multiple acronyms', () => {
		expect(humaniseSlug('fac-cra')).toBe('FAC CRA');
	});

	it('applies the DB acronym', () => {
		expect(humaniseSlug('chirp-db')).toBe('Chirp DB');
	});

	it('applies the CLI acronym', () => {
		expect(humaniseSlug('my-cli')).toBe('My CLI');
	});

	it('handles single-token slugs', () => {
		expect(humaniseSlug('iris')).toBe('Iris');
	});

	it('capitalises each non-acronym token', () => {
		expect(humaniseSlug('the-tongue')).toBe('The Tongue');
	});
});

// ---------------------------------------------------------------------------
// inferTags
// ---------------------------------------------------------------------------

describe('inferTags', () => {
	it('returns empty array for empty manifest', () => {
		const manifest: SyncedSource = {};
		expect(inferTags(manifest)).toEqual([]);
	});

	it('maps languages via LANGUAGE_TAGS', () => {
		const manifest: SyncedSource = { languages: ['TypeScript', 'CSS'] };
		const tags = inferTags(manifest);
		expect(tags).toContainEqual({ label: 'TypeScript', kind: 'language' });
		expect(tags).toContainEqual({ label: 'CSS', kind: 'language' });
	});

	it('drops unmapped languages silently', () => {
		const manifest: SyncedSource = { languages: ['TypeScript', 'COBOL'] };
		const tags = inferTags(manifest);
		expect(tags).toHaveLength(1);
		expect(tags[0]).toEqual({ label: 'TypeScript', kind: 'language' });
	});

	it('maps runtime identities via RUNTIME_TAGS', () => {
		const manifest: SyncedSource = { runtime: ['bun'] };
		const tags = inferTags(manifest);
		expect(tags).toContainEqual({ label: 'Bun', kind: 'runtime' });
	});

	it('maps framework package names via FRAMEWORK_TAGS', () => {
		const manifest: SyncedSource = { framework: ['@sveltejs/kit'] };
		const tags = inferTags(manifest);
		expect(tags).toContainEqual({ label: 'SvelteKit', kind: 'framework' });
	});

	it('maps database package names via DATABASE_TAGS', () => {
		const manifest: SyncedSource = { database: ['@supabase/supabase-js'] };
		const tags = inferTags(manifest);
		expect(tags).toContainEqual({ label: 'Supabase', kind: 'data' });
	});

	it('deduplicates tags with the same kind and label', () => {
		// 'pg' and 'postgres' both map to { label: 'PostgreSQL', kind: 'data' }
		const manifest: SyncedSource = { database: ['pg', 'postgres'] };
		const tags = inferTags(manifest);
		const postgresCount = tags.filter((t) => t.kind === 'data' && t.label === 'PostgreSQL').length;
		expect(postgresCount).toBe(1);
	});

	it('surfaces SQL from languages as a data tag (not a language tag)', () => {
		// .sql files populate manifest.languages with 'SQL', but LANGUAGE_TAGS has no
		// SQL entry. The special-case path must surface it as kind: 'data' so that
		// card.ts classifyDataLabel can resolve the relational data model.
		const manifest: SyncedSource = { languages: ['TypeScript', 'SQL'] };
		const tags = inferTags(manifest);
		expect(tags).toContainEqual({ label: 'SQL', kind: 'data' });
		// SQL must NOT also appear as a language tag
		const sqlLanguageTags = tags.filter((t) => t.kind === 'language' && t.label === 'SQL');
		expect(sqlLanguageTags).toHaveLength(0);
	});

	it('does not add a duplicate Svelte language tag when @sveltejs/kit is present', () => {
		// Svelte is surfaced via the framework dependency path (@sveltejs/kit → SvelteKit).
		// A .svelte file in languages would yield 'Svelte' in manifest.languages, but
		// LANGUAGE_TAGS has no 'Svelte' entry, so it drops silently — no duplicate.
		const manifest: SyncedSource = {
			languages: ['TypeScript', 'Svelte'],
			framework: ['@sveltejs/kit']
		};
		const tags = inferTags(manifest);
		expect(tags).toContainEqual({ label: 'SvelteKit', kind: 'framework' });
		// No bare 'Svelte' language tag should appear alongside 'SvelteKit'
		const svelteLangTags = tags.filter((t) => t.kind === 'language' && t.label === 'Svelte');
		expect(svelteLangTags).toHaveLength(0);
	});

	it('keeps language Go and runtime Go as separate tags', () => {
		// Go appears in languages (kind: 'language') and runtime (kind: 'runtime');
		// they must NOT collapse because (kind, label) pairs differ.
		const manifest: SyncedSource = { languages: ['Go'], runtime: ['go'] };
		const tags = inferTags(manifest);
		const langGo = tags.filter((t) => t.kind === 'language' && t.label === 'Go');
		const rtGo = tags.filter((t) => t.kind === 'runtime' && t.label === 'Go');
		expect(langGo).toHaveLength(1);
		expect(rtGo).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// inferContribution
// ---------------------------------------------------------------------------

describe('inferContribution', () => {
	it('returns solo when commits and commitsMine are equal (sole author)', () => {
		const manifest: SyncedSource = { commits: 50, commitsMine: 50 };
		expect(inferContribution(manifest)).toEqual({
			role: 'solo',
			collaboration: { team: 'Solo (Jason)' }
		});
	});

	it('returns solo when commitsMine is undefined (no collaborator data)', () => {
		const manifest: SyncedSource = { commits: 10 };
		expect(inferContribution(manifest)).toEqual({
			role: 'solo',
			collaboration: { team: 'Solo (Jason)' }
		});
	});

	it('returns solo when commits is 0 (guards divide-by-zero)', () => {
		const manifest: SyncedSource = { commits: 0, commitsMine: 0 };
		expect(inferContribution(manifest)).toEqual({
			role: 'solo',
			collaboration: { team: 'Solo (Jason)' }
		});
	});

	it('returns lead when Jason authored the majority of commits', () => {
		const manifest: SyncedSource = { commits: 100, commitsMine: 80 };
		const result = inferContribution(manifest);
		expect(result.role).toBe('lead');
	});

	it('returns collaborator when Jason authored a minority of commits', () => {
		const manifest: SyncedSource = { commits: 100, commitsMine: 30 };
		const result = inferContribution(manifest);
		expect(result.role).toBe('collaborator');
	});

	it('returns collaborator when Jason authored exactly half the commits', () => {
		// 50/100 = 0.5, which is NOT > 0.5, so collaborator
		const manifest: SyncedSource = { commits: 100, commitsMine: 50 };
		const result = inferContribution(manifest);
		expect(result.role).toBe('collaborator');
	});

	it('inferred team contributions carry no contributionNote', () => {
		const manifest: SyncedSource = { commits: 100, commitsMine: 80 };
		const result = inferContribution(manifest);
		// TypeScript narrowing: assert contributionNote absent for lead/collaborator
		if (result.role !== 'solo') {
			expect(result.contributionNote).toBeUndefined();
		}
	});
});

// ---------------------------------------------------------------------------
// defaultProjectFromManifest
// ---------------------------------------------------------------------------

describe('defaultProjectFromManifest', () => {
	it('produces a complete Project with no undefined required fields', () => {
		const manifest: SyncedSource = { commits: 5, commitsMine: 5 };
		const project = defaultProjectFromManifest('baby-names', manifest);

		expect(project.slug).toBe('baby-names');
		expect(project.name).toBeDefined();
		expect(project.name.length).toBeGreaterThan(0);
		expect(project.tagline).toBe('');
		expect(project.blurb).toBe('');
		expect(project.description).toBe('');
		expect(project.highlights).toEqual([]);
		expect(project.relationships).toEqual([]);
	});

	it("sets kind to 'repo'", () => {
		const project = defaultProjectFromManifest('some-repo', {});
		expect(project.kind).toBe('repo');
	});

	it("sets status to 'uncategorised'", () => {
		const project = defaultProjectFromManifest('some-repo', {});
		expect(project.status).toBe('uncategorised');
	});

	it('defaults track heuristically: long-and-large reads as product', () => {
		const product = defaultProjectFromManifest('big-old', {
			firstCommit: '2025-01-01',
			lastCommit: '2025-12-01',
			linesOfCode: 20_000
		});
		expect(product.track).toBe('product');
		expect(product.trackAuthored).toBe(false);
	});

	it('defaults track heuristically: short or small reads as exploration', () => {
		const shortSpan = defaultProjectFromManifest('quick', {
			firstCommit: '2026-06-01',
			lastCommit: '2026-06-20',
			linesOfCode: 20_000
		});
		const small = defaultProjectFromManifest('tiny', {
			firstCommit: '2025-01-01',
			lastCommit: '2025-12-01',
			linesOfCode: 800
		});
		const undated = defaultProjectFromManifest('no-dates', { linesOfCode: 20_000 });
		expect(shortSpan.track).toBe('exploration');
		expect(small.track).toBe('exploration');
		expect(undated.track).toBe('exploration');
	});

	it('defaults progress heuristically from recent commits', () => {
		const active = defaultProjectFromManifest('busy', { commitsRecent: 3 });
		const dormant = defaultProjectFromManifest('quiet', { commitsRecent: 0 });
		expect(active.progress).toBe('in-progress');
		expect(dormant.progress).toBe('complete');
		expect(active.progressAuthored).toBe(false);
	});

	it('defaults deployed and archived to false', () => {
		const project = defaultProjectFromManifest('some-repo', {});
		expect(project.deployed).toBe(false);
		expect(project.archived).toBe(false);
	});

	it('infers solo contribution from sole-author manifest', () => {
		const manifest: SyncedSource = { commits: 10, commitsMine: 10 };
		const project = defaultProjectFromManifest('my-repo', manifest);
		expect(project.contribution.role).toBe('solo');
	});

	it('infers lead contribution from majority-author manifest', () => {
		const manifest: SyncedSource = { commits: 100, commitsMine: 80 };
		const project = defaultProjectFromManifest('team-repo', manifest);
		expect(project.contribution.role).toBe('lead');
	});

	it('uses manifest.remote as repoUrl when present', () => {
		const manifest: SyncedSource = { remote: 'https://github.com/SomeOrg/some-repo' };
		const project = defaultProjectFromManifest('some-repo', manifest);
		expect(project.repoUrl).toBe('https://github.com/SomeOrg/some-repo');
	});

	it('derives every companion repository URL in topology order', () => {
		const project = defaultProjectFromManifest('multi-repo', {
			remote: 'https://github.com/example/backend',
			companionRemotes: ['https://github.com/example/frontend', 'https://github.com/example/shared']
		});

		expect(project.repoUrl).toBe('https://github.com/example/backend');
		expect(project.companionRepoUrls).toEqual([
			'https://github.com/example/frontend',
			'https://github.com/example/shared'
		]);
	});

	it('falls back to a GitHub URL constructed from the slug when remote is absent', () => {
		const project = defaultProjectFromManifest('my-project', {});
		expect(project.repoUrl).toBe('https://github.com/JasonWarrenUK/my-project');
	});

	it('humanises the slug as the project name', () => {
		const project = defaultProjectFromManifest('wyrd-tui', {});
		expect(project.name).toBe('Wyrd TUI');
	});
});

// ---------------------------------------------------------------------------
// mergeAuthored
// ---------------------------------------------------------------------------

describe('mergeAuthored', () => {
	const base = defaultProjectFromManifest('test-slug', { languages: ['TypeScript'] });

	it('authored track and progress win and flip the provenance flags', () => {
		const merged = mergeAuthored(base, {
			slug: 'test-slug',
			track: 'product',
			progress: 'complete'
		});
		expect(merged.track).toBe('product');
		expect(merged.trackAuthored).toBe(true);
		expect(merged.progress).toBe('complete');
		expect(merged.progressAuthored).toBe(true);
	});

	it('keeps heuristic track/progress with false provenance when unauthored', () => {
		const merged = mergeAuthored(base, { slug: 'test-slug', name: 'Renamed' });
		expect(merged.track).toBe(base.track);
		expect(merged.trackAuthored).toBe(false);
		expect(merged.progressAuthored).toBe(false);
	});

	it('derives deployed from the merged liveUrl', () => {
		const deployed = mergeAuthored(base, { slug: 'test-slug', liveUrl: 'https://example.com' });
		const not = mergeAuthored(base, { slug: 'test-slug' });
		expect(deployed.deployed).toBe(true);
		expect(not.deployed).toBe(false);
	});

	it('merges an authored archived flag', () => {
		const merged = mergeAuthored(base, { slug: 'test-slug', archived: true });
		expect(merged.archived).toBe(true);
	});

	it('preserves an authored role when commit-share inference disagrees', () => {
		const inferred = defaultProjectFromManifest('team-project', {
			commits: 100,
			commitsMine: 80
		});
		const authored: AuthoredProject = {
			slug: 'team-project',
			contribution: {
				role: 'collaborator',
				collaboration: { team: 'Project team' },
				contributionNote: 'Held a supporting technical role.'
			}
		};

		expect(inferred.contribution.role).toBe('lead');
		const merged = mergeAuthored(inferred, authored);
		expect(merged.contribution.role).toBe('collaborator');
		expect(merged.contribution.collaboration.team).toBe('Project team');
	});

	it('returns base unchanged when authored is undefined', () => {
		const result = mergeAuthored(base, undefined);
		expect(result).toBe(base); // strict reference equality
	});

	it('suppressTags drops an inferred tag', () => {
		const authored: AuthoredProject = { slug: 'test-slug', suppressTags: ['TypeScript'] };
		const result = mergeAuthored(base, authored);
		expect(result.tags.map((t) => t.label)).not.toContain('TypeScript');
	});

	it('suppressTags wins over an authored addition of the same label', () => {
		const authored: AuthoredProject = {
			slug: 'test-slug',
			tags: [{ label: 'Neo4j', kind: 'data' }],
			suppressTags: ['Neo4j']
		};
		const result = mergeAuthored(base, authored);
		expect(result.tags.map((t) => t.label)).not.toContain('Neo4j');
		// The untouched inferred tag survives suppression of the other label.
		expect(result.tags.map((t) => t.label)).toContain('TypeScript');
	});

	it('an empty suppressTags is a no-op', () => {
		const authored: AuthoredProject = { slug: 'test-slug', suppressTags: [] };
		const result = mergeAuthored(base, authored);
		expect(result.tags).toEqual(base.tags);
	});

	it('overlays authored name', () => {
		const authored: AuthoredProject = { slug: 'test-slug', name: 'My Custom Name' };
		const result = mergeAuthored(base, authored);
		expect(result.name).toBe('My Custom Name');
	});

	it('overlays authored kind', () => {
		const authored: AuthoredProject = { slug: 'test-slug', kind: 'app' };
		const result = mergeAuthored(base, authored);
		expect(result.kind).toBe('app');
	});

	it('leaves base kind intact when authored.kind is undefined', () => {
		const authored: AuthoredProject = { slug: 'test-slug', name: 'Something' };
		const result = mergeAuthored(base, authored);
		expect(result.kind).toBe('repo');
	});

	it('merges authored tags with inferred tags, deduped, inferred first', () => {
		// base has [TypeScript (language)] from inference
		const authored: AuthoredProject = {
			slug: 'test-slug',
			tags: [
				{ label: 'SvelteKit', kind: 'framework' },
				// Duplicate of the inferred TypeScript tag — should collapse
				{ label: 'TypeScript', kind: 'language' }
			]
		};
		const result = mergeAuthored(base, authored);

		const tsCount = result.tags.filter(
			(t) => t.kind === 'language' && t.label === 'TypeScript'
		).length;
		expect(tsCount).toBe(1);

		expect(result.tags).toContainEqual({ label: 'SvelteKit', kind: 'framework' });

		// Inferred TypeScript appears before authored SvelteKit
		const tsIndex = result.tags.findIndex((t) => t.label === 'TypeScript');
		const skIndex = result.tags.findIndex((t) => t.label === 'SvelteKit');
		expect(tsIndex).toBeLessThan(skIndex);
	});

	it('leaves base tags intact when authored.tags is undefined', () => {
		const authored: AuthoredProject = { slug: 'test-slug', tagline: 'A tagline' };
		const result = mergeAuthored(base, authored);
		expect(result.tags).toEqual(base.tags);
	});

	it('overlays authored contribution role and note, inheriting base collaboration when omitted', () => {
		const authored: AuthoredProject = {
			slug: 'test-slug',
			contribution: { role: 'lead', contributionNote: 'Built the frontend.' }
		};
		const result = mergeAuthored(base, authored);
		// Authored role and note win; collaboration falls back to the inferred default
		// from the base (solo default in this case — the base has no commit data).
		expect(result.contribution).toEqual({
			role: 'lead',
			collaboration: { team: 'Solo (Jason)' },
			contributionNote: 'Built the frontend.'
		});
	});

	it('overlays authored contribution with explicit collaboration', () => {
		const authored: AuthoredProject = {
			slug: 'test-slug',
			contribution: {
				role: 'lead',
				collaboration: { team: 'FAC-30 cohort', employer: 'Founders and Coders' },
				contributionNote: 'Led the delivery.'
			}
		};
		const result = mergeAuthored(base, authored);
		expect(result.contribution).toEqual({
			role: 'lead',
			collaboration: { team: 'FAC-30 cohort', employer: 'Founders and Coders' },
			contributionNote: 'Led the delivery.'
		});
	});

	it('leaves base repoUrl intact when authored does not supply one', () => {
		const authored: AuthoredProject = { slug: 'test-slug', name: 'Only A Name' };
		const result = mergeAuthored(base, authored);
		expect(result.repoUrl).toBe(base.repoUrl);
	});
});
