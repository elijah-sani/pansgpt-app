# PansGPT

PansGPT is a pharmacy-focused AI study platform for students, lecturers, university admins, and super admins. It combines chat, document-aware retrieval, quiz generation, notes, PDF reading, lecturer material submission, timetable support, and university administration into one web app.

The app is split into a FastAPI backend and a Next.js frontend. Supabase is the primary database/auth layer, Google Drive stores uploaded academic materials, and multiple LLM providers are used for chat, document processing, quiz generation, and failover.

## What This App Does

- AI chat for pharmacy students with Supabase-authenticated sessions.
- Retrieval-augmented answers from uploaded course materials.
- AI quiz generation, quiz history, quiz taking, results, and performance tracking.
- PDF/document library with upload, processing, embeddings, and access control.
- Notes and reader flows for studying uploaded materials.
- Lecturer registration, profile approval, material submission, and material review.
- Admin and super-admin dashboards for universities, students, lecturers, timetable, restrictions, settings, and feedback.
- Timetable lookup and faculty/university-specific context.
- Optional web search feature, currently disabled by default.

## Repository Layout

```text
.
|-- backend/                 FastAPI backend
|   |-- api.py               Main app entry point
|   |-- routers/             API modules: chat, quiz, library, admin, lecturer, notes, etc.
|   |-- services/            LLM, chat history, email, web search services
|   |-- migrations/          Database schema/migration SQL
|   |-- tests/               Backend tests
|   `-- requirements.txt     Python dependencies
|-- frontend/                Next.js app
|   |-- app/                 App Router pages
|   |-- components/          UI components
|   |-- hooks/               Client-side controllers and hooks
|   |-- lib/                 Supabase/API/client utilities
|   `-- package.json         Frontend scripts and dependencies
|-- docs/                    Architecture audits and operational notes
|-- .github/workflows/       CI and Vercel deployment workflows
|-- Makefile                 Backend dev/test shortcuts
`-- package.json             Root workspace scripts
```

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, PWA support.
- Backend: FastAPI, Pydantic v2, Uvicorn, SlowAPI rate limiting.
- Database/Auth: Supabase Postgres and Supabase Auth.
- Storage: Google Drive for uploaded academic files.
- AI Providers: Google Gemini-compatible API, Groq, OpenRouter.
- Retrieval: Supabase RPC/vector matching plus document chunking.
- Web Search: Tavily, currently feature-gated off.
- Monitoring: optional Sentry for backend.

## Prerequisites

- Node.js 20+.
- Python 3.10+.
- Supabase project with the schema in `backend/migrations/schema.sql` or equivalent applied.
- Google Drive API credentials and a configured upload folder.
- At least one configured LLM provider key.

## Environment Variables

Create environment files locally. Do not commit secrets.

Frontend variables usually go in `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_KEY=local-api-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Backend variables usually go in `backend/.env`:

```env
ENVIRONMENT=development
API_KEYS=local-api-key
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_DRIVE_FOLDER_ID=your-drive-folder-id
GOOGLE_API_KEY=your-google-api-key
GOOGLE_AI_API_KEY=your-google-ai-key
GEMINI_API_KEY=your-gemini-key
OPENROUTER_API_KEY=your-openrouter-key
GROQ_API_KEY=your-groq-key

SENTRY_DSN=
RAG_MATCH_THRESHOLD=0.65

QUIZ_BATCH_SIZE=5
QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS=60
QUIZ_LLM_PROVIDER_TIMEOUT_SECONDS=20
QUIZ_RECENT_QUESTION_LIMIT=15
QUIZ_RECENT_PROMPT_LIMIT=12
QUIZ_RECENT_SIMILARITY_THRESHOLD=0.90
QUIZ_IN_QUIZ_SIMILARITY_THRESHOLD=0.82

WEB_SEARCH_FEATURE_ENABLED=false
TAVILY_API_KEY=

ZOHO_EMAIL=
ZOHO_PASSWORD=
ZOHO_UPDATES_EMAIL=
ZOHO_UPDATES_PASSWORD=
```

Important backend startup guard: `GOOGLE_DRIVE_FOLDER_ID` is required outside tests. The backend refuses to start without it so uploads do not accidentally go to the Drive root.

## Local Development

Install JavaScript dependencies:

```bash
npm install
```

Install Python dependencies:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Run both apps from the repository root:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Health check: `http://localhost:8000/health`

## Common Commands

```bash
npm run dev                  # Run frontend and backend together
npm run dev:frontend         # Run Next.js only
npm run dev:backend          # Run FastAPI only
npm run build                # Build frontend workspace
npm run start                # Start built frontend

make test-backend            # Run backend tests
make lint                    # Backend syntax/undefined lint checks
```

Useful direct checks:

```bash
python -m py_compile backend/api.py
pytest backend/tests/ -q
npm.cmd run build --prefix frontend
```

## Backend API Areas

The backend entry point is `backend/api.py`. Major routers include:

- `backend/routers/chat_core.py`: main streaming chat endpoint and chat pipeline.
- `backend/routers/chat_sessions.py`: chat sessions/history.
- `backend/routers/library.py`: document upload, processing, embeddings, PDF access.
- `backend/routers/quiz.py`: quiz generation, jobs, questions, attempts, results.
- `backend/routers/notes.py`: study notes.
- `backend/routers/lecturer.py`: lecturer registration and material workflows.
- `backend/routers/admin.py`: admin dashboards and university management.
- `backend/routers/settings.py`: system settings.
- `backend/routers/timetable.py`: timetable endpoints.
- `backend/routers/feedback.py`: feedback handling.

