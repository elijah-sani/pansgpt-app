from fastapi import FastAPI, HTTPException, Header, Depends, status, Request, BackgroundTasks, Query
from contextlib import asynccontextmanager # [GRACEFUL SHUTDOWN]
from starlette.concurrency import iterate_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import uuid
import os
import sys
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv
from google_drive import GoogleDriveService, get_drive_service
from restrictions import (
    build_university_candidates,
    get_active_student_restriction,
    normalize_university_name,
)
from services import llm_engine
from services import ai_usage_tracker
import sentry_sdk
from dependencies import (
    prime_jwks_cache,
    get_current_user,
    get_current_user_role,
    get_current_user_role_info,
    get_current_global_admin,
    get_admin_university_scope,
    resolve_admin_workspace_university,
    get_lecturer_profile_for_user,
    require_admin_role,
    require_super_admin_role,
    set_role_dependencies,
    User,
    get_current_super_admin,
    get_current_senior_university_admin,
    UNIVERSITY_SUSPENDED_MESSAGE,
)

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

# Load backend environment variables from a stable source path, independent of
# the process working directory.
BACKEND_DIR = Path(__file__).resolve().parent
BACKEND_ENV_PATH = BACKEND_DIR / ".env"
load_dotenv(dotenv_path=BACKEND_ENV_PATH)

is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"


async def _resolve_profile_university_id(sb, profile_row: dict) -> Optional[str]:
    explicit_university_id = (profile_row.get("university_id") or "").strip()
    if explicit_university_id:
        return explicit_university_id

    university_candidates = build_university_candidates(profile_row.get("university"))
    if not university_candidates:
        return None

    university_res = await _run_db(
        lambda: sb.table("universities").select("id,name,short_name").execute(),
        operation_name="resolve profile university",
    )
    university_rows = university_res.data or []
    candidate_set = set(university_candidates)
    match = next(
        (
            row for row in university_rows
            if normalize_university_name(row.get("name")) in candidate_set
            or normalize_university_name(row.get("short_name")) in candidate_set
        ),
        None,
    )
    return match.get("id") if match else None


async def _resolve_university_name_by_id(sb, university_id: Optional[str]) -> Optional[str]:
    normalized_university_id = (university_id or "").strip()
    if not normalized_university_id:
        return None

    university_res = await _run_db(
        lambda: sb.table("universities").select("name").eq("id", normalized_university_id).limit(1).execute(),
        operation_name="resolve university name",
    )
    university_row = _first_row(university_res)
    if not university_row:
        return None
    return (university_row.get("name") or "").strip() or None


async def _resolve_university_lifecycle_by_id(sb, university_id: Optional[str]) -> dict:
    normalized_university_id = (university_id or "").strip()
    if not normalized_university_id:
        return {"status": None, "name": None}

    university_res = await _run_db(
        lambda: sb.table("universities")
        .select("id,name,status")
        .eq("id", normalized_university_id)
        .limit(1)
        .execute(),
        operation_name="resolve university lifecycle",
    )
    university_row = _first_row(university_res)
    if not university_row:
        return {"status": None, "name": None}

    status_value = (university_row.get("status") or "").strip().lower() or None
    return {
        "status": status_value,
        "name": (university_row.get("name") or "").strip() or None,
    }


async def _resolve_profile_university_payload(
    sb,
    *,
    university_id: Optional[str],
    university_text: Optional[str],
) -> dict:
    normalized_university_id = (university_id or "").strip() or None
    normalized_university_text = (university_text or "").strip() or None

    if normalized_university_id:
        university_res = await _run_db(
            lambda: sb.table("universities")
            .select("id,name,short_name,status")
            .eq("id", normalized_university_id)
            .limit(1)
            .execute(),
            operation_name="validate profile university_id",
        )
        university_row = _first_row(university_res)
        if not university_row:
            raise HTTPException(status_code=400, detail="Selected university was not found")

        if (university_row.get("status") or "").strip().lower() != "active":
            raise HTTPException(status_code=400, detail="Selected university is not active")

        university_name = (university_row.get("name") or "").strip() or normalized_university_text
        return {
            "university_id": str(university_row.get("id")),
            "university": university_name,
            "university_name": university_name,
        }

    if not normalized_university_text:
        return {
            "university_id": None,
            "university": None,
            "university_name": None,
        }

    university_candidates = build_university_candidates(normalized_university_text)
    if not university_candidates:
        return {
            "university_id": None,
            "university": normalized_university_text,
            "university_name": normalized_university_text,
        }

    university_res = await _run_db(
        lambda: sb.table("universities").select("id,name,short_name,status").execute(),
        operation_name="resolve profile university fallback",
    )
    candidate_set = set(university_candidates)
    university_row = next(
        (
            row for row in (university_res.data or [])
            if (row.get("status") or "").strip().lower() == "active"
            and (
                normalize_university_name(row.get("name")) in candidate_set
                or normalize_university_name(row.get("short_name")) in candidate_set
            )
        ),
        None,
    )

    if not university_row:
        return {
            "university_id": None,
            "university": normalized_university_text,
            "university_name": normalized_university_text,
        }

    university_name = (university_row.get("name") or "").strip() or normalized_university_text
    return {
        "university_id": str(university_row.get("id")),
        "university": university_name,
        "university_name": university_name,
    }


async def _hydrate_profile_university_fields(sb, profile: Optional[dict]) -> Optional[dict]:
    if not profile:
        return None

    resolved_university_id = (profile.get("university_id") or "").strip() or None
    if not resolved_university_id:
        resolved_university_id = await _resolve_profile_university_id(sb, profile)

    if resolved_university_id:
        profile["university_id"] = resolved_university_id
        resolved_university_name = await _resolve_university_name_by_id(sb, resolved_university_id)
        profile["university_name"] = resolved_university_name or (profile.get("university") or "").strip() or None
        if not (profile.get("university") or "").strip() and profile.get("university_name"):
            profile["university"] = profile["university_name"]
    else:
        profile["university_name"] = (profile.get("university") or "").strip() or None

    return profile


async def _get_auth_user_metadata(user_id: str) -> dict:
    if not supabase_service_client:
        raise HTTPException(status_code=503, detail="Profile sync is temporarily unavailable")

    try:
        auth_response = await asyncio.to_thread(lambda: supabase_service_client.auth.admin.get_user_by_id(user_id))
    except Exception as exc:
        logger.error("Auth user lookup failed for profile sync user_id=%s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Unable to read account metadata")

    user_obj = getattr(auth_response, "user", None) or auth_response
    metadata = getattr(user_obj, "user_metadata", None)
    if metadata is None and isinstance(user_obj, dict):
        metadata = user_obj.get("user_metadata") or user_obj.get("raw_user_meta_data")
    if not isinstance(metadata, dict):
        metadata = {}
    return metadata


def _level_tokens(value: str) -> set[str]:
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


