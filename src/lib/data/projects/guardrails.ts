import type { AuthoredProject } from '../types.js';

export const guardrails: AuthoredProject = {
	slug: 'guardrails',
	name: 'Guardrails',
	tagline:
		'A PII-redaction guardrail service: prompts pass through a browser extension and a FastAPI/Presidio NER pipeline before reaching Claude or OpenAI, with an org-level admin panel.',
	blurb: 'A PII-redaction pipeline that cleans prompts before they reach an LLM.',
	description:
		"A PII-redaction guardrail built as a genuine polyglot microservice product: a Chrome MV3 extension intercepts prompts, a FastAPI service running Microsoft Presidio and Flair NER scans for ten PII entity types (PERSON, EMAIL, PHONE, LOCATION, ORG, CREDIT_CARD, SSN, postcode and more) and redacts them before the prompt reaches Claude or OpenAI, and an Express API with a React admin panel handles auth and org management. Jason's work focused on making detection smarter and widening provider coverage: he added UK postcode and name-initial detection, brought in Google Gemini as a third AI provider, built the file-attachment warning in the extension sidebar, and added Claude Code skills and Git workflow documentation.",
	kind: 'tool',
	contribution: {
		role: 'collaborator',
		contributionNote:
			'4 merged PRs. Improved PII detection for UK postcodes and name initials (PR #86); added Google Gemini as a third AI provider alongside Claude and OpenAI (PR #22); built the file-attachment warning in the extension sidebar (PR #45); added Claude Code skills and Git workflow documentation (PR #23). +6,500 / −173 lines.',
	},
	status: 'wip',
	repoUrl: 'https://github.com/yalla-coop/yalla-labs-guardrails',
	highlights: [
		'Smarter PII detection: UK postcode pattern matching and name-initial detection.',
		'Added Google Gemini as a third AI provider, extending the architecture beyond Claude and OpenAI.',
		'File-attachment warning in the Chrome extension sidebar.',
		'Genuine polyglot microservice architecture: Chrome MV3 extension, React admin panel, Express API, FastAPI/Presidio NER service.',
		'10 PII entity types: PERSON, EMAIL, PHONE, LOCATION, ORG, CREDIT_CARD, SSN, postcode, and more.'
	],
	relationships: [],
	tags: [
		{ label: 'TypeScript', kind: 'language' },
		{ label: 'Python', kind: 'language' },
		{ label: 'CPython', kind: 'runtime' },
		{ label: 'React', kind: 'framework' },
		{ label: 'Express', kind: 'framework' },
		{ label: 'FastAPI', kind: 'framework' },
		{ label: 'Chrome Extension', kind: 'tool' },
		{ label: 'NLP / NER', kind: 'ai' },
		{ label: 'PostgreSQL', kind: 'data' }
	],
	lastCommit: '2026-06-12',
	metrics: {
		commits: 14,
		mergedPrs: 4,
		linesAdded: 6500,
		linesRemoved: 173
	}
};
