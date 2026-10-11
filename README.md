# Haqdar backend

NestJS API behind Haqdar, the WhatsApp agent that helps UAE migrant workers understand their contract and labour rights in Urdu. It receives WhatsApp messages, runs the Gemini agent with Haqdar's tools, and serves the calculators, complaint guides and admin dashboard.

Stack: NestJS 12 (ESM) · TypeScript · PostgreSQL + TypeORM 1.x · Google Gemini (`@google/genai`, `gemini-3.8-flash`) · Swagger · Vitest.

## Quick start

Requires Node 22.12+ (`.nvmrc` pins 22.22.2), pnpm and PostgreSQL 13+.

```bash
nvm use
pnpm install
cp .env.example .env            # then fill in the secrets (commands are in the file)
createdb haqdar
pnpm seed                       # builds, runs migrations, loads the starter knowledge base
pnpm start:dev                  # http://localhost:3000/api/v1
```

API docs: <http://localhost:3000/docs> (OpenAPI JSON at `/docs-json`). Admin endpoints need the `x-api-key` header; use **Authorize** in Swagger.

Without WhatsApp credentials, replies are logged instead of sent. Without `GEMINI_API_KEY`, the agent falls back to a fixed MOHRE-helpline reply. Try the full pipeline without WhatsApp from `POST /api/v1/admin/agent/simulate`.

## Architecture

A modular monolith. Every feature module is split into the same four layers:

| Layer | Holds | May depend on |
|---|---|---|
| `presentation/` | Controllers, DTOs, guards | application |
| `application/` | Services and use cases | domain, other modules' application services |
| `domain/` | Entities, pure business rules, **ports** (abstract repositories and providers) | nothing outside the domain |
| `infrastructure/` | TypeORM repositories, Gemini, WhatsApp and speech adapters | domain (implements its ports) |

Services depend on ports (e.g. `WorkerRepository`, `MessagingChannel`, `ContractExtractor`), never on TypeORM or an SDK. Each module binds a port to an adapter in one line. Unit tests swap in fakes, and changing a provider (e.g. choosing a speech-to-text vendor) touches only the module file and the new adapter.

### Modules

| Module | PRD | Responsibility |
|---|---|---|
| `whatsapp-webhook` | FR-1 | Meta verification, HMAC signature check, payload parsing, ordered per-sender processing |
| `agent` | Flows A–D | Orchestrator, consent flow, inbound resolution (voice/photo/text), Gemini function-calling loop, 6 tools |
| `workers` | FR-4, FR-14 | Consent; phone stored as HMAC (lookup) + AES-256-GCM (follow-ups); delete-my-data |
| `conversations` | FR-15 | Messages with tool calls, citations, latency, urgency and accuracy flags |
| `contracts` | FR-5, FR-6, FR-12 | Gemini reads a contract photo or PDF (WhatsApp documents too) → deterministic legal checks → Urdu summary card |
| `knowledge` | FR-7 | Law articles, Postgres full-text search (GIN), admin CRUD |
| `calculators` | FR-8, FR-9 | Gratuity and overtime in exact integer fils |
| `complaints` | FR-10, FR-13 | MOHRE guides; follow-up cases sent by an hourly cron |
| `safety` | FR-11 | Urgent-case detection (English, Roman Urdu, Urdu) before the LLM |
| `speech` | FR-2, FR-3 | Speech-to-text on Gemini (any language, Urdu in Urdu script; silent WAV never reaches the model, which can invent words for silence). Text-to-speech provider still to be chosen |
| `messaging` | — | Channel port with WhatsApp Cloud API and console adapters |
| `admin`, `health` | FR-15 | Dashboard stats, conversation review, health check |
| `demo` | — | Public website demo: scripted cases whose figures and sources come from the real calculators and knowledge base |

### One message, end to end