def _document_matches_level(doc: dict, user_tokens: set[str]) -> bool:
    target_levels = doc.get("target_levels")
    if not target_levels or not user_tokens:
        return False

    if isinstance(target_levels, str):
        doc_levels = [target_levels]
    elif isinstance(target_levels, list):
        doc_levels = [str(item) for item in target_levels]
    else:
        doc_levels = []

    doc_tokens: set[str] = set()
    for lvl in doc_levels:
        doc_tokens |= _level_tokens(lvl)

    if "all" in doc_tokens or "general" in doc_tokens:
        return True

    return bool(user_tokens.intersection(doc_tokens))


def _is_student_visible_document(doc: dict) -> bool:
    material_status = str(doc.get("material_status") or "active").strip().lower()
    return material_status in {"active", "archived"}


async def _can_user_access_library_document(sb, current_user: User, db_record: dict) -> bool:
    role_info = await get_current_user_role_info(current_user)
    if role_info.is_university_admin:
        await resolve_admin_workspace_university(current_user)

    if role_info.is_admin:
        return True

    if not _is_student_visible_document(db_record):
        return False

    profile_resp = await _run_db(
        lambda: sb.table("profiles").select("level,university,university_id").eq("id", current_user.id).limit(1).execute(),
        operation_name="document access profile lookup",
        user_id=current_user.id,
    )
    profile_rows = profile_resp.data or []
    if not profile_rows:
        return False

    profile_row = profile_rows[0]
    user_level_tokens = _level_tokens(profile_row.get("level") or "")
    if not _document_matches_level(db_record, user_level_tokens):
        return False

    document_university_id = db_record.get("university_id")
    if not document_university_id:
        return True

    user_university_id = await _resolve_profile_university_id(sb, profile_row)
    if user_university_id:
        lifecycle = await _resolve_university_lifecycle_by_id(sb, user_university_id)
        if lifecycle.get("status") == "suspended":
            raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)

    return bool(user_university_id and user_university_id == document_university_id)

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    traces_sample_rate=0.1 if is_production else 1.0,
    profiles_sample_rate=0.1 if is_production else 1.0,
)

from routers import settings, system, library, chat, quiz, lecturer, shared
from routers.chat_core import router as chat_core_router
from routers.chat_core import chat_limiter
from routers.chat_sessions import router as chat_sessions_router
from routers.timetable import router as timetable_router
from routers.admin import router as admin_router
from routers.feedback import router as feedback_router
from routers.notes import router as notes_router
from routers.lecturer import router as lecturer_router
from routers import learn as learn_router_module  # [LEARN MODE]
from routers.learn import router as learn_router  # [LEARN MODE]

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

# [GRACEFUL SHUTDOWN]
API_KEYS = os.getenv("API_KEYS", "").split(",")  # [GRACEFUL SHUTDOWN]
GOOGLE_DRIVE_FOLDER_ID = (os.getenv("GOOGLE_DRIVE_FOLDER_ID") or "").strip()  # [GRACEFUL SHUTDOWN]
if not GOOGLE_DRIVE_FOLDER_ID:  # [GRACEFUL SHUTDOWN]
    # During testing, we allow this to be empty to avoid collection errors  # [GRACEFUL SHUTDOWN]
    is_testing = (  # [GRACEFUL SHUTDOWN]
        os.getenv("PYTEST_CURRENT_TEST") or   # [GRACEFUL SHUTDOWN]
        os.getenv("ENVIRONMENT") == "testing" or   # [GRACEFUL SHUTDOWN]
        "pytest" in sys.modules or   # [GRACEFUL SHUTDOWN]
        (len(sys.argv) > 0 and "pytest" in sys.argv[0])  # [GRACEFUL SHUTDOWN]
    )  # [GRACEFUL SHUTDOWN]
    if is_testing:  # [GRACEFUL SHUTDOWN]
        logger.warning("GOOGLE_DRIVE_FOLDER_ID is not configured. Proceeding anyway for testing.")  # [GRACEFUL SHUTDOWN]
        GOOGLE_DRIVE_FOLDER_ID = "test-folder-id"  # [GRACEFUL SHUTDOWN]
    else:  # [GRACEFUL SHUTDOWN]
        logger.critical("GOOGLE_DRIVE_FOLDER_ID is not configured. Refusing to start because uploads would go to My Drive root.")  # [GRACEFUL SHUTDOWN]
        raise RuntimeError("GOOGLE_DRIVE_FOLDER_ID is not configured.")  # [GRACEFUL SHUTDOWN]
  # [GRACEFUL SHUTDOWN]
async def verify_api_key(x_api_key: str = Header(...)):  # [GRACEFUL SHUTDOWN]
    """  # [GRACEFUL SHUTDOWN]
    Validates the 'x-api-key' header.   # [GRACEFUL SHUTDOWN]
    Returns True if valid, raises 403 if invalid.  # [GRACEFUL SHUTDOWN]
    """  # [GRACEFUL SHUTDOWN]
    if x_api_key not in API_KEYS:  # [GRACEFUL SHUTDOWN]
        raise HTTPException(  # [GRACEFUL SHUTDOWN]
            status_code=status.HTTP_403_FORBIDDEN,  # [GRACEFUL SHUTDOWN]
            detail="Invalid or missing API Key"  # [GRACEFUL SHUTDOWN]
        )  # [GRACEFUL SHUTDOWN]
    return x_api_key  # [GRACEFUL SHUTDOWN]
  # [GRACEFUL SHUTDOWN]
drive_service = None  # [GRACEFUL SHUTDOWN]
supabase_client = None  # [GRACEFUL SHUTDOWN]
supabase_service_client = None  # [GRACEFUL SHUTDOWN]
  # [GRACEFUL SHUTDOWN]
