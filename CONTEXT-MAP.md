# Context Map

This repo has a single active context. The backend lives in a separate repository.

## Contexts

| Context | Path | Description |
|---------|------|-------------|
| App | `smartsaver/CONTEXT.md` | React Native (Expo) IoT control app — UI, state, services |
| Agent | `AGENTS.md` | Full project reference for AI agents — architecture, patterns, commands |
| Fix Plan | `fix-instructions.md` | Completed implementation plan (49 tasks across 5 phases) |

## Cross-references

- Backend API spec (historical v1): `api_spec.md` (repo root) — **deprecated**, see AGENTS.md + smartsaver/CONTEXT.md for current
- Backend overhaul spec: `remember-me/BACKEND-SPEC.md` — Auth0 OAuth2.1 integration + new table schemas
- Backend database schema: `database_schema.md` (repo root)
- Backend repo: separate — not in this repository
- Frontend API types: `smartsaver/src/types/api.ts` — live TypeScript schemas
- Frontend API client: `smartsaver/src/services/apiClient.ts` — all endpoint implementations