```
Meta webhook ──▶ signature guard ──▶ parser ──▶ processor (200 OK at once; per-sender queue)
   └─▶ AgentOrchestrator
         1. duplicate delivery?            → ignore
         2. "ڈیٹا ختم کریں"                 → delete everything
         3. consent not given?             → greeting / consent question (nothing stored)
         4. voice → transcript · photo → contract terms + legal flags + card
         5. urgent? (passport, no food…)   → MOHRE helpline goes first
         6. Gemini tool loop (search_labour_law, calculate_*, get_saved_contract,
            get_complaint_guide, schedule_follow_up)
         7. store both messages with tool calls, citations and latency
   └─▶ WhatsApp: text reply (+ voice when speech is configured)
```

### Rules the code enforces

- **Money is computed by code, never by the LLM.** Calculators work in integer fils, evaluate each formula as one exact fraction and round once (100% tested).
- **Legality is decided by code.** `analyzeContract` flags unlawful terms; Gemini only explains them. All legal figures live in `calculators/domain/labour-law.constants.ts`.
- **Answers come from the knowledge base.** The system prompt requires `search_labour_law` before stating any rule, and every reply stores the references it relied on.
- **Consent before storage.** Nothing a worker sends is stored until they reply "yes". Contract photos and voice notes are held in memory only and never persisted.
- **Always a safe reply.** If Gemini fails or withholds an answer, or speech or a media download fails, the worker gets a fixed Urdu message pointing to MOHRE (600590000).
- Gemini 3 settings: depth is set with `AGENT_THINKING_LEVEL` (`low` by default for latency) and no temperature is sent, as Google recommends. Each model turn is passed back unchanged so its thought signatures survive multi-step tool calls. A stable system prompt and sorted tool list keep the request prefix identical for Gemini's implicit caching.

## API

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | – | Liveness and database ping |
| `GET /api/v1/webhooks/whatsapp` | verify token | Meta subscription handshake |
| `POST /api/v1/webhooks/whatsapp` | HMAC signature | Incoming WhatsApp messages |
| `POST /api/v1/calculators/gratuity` · `/overtime` | – | Money calculators |
| `GET /api/v1/complaints/guides[/:issueType]` | – | MOHRE complaint guides |
| `GET /api/v1/demo/scenarios` | – | Example cases for the website's "Try the demo" |
| `POST /api/v1/demo/scenarios/:id/start` · `/steps` `{from, to}` | – | Start a case or take a quick reply (only replies offered at `from` are accepted). Stateless, no LLM, nothing stored, 60 requests/min per IP |
| `POST /api/v1/demo/chat` `{message, history}` | – | Live chat with the real agent (demo prompt; tools: law search, gratuity, overtime, complaint guides). Stateless and unsaved, replies in the visitor's language, 10 messages/min per IP, 503 when Gemini is unavailable |
| `POST /api/v1/demo/voice` (multipart `audio`, `history` JSON) | – | Voice note → Gemini transcript in the language spoken → the agent's text answer. WAV/Ogg/MP3/FLAC up to 4 MB, nothing saved, 10/min per IP |
| `POST /api/v1/demo/speech` `{text, token}` | – | A demo answer as a WAV voice note (Gemini TTS, `AGENT_TTS_MODEL` / `AGENT_TTS_VOICE`). Only text with the `speechToken` its answer came with is spoken. 10/min per IP |
| `POST /api/v1/demo/feedback` `{helpful, tools}` | – | "Was this helpful?": logs the rating and tool names only, no text |
| `POST /api/v1/demo/contract` (multipart `contract`) | – | Read a contract photo or PDF with the real reader and legal checks; nothing saved. JPG/PNG/WebP/HEIC or PDF up to 10 MB (file signature checked), 5 requests/min per IP, 503 when Gemini isn't configured |
| `GET /api/v1/admin/overview` | admin key | Usage, issue types, accuracy flags, latency |
| `GET /api/v1/admin/conversations[/:id/messages]` | admin key | Review queue (`?status=needs_review\|guided_to_mohre\|answered\|reviewed`), no phone numbers |
| `PATCH /api/v1/admin/conversations/:id/review` | admin key | Mark a conversation reviewed, or reopen it |
| `GET /api/v1/admin/messages/flagged` | admin key | Answers flagged as wrong |
| `PATCH /api/v1/admin/messages/:id/flag` | admin key | Mark an answer wrong |
| `GET/POST/PATCH/DELETE /api/v1/admin/knowledge[...]`, `GET …/search?q=` | admin key | Knowledge base |
| `POST /api/v1/admin/agent/simulate` | admin key | Run the agent without WhatsApp |