@asynccontextmanager  # [GRACEFUL SHUTDOWN]
async def lifespan(app: FastAPI):  # [GRACEFUL SHUTDOWN]
    global drive_service, supabase_client, supabase_service_client  # [GRACEFUL SHUTDOWN]
    logger.info("[GRACEFUL SHUTDOWN] Starting up lifecycle manager...")  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    # Initialize dual-provider LLM clients through service layer  # [GRACEFUL SHUTDOWN]
    llm_engine.initialize_clients()  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    try:  # [GRACEFUL SHUTDOWN]
        drive_service = get_drive_service(allow_upload=True)  # [GRACEFUL SHUTDOWN]
        logger.info("[INFO] Google Drive Service Initialized")  # [GRACEFUL SHUTDOWN]
    except Exception as e:  # [GRACEFUL SHUTDOWN]
        logger.error(f"[ERROR] Failed to initialize Drive Service: {e}")  # [GRACEFUL SHUTDOWN]
        drive_service = None  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    # Supabase Initialization  # [GRACEFUL SHUTDOWN]
    logger.info("--- Supabase Initialization Debug ---")  # [GRACEFUL SHUTDOWN]
    SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")  # [GRACEFUL SHUTDOWN]
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or \
                   os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")  # [GRACEFUL SHUTDOWN]
    if not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):  # [GRACEFUL SHUTDOWN]
        logger.warning(  # [GRACEFUL SHUTDOWN]
            "[WARNING] SUPABASE_SERVICE_ROLE_KEY not set — "  # [GRACEFUL SHUTDOWN]
            "falling back to anon key. Service-role operations may fail."  # [GRACEFUL SHUTDOWN]
        )  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    try:  # [GRACEFUL SHUTDOWN]
        from supabase import create_client, Client, ClientOptions  # [GRACEFUL SHUTDOWN]
        if SUPABASE_URL and SUPABASE_KEY:  # [GRACEFUL SHUTDOWN]
            supabase_options = ClientOptions(postgrest_client_timeout=60)  # [GRACEFUL SHUTDOWN]
            supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY, options=supabase_options)  # [GRACEFUL SHUTDOWN]
            logger.info("[INFO] Supabase Client Initialized Successfully")  # [GRACEFUL SHUTDOWN]
              # [GRACEFUL SHUTDOWN]
            # Optional service-role client with same timeout policy when available.  # [GRACEFUL SHUTDOWN]
            service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # [GRACEFUL SHUTDOWN]
            if service_role_key:  # [GRACEFUL SHUTDOWN]
                supabase_service_client = create_client(SUPABASE_URL, service_role_key, options=supabase_options)  # [GRACEFUL SHUTDOWN]
        else:  # [GRACEFUL SHUTDOWN]
            logger.warning("[WARNING] Supabase Initialization Skipped due to missing variables.")  # [GRACEFUL SHUTDOWN]
    except ImportError:  # [GRACEFUL SHUTDOWN]
        logger.error("[ERROR] 'supabase' package not installed.")  # [GRACEFUL SHUTDOWN]
    except Exception as e:  # [GRACEFUL SHUTDOWN]
        logger.error(f"[ERROR] Failed to initialize Supabase: {e}")  # [GRACEFUL SHUTDOWN]
    logger.info("---------------------------------------")  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    set_role_dependencies(supabase_client, supabase_service_client)  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    # Auth JWKS Preflight (startup-only, no request-path overhead)  # [GRACEFUL SHUTDOWN]
    try:  # [GRACEFUL SHUTDOWN]
        jwks_health = prime_jwks_cache()  # [GRACEFUL SHUTDOWN]
        if jwks_health.get("ready"):  # [GRACEFUL SHUTDOWN]
            logger.info(f"[INFO] JWKS preflight ready via {jwks_health.get('endpoint')}")  # [GRACEFUL SHUTDOWN]
        else:  # [GRACEFUL SHUTDOWN]
            logger.warning(f"[WARNING] JWKS preflight not ready: {jwks_health.get('error')}")  # [GRACEFUL SHUTDOWN]
    except Exception as e:  # [GRACEFUL SHUTDOWN]
        logger.warning(f"[WARNING] JWKS preflight failed: {e}")  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    # Initialize Routers with Dependencies  # [GRACEFUL SHUTDOWN]
    library.set_dependencies(drive_service, supabase_client, verify_api_key, GOOGLE_DRIVE_FOLDER_ID, supabase_service_client)  # [GRACEFUL SHUTDOWN]
    chat.set_dependencies(supabase_client, verify_api_key, supabase_service_client)  # [GRACEFUL SHUTDOWN]
    system.set_dependencies(supabase_client)  # [GRACEFUL SHUTDOWN]
    settings.set_dependencies(supabase_client, verify_api_key, supabase_service_client)  # [GRACEFUL SHUTDOWN]
    quiz.set_dependencies(supabase_client, verify_api_key, supabase_service_client)  # [GRACEFUL SHUTDOWN]
    lecturer.set_dependencies(supabase_client, verify_api_key, supabase_service_client, drive_service, GOOGLE_DRIVE_FOLDER_ID)  # [GRACEFUL SHUTDOWN]
    learn_router_module.set_dependencies(supabase_client, supabase_service_client)  # [LEARN MODE]
    ai_usage_tracker.set_dependencies(supabase_service_client)  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    # Stale Job Recovery Checks  # [GRACEFUL SHUTDOWN]
    sb_db = supabase_service_client or supabase_client  # [GRACEFUL SHUTDOWN]
    if sb_db:  # [GRACEFUL SHUTDOWN]
        recovered_quizzes = await quiz.recover_orphaned_quiz_jobs(sb_db)  # [GRACEFUL SHUTDOWN]
        recovered_docs = await library.recover_orphaned_document_ingestions(sb_db)  # [GRACEFUL SHUTDOWN]
        logger.info(  # [GRACEFUL SHUTDOWN]
            "[GRACEFUL SHUTDOWN] Startup recovery check completed: "  # [GRACEFUL SHUTDOWN]
            "recovered %d quizzes, %d documents.",  # [GRACEFUL SHUTDOWN]
            recovered_quizzes,  # [GRACEFUL SHUTDOWN]
            recovered_docs,  # [GRACEFUL SHUTDOWN]
        )  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    yield  # [GRACEFUL SHUTDOWN]
      # [GRACEFUL SHUTDOWN]
    # On Shutdown: Log in-flight tasks and wait/warn  # [GRACEFUL SHUTDOWN]
    from utils import background_task_tracker  # [GRACEFUL SHUTDOWN]
    active_count = background_task_tracker.active_tasks  # [GRACEFUL SHUTDOWN]
    if active_count > 0:  # [GRACEFUL SHUTDOWN]
        logger.warning(  # [GRACEFUL SHUTDOWN]
            "[GRACEFUL SHUTDOWN] Server shutting down. %d background tasks are currently in-flight. "  # [GRACEFUL SHUTDOWN]
            "Attempting ASGI graceful drain.",  # [GRACEFUL SHUTDOWN]
            active_count,  # [GRACEFUL SHUTDOWN]
        )  # [GRACEFUL SHUTDOWN]
    else:  # [GRACEFUL SHUTDOWN]
        logger.info("[GRACEFUL SHUTDOWN] Server shutting down cleanly with 0 active background tasks.")  # [GRACEFUL SHUTDOWN]
  # [GRACEFUL SHUTDOWN]
app = FastAPI(lifespan=lifespan)  # [GRACEFUL SHUTDOWN]
app.state.limiter = limiter  # [GRACEFUL SHUTDOWN]
app.state.chat_limiter = chat_limiter  # [GRACEFUL SHUTDOWN]
app.add_exception_handler(RateLimitExceeded, _custom_rate_limit_handler)  # [GRACEFUL SHUTDOWN]
  # [GRACEFUL SHUTDOWN]
app.include_router(settings.router)  # [GRACEFUL SHUTDOWN]
app.include_router(system.router)  # [GRACEFUL SHUTDOWN]
  # [GRACEFUL SHUTDOWN]
