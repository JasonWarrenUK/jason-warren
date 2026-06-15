import type { Project } from '../types.js';

export const guardrails: Project = {
	slug: 'guardrails',
	name: 'Guardrails',
	tagline:
		'A PII-redaction guardrail service: prompts pass through a browser extension and a FastAPI/Presidio NER pipeline before reaching Claude or OpenAI, with an org-level admin panel.',
	description:
		'[Placeholder] Guardrails is a polyglot microservice product: a Chrome MV3 extension intercepts prompts, a FastAPI service running Microsoft Presidio and Flair NER scans for 10 PII entity types and redacts them, and an Express server handles auth and org management. My contributions focused on making the PII detection smarter and extending the provider coverage.',
	kind: 'tool',
	contribution: {
		role: 'collaborator',
		contributionNote:
			'4 merged PRs. Improved PII detection for UK postcodes and name initials (PR #86); added Google Gemini as a third AI provider alongside Claude and OpenAI (PR #22); built the file-attachment warning in the extension sidebar (PR #45); added Claude Code skills and Git workflow documentation (PR #23). +6,500 / −173 lines.',
		team: 'Yalla Coop'
	},
	status: 'wip',
	repoUrl: 'https://github.com/yalla-coop/yalla-labs-guardrails',
	highlights: [
		'Smarter PII detection: added UK postcode pattern matching and name-initial detection (PR #86).',
		'Added Google Gemini as a third AI provider, extending the architecture beyond Claude and OpenAI (PR #22).',
		'File-attachment warning in the Chrome extension sidebar (PR #45).',
		'Genuine polyglot microservice architecture: Chrome MV3 extension, React admin panel, Express API, FastAPI/Presidio NER service.',
		'10 PII entity types: PERSON, EMAIL, PHONE, LOCATION, ORG, CREDIT_CARD, SSN, postcode, and more.'
	],
	relationships: [],
	featured: false,
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Python', kind: 'language' },
		{ label: 'React', kind: 'framework' },
		{ label: 'Express', kind: 'framework' },
		{ label: 'FastAPI', kind: 'framework' },
		{ label: 'Chrome Extension', kind: 'domain' },
		{ label: 'NLP / NER', kind: 'domain' },
		{ label: 'PostgreSQL', kind: 'domain' }
	],
	metrics: {
		commits: 14,
		mergedPrs: 4,
		linesAdded: 6500,
		linesRemoved: 173
	}
};
