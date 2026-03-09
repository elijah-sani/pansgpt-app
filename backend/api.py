from fastapi import FastAPI, HTTPException, Header, Depends, status, Request, BackgroundTasks
from starlette.concurrency import iterate_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import os
import time
import httpx
from dotenv import load_dotenv
from google_drive import GoogleDriveService, get_drive_service
from services import llm_engine
import sentry_sdk
from dependencies import prime_jwks_cache, get_current_user, User

import logging
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("PansGPT")

# Load environment variables
load_dotenv()

is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    traces_sample_rate=0.1 if is_production else 1.0,
    profiles_sample_rate=0.1 if is_production else 1.0,
)

from routers import settings, system, library, chat, quiz
from routers.chat_core import router as chat_core_router
from routers.chat_core import chat_limiter
from routers.chat_sessions import router as chat_sessions_router
from routers.timetable import router as timetable_router
from routers.admin import router as admin_router
from routers.feedback import router as feedback_router
from routers.notes import router as notes_router

# Initialize Rate Limiter
def _get_rate_limit_key(request: Request) -> str:
    """Use authenticated user ID as rate limit key, fall back to IP address."""
    user = getattr(request.state, "user", None)
    if user and getattr(user, "id", None):
        return f"user:{user.id}"
    return get_remote_address(request)


limiter = Limiter(key_func=_get_rate_limit_key)


async def _custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "You're sending messages too quickly. Please wait a moment and try again."
        }
    )

app = FastAPI()
app.state.limiter = limiter
app.state.chat_limiter = chat_limiter
app.add_exception_handler(RateLimitExceeded, _custom_rate_limit_handler)

app.include_router(settings.router)
app.include_router(system.router)

# Security Configuration
API_KEYS = os.getenv("API_KEYS", "").split(",")
GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID")
# Initialize dual-provider LLM clients through service layer
llm_engine.initialize_clients()

# CORS: Allow your frontend to talk to this backend
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
if not origins:
    origins = ["http://localhost:3000"] # Default fallback
    logger.info("Using default CORS origin: http://localhost:3000")
else:
    logger.info(f"Loaded CORS origins: {origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models and constants moved to routers

# --- Dependency: The Bouncer ---
async def verify_api_key(x_api_key: str = Header(...)):
    """
    Validates the 'x-api-key' header. 
    Returns True if valid, raises 403 if invalid.
    """
    if x_api_key not in API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API Key"
        )
    return x_api_key

# --- Service Initialization ---
try:
    drive_service = get_drive_service(allow_upload=True)
    logger.info("[INFO] Google Drive Service Initialized")
except Exception as e:
    logger.error(f"[ERROR] Failed to initialize Drive Service: {e}")
    drive_service = None

# --- Supabase Initialization (Moved up to be available for routes) ---
# NOTE: Using supabase==2.0.3 for httpx compatibility
logger.info("--- Supabase Initialization Debug ---")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase_client = None
supabase_service_client = None
try:
    from supabase import create_client, Client, ClientOptions
    if SUPABASE_URL and SUPABASE_KEY:
        supabase_options = ClientOptions(postgrest_client_timeout=60)
        supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=supabase_options)
        logger.info("[INFO] Supabase Client Initialized Successfully")

        # Optional service-role client with same timeout policy when available.
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if service_role_key:
            supabase_service_client = create_client(SUPABASE_URL, service_role_key, options=supabase_options)
    else:
        logger.warning("[WARNING] Supabase Initialization Skipped due to missing variables.")
except ImportError:
    logger.error("[ERROR] 'supabase' package not installed.")
except Exception as e:
    logger.error(f"[ERROR] Failed to initialize Supabase: {e}")
logger.info("---------------------------------------")

# --- Auth JWKS Preflight (startup-only, no request-path overhead) ---
try:
    jwks_health = prime_jwks_cache()
    if jwks_health.get("ready"):
        logger.info(f"[INFO] JWKS preflight ready via {jwks_health.get('endpoint')}")
    else:
        logger.warning(f"[WARNING] JWKS preflight not ready: {jwks_health.get('error')}")
