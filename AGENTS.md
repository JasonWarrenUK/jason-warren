# Portfolio — AGENTS.md

## Purpose

This is Jason Warren's professional developer portfolio: a public-facing artefact built with care. It demonstrates skills not only through its content but through the quality of the code itself. The site is the evidence.

**Stack:** SvelteKit 2, Svelte 5, TypeScript (strict), Vite, Node.js, PostgreSQL/Supabase where needed.

---

## Communication Rules

### Spelling (Non-Negotiable)

British English throughout — code comments, documentation, commit messages, prose:

- `-ise` not `-ize` (organise, normalise, initialise)
- `-our` not `-or` (colour, behaviour, favour)
- `-re` not `-er` (centre, metre)
- `-ogue` not `-og` (catalogue, dialogue)
- Double consonants: travelled, cancelled, modelling

### Tone

- No sycophancy. No "Great question!" or "Certainly!". Direct answers only.
- No em-dashes (—). Use a comma, a colon, parentheses, or restructure the sentence.
- No hedging. State things plainly.
- Concrete examples over abstract explanations.
- Clever humour welcome when it lands; forced humour is not.

---

## Code Conventions

### TypeScript

- Strict mode enabled
- Interfaces over types for object shapes
- Avoid `any` — use `unknown` when the type is uncertain
- Explicit return types on exported functions
- Discriminated unions preferred

### Style

- Tabs for indentation (not spaces)
- `kebab-case` for files; `PascalCase` for Svelte components
- Descriptive variable names — no cryptic abbreviations

### Colour

Default palette: [Reasonable Colors](https://www.reasonable.work/colors/) (`reasonable-colors` npm package).

Variable convention: `--color-COLORNAME-SHADE` (e.g. `--color-azure-3`).

Always define semantic aliases; never use Reasonable Colors variables directly in components:

```css
:root {
	--color-primary: var(--color-azure-3);
	--color-primary-bg: var(--color-azure-1);
	--color-primary-text: var(--color-azure-6);
}
```

---

## Git Workflow

Conventional Commits: `type(scope): description`

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Commit frequently with granular, single-purpose changes.

### PR Structure

```md
# {{ title }}

## Overview

{{ overview }}

## Summary

{{ absurd metaphor }}

> [!TIP]
> {{ tldr }}

---

## Changes

## {{ changes with collapsible details }}
```

---

## Quality Bar

This site is a portfolio. "Good enough" is not good enough. Every component, every interaction, every line of copy reflects on the craft. Prioritise:

1. Correctness
2. Clarity
3. Polish

When in doubt, do less and do it well.
