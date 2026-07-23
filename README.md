# PansGPT

PansGPT is a university study platform built for document-grounded learning, AI chat, quiz generation, PDF reading, notes, lecturer submissions, and university administration.

The codebase is split into:
- a **FastAPI** backend in `backend/`
- a **Next.js** frontend in `frontend/`

It uses **Supabase** for auth and data, **Google Drive** for academic file storage, and multiple LLM providers for chat, retrieval, quiz, and adaptive learning workflows.

## Contents

- [What PansGPT Does](#what-pansgpt-does)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Common Commands](#common-commands)
- [Testing And CI](#testing-and-ci)
- [Backend Overview](#backend-overview)
- [Frontend Overview](#frontend-overview)
- [Database And Migrations](#database-and-migrations)
- [Deployment](#deployment)
- [Operational Notes](#operational-notes)
- [Known Product / Engineering Notes](#known-product--engineering-notes)

## What PansGPT Does

- AI chat for students with authenticated, streamed responses and full session history
- retrieval-augmented answers grounded in uploaded academic materials
- document library with upload, processing, chunking, embedding ingestion progress, and access control
- PDF reader with saved reading progress, notes, export, and in-reader study tools
- **Learn Mode**: AI-generated section outlines, explanations, adaptive check questions, immediate retests, and mastery tracking per document section
- in-reader AI text actions: explain selection, define term, generate example, snip to chat, and add to chat input
- quiz generation, async quiz jobs, quiz history, attempts, and result tracking
- voice input support for chat
- lecturer registration, approval, and material submission workflows
- university admin flows for students, lecturers, restrictions, timetable, and academic context management
- super-admin flows for cross-university administration
- offline mode with local notes storage
- optional web search support, currently feature-gated off by default

## Architecture

```text
Frontend (Next.js App Router)
    |
    |  x-api-key + Supabase bearer token
    v
Backend (FastAPI)
    |
    +--> Supabase (Auth, Postgres, RPCs, RLS, role/scope logic)
    +--> Google Drive (material storage)
    +--> LLM providers (chat, retrieval, quiz, learn mode, failover)
```

### Main runtime flow

1. The frontend authenticates users with Supabase.
2. API requests go to FastAPI with:
   - a public `x-api-key`
   - a Supabase bearer token where required
3. The backend resolves user identity and role/scope server-side.
4. Documents are stored in Google Drive and tracked in Supabase.
5. Chat, retrieval, quiz generation, and Learn Mode use configured LLM providers with tiered failover.

## Repository Layout

```text
.
|-- backend/
|   |-- api.py                  FastAPI entry point and router registration
|   |-- dependencies.py         Auth, role, and university scope helpers
|   |-- google_drive.py         Google Drive integration (upload, fetch, metadata)
|   |-- restrictions.py         University restriction enforcement logic
|   |-- routers/                API route modules (see Backend Overview)
|   |-- services/               LLM engine, email, security, and web search services
|   |-- migrations/             Schema snapshots and incremental migration SQL files
|   |-- tests/                  Backend test suite
|   `-- requirements.txt        Python dependencies
|-- frontend/
|   |-- app/                    Next.js App Router pages and route groups
|   |-- components/             UI components (PDFViewer, LearnModeView, etc.)
|   |-- hooks/                  Client-side controllers and state hooks
|   |-- lib/                    API wrapper, Supabase client, cache, and workspace helpers
|   |-- public/                 Static assets and generated PWA artifacts
|   `-- package.json            Frontend package metadata
|-- .github/workflows/          CI and deployment workflows
|-- Makefile                    Backend dev/test shortcuts
|-- package.json                Root workspace scripts
`-- README.md
```

## Tech Stack

### Frontend

- Next.js (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- React PDF / PDF.js
- ReactMarkdown with remark-gfm, remark-math, rehype-katex for rich content rendering
- PWA support via `@ducanh2912/next-pwa`

### Backend

- FastAPI
- Pydantic v2
- Uvicorn
- SlowAPI (rate limiting)
- Supabase Python client

### Infrastructure / Services

- Supabase Postgres + Supabase Auth + Row Level Security
- Google Drive for uploaded material storage
- Gemini / Google AI APIs
- Groq
- OpenRouter
- Tavily (feature-gated for web search)
- Optional Sentry for backend telemetry

## Prerequisites

- Node.js 20+
- Python 3.10+
- a Supabase project
- Google Drive API credentials and a configured upload folder
- at least one valid LLM provider key

## Environment Variables

Create these locally. Do not commit them.

### Frontend: `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_KEY=local-api-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Backend: `backend/.env`

```env
ENVIRONMENT=development
API_KEYS=local-api-key
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

GOOGLE_DRIVE_FOLDER_ID=your-drive-folder-id

GOOGLE_API_KEY=
GOOGLE_AI_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=

SENTRY_DSN=
TAVILY_API_KEY=

RAG_MATCH_THRESHOLD=0.65

QUIZ_BATCH_SIZE=5
QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS=60
QUIZ_LLM_PROVIDER_TIMEOUT_SECONDS=20
QUIZ_RECENT_QUESTION_LIMIT=15
QUIZ_RECENT_PROMPT_LIMIT=12
QUIZ_RECENT_SIMILARITY_THRESHOLD=0.90
QUIZ_IN_QUIZ_SIMILARITY_THRESHOLD=0.82

WEB_SEARCH_FEATURE_ENABLED=false

ZOHO_EMAIL=
ZOHO_PASSWORD=
ZOHO_UPDATES_EMAIL=
ZOHO_UPDATES_PASSWORD=
ZOHO_SMTP_HOST=smtp.zoho.com
ZOHO_SMTP_PORT=465
```

### Important startup guard

`GOOGLE_DRIVE_FOLDER_ID` is required outside tests. The backend intentionally refuses to start without it so uploads do not fall back to the Drive root by mistake.

## Local Development

### 1. Install JavaScript dependencies

From the repository root:

```bash
npm install
```

### 2. Create and activate a Python environment

From `backend/`:

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Run the app

From the repository root:

```bash
npm run dev
```

Or run services separately:

```bash
npm run dev:frontend
npm run dev:backend
```

### Default local URLs

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Health check: `http://localhost:8000/health`

## Common Commands

### Root workspace

```bash
npm run dev
npm run dev:frontend
npm run dev:backend
npm run build
npm run start
```

### Frontend only

```bash
npm run build --workspace=frontend
npm run lint --workspace=frontend
```

### Backend only

```bash
python -m compileall backend
pytest backend/tests -q
```

### Makefile shortcuts

```bash
make lint
make test-backend
make dev-backend
make dev-frontend
```

## Testing And CI

GitHub Actions workflows live in `.github/workflows/`.

### CI (`ci.yml`)

Runs on every push to `main` and on all pull requests:

- **Backend quality** job:
  - `ruff check backend --select E9,F63,F7,F82` (syntax and undefined name checks)
  - `pytest backend/tests/ -q` (excluding prompt guard and chat security — these run separately)
- **Security regression** job:
  - `pytest backend/tests/test_prompt_guard.py`
  - `pytest backend/tests/test_chat_security.py`
- **Frontend build check** job:
  - `npm run build` inside `frontend/` with placeholder Supabase env vars

### Deployment (`deploy.yml`)

Runs on every push to `main`:

- Installs the Vercel CLI and deploys the frontend to production with `vercel --prod`
- Requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets

## Backend Overview

Entry point: `backend/api.py`

### Routers

| File | Responsibility |
|---|---|
| `routers/chat_core.py` | Streaming AI chat, RAG retrieval, agentic re-rank, thinking mode |
| `routers/chat_sessions.py` | Session creation, history fetch, session deletion |
| `routers/learn.py` | Learn Mode: section outlines, explanations, check questions, answer grading, retest injection, mastery tracking |
| `routers/library.py` | Document upload, processing, embedding ingestion, progress, re-embed |
| `routers/quiz.py` | Quiz generation jobs, question deduplication, attempts, results, history |
| `routers/notes.py` | Note storage, retrieval, and export |
| `routers/lecturer.py` | Lecturer registration, approval, material submission, cancellation, resubmission |
| `routers/admin.py` | University admin: students, lecturers, restrictions, timetable, academic context, system settings |
| `routers/timetable.py` | Timetable endpoints |
| `routers/feedback.py` | Feedback submission and handling |
| `routers/settings.py` | User and system settings |
| `routers/shared.py` | Shared utility endpoints used across roles |
| `routers/system.py` | Health check and system status endpoints |

### Services

| File | Responsibility |
|---|---|
| `services/llm_engine.py` | LLM provider abstraction with tiered failover (primary → secondary → tertiary) across Gemini, Groq, and OpenRouter |
| `services/chat_history.py` | Chat message persistence helpers |
| `services/email_service.py` | Zoho SMTP email dispatch |
| `services/ai_usage_tracker.py` | Per-request AI token and cost logging |
| `services/policy_guard.py` | Prompt injection and policy enforcement |
| `services/security_logging.py` | Security event logging |
| `services/security_metrics.py` | Security metric aggregation |
| `services/pdf_conversion.py` | PDF-to-text extraction helpers |
| `services/web_search.py` | Tavily web search integration (feature-gated) |

### Auth model

Requests typically include:

- `x-api-key` — coarse client/app gate
- `Authorization: Bearer <supabase-access-token>` — real user identity

The backend resolves user identity, role (`student`, `lecturer`, `admin`, `super_admin`), and university scope server-side via `backend/dependencies.py`. All role and scope enforcement happens on the backend regardless of what the frontend sends.

### LLM provider routing

`services/llm_engine.py` routes requests across named model tiers:

- `PRIMARY` — default capable model (Gemini / OpenRouter)
- `SECONDARY` — fallback for primary failures
- `TERTIARY` / `SMALL_TERTIARY` — lightweight models for low-cost tasks and alias compatibility
- Automatic failover retries across providers on timeout or error

## Frontend Overview

The frontend uses the Next.js App Router.

### Key pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/home` or `/(app)/main` | Student home: document library, chat, recent activity |
| `/(app)/reader` | PDF reader with in-reader AI tools |
| `/(app)/notes` | Notes management |
| `/(app)/quiz/*` | Quiz interface and history |
| `/lecturer/*` | Lecturer portal: registration, submissions |
| `/admin/*` | University admin dashboard |
| `/super-admin/*` | Cross-university super-admin dashboard |
| `/auth`, `/login`, `/reset-password` | Auth flows |
| `/settings`, `/usage`, `/feedback` | User settings and feedback |
| `/about`, `/contact`, `/faq`, `/privacy`, `/terms` | Public pages |

### Key components and hooks

| File | Responsibility |
|---|---|
| `components/PDFViewer.tsx` | Core PDF reader: page rendering, zoom, progress sync, mobile/desktop adaptive layout, in-reader AI sidebar with Chat and Learn Mode tabs, text selection actions, snip-to-chat, bottom navigation bar |
| `components/LearnModeView.tsx` | Learn Mode UI: start screen, section list with mastery progress, section detail with AI explanations, inline check questions, focus quiz modal with retest injection, and section completion |
| `hooks/useMainPageController.ts` | Main page state: document library, chat orchestration, session management, voice input, quiz sidebar |
| `hooks/useAuthPage.ts` | Auth page state and Supabase sign-in/sign-up flows |
| `hooks/useChatHistory.ts` | Chat session and message history management |
| `hooks/useNotesOfflineStore.ts` | Offline-capable note storage with sync |
| `hooks/useVoiceInput.ts` | Microphone capture and speech-to-text integration |
| `lib/api.ts` | API wrapper: auth token forwarding, admin workspace query injection |
| `lib/supabase.ts` | Browser Supabase client |
| `lib/admin-workspace.ts` | Current admin workspace university state |

### Mobile PDF reader

The mobile PDF reader uses a purpose-built adaptive layout:

- full-width PDF rendering with rounded corners
- auto-hiding header bar on scroll
- floating bottom navigation bar with page indicator and snip tool
- full-screen slide-over sidebar drawer for AI Chat and Learn Mode
- text selection triggers an action menu: Explain, Define, Example, Snip to Chat, Add to Input
- all AI actions open the sidebar and route to the Chat tab automatically

## Database And Migrations

Canonical schema snapshot:

```text
backend/migrations/schema.sql
```

Incremental migration files in `backend/migrations/` cover:

- multi-university foundation and scoping
- Learn Mode tables (`add_learn_mode.sql`, `add_learn_retests.sql`)
- document sections and page tracking (`add_document_sections.sql`, `add_page_tracking.sql`)
- ingestion worker claims and run tokens
- quiz generation jobs and result tracking
- lecturer portal foundation, submission lifecycle, cancellation and resubmission
- admin RLS policies and role enforcement
- AI usage logging (`add_ai_usage_logs.sql`)
- system settings history and change request tables
- vector index health check procedures

Use your normal Supabase migration workflow for applying schema changes.

## Deployment

### Frontend

`deploy.yml` deploys the frontend to Vercel on every push to `main`.

Required GitHub secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### Backend

The FastAPI backend is deployed separately and is not bundled into the Vercel frontend deployment. The frontend must point `NEXT_PUBLIC_API_URL` to the deployed backend base URL.

## Operational Notes

- keep `SUPABASE_SERVICE_ROLE_KEY` backend-only — never expose it to the frontend
- treat all `NEXT_PUBLIC_*` variables as browser-visible
- do not commit `.env` files, service-account JSON files, or API keys
- verify `GOOGLE_DRIVE_FOLDER_ID` before backend startup in non-test environments
- if document uploads fail, check Drive credentials, upload folder configuration, and backend logs
- if quiz generation becomes unstable, inspect quiz provider timeouts, duplicate-filter thresholds, and generation logs
- if Learn Mode section generation stalls, check LLM provider availability and the `learn.py` router logs

## Known Product / Engineering Notes

### Learn Mode is on a separate branch

Learn Mode backend (endpoints, migrations, `routers/learn.py`) has been merged to `main` and is live in production. The frontend Learn Mode UI (`LearnModeView.tsx`, sidebar integration, tab navigation) is developed on the `feature/learn-mode` branch and not yet merged to `main`.

### Web search is currently disabled by default

Current gating:

- backend env gate: `WEB_SEARCH_FEATURE_ENABLED=false`
- frontend hard gate in `frontend/hooks/useMainPageController.ts`

To re-enable:

1. set `WEB_SEARCH_FEATURE_ENABLED=true` in backend env
2. re-enable the frontend gate
3. configure `TAVILY_API_KEY`
4. verify usage limits and UI behavior

### Documentation caveat

Treat the code as the source of truth if any document appears stale. Some internal markdown files may be audit-style, planning-oriented, or historical rather than current.
