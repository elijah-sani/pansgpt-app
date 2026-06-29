# PansGPT

PansGPT is a university study platform built for document-grounded learning, AI chat, quiz generation, PDF reading, notes, lecturer submissions, and university administration.

The codebase is split into:
- a **FastAPI** backend in `backend/`
- a **Next.js 16** frontend in `frontend/`

It uses **Supabase** for auth/data, **Google Drive** for academic file storage, and multiple LLM providers for chat, retrieval, and quiz workflows.

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

- AI chat for students with authenticated sessions
- retrieval-augmented answers from uploaded academic materials
- document library with upload, processing, ingestion progress, and access control
- PDF reading with saved progress, notes, export, and study tools
- quiz generation, quiz jobs, quiz history, attempts, and result tracking
- lecturer registration, approval, and material submission workflows
- university admin flows for students, lecturers, restrictions, timetable, and academic context
- super-admin flows for cross-university administration
- optional web search support, currently feature-gated off by default

## Architecture

```text
Frontend (Next.js App Router)
    |
    |  x-api-key + Supabase bearer token
    v
Backend (FastAPI)
    |
    +--> Supabase (Auth, Postgres, RPCs, role/scope logic)
    +--> Google Drive (material storage)
    +--> LLM providers (chat, retrieval, quiz, failover)
```

### Main runtime flow

1. The frontend authenticates users with Supabase.
2. API requests go to FastAPI with:
   - a public `x-api-key`
   - a Supabase bearer token where required
3. The backend resolves user identity and role/scope server-side.
4. Documents are stored in Google Drive and tracked in Supabase.
5. Chat, retrieval, and quiz generation use configured LLM providers.

## Repository Layout

```text
.
|-- backend/
|   |-- api.py                  FastAPI entry point
|   |-- dependencies.py        Auth, role, and scope helpers
|   |-- google_drive.py        Google Drive integration
|   |-- routers/               API route modules
|   |-- services/              LLM, email, and web search services
|   |-- migrations/            Schema and migration SQL
|   |-- tests/                 Backend test suite
|   `-- requirements.txt       Python dependencies
|-- frontend/
|   |-- app/                   Next.js App Router pages
|   |-- components/            UI components
|   |-- hooks/                 Client hooks/controllers
|   |-- lib/                   API, Supabase, cache, and workspace helpers
|   |-- public/                Static assets and generated PWA artifacts
|   `-- package.json           Frontend package metadata
|-- .github/workflows/         CI and deployment workflows
|-- Makefile                   Backend dev/test shortcuts
|-- package.json               Root workspace scripts
`-- README.md
```

## Tech Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- React PDF / PDF.js
- PWA support via `@ducanh2912/next-pwa`

### Backend

- FastAPI
- Pydantic v2
- Uvicorn
- SlowAPI
- Supabase Python client

### Infrastructure / Services

- Supabase Postgres + Supabase Auth
- Google Drive for uploaded material storage
- Gemini-compatible Google APIs
- Groq
- OpenRouter
- Tavily, feature-gated for web search
- optional Sentry for backend telemetry

## Prerequisites

- Node.js 20+
- Python 3.10+
- a Supabase project
- Google Drive API credentials
- a configured Google Drive upload folder
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

`GOOGLE_DRIVE_FOLDER_ID` is required outside tests.

The backend intentionally refuses to start without it so uploads do not fall back to the Drive root by mistake.

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

### CI

`ci.yml` currently runs:

- backend lint: `ruff check backend --select E9,F63,F7,F82`
- backend tests:
  - `pytest backend/tests/ -q`
  - with some heavy/security-targeted files split into a separate job
- frontend build check:
  - `npm run build` inside `frontend/`

### Security regression

The CI pipeline also has a dedicated job for:

- `backend/tests/test_prompt_guard.py`
- `backend/tests/test_chat_security.py`

## Backend Overview

The backend entry point is:

- `backend/api.py`

Important backend modules:

- `backend/dependencies.py`
  - authentication
  - role resolution
  - university scope enforcement
- `backend/routers/chat_core.py`
  - main streaming chat endpoint
- `backend/routers/chat_sessions.py`
  - chat history/session handling
- `backend/routers/library.py`
  - uploads, document processing, ingestion, progress
- `backend/routers/quiz.py`
  - quiz generation, jobs, results, history
- `backend/routers/notes.py`
  - note storage and retrieval
- `backend/routers/lecturer.py`
  - lecturer registration and submission flows
- `backend/routers/admin.py`
  - university admin operations
- `backend/routers/timetable.py`
  - timetable endpoints
- `backend/routers/feedback.py`
  - feedback submission/handling
- `backend/routers/settings.py`
  - system and settings endpoints

### Auth model

Requests typically include:

- `x-api-key`
- `Authorization: Bearer <supabase-access-token>`

Important distinction:
- `x-api-key` is a coarse client/app gate
- real user identity and authorization come from the bearer token and backend role/scope checks

## Frontend Overview

The frontend uses the Next.js App Router.

Important areas:

- `frontend/lib/api.ts`
  - API wrapper
  - auth token forwarding
  - admin workspace query injection
- `frontend/lib/supabase.ts`
  - browser Supabase client
- `frontend/lib/admin-workspace.ts`
  - current admin workspace university state
- `frontend/components/PDFViewer.tsx`
  - reader, notes, export, progress sync, PDF fetch/cache

Important route groups:

- `/home`
- `/reader/[id]`
- `/notes`
- `/quiz/*`
- `/lecturer/*`
- `/admin/*`
- `/super-admin/*`

## Database And Migrations

Canonical schema snapshot:

```text
backend/migrations/schema.sql
```

Other SQL files currently present:

- `backend/supabase_setup.sql`
- `backend/quiz_tables.sql`
- `backend/lbac_migration.sql`
- feature-specific files in `backend/migrations/`

Use your normal Supabase migration/editor workflow for applying schema changes in your environment.

## Deployment

### Frontend

`deploy.yml` deploys the frontend to Vercel on pushes to `main`.

Required GitHub secrets include:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### Backend

The FastAPI backend is deployed separately and is not bundled into the Vercel frontend deployment.

The frontend must point `NEXT_PUBLIC_API_URL` to the deployed backend base URL.

## Operational Notes

- keep `SUPABASE_SERVICE_ROLE_KEY` backend-only
- treat all `NEXT_PUBLIC_*` variables as browser-visible
- do not commit `.env` files, service-account files, or API keys
- verify `GOOGLE_DRIVE_FOLDER_ID` before backend startup in non-test environments
- if document uploads fail, check:
  - Drive credentials
  - upload folder configuration
  - backend logs
- if quiz generation becomes unstable, inspect:
  - quiz provider timeouts
  - duplicate-filter thresholds
  - generation logs

## Known Product / Engineering Notes

### Web search is currently disabled by default

Current gating:

- backend env gate: `WEB_SEARCH_FEATURE_ENABLED=false`
- frontend hard gate in `frontend/hooks/useMainPageController.ts`

To re-enable later:

1. set `WEB_SEARCH_FEATURE_ENABLED=true` in backend env
2. re-enable the frontend gate
3. configure `TAVILY_API_KEY`
4. verify usage limits and UI behavior

### Documentation caveat

Some internal markdown under ignored/private documentation areas may be audit-style, planning-oriented, or historical.

Treat the code as the source of truth if any document appears stale.
