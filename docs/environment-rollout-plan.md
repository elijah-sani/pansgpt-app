# Environment Rollout Plan

This document describes how to move PansGPT from one shared setup to separate local development, staging, and production environments.

## Goal

Use the same codebase everywhere, but point each environment at the correct services:

```text
Local development -> test/dev services
Staging           -> deployed test services
Production        -> real user services
```

This prevents local testing and staging QA from touching real production users, notes, documents, auth accounts, storage, or payments.

## Target Environments

### 1. Local Development

Used for daily coding.

- Runs on the developer machine.
- Frontend URL: `http://localhost:3000`
- Backend URL: `http://localhost:8000`
- Uses dev or staging Supabase.
- Can contain fake/test users and test documents.
- Safe to break.

### 2. Staging

Used to test the real deployed app before production.

- Public but not advertised.
- Example frontend URL: `https://staging-pansgpt.vercel.app`
- Example backend URL: `https://pansgpt-backend-staging.example.com`
- Uses dev/staging Supabase.
- Used for mobile testing, auth callbacks, PDF storage, PWA behavior, backend connectivity, and final QA.

### 3. Production

Used by real users.

- Public live app.
- Example frontend URL: `https://pansgpt.com`
- Example backend URL: `https://api.pansgpt.com`
- Uses production Supabase.
- Contains real users and real data.
- Only receives tested changes.

## Recommended First Setup

Start with two Supabase projects:

```text
Local development -> dev/staging Supabase
Staging           -> dev/staging Supabase
Production        -> production Supabase
```

Later, if needed, split staging into its own Supabase project:

```text
Local development -> dev Supabase
Staging           -> staging Supabase
Production        -> production Supabase
```

## Environment Variables Used By This Repo

### Frontend

These are read by the Next.js frontend:

```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
ALLOWED_ORIGINS=
```

### Backend

These are read by the FastAPI backend:

```env
API_KEYS=
ALLOWED_ORIGINS=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_API_KEY=
GOOGLE_AI_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=
TAVILY_API_KEY=
NEXT_PUBLIC_APP_URL=
```

## Example Environment Mapping

### Local Frontend

`frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_KEY=dev_api_key
NEXT_PUBLIC_SUPABASE_URL=https://dev-or-staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev_or_staging_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Local Backend

`backend/.env`

```env
API_KEYS=dev_api_key
ALLOWED_ORIGINS=http://localhost:3000
SUPABASE_URL=https://dev-or-staging-project.supabase.co
SUPABASE_ANON_KEY=dev_or_staging_anon_key
SUPABASE_SERVICE_ROLE_KEY=dev_or_staging_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Staging Frontend

Set these in the frontend hosting provider, not in git:

```env
NEXT_PUBLIC_API_URL=https://pansgpt-backend-staging.example.com
NEXT_PUBLIC_API_KEY=staging_api_key
NEXT_PUBLIC_SUPABASE_URL=https://dev-or-staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dev_or_staging_anon_key
NEXT_PUBLIC_APP_URL=https://staging-pansgpt.vercel.app
```

### Staging Backend

Set these in the backend hosting provider:

```env
API_KEYS=staging_api_key
ALLOWED_ORIGINS=https://staging-pansgpt.vercel.app
SUPABASE_URL=https://dev-or-staging-project.supabase.co
SUPABASE_ANON_KEY=dev_or_staging_anon_key
SUPABASE_SERVICE_ROLE_KEY=dev_or_staging_service_role_key
NEXT_PUBLIC_APP_URL=https://staging-pansgpt.vercel.app
```

### Production Frontend

Set these in the production frontend hosting provider:

```env
NEXT_PUBLIC_API_URL=https://api.pansgpt.com
NEXT_PUBLIC_API_KEY=production_api_key
NEXT_PUBLIC_SUPABASE_URL=https://production-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=production_anon_key
NEXT_PUBLIC_APP_URL=https://pansgpt.com
```

### Production Backend

Set these in the production backend hosting provider:

```env
API_KEYS=production_api_key
ALLOWED_ORIGINS=https://pansgpt.com
SUPABASE_URL=https://production-project.supabase.co
SUPABASE_ANON_KEY=production_anon_key
SUPABASE_SERVICE_ROLE_KEY=production_service_role_key
NEXT_PUBLIC_APP_URL=https://pansgpt.com
```

## Step-By-Step Tasks

### Phase 1: Document Current Setup

- [ ] List the current frontend hosting provider.
- [ ] List the current backend hosting provider.
- [ ] Identify the current Supabase project.
- [ ] Decide whether the current Supabase project becomes dev/staging or production.
- [ ] Record current auth redirect URLs.
- [ ] Record current storage bucket names.
- [ ] Record current backend URL and frontend URL.

### Phase 2: Create Production Supabase

- [ ] Create a new Supabase project named `pansgpt-prod`.
- [ ] Apply all schema migrations to production.
- [ ] Create required storage buckets.
- [ ] Recreate storage policies.
- [ ] Recreate row-level security policies.
- [ ] Configure auth redirect URLs for the production frontend.
- [ ] Create the production admin account.
- [ ] Test basic Supabase auth manually.

### Phase 3: Prepare Staging

- [ ] Create a `staging` git branch.
- [ ] Create a staging frontend deployment.
- [ ] Create a staging backend deployment.
- [ ] Point staging frontend to staging backend.
- [ ] Point staging backend to dev/staging Supabase.
- [ ] Add staging frontend URL to backend `ALLOWED_ORIGINS`.
- [ ] Add staging frontend URL to Supabase auth redirect URLs.
- [ ] Confirm staging login works.

### Phase 4: Configure Production Deployments

- [ ] Create or identify the production frontend deployment.
- [ ] Create or identify the production backend deployment.
- [ ] Point production frontend to production backend.
- [ ] Point production backend to production Supabase.
- [ ] Add production frontend URL to backend `ALLOWED_ORIGINS`.
- [ ] Add production frontend URL to Supabase auth redirect URLs.
- [ ] Confirm production login works with a test account.

### Phase 5: Add Safe Env Templates

- [ ] Add `frontend/.env.example`.
- [ ] Add `backend/.env.example`.
- [ ] Include all required variable names.
- [ ] Do not include real secrets.
- [ ] Confirm `.gitignore` keeps real `.env` files out of git.

### Phase 6: Deployment Workflow

Use this workflow before launch:

```text
1. Build locally.
2. Push changes to staging.
3. Test on staging.
4. Merge/deploy to production only after staging passes.
```

Recommended branch mapping:

```text
feature branches -> preview deployments, optional
staging branch   -> staging deployment
main branch      -> production deployment
```

### Phase 7: Staging QA Checklist

Before every production release, test these on staging:

- [ ] Signup.
- [ ] Login.
- [ ] Password reset.
- [ ] Chat.
- [ ] Reader page.
- [ ] PDF opening.
- [ ] Notes.
- [ ] Quick notes sync between sidebar and `/notes`.
- [ ] Quiz creation.
- [ ] Quiz results.
- [ ] Admin pages.
- [ ] File upload/storage.
- [ ] Mobile layout.
- [ ] PWA install/offline behavior, if in scope.

### Phase 8: Production Prelaunch Checklist

- [ ] Production frontend uses production backend URL.
- [ ] Production backend uses production Supabase URL.
- [ ] Production backend uses production service role key.
- [ ] Production frontend uses only anon Supabase key.
- [ ] Production CORS allows only production frontend URLs.
- [ ] Production auth redirects contain only valid production URLs plus any required staging URLs.
- [ ] Production API key differs from staging API key.
- [ ] Production test account can sign in.
- [ ] Admin access is limited to intended accounts.
- [ ] No real secrets are committed.

## Important Rules

- Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend env vars.
- Never commit real `.env` files.
- Never point local development at production unless doing a controlled production fix.
- Staging should be tested before every production release.
- Production should have stricter CORS than local or staging.

## Open Decisions

- [ ] What will the production frontend domain be?
- [ ] What will the production backend domain be?
- [ ] Will staging use the current Supabase project or a separate staging Supabase project?
- [ ] Which branch should auto-deploy to staging?
- [ ] Which branch should auto-deploy to production?
- [ ] Who can access staging?