Errors always look like `{ statusCode, error, message, path, timestamp }`.

## Rate limits on the public demo

The demo's AI routes are limited per visitor (by a hash of their IP, never the raw address) and for all visitors together, so one person can't run up the Gemini bill and the total has a ceiling. Counters live in Redis (`REDIS_URL`), so the limits hold across any number of servers; without Redis, or if it goes down, each server counts on its own.

| Requests | Per visitor | Everyone together |
|---|---|---|
| Chat and voice notes (`ai`) | 10/minute, 40/hour, 150/day | `DEMO_AI_HOURLY_BUDGET` (600/hour) |
| Voice answers (`speech`) | 20/minute, 150/hour | `DEMO_SPEECH_HOURLY_BUDGET` (600/hour) |
| Contract readings (`contract`) | 5/minute, 20/day | `DEMO_CONTRACT_HOURLY_BUDGET` (200/hour) |

Allowed responses carry `X-Demo-Remaining`. Refusals are `429` with `Retry-After` and `X-Demo-Limit-Scope: visitor | everyone`; a visitor over their own limit never spends the shared budget. Behind a CDN or load balancer set `TRUST_PROXY_HOPS`, or every visitor shares the proxy's IP. The scripted demo and feedback keep the general per-minute limit. Per-visitor numbers are in `demo/domain/demo-limits.ts`.

## Database

The schema changes only through migrations (`synchronize` is off). Pending migrations also run automatically at boot.

```bash
pnpm migration:generate src/database/migrations/AddSomething   # from entity changes
pnpm migration:run
pnpm migration:revert
```

Register each new migration class in `src/database/migrations/index.ts`. Migrations are listed explicitly, not globbed, so the ESM build and the tests load the same set.

## Testing

```bash
pnpm test          # unit: 246 tests, no database, all ports faked
pnpm test:e2e      # e2e: 48 tests, real AppModule on the haqdar_test database
pnpm test:cov      # both, with coverage thresholds
```

The e2e suite needs a `haqdar_test` database (`createdb haqdar_test`; override with `TEST_DATABASE_URL`). It runs the real migrations, HTTP pipeline, guards and SQL. Only WhatsApp, Gemini and the vision extractor are faked. `agent-flow.e2e-spec.ts` drives the **real** agent runner with a scripted Gemini, so the tools run against Postgres.

Coverage gates: 95% lines/statements, 92% functions, 80% branches overall, and 100% for the calculators, the contract analyzer and urgent-case detection. The branch figure is lowered by TypeScript's decorator-metadata checks on entity and DTO properties, not by untested logic.

Other checks: `pnpm lint` (type-aware ESLint), `pnpm format:check`, `pnpm typecheck`.

## Before launch

- **Verify the law.** The 13 seeded articles come from the PRD's "approximate" rules and are all `verified: false`, so the agent tells workers to confirm with MOHRE. Check each text and article number against current MOHRE material, then set `verified: true` via the admin API. Do the same for `labour-law.constants.ts`.
- **Choose speech providers.** Bind a speech-to-text and a text-to-speech adapter in `SpeechModule` after testing on real Urdu voice notes (PRD risk table). Until then, voice notes get a "please type" reply.
- **Gemini.** Set `GEMINI_API_KEY` and run the 30-question legal test set through `POST /api/v1/admin/agent/simulate`. Check that Gemini's safety filters don't block legitimate reports of abuse or unsafe work; a blocked answer currently gets the MOHRE fallback reply.
- **WhatsApp.** Set the access token, phone number id, app secret and verify token. Get a follow-up template approved (`WHATSAPP_FOLLOW_UP_TEMPLATE`): follow-ups arrive days later, outside the 24-hour window where free text is allowed.
- **Scale.** Webhook processing is in-process (fine for the 100-user pilot). Replace `InboundMessageProcessor` with a queue consumer for durability across restarts.
- **Admin auth.** The admin area uses one shared API key. Move to per-user accounts before more people need access.
# hardar_backend