except Exception as e:
    logger.warning(f"[WARNING] JWKS preflight failed: {e}")

# --- Initialize Routers with Dependencies ---
library.set_dependencies(drive_service, supabase_client, verify_api_key, GOOGLE_DRIVE_FOLDER_ID, supabase_service_client)
chat.set_dependencies(supabase_client, verify_api_key, supabase_service_client)
system.set_dependencies(supabase_client)
settings.set_dependencies(supabase_client, verify_api_key, supabase_service_client)
quiz.set_dependencies(supabase_client, verify_api_key, supabase_service_client)

# Include routers
app.include_router(library.router)
app.include_router(chat_core_router)
app.include_router(chat_sessions_router)
app.include_router(timetable_router)
app.include_router(admin_router)
app.include_router(feedback_router)
app.include_router(quiz.router)
app.include_router(notes_router)

# --- Routes ---
@app.get("/health")
@limiter.limit("60/minute")
def health_check(request: Request):
    return {"status": "ok", "service": "PansGPT Backend"}


def _db():
    return supabase_service_client or supabase_client


async def _run_db(execute_fn):
    last_error = None
    for attempt in range(1, 4):
        try:
            return await asyncio.to_thread(execute_fn)
        except Exception as exc:
            last_error = exc
            if attempt < 3 and _is_retryable_db_error(exc):
                logger.warning(
                    "Supabase request failed (attempt %s/3), retrying: %s",
                    attempt,
                    exc,
                )
                await asyncio.sleep(0.75 * attempt)
                continue
            raise
    raise last_error


def _is_retryable_db_error(exc: Exception) -> bool:
    if isinstance(exc, (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError)):
        return True

    message = str(exc).lower()
    retry_markers = (
        "server disconnected",
        "connection reset",
        "timeout",
        "timed out",
        "remoteprotocolerror",
        "temporarily unavailable",
    )
    return any(marker in message for marker in retry_markers)


def _first_row(response):
    rows = response.data or []
    if isinstance(rows, list):
        return rows[0] if rows else None
    return rows


def _profile_with_display_name(profile):
    if not profile:
        return None

    first_name = (profile.get("first_name") or "").strip()
    other_names = (profile.get("other_names") or "").strip()
    full_name = " ".join(part for part in [first_name, other_names] if part).strip()

    return {
        **profile,
        "full_name": full_name or None,
    }


async def _get_user_role(current_user: User) -> Optional[str]:
    sb = _db()
    if not sb or not current_user.email:
        return None

    normalized_email = current_user.email.strip().lower()
    res = await _run_db(
        lambda: sb.table("user_roles").select("role,email").ilike("email", normalized_email).execute()
    )
    rows = res.data or []
    for row in rows:
        role = (row.get("role") or "").strip().lower()
        if role in {"admin", "super_admin"}:
            return role
    return None


async def _require_admin(current_user: User) -> str:
    role = await _get_user_role(current_user)
    if role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return role


