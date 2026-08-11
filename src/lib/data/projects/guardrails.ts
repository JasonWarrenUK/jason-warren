import type { AuthoredProject } from '../types.js';

export const guardrails: AuthoredProject = {
	slug: 'guardrails',
	tagline:
		'A PII-redaction guardrail service: prompts pass through a browser extension and a FastAPI/Presidio NER pipeline before reaching Claude or OpenAI, with an org-level admin panel.',
	blurb: 'A PII-redaction pipeline that cleans prompts before they reach an LLM.',
	description:
		'A PII-redaction guardrail as a polyglot microservice: a Chrome MV3 extension intercepts prompts, a FastAPI service running Microsoft Presidio and Flair NER scans for PII and redacts before the prompt reaches Claude, OpenAI or Gemini, and an Express API with a React admin panel handles auth and org management. I worked across the full stack: file scanning end-to-end (PDF, DOCX, XLSX and plain-text extractors, auto-scan trigger, sidebar review UI); a full role hierarchy (deactivate, reactivate, promote, demote) with soft-delete and session revocation; anonymised usage analytics from extension through server to an admin dashboard; login and signup pathway improvements including dual-mint auth for panel-role extension sign-ins; smarter PII detection for UK postcodes, name initials and location spans; and the extension popup auth flow including self-healing after sign-in.',
	kind: 'tool',
	contribution: {
		role: 'collaborator',
		collaboration: { team: 'Yalla Cooperative', employer: 'Yalla Cooperative' },
		contributionNote: 'PLACEHOLDER'
	},
	highlights: [
		'Smarter PII detection: UK postcode pattern matching and name-initial detection.',
		'Added Google Gemini as a third AI provider, extending the architecture beyond Claude and OpenAI.',
		'File-attachment warning in the Chrome extension sidebar.',
		'Genuine polyglot microservice architecture: Chrome MV3 extension, React admin panel, Express API, FastAPI/Presidio NER service.',
		'10 PII entity types: PERSON, EMAIL, PHONE, LOCATION, ORG, CREDIT_CARD, SSN, postcode, and more.'
	],
	relationships: [],
	tags: [
		{ label: 'Chrome Extension', kind: 'tool' },
		{ label: 'NLP / NER', kind: 'ai' }
	]
};