# CORS: Allow your frontend to talk to this backend  # [GRACEFUL SHUTDOWN]
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")  # [GRACEFUL SHUTDOWN]
origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]  # [GRACEFUL SHUTDOWN]
if not origins:  # [GRACEFUL SHUTDOWN]
    origins = [  # [GRACEFUL SHUTDOWN]
        "http://localhost:3000",  # [GRACEFUL SHUTDOWN]
        "http://127.0.0.1:3000",  # [GRACEFUL SHUTDOWN]
        "http://localhost:3001",  # [GRACEFUL SHUTDOWN]
        "http://127.0.0.1:3001",  # [GRACEFUL SHUTDOWN]
    ] # Default fallback  # [GRACEFUL SHUTDOWN]
    logger.info("Using default CORS origins: %s", origins)  # [GRACEFUL SHUTDOWN]
else:  # [GRACEFUL SHUTDOWN]
    logger.info(f"Loaded CORS origins: {origins}")  # [GRACEFUL SHUTDOWN]
  # [GRACEFUL SHUTDOWN]
app.add_middleware(  # [GRACEFUL SHUTDOWN]
    CORSMiddleware,  # [GRACEFUL SHUTDOWN]
    allow_origins=origins,  # [GRACEFUL SHUTDOWN]
    allow_credentials=True,  # [GRACEFUL SHUTDOWN]
    allow_methods=["*"],  # [GRACEFUL SHUTDOWN]
    allow_headers=["*"],  # [GRACEFUL SHUTDOWN]
)  # [GRACEFUL SHUTDOWN]

# Include routers
app.include_router(library.router)
app.include_router(chat_core_router)
app.include_router(chat_sessions_router)
app.include_router(timetable_router)
app.include_router(admin_router)
app.include_router(feedback_router)
app.include_router(quiz.router)
app.include_router(notes_router)
app.include_router(lecturer_router)
app.include_router(learn_router)  # [LEARN MODE]

# --- Routes ---
@app.get("/health")
@limiter.limit("60/minute")
def health_check(request: Request):
    return {"status": "ok", "service": "PansGPT Backend"}


class UniversityUpsertRequest(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    country: Optional[str] = "Nigeria"
    state: Optional[str] = None
    status: Optional[str] = "active"


class UniversityAdminAssignmentRequest(BaseModel):
    email: str
    university_id: str


class SuperAdminSeniorAdminAssignmentRequest(BaseModel):
    email: str


class WorkspaceAdminAssignmentRequest(BaseModel):
    email: str


def _db():
    return supabase_service_client or supabase_client


async def _run_db(execute_fn, operation_name: str = "Supabase query", user_id: Optional[str] = None):
    last_error = None
    for attempt in range(1, 4):
        try:
            return await asyncio.to_thread(execute_fn)
        except Exception as exc:
            last_error = exc
            if attempt < 3 and _is_retryable_db_error(exc):
                logger.warning(
                    "Supabase request failed for %s (user_id=%s, attempt %s/3), retrying: %s",
                    operation_name,
                    user_id,
                    attempt,
                    exc,
                )
                await asyncio.sleep(0.75 * attempt)
                continue
            raise
    if last_error is not None:
        raise last_error
    raise RuntimeError("Supabase query failed without raising an exception")


async def _insert_audit_log(
    *,
    actor_user_id: str,
    actor_role: str,
    university_id: Optional[str],
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    metadata: dict = {},
) -> None:
    sb = _db()
    if not sb:
        return
    try:
        await _run_db(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "university_id": university_id,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "metadata": metadata,
            })
            .execute(),
            operation_name="insert audit log",
        )
    except Exception as exc:
        logger.warning("Access control audit log failed for action %s: %s", action, exc)


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


def _auth_metadata_value(metadata: dict, *keys: str) -> Optional[str]:
    for key in keys:
        value = metadata.get(key)
        if value is None:
            continue
        normalized = str(value).strip()
        if normalized:
            return normalized
    return None


def _normalize_university_payload(payload: dict) -> dict:
    name = (payload.get("name") or "").strip()
    short_name = (payload.get("short_name") or "").strip() or None
    country = (payload.get("country") or "Nigeria").strip() or "Nigeria"
    state = (payload.get("state") or "").strip() or None
    status_value = (payload.get("status") or "active").strip().lower() or "active"

    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if status_value not in {"active", "suspended"}:
        raise HTTPException(status_code=400, detail="status must be active or suspended")

    return {
        "name": name,
        "short_name": short_name,
        "country": country,
        "state": state,
        "status": status_value,
    }


def _apply_university_scope_to_query(query, scope: Optional[str], field: str = "university_id"):
    if scope:
        return query.eq(field, scope)
    return query


def _assert_record_matches_admin_scope(scope: Optional[str], record: Optional[dict], *, field: str = "university_id", resource_name: str = "record") -> None:
    if not record:
        raise HTTPException(status_code=404, detail=f"{resource_name.capitalize()} not found")
    if scope and (record.get(field) or None) != scope:
        raise HTTPException(status_code=403, detail=f"You do not have access to this {resource_name}")


async def _get_user_role(current_user: User) -> Optional[str]:
    return await get_current_user_role(current_user)


async def _require_admin(current_user: User) -> str:
    return await require_admin_role(current_user)