@app.get("/me/bootstrap")
async def get_me_bootstrap(current_user: User = Depends(get_current_user)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    profile_res = await _run_db(
        lambda: sb.table("profiles")
        .select("id,first_name,other_names,avatar_url,level,university,subscription_tier,has_seen_welcome")
        .eq("id", current_user.id)
        .limit(1)
        .execute()
    )
    profile = _profile_with_display_name(_first_row(profile_res))

    role = await _get_user_role(current_user)

    system_res = await _run_db(
        lambda: sb.table("system_settings")
        .select("maintenance_mode,web_search_enabled,total_api_calls")
        .eq("id", 1)
        .limit(1)
        .execute()
    )
    system_settings = _first_row(system_res) or {}

    file_count = 0
    if current_user.email:
        docs_res = await _run_db(
            lambda: sb.table("pans_library")
            .select("id", count="exact")
            .eq("uploaded_by_email", current_user.email)
            .execute()
        )
        file_count = docs_res.count or 0

    return {
        "profile": profile,
        "role": role,
        "is_admin": role in {"admin", "super_admin"},
        "is_super_admin": role == "super_admin",
        "system_settings": system_settings,
        "file_count": file_count,
    }


@app.get("/me/profile")
async def get_my_profile(current_user: User = Depends(get_current_user)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    res = await _run_db(
        lambda: sb.table("profiles")
        .select("id,first_name,other_names,avatar_url,level,university,subscription_tier,has_seen_welcome,updated_at")
        .eq("id", current_user.id)
        .limit(1)
        .execute()
    )
    return _profile_with_display_name(_first_row(res))


@app.patch("/me/profile")
async def update_my_profile(payload: dict, current_user: User = Depends(get_current_user)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    allowed_fields = {
        "first_name",
        "other_names",
        "avatar_url",
        "level",
        "university",
        "subscription_tier",
        "has_seen_welcome",
    }
    update_data = {key: value for key, value in payload.items() if key in allowed_fields}
    update_data["id"] = current_user.id

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid profile fields provided")

    res = await _run_db(
        lambda: sb.table("profiles").upsert(update_data).execute()
    )
    return {"data": res.data[0] if res.data else update_data}


@app.delete("/me/account")
async def delete_my_account(current_user: User = Depends(get_current_user)):
    if not supabase_service_client:
        raise HTTPException(status_code=503, detail="Account deletion is temporarily unavailable")

    try:
        await asyncio.to_thread(lambda: supabase_service_client.auth.admin.delete_user(current_user.id))
    except Exception as exc:
        logger.error(f"Failed to delete account for {current_user.id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete account")

    return {"status": "deleted"}


@app.get("/web-search/usage")
async def get_web_search_usage(current_user: User = Depends(get_current_user)):
    from services.web_search import MAX_SEARCHES_PER_USER_PER_DAY, get_daily_usage_count

    used = await get_daily_usage_count(current_user.id)

    return {
        "used": used,
        "limit": MAX_SEARCHES_PER_USER_PER_DAY,
        "remaining": max(0, MAX_SEARCHES_PER_USER_PER_DAY - used),
    }


@app.get("/admin/users")
async def list_admin_users(current_user: User = Depends(get_current_user)):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    res = await _run_db(
        lambda: sb.table("user_roles").select("*").order("created_at", desc=True).execute()
    )
    return {"data": res.data or []}


@app.post("/admin/users")
async def create_admin_user(payload: dict, current_user: User = Depends(get_current_user)):
    role = await _require_admin(current_user)
    if role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can add users")

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    email = (payload.get("email") or "").strip().lower()
    target_role = (payload.get("role") or "admin").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if target_role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=400, detail="role must be admin or super_admin")

    existing = await _run_db(
        lambda: sb.table("user_roles").select("id").eq("email", email).limit(1).execute()
    )
    if _first_row(existing):
        raise HTTPException(status_code=409, detail="User already exists in admin list")

    res = await _run_db(
        lambda: sb.table("user_roles").insert({
            "email": email,
            "role": target_role,
            "is_admin": True,
        }).execute()
    )
    return {"data": res.data[0] if res.data else None}


@app.delete("/admin/users")
async def delete_admin_user(target_email: str, current_user: User = Depends(get_current_user)):
    role = await _require_admin(current_user)
    if role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can remove users")

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    normalized_email = target_email.strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="target_email is required")
    if current_user.email and normalized_email == current_user.email.strip().lower():
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    await _run_db(
        lambda: sb.table("user_roles").delete().eq("email", normalized_email).execute()
    )
    return {"status": "success", "email": normalized_email}


@app.get("/admin/students")
async def list_students(current_user: User = Depends(get_current_user)):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    res = await _run_db(
        lambda: sb.table("profiles")
        .select("id,first_name,other_names,level,university,subscription_tier,updated_at")
        .order("updated_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@app.patch("/admin/students/{student_id}")
async def update_student_profile(student_id: str, payload: dict, current_user: User = Depends(get_current_user)):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    allowed_fields = {"subscription_tier", "level", "university", "first_name", "other_names", "avatar_url"}
    update_data = {key: value for key, value in payload.items() if key in allowed_fields}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid student fields provided")

    res = await _run_db(
        lambda: sb.table("profiles").update(update_data).eq("id", student_id).execute()
    )
    return {"data": res.data[0] if res.data else None}


@app.get("/admin/dashboard")
async def get_admin_dashboard(current_user: User = Depends(get_current_user)):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    users_res = await _run_db(lambda: sb.table("user_roles").select("email,created_at", count="exact").order("created_at", desc=True).limit(5).execute())
    docs_res = await _run_db(lambda: sb.table("pans_library").select("id,file_size,created_at,title,uploaded_by_email").order("created_at", desc=True).execute())
    settings_res = await _run_db(lambda: sb.table("system_settings").select("maintenance_mode,total_api_calls").eq("id", 1).limit(1).execute())

    docs = docs_res.data or []
    total_bytes = sum((doc.get("file_size") or 0) for doc in docs)
    storage_percentage = (total_bytes / (1024 * 1024 * 1024 * 15)) * 100 if total_bytes else 0

    return {
        "stats": {
            "userCount": users_res.count or 0,
            "docCount": len(docs),
            "storageUsed": f"{(total_bytes / (1024 * 1024 * 1024)):.2f}",
            "storagePercentage": storage_percentage,
            "aiStatus": "Maintenance" if ((_first_row(settings_res) or {}).get("maintenance_mode")) else "Optimal",
            "apiCalls": str(((_first_row(settings_res) or {}).get("total_api_calls")) or 0),
        },
        "recentUsers": users_res.data or [],
        "recentDocs": docs[:5],
    }


@app.get("/admin/chat/{session_id}")
async def get_admin_chat_session(session_id: str, current_user: User = Depends(get_current_user)):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    session_res = await _run_db(
        lambda: sb.table("chat_sessions").select("id,title,created_at,user_id").eq("id", session_id).limit(1).execute()
    )
    session_data = _first_row(session_res)
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    profile = None
    user_id = session_data.get("user_id")
    if user_id:
        profile_res = await _run_db(
            lambda: sb.table("profiles")
            .select("first_name,other_names,university,level")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        profile = _first_row(profile_res)

    messages_res = await _run_db(
        lambda: sb.table("chat_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute()
    )
    return {
        "session": {
            **session_data,
            "profiles": profile,
        },
        "messages": messages_res.data or [],
    }


@app.post("/webhooks/signup")
async def handle_signup_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Called by Supabase auth webhook on new user signup (auth.users INSERT).
    Schedules a welcome email 10 minutes after signup.
    Always returns 200 — Supabase retries on any other status.
    """
    from services.email_service import send_welcome_email_delayed
    try:
        payload = await request.json()
        record = payload.get("record", {})
        email = record.get("email", "")
        raw_meta = record.get("raw_user_meta_data", {}) or {}
        first_name = (
            raw_meta.get("first_name")
            or (raw_meta.get("full_name") or "").split()[0]
            or "Student"
        )
        if email:
            background_tasks.add_task(
                send_welcome_email_delayed,
                first_name,
                email,
                "https://pansgpt-app.vercel.app/main",
            )
            logger.info(f"Welcome email scheduled for {email}")
    except Exception as e:
        logger.error(f"Signup webhook error: {e}")
    return {"status": "ok"}


if os.getenv("ENV", "").lower() != "production":
    @app.get("/debug-sentry")
    def trigger_error():
        division_by_zero = 1 / 0
        return {"result": division_by_zero}

@app.get("/documents", dependencies=[Depends(verify_api_key)])
async def list_documents(level: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """Returns a filtered list of documents based on the user's academic level."""
    
    if not supabase_client:
        raise HTTPException(
            status_code=500, 
            detail="Server Error: Database connection not active."
        )

    sb = supabase_service_client or supabase_client

    try:
        # 1. Fetch the user's academic level from the profiles table
        profile_resp = await asyncio.to_thread(
            lambda: sb.table("profiles").select("level").eq("id", current_user.id).limit(1).execute()
        )
        profile_level = None
        if profile_resp.data and len(profile_resp.data) > 0:
            profile_level = profile_resp.data[0].get("level")
        user_level = (level or profile_level or "").strip()

        # 2. Fetch all records from 'pans_library'
        response = await asyncio.to_thread(
            lambda: sb.table("pans_library").select("*").execute()
        )
        all_docs = response.data or []

        # 3. Filter: return docs explicitly assigned to the user's level.
        def level_tokens(value: str) -> set[str]:
            raw = (value or "").strip().lower().replace(" ", "")
            digits = "".join(ch for ch in raw if ch.isdigit())
            tokens: set[str] = set()
            if raw:
                tokens.add(raw)
            if digits:
                tokens.add(digits)
                tokens.add(f"{digits}lvl")
                tokens.add(f"{digits}l")
            return tokens

        user_tokens = level_tokens(user_level)
        filtered_docs = []
        for doc in all_docs:
            target_levels = doc.get("target_levels")
            if not target_levels or not user_tokens:
                continue

            if isinstance(target_levels, str):
                doc_levels = [target_levels]
            elif isinstance(target_levels, list):
                doc_levels = [str(item) for item in target_levels]
            else:
                doc_levels = []

            doc_tokens: set[str] = set()
            for lvl in doc_levels:
                doc_tokens |= level_tokens(lvl)

            if "all" in doc_tokens or "general" in doc_tokens:
                filtered_docs.append(doc)
                continue

            if user_tokens.intersection(doc_tokens):
                filtered_docs.append(doc)

        return filtered_docs
    except Exception as e:
        logger.error(f"Database Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load documents. Please try again.")

@app.get("/documents/{file_id}", dependencies=[Depends(verify_api_key)])
async def get_document_metadata(file_id: str):
    """Returns metadata for a single file, preferring DB record over Drive."""
    
    # 1. Try Fetching from Supabase (DB) First
    if supabase_client:
        try:
            # Query by drive_file_id
            response = await asyncio.to_thread(
                lambda: supabase_client.table("pans_library").select("*").eq("drive_file_id", file_id).execute()
            )
            
            if response.data and len(response.data) > 0:
                # Return the rich metadata from DB
                db_record = response.data[0]
                return {
                    "id": db_record['id'],
                    "name": db_record.get('file_name'), 
                    "file_name": db_record.get('file_name'),
                    "topic": db_record.get('topic'),
                    "lecturer_name": db_record.get('lecturer_name'),
                    "course_code": db_record.get('course_code'),
                    "size": db_record.get('file_size'),
                    "drive_file_id": db_record.get('drive_file_id')
                }
        except Exception as e:
            logger.warning(f"DB Metadata fetch failed, falling back to Drive: {e}")

    # 2. Fallback to Google Drive
    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")
        
    try:
        metadata = drive_service.get_file_metadata(file_id)
        return metadata
    except Exception as e:
        logger.error(f"Metadata Error: {e}")
        if "404" in str(e) or "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail="Unable to retrieve document information. Please try again.")


@app.get("/documents/{file_id}/stream", dependencies=[Depends(verify_api_key)])
async def stream_document(file_id: str, size: Optional[str] = None):
    """
    Streams a PDF file.
    """
    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")

    file_size = size
    file_name = f"{file_id}.pdf"
    
    if not file_size:
        try:
            metadata = drive_service.get_file_metadata(file_id)
            if metadata:
                file_size = metadata.get('size')
                file_name = metadata.get('name', file_name)
        except Exception as e:
            logger.warning(f"[WARNING] Warning: Metadata fetch failed: {e}")

    try:
        sync_generator = drive_service.get_file_stream(file_id)
        async_stream = iterate_in_threadpool(sync_generator)
        
        headers = {
            "Content-Disposition": f'inline; filename="{file_name}"',
            "Accept-Ranges": "none"
        }
        
        if file_size:
            headers["Content-Length"] = str(file_size)
        
        return StreamingResponse(
            async_stream,
            media_type="application/pdf",
            headers=headers
        )
    except Exception as e:
        logger.error(f"Streaming Error: {e}")
        raise HTTPException(status_code=404, detail=f"File error: {str(e)}")

# Library endpoints (upload, delete, update) moved to routers/library.py
# Admin user management is handled via database user_roles table