Requests from the frontend include an `x-api-key` header and a Supabase bearer token. The backend validates both where required.

## Frontend Areas

The frontend uses the Next.js App Router. Important routes include:

- `/main`: main AI chat experience.
- `/reader` and `/reader/[id]`: document reading flows.
- `/notes`: notes workspace.
- `/quiz`, `/quiz/new`, `/quiz/history`, `/quiz/generating/[jobId]`, `/quiz/[id]`: quiz flows.
- `/lecturer/*`: lecturer registration/profile/material workflows.
- `/admin/*`: university admin tools.
- `/super-admin/*`: platform-level administration.

The frontend API client is `frontend/lib/api.ts`. It attaches the API key, Supabase auth token, and admin workspace university context when needed.

## Quiz Generation Notes

Quiz generation is asynchronous and job-based. The frontend creates a quiz generation job and polls job state while the backend retrieves context, calls the LLM, validates output, and inserts questions incrementally.

Current quiz reliability behavior:

- `QUIZ_BATCH_SIZE` controls batch size and should stay env-driven.
- Tagged text is the primary model output format.
- Tagged text supports native `multiple_choice`, `MCQ`, `TRUE_FALSE`, and `SHORT_ANSWER` quiz question types.
- JSON parsing and `json-repair` remain as legacy fallback.
- Generated questions are validated before insert.
- Partial valid tagged batches can be inserted while invalid blocks are rejected.
- Recent-question duplicate checks run per question, not as all-or-nothing batch rejection.
- `QUIZ_RECENT_QUESTION_LIMIT` controls how many past questions are compared for repetition.
- `QUIZ_RECENT_PROMPT_LIMIT` controls how many past questions are shown in the prompt.
- `QUIZ_RECENT_SIMILARITY_THRESHOLD` and `QUIZ_IN_QUIZ_SIMILARITY_THRESHOLD` tune duplicate strictness.
- Quiz generation uses its own provider preference order and does not change the main chat routing.
- Job rows track `generated_question_count` and `target_question_count`.
- Provider attempt and parse timing logs are emitted with `quiz_generation_timing`.

## Web Search Status

Web search is intentionally disabled for now.

Current disablement:

- Backend gate: `WEB_SEARCH_FEATURE_ENABLED=false` by default in `backend/routers/chat_core.py`.
- Frontend gate: `WEB_SEARCH_FEATURE_ENABLED = false` in `frontend/hooks/useMainPageController.ts`.
- The frontend sends `web_search: false` even if stale browser localStorage previously enabled it.
- The frontend skips `/web-search/usage` while disabled.
- Old clients cannot trigger Tavily unless the backend env gate is enabled.

### Future TODO: Re-enable Web Search

To re-enable web search later:

1. Backend: set `WEB_SEARCH_FEATURE_ENABLED=true`.
2. Frontend: set `WEB_SEARCH_FEATURE_ENABLED = true` in `frontend/hooks/useMainPageController.ts`.
3. Re-enable the web-search UI toggle in `frontend/components/ChatInput.tsx` if users should control it per message.
4. Confirm `system_settings.web_search_enabled` is enabled in Supabase.
5. Configure `TAVILY_API_KEY`.
6. Verify daily usage limits and quota UI.
7. Keep a backend guard so greetings and small talk do not trigger web search unless the user explicitly asks.

## Database

The canonical schema snapshot is in:

```text
backend/migrations/schema.sql
```

Additional SQL files exist for setup and feature-specific migrations, including:

- `backend/supabase_setup.sql`
- `backend/quiz_tables.sql`
- `backend/lbac_migration.sql`

Use the Supabase SQL editor or migration workflow for your environment. Service-role access is needed for backend write paths that bypass RLS safely.

## Deployment

Frontend deployment is configured through Vercel in `.github/workflows/deploy.yml`.

CI is configured in `.github/workflows/ci.yml`:

- Backend installs Python dependencies, runs limited Ruff checks, and runs `pytest backend/tests/ -q`.
- Frontend installs dependencies and runs `npm run build`.

The backend is a separate FastAPI service and must be deployed with its own environment variables. The frontend must point `NEXT_PUBLIC_API_URL` to that deployed backend.

## Operational Notes

- Do not commit `backend/.env`, Google credentials, service account files, Supabase keys, or provider keys.
- Keep `SUPABASE_SERVICE_ROLE_KEY` backend-only.
- Keep `NEXT_PUBLIC_*` values safe for browser exposure.
- If quiz generation slows down, inspect `quiz_generation_timing` logs before changing batch size or provider routing.
- If `/chat` feels slow, compare context gathering time vs provider call time in `CHAT LATENCY` logs.
- If document uploads fail, verify Google Drive credentials and `GOOGLE_DRIVE_FOLDER_ID`.

## Current Caveats

- Web search is parked and disabled until it is intentionally reintroduced.
- Some documentation in `docs/` is audit-style and may describe historical states, not necessarily the current implementation.
- The backend still contains both older and newer quiz generation paths because JSON fallback has been preserved while tagged text proves stable in production.