@app.get("/me/bootstrap")
async def get_me_bootstrap(current_user: User = Depends(get_current_user)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    profile_res = await _run_db(
        lambda: sb.table("profiles")
        .select("id,first_name,other_names,avatar_url,level,university,university_id,subscription_tier,has_seen_welcome")
        .eq("id", current_user.id)
        .limit(1)
        .execute(),
        operation_name="/me/bootstrap profile lookup",
        user_id=current_user.id,
    )
    profile = await _hydrate_profile_university_fields(sb, _profile_with_display_name(_first_row(profile_res)))

    try:
        role_info = await get_current_user_role_info(current_user)
    except HTTPException as exc:
        if exc.status_code == 503:
            logger.warning("Bootstrap role lookup fell back to non-admin for user_id=%s", current_user.id)
            role_info = None
        else:
            raise

    try:
        lecturer_profile = await get_lecturer_profile_for_user(current_user)
    except HTTPException as exc:
        if exc.status_code == 503:
            logger.warning("Bootstrap lecturer lookup fell back to non-lecturer for user_id=%s", current_user.id)
            lecturer_profile = None
        else:
            raise

    system_res = await _run_db(
        lambda: sb.table("system_settings")
        .select("maintenance_mode,web_search_enabled,total_api_calls")
        .eq("id", 1)
        .limit(1)
        .execute(),
        operation_name="/me/bootstrap system settings lookup",
        user_id=current_user.id,
    )
    system_settings = _first_row(system_res) or {}

    file_count = 0
    if current_user.email:
        try:
            docs_res = await _run_db(
                lambda: sb.table("pans_library")
                .select("id", count="exact")
                .eq("uploaded_by_email", current_user.email)
                .execute(),
                operation_name="/me/bootstrap uploaded file count",
                user_id=current_user.id,
            )
            file_count = docs_res.count or 0
        except Exception as exc:
            if _is_retryable_db_error(exc):
                logger.warning("Bootstrap file count lookup failed for user_id=%s, defaulting to 0: %s", current_user.id, exc)
                file_count = 0
            else:
                raise

    lecturer_payload = None
    lecturer_status = None
    is_lecturer = False
    academic_role = None
    university_id = None
    university_name = None
    assigned_university_id = None

    if lecturer_profile:
        is_lecturer = True
        lecturer_status = lecturer_profile.status
        academic_role = "lecturer"
        university_id = lecturer_profile.university_id
        university_name = lecturer_profile.university_name
        assigned_university_id = lecturer_profile.university_id
        lecturer_payload = {
            "id": lecturer_profile.id,
            "user_id": lecturer_profile.user_id,
            "university_id": lecturer_profile.university_id,
            "university_name": lecturer_profile.university_name,
            "university_status": lecturer_profile.university_status,
            "status": lecturer_profile.status,
            "title": lecturer_profile.title,
            "full_name": lecturer_profile.full_name,
            "email": lecturer_profile.email,
            "phone_number": lecturer_profile.phone_number,
        }
    elif role_info and role_info.is_university_admin and role_info.university_id:
        academic_role = "university_admin"
        university_id = role_info.university_id
        assigned_university_id = role_info.university_id
        university_name = await _resolve_university_name_by_id(sb, role_info.university_id)
    else:
        is_platform_admin = bool(role_info and (role_info.is_super_admin or role_info.is_global_admin or role_info.is_admin))
        if not is_platform_admin:
            profile_university_id = profile.get("university_id") if profile else None
            if profile_university_id:
                university_id = profile_university_id
                assigned_university_id = profile_university_id
                university_name = await _resolve_university_name_by_id(sb, profile_university_id)
            elif profile:
                university_id = await _resolve_profile_university_id(sb, profile)
                assigned_university_id = university_id
                university_name = await _resolve_university_name_by_id(sb, university_id)

    university_lifecycle = await _resolve_university_lifecycle_by_id(sb, assigned_university_id)
    university_status = university_lifecycle.get("status")
    if university_lifecycle.get("name"):
        university_name = university_lifecycle.get("name")

    academic_context = await shared.get_current_academic_context(assigned_university_id)

    return {
        "profile": profile,
        "role": role_info.role if role_info else None,
        "admin_level": role_info.admin_level if role_info else None,
        "is_admin": bool(role_info.is_admin) if role_info else False,
        "is_super_admin": bool(role_info.is_super_admin) if role_info else False,
        "is_global_admin": bool(role_info.is_global_admin) if role_info else False,
        "is_university_admin": bool(role_info.is_university_admin) if role_info else False,
        "is_senior_university_admin": bool(role_info.is_senior_university_admin) if role_info else False,
        "is_lecturer": is_lecturer,
        "lecturer_status": lecturer_status,
        "lecturer_profile": lecturer_payload,
        "academic_role": academic_role,
        "university_id": university_id,
        "university_name": university_name,
        "university_status": university_status,
        "is_university_suspended": university_status == "suspended",
        "academic_context": academic_context,
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
        .select("id,first_name,other_names,avatar_url,level,university,university_id,subscription_tier,has_seen_welcome,updated_at")
        .eq("id", current_user.id)
        .limit(1)
        .execute()
    )
    return await _hydrate_profile_university_fields(sb, _profile_with_display_name(_first_row(res)))


@app.get("/me/restriction-status", dependencies=[Depends(verify_api_key)])
async def get_my_restriction_status(current_user: User = Depends(get_current_user)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    restriction = await get_active_student_restriction(
        sb,
        user_id=current_user.id,
        execute_fn=lambda query_fn, _operation_name: _run_db(query_fn),
    )

    return {
        "restricted": bool(restriction),
        "restriction": restriction,
    }


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
        "university_id",
        "subscription_tier",
        "has_seen_welcome",
    }
    update_data = {key: value for key, value in payload.items() if key in allowed_fields}
    update_data["id"] = current_user.id

    if "university_id" in payload or "university" in payload:
        university_payload = await _resolve_profile_university_payload(
            sb,
            university_id=payload.get("university_id"),
            university_text=payload.get("university"),
        )
        update_data["university_id"] = university_payload["university_id"]
        update_data["university"] = university_payload["university"]

    if len(update_data) == 1:
        raise HTTPException(status_code=400, detail="No valid profile fields provided")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    res = await _run_db(
        lambda: sb.table("profiles").upsert(update_data).execute()
    )
    profile_row = res.data[0] if res.data else update_data
    return {"data": await _hydrate_profile_university_fields(sb, _profile_with_display_name(profile_row))}


@app.post("/me/profile/sync")
async def sync_my_profile(current_user: User = Depends(get_current_user)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    metadata = await _get_auth_user_metadata(current_user.id)
    existing_res = await _run_db(
        lambda: sb.table("profiles")
        .select("id,first_name,other_names,full_name,avatar_url,level,university,university_id,subscription_tier,has_seen_welcome,updated_at")
        .eq("id", current_user.id)
        .limit(1)
        .execute(),
        operation_name="/me/profile/sync existing profile lookup",
        user_id=current_user.id,
    )
    existing_profile = _first_row(existing_res) or {}

    first_name = _auth_metadata_value(metadata, "first_name")
    other_names = _auth_metadata_value(metadata, "other_names")
    full_name = _auth_metadata_value(metadata, "full_name")
    university_text = _auth_metadata_value(metadata, "university")
    university_id = _auth_metadata_value(metadata, "university_id")
    level = _auth_metadata_value(metadata, "level")

    resolved_university = await _resolve_profile_university_payload(
        sb,
        university_id=university_id,
        university_text=university_text,
    )

    update_data = {
        "id": current_user.id,
        "first_name": first_name if first_name is not None else existing_profile.get("first_name"),
        "other_names": other_names if other_names is not None else existing_profile.get("other_names"),
        "full_name": full_name if full_name is not None else existing_profile.get("full_name"),
        "level": level if level is not None else existing_profile.get("level"),
        "university": resolved_university["university"] if (university_id is not None or university_text is not None) else existing_profile.get("university"),
        "university_id": resolved_university["university_id"] if (university_id is not None or university_text is not None) else existing_profile.get("university_id"),
        "avatar_url": existing_profile.get("avatar_url"),
        "subscription_tier": existing_profile.get("subscription_tier") or "free",
        "has_seen_welcome": existing_profile.get("has_seen_welcome") if existing_profile.get("has_seen_welcome") is not None else False,
    }

    if not update_data.get("full_name"):
        composed_name = " ".join(
            part for part in [
                (update_data.get("first_name") or "").strip(),
                (update_data.get("other_names") or "").strip(),
            ]
            if part
        ).strip()
        if composed_name:
            update_data["full_name"] = composed_name

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    res = await _run_db(
        lambda: sb.table("profiles").upsert(update_data).execute(),
        operation_name="/me/profile/sync upsert",
        user_id=current_user.id,
    )
    profile_row = res.data[0] if res.data else update_data
    return {"data": await _hydrate_profile_university_fields(sb, _profile_with_display_name(profile_row))}


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
async def list_admin_users(current_user: User = Depends(get_current_global_admin)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    res = await _run_db(
        lambda: sb.table("user_roles")
        .select("*, university:universities(id,name,short_name,status)")
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@app.post("/admin/users")
async def create_admin_user(payload: dict, current_user: User = Depends(get_current_super_admin)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    email = (payload.get("email") or "").strip().lower()
    target_role = (payload.get("role") or "super_admin").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required")
    if target_role != "super_admin":
        raise HTTPException(status_code=400, detail="Only super_admin creation is allowed via this endpoint")

    existing = await _run_db(
        lambda: sb.table("user_roles").select("id").eq("email", email).limit(1).execute()
    )
    if _first_row(existing):
        raise HTTPException(status_code=409, detail="User already exists in admin list")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    res = await _run_db(
        lambda: sb.table("user_roles").insert({
            "email": email,
            "role": "super_admin",
            "is_admin": True,
            "university_id": None,
            "admin_level": None,
        }).execute()
    )
    
    bound_row = _first_row(res)
    await _insert_audit_log(
        actor_user_id=current_user.id,
        actor_role="super_admin",
        university_id=None,
        action="super_admin_created",
        target_type="user_roles",
        target_id=bound_row.get("id") if bound_row else None,
        metadata={"email": email},
    )
    return {"data": bound_row}


@app.delete("/admin/users")
async def delete_admin_user(target_email: str, current_user: User = Depends(get_current_super_admin)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    normalized_email = target_email.strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="target_email is required")
    if current_user.email and normalized_email == current_user.email.strip().lower():
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    target_res = await _run_db(
        lambda: sb.table("user_roles").select("*").eq("email", normalized_email).limit(1).execute()
    )
    target_row = _first_row(target_res)
    if not target_row:
        raise HTTPException(status_code=404, detail="Admin assignment not found")

    if target_row.get("role") == "super_admin":
        supers_res = await _run_db(
            lambda: sb.table("user_roles").select("id").eq("role", "super_admin").execute()
        )
        supers = supers_res.data or []
        if len(supers) <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the final remaining Super Admin account")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    await _run_db(
        lambda: sb.table("user_roles").delete().eq("email", normalized_email).execute()
    )
    
    await _insert_audit_log(
        actor_user_id=current_user.id,
        actor_role="super_admin",
        university_id=None,
        action="super_admin_deleted",
        target_type="user_roles",
        target_id=target_row.get("id"),
        metadata={"email": normalized_email},
    )
    return {"status": "success", "email": normalized_email}


@app.get("/admin/universities")
async def list_admin_universities(current_user: User = Depends(get_current_global_admin)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    res = await _run_db(
        lambda: sb.table("universities").select("*").order("name", desc=False).execute()
    )
    return {"data": res.data or []}


@app.post("/admin/universities")
async def create_university(payload: UniversityUpsertRequest, current_user: User = Depends(get_current_global_admin)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    normalized_payload = _normalize_university_payload(payload.model_dump())
    existing_res = await _run_db(
        lambda: sb.table("universities").select("id").ilike("name", normalized_payload["name"]).limit(1).execute()
    )
    if _first_row(existing_res):
        raise HTTPException(status_code=409, detail="University with this name already exists")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    res = await _run_db(
        lambda: sb.table("universities").insert(normalized_payload).execute()
    )
    return {"data": _first_row(res)}


@app.patch("/admin/universities/{university_id}")
async def update_university(
    university_id: str,
    payload: UniversityUpsertRequest,
    current_user: User = Depends(get_current_global_admin),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    existing_res = await _run_db(
        lambda: sb.table("universities").select("*").eq("id", university_id).limit(1).execute()
    )
    existing_row = _first_row(existing_res)
    if not existing_row:
        raise HTTPException(status_code=404, detail="University not found")

    merged_payload = {
        "name": payload.name if payload.name is not None else existing_row.get("name"),
        "short_name": payload.short_name if payload.short_name is not None else existing_row.get("short_name"),
        "country": payload.country if payload.country is not None else existing_row.get("country"),
        "state": payload.state if payload.state is not None else existing_row.get("state"),
        "status": payload.status if payload.status is not None else existing_row.get("status"),
    }
    normalized_payload = _normalize_university_payload(merged_payload)

    name_conflict_res = await _run_db(
        lambda: sb.table("universities")
        .select("id")
        .ilike("name", normalized_payload["name"])
        .neq("id", university_id)
        .limit(1)
        .execute()
    )
    if _first_row(name_conflict_res):
        raise HTTPException(status_code=409, detail="Another university with this name already exists")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    res = await _run_db(
        lambda: sb.table("universities").update(normalized_payload).eq("id", university_id).execute()
    )
    return {"data": _first_row(res)}


@app.post("/admin/users/university-admin")
async def assign_university_admin(
    payload: UniversityAdminAssignmentRequest,
    current_user: User = Depends(get_current_global_admin),
):
    raise HTTPException(
        status_code=400,
        detail="This endpoint is deprecated and disabled. Use /super-admin/universities/{university_id}/senior-admins or /admin/admins instead."
    )


@app.post("/super-admin/universities/{university_id}/senior-admins")
async def assign_university_senior_admin(
    university_id: str,
    payload: SuperAdminSeniorAdminAssignmentRequest,
    current_user: User = Depends(get_current_super_admin),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        uuid.UUID(str(university_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="university_id must be a valid UUID")

    university_res = await _run_db(
        lambda: sb.table("universities").select("id,name,status").eq("id", university_id).limit(1).execute()
    )
    university_row = _first_row(university_res)
    if not university_row:
        raise HTTPException(status_code=404, detail="University not found")
    if (university_row.get("status") or "").strip().lower() != "active":
        raise HTTPException(status_code=400, detail="University is not active")

    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required")

    existing_res = await _run_db(
        lambda: sb.table("user_roles").select("*").eq("email", email).limit(1).execute()
    )
    existing_row = _first_row(existing_res)
    if existing_row:
        existing_role = ((existing_row or {}).get("role") or "").strip().lower()
        if existing_role == "super_admin":
            raise HTTPException(status_code=400, detail="Cannot demote or modify super_admin roles")
        if existing_row.get("university_id") and str(existing_row.get("university_id")) != university_id:
            raise HTTPException(status_code=400, detail="This admin belongs to another university")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    payload_data = {
        "email": email,
        "role": "university_admin",
        "is_admin": True,
        "university_id": university_id,
        "admin_level": "senior",
    }

    if existing_row:
        res = await _run_db(
            lambda: sb.table("user_roles")
            .update(payload_data)
            .eq("id", existing_row["id"])
            .execute()
        )
    else:
        res = await _run_db(
            lambda: sb.table("user_roles").insert(payload_data).execute()
        )

    bound_row = _first_row(res)

    await _insert_audit_log(
        actor_user_id=current_user.id,
        actor_role="super_admin",
        university_id=university_id,
        action="senior_admin_assigned",
        target_type="user_roles",
        target_id=bound_row.get("id") if bound_row else None,
        metadata={"email": email},
    )

    return {"data": bound_row}


@app.delete("/super-admin/universities/{university_id}/senior-admins/{admin_role_id}")
async def remove_university_senior_admin(
    university_id: str,
    admin_role_id: str,
    current_user: User = Depends(get_current_super_admin),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        uuid.UUID(str(university_id))
        uuid.UUID(str(admin_role_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    target_res = await _run_db(
        lambda: sb.table("user_roles").select("*").eq("id", admin_role_id).limit(1).execute()
    )
    target_row = _first_row(target_res)
    if not target_row:
        raise HTTPException(status_code=404, detail="Admin assignment not found")

    if str(target_row.get("university_id")) != university_id:
        raise HTTPException(status_code=400, detail="Admin assignment does not belong to this university")

    if target_row.get("role") != "university_admin" or target_row.get("admin_level") != "senior":
        raise HTTPException(status_code=400, detail="Target is not a senior university admin")

    seniors_res = await _run_db(
        lambda: sb.table("user_roles")
        .select("id")
        .eq("university_id", university_id)
        .eq("role", "university_admin")
        .eq("admin_level", "senior")
        .execute()
    )
    seniors = seniors_res.data or []
    if len(seniors) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the final remaining senior admin for this university"
        )

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    await _run_db(
        lambda: sb.table("user_roles").delete().eq("id", admin_role_id).execute()
    )

    await _insert_audit_log(
        actor_user_id=current_user.id,
        actor_role="super_admin",
        university_id=university_id,
        action="senior_admin_removed",
        target_type="user_roles",
        target_id=admin_role_id,
        metadata={"email": target_row.get("email")},
    )

    return {"status": "success", "id": admin_role_id}


@app.get("/admin/admins")
async def list_workspace_admins(
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    resolved_university_id = await resolve_admin_workspace_university(current_user, university_id)
    role_info = await get_current_user_role_info(current_user)
    if not role_info.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    res = await _run_db(
        lambda: sb.table("user_roles")
        .select("id,user_id,email,role,is_admin,university_id,admin_level,created_at")
        .eq("university_id", resolved_university_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@app.post("/admin/admins")
async def create_workspace_admin(
    payload: WorkspaceAdminAssignmentRequest,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    resolved_university_id = await resolve_admin_workspace_university(current_user, university_id)
    role_info = await get_current_user_role_info(current_user)

    if role_info.is_university_admin and role_info.admin_level != "senior":
        raise HTTPException(status_code=403, detail="Only senior admins can manage admin access.")

    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required")

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    existing_res = await _run_db(
        lambda: sb.table("user_roles").select("*").eq("email", email).limit(1).execute()
    )
    existing_row = _first_row(existing_res)
    if existing_row:
        existing_role = ((existing_row or {}).get("role") or "").strip().lower()
        if existing_role == "super_admin":
            raise HTTPException(status_code=400, detail="Cannot modify a super admin role")
        if existing_row.get("university_id") and str(existing_row.get("university_id")) != resolved_university_id:
            raise HTTPException(status_code=400, detail="This admin belongs to another university")
        if existing_row.get("admin_level") == "senior":
            raise HTTPException(status_code=400, detail="Cannot modify or downgrade an existing senior admin")

    payload_data = {
        "email": email,
        "role": "university_admin",
        "is_admin": True,
        "university_id": resolved_university_id,
        "admin_level": "standard",
    }

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    if existing_row:
        res = await _run_db(
            lambda: sb.table("user_roles")
            .update(payload_data)
            .eq("id", existing_row["id"])
            .execute()
        )
    else:
        res = await _run_db(
            lambda: sb.table("user_roles").insert(payload_data).execute()
        )

    bound_row = _first_row(res)

    await _insert_audit_log(
        actor_user_id=current_user.id,
        actor_role=role_info.role or "university_admin",
        university_id=resolved_university_id,
        action="standard_admin_assigned",
        target_type="user_roles",
        target_id=bound_row.get("id") if bound_row else None,
        metadata={"email": email},
    )

    return {"data": bound_row}


@app.delete("/admin/admins/{admin_role_id}")
async def delete_workspace_admin(
    admin_role_id: str,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    resolved_university_id = await resolve_admin_workspace_university(current_user, university_id)
    role_info = await get_current_user_role_info(current_user)

    if role_info.is_university_admin and role_info.admin_level != "senior":
        raise HTTPException(status_code=403, detail="Only senior admins can manage admin access.")

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        uuid.UUID(str(admin_role_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid admin_role_id format")

    target_res = await _run_db(
        lambda: sb.table("user_roles").select("*").eq("id", admin_role_id).limit(1).execute()
    )
    target_row = _first_row(target_res)
    if not target_row:
        raise HTTPException(status_code=404, detail="Admin assignment not found")

    if str(target_row.get("university_id")) != resolved_university_id:
        raise HTTPException(status_code=400, detail="Admin assignment does not belong to this university workspace")

    if target_row.get("role") == "super_admin":
        raise HTTPException(status_code=400, detail="Cannot remove a super admin from the workspace")

    if current_user.email and target_row.get("email") and target_row.get("email").strip().lower() == current_user.email.strip().lower():
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    if target_row.get("admin_level") == "senior":
        raise HTTPException(status_code=400, detail="Senior admins can only be removed by platform super admins")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    await _run_db(
        lambda: sb.table("user_roles").delete().eq("id", admin_role_id).execute()
    )

    await _insert_audit_log(
        actor_user_id=current_user.id,
        actor_role=role_info.role or "university_admin",
        university_id=resolved_university_id,
        action="standard_admin_removed",
        target_type="user_roles",
        target_id=admin_role_id,
        metadata={"email": target_row.get("email")},
    )

    return {"status": "success", "id": admin_role_id}


@app.get("/admin/students")
async def list_students(
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

    query = sb.table("profiles").select("id,first_name,other_names,level,university,university_id,subscription_tier,updated_at")
    query = _apply_university_scope_to_query(query, admin_scope)
    res = await _run_db(lambda: query.order("updated_at", desc=True).execute())
    return {"data": res.data or []}


@app.patch("/admin/students/{student_id}")
async def update_student_profile(
    student_id: str,
    payload: dict,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

    allowed_fields = {"subscription_tier", "level", "university", "first_name", "other_names", "avatar_url"}
    update_data = {key: value for key, value in payload.items() if key in allowed_fields}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid student fields provided")

    existing_res = await _run_db(
        lambda: sb.table("profiles").select("id,university_id").eq("id", student_id).limit(1).execute()
    )
    existing_row = _first_row(existing_res)
    _assert_record_matches_admin_scope(admin_scope, existing_row, resource_name="student")

    if not supabase_service_client:
        logger.error("[ERROR] Service role client unavailable for admin operation — skipping")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    res = await _run_db(
        lambda: sb.table("profiles").update(update_data).eq("id", student_id).execute()
    )
    return {"data": res.data[0] if res.data else None}


@app.get("/admin/dashboard")
async def get_admin_dashboard(
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

    scoped_profiles_res = await _run_db(
        lambda: sb.table("profiles")
        .select("id", count="exact")
        .eq("university_id", admin_scope)
        .execute()
    )
    user_count = scoped_profiles_res.count or 0
    recent_users = []

    docs_query = sb.table("pans_library").select("id,file_size,created_at,title,uploaded_by_email").order("created_at", desc=True)
    docs_query = _apply_university_scope_to_query(docs_query, admin_scope)
    docs_res = await _run_db(lambda: docs_query.execute())
    settings_res = await _run_db(lambda: sb.table("system_settings").select("maintenance_mode,total_api_calls").eq("id", 1).limit(1).execute())

    docs = docs_res.data or []
    total_bytes = sum((doc.get("file_size") or 0) for doc in docs)
    storage_percentage = (total_bytes / (1024 * 1024 * 1024 * 15)) * 100 if total_bytes else 0

    return {
        "stats": {
            "userCount": user_count,
            "docCount": len(docs),
            "storageUsed": f"{(total_bytes / (1024 * 1024 * 1024)):.2f}",
            "storagePercentage": storage_percentage,
            "aiStatus": "Maintenance" if ((_first_row(settings_res) or {}).get("maintenance_mode")) else "Optimal",
            "apiCalls": str(((_first_row(settings_res) or {}).get("total_api_calls")) or 0),
        },
        "recentUsers": recent_users,
        "recentDocs": docs[:5],
    }


@app.get("/admin/chat/{session_id}")
async def get_admin_chat_session(
    session_id: str,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(current_user)
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

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
            .select("first_name,other_names,university,university_id,level")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        profile = _first_row(profile_res)
        _assert_record_matches_admin_scope(admin_scope, profile, resource_name="chat session")
    elif admin_scope is not None:
        raise HTTPException(status_code=403, detail="You do not have access to this chat session")

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
        raise ZeroDivisionError("Sentry debug trigger")

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
        try:
            role_info = await get_current_user_role_info(current_user)
        except HTTPException as exc:
            if exc.status_code == 503:
                logger.warning("Documents role lookup fell back to non-admin for user_id=%s", current_user.id)
                role_info = None
            else:
                raise

        if role_info and role_info.is_university_admin:
            await resolve_admin_workspace_university(current_user)

        # 1. Fetch the user's academic level from the profiles table
        profile_resp = await _run_db(
            lambda: sb.table("profiles").select("level,university,university_id").eq("id", current_user.id).limit(1).execute(),
            operation_name="/documents profile lookup",
            user_id=current_user.id,
        )
        profile_level = None
        profile_row = None
        if profile_resp.data and len(profile_resp.data) > 0:
            profile_row = profile_resp.data[0]
            profile_level = profile_row.get("level")
        user_level = (level or profile_level or "").strip()
        user_university_id = None
        if profile_row:
            user_university_id = await _resolve_profile_university_id(sb, profile_row)
            if user_university_id:
                lifecycle = await _resolve_university_lifecycle_by_id(sb, user_university_id)
                if lifecycle.get("status") == "suspended":
                    raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)

        # 2. Fetch all records from 'pans_library'
        response = await _run_db(
            lambda: sb.table("pans_library").select("*").execute(),
            operation_name="/documents pans_library list",
            user_id=current_user.id,
        )
        all_docs = response.data or []

        # 3. Filter: return docs explicitly assigned to the user's level.
        user_tokens = _level_tokens(user_level)
        filtered_docs = []
        is_platform_admin = bool(role_info and (role_info.is_super_admin or role_info.is_global_admin))

        for doc in all_docs:
            if not _is_student_visible_document(doc):
                continue
            document_university_id = doc.get("university_id")
            if not is_platform_admin:
                if document_university_id and document_university_id != user_university_id:
                    continue
            if _document_matches_level(doc, user_tokens):
                filtered_docs.append(doc)

        return filtered_docs
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.error("Documents fetch failed for user_id=%s: %s", current_user.id, e)
        if _is_retryable_db_error(e):
            raise HTTPException(status_code=503, detail="Document service is temporarily unavailable. Please try again.")
        raise HTTPException(status_code=500, detail="Unable to load documents. Please try again.")

@app.get("/documents/{file_id}", dependencies=[Depends(verify_api_key)])
async def get_document_metadata(file_id: str, current_user: User = Depends(get_current_user)):
    """Returns metadata for a single file, preferring DB record over Drive."""
    sb = supabase_service_client or supabase_client

    # 1. Try Fetching from Supabase (DB) First
    if sb:
        try:
            # Query by drive_file_id
            response = await asyncio.to_thread(
                lambda: sb.table("pans_library").select("*").eq("drive_file_id", file_id).execute()
            )
            
            if response.data and len(response.data) > 0:
                # Return the rich metadata from DB
                db_record = response.data[0]
                if not await _can_user_access_library_document(sb, current_user, db_record):
                    raise HTTPException(status_code=403, detail="You do not have access to this document")
                return {
                    "id": db_record['id'],
                    "name": db_record.get('file_name'), 
                    "file_name": db_record.get('file_name'),
                    "topic": db_record.get('topic'),
                    "lecturer_name": db_record.get('lecturer_name'),
                    "course_code": db_record.get('course_code'),
                    "size": db_record.get('file_size'),
                    "drive_file_id": db_record.get('drive_file_id'),
                    "material_status": db_record.get("material_status") or "active",
                    "academic_session": db_record.get("academic_session"),
                    "semester": db_record.get("semester"),
                }
            role_info = await get_current_user_role_info(current_user)
            if not role_info.is_admin:
                raise HTTPException(status_code=404, detail="Document not found")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise
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
async def stream_document(file_id: str, size: Optional[str] = None, current_user: User = Depends(get_current_user)):
    """
    Streams a PDF file.
    """
    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")

    sb = supabase_service_client or supabase_client
    if sb:
        response = await asyncio.to_thread(
            lambda: sb.table("pans_library").select("*").eq("drive_file_id", file_id).limit(1).execute()
        )
        rows = response.data or []
        if rows:
            if not await _can_user_access_library_document(sb, current_user, rows[0]):
                raise HTTPException(status_code=403, detail="You do not have access to this document")
        else:
            role_info = await get_current_user_role_info(current_user)
            if not role_info.is_admin:
                raise HTTPException(status_code=404, detail="Document not found")

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
