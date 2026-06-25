/**
 * Type declarations for tag-taxonomy.js.
 * This file exists so the typed SvelteKit app can import the plain-JS taxonomy
 * module with full type safety. The .js module is the single source of truth;
 * keep these declarations in sync with it.
 */

import type { TechTag } from '../src/lib/data/types.js';

/** Maps lowercase file extensions to canonical language names. */
export declare const EXTENSION_LANGUAGE: Record<string, string>;

/** Maps canonical language names to language TechTags. */
export declare const LANGUAGE_TAGS: Record<string, TechTag>;

/** Maps runtime identity strings (from detectDependencies) to runtime TechTags. */
export declare const RUNTIME_TAGS: Record<string, TechTag>;

/** Maps framework package names (from detectDependencies) to framework TechTags. */
export declare const FRAMEWORK_TAGS: Record<string, TechTag>;

/** Maps database package names (from detectDependencies) to data TechTags. */
export declare const DATABASE_TAGS: Record<string, TechTag>;
