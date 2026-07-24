"""
Library Router: Document Management Endpoints
Handles upload, list, delete, and update operations for documents.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, BackgroundTasks, Header, Query
from dependencies import (
    get_current_admin,
    get_current_user,
    get_admin_university_scope,
    get_current_user_role_info,
    resolve_admin_workspace_university,
    User,
)
from fastapi.responses import JSONResponse
from uuid import uuid4
from pydantic import BaseModel
from typing import Optional
import json
import os
import logging
import io
import base64
import asyncio
import time
from functools import partial
import re
from datetime import datetime, timezone

# RAG & Extraction Imports
from google import genai  # v1 SDK
from google.genai import types
import fitz  # PyMuPDF
from PIL import Image
# from groq import Groq  <-- Removed
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    except ImportError:
        # dummy fallback for type checkers / static analysis in IDE
        RecursiveCharacterTextSplitter = None  # type: ignore
from services.pdf_conversion import convert_office_file_to_pdf, detect_admin_upload_file_type
from services.policy_guard import contains_prompt_leak
from services.security_logging import log_security_event
from services import llm_engine, ai_usage_tracker  # [SECTION OUTLINE]
from utils.thinking_token_utils import strip_thinking_tokens
from .shared import get_current_academic_context

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/admin", tags=["library"])
PROCESSING_CONFLICT_DETAIL = "This document is already being processed. Wait for the current ingestion to finish before retrying."
STALE_PROCESSING_THRESHOLD_SECONDS = 15 * 60

# These will be injected from main api.py
drive_service = None
supabase_client = None
supabase_service_client = None

# In-memory cancellation registry — add a document_id here to cancel its ingestion
_cancelled_ingestions: set = set()
verify_api_key_handler = None
GOOGLE_DRIVE_FOLDER_ID = None


class StaleIngestionRun(RuntimeError):
    pass

async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected admin library endpoints.
    """
    if verify_api_key_handler is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return await verify_api_key_handler(x_api_key)

def _db_client():
    """
    Prefer service-role client for admin/background operations so RLS does not block writes.
    Falls back to regular client if service-role is unavailable.
    """
    return supabase_service_client or supabase_client


async def _get_admin_scope(current_user: User) -> Optional[str]:
    return await get_admin_university_scope(current_user)


def _apply_admin_scope_to_query(query, scope: Optional[str]):
    if scope:
        return query.eq("university_id", scope)
    return query


def _assert_document_matches_scope(document_row: Optional[dict], scope: Optional[str]) -> None:
    if not document_row:
        raise HTTPException(status_code=404, detail="Document not found")
    if scope and (document_row.get("university_id") or None) != scope:
        raise HTTPException(status_code=403, detail="You do not have access to this document")


async def _get_document_row_for_admin(db, document_id: str, scope: Optional[str], fields: str = "*") -> dict:
    response = await _execute_with_retry_async(
        lambda: db.table("pans_library").select(fields).eq("id", document_id).limit(1).execute(),
        f"Fetch scoped document {document_id}",
    )
    rows = response.data or []
    row = rows[0] if rows else None
    _assert_document_matches_scope(row, scope)
    return row


async def _assert_user_can_access_progress_document(db, current_user: User, document_id: str) -> None:
    """
    Reading-progress endpoints are user-scoped, not admin-scoped.
    The route path lives under /admin for historical reasons, so we explicitly
    verify document visibility before reading or writing progress.
    `document_id` here is the Drive file id used by the reader.
    """
    response = await _execute_with_retry_async(
        lambda: db.table("pans_library").select("*").eq("drive_file_id", document_id).limit(1).execute(),
        f"Fetch document for reading-progress access {document_id}",
    )
    rows = response.data or []
    row = rows[0] if rows else None

    if row:
        from api import _can_user_access_library_document

        if not await _can_user_access_library_document(db, current_user, row):
            raise HTTPException(status_code=403, detail="You do not have access to this document")
        return

    role_info = await get_current_user_role_info(current_user)
    if not role_info.is_admin:
        raise HTTPException(status_code=404, detail="Document not found")

def _is_retryable_network_error(exc: Exception) -> bool:
    """
    Return True for transient SSL/timeout failures that should be retried.
    """
    msg = str(exc).lower()
    retry_markers = (
        "timed out",
        "timeout",
        "the handshake operation timed out",
        "the read operation timed out",
        "_ssl.c",
        "ssl",
    )
    return any(marker in msg for marker in retry_markers)


def _is_retryable_provider_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    provider_retry_markers = (
        "429",
        "quota",
        "resource_exhausted",
        "temporarily unavailable",
        "server disconnected",
        "connection reset",
        "connection aborted",
        "unexpected_eof_while_reading",
        "eof occurred in violation of protocol",
        "ssl",
        "timeout",
        "timed out",
        "503",
        "502",
        "500",
        "transport",
    )
    return _is_retryable_network_error(exc) or any(marker in msg for marker in provider_retry_markers)


async def _execute_with_retry_async(execute_fn, operation_name: str, max_attempts: int = 3):
    """
    Retry transient Supabase calls from async code paths.
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await asyncio.to_thread(execute_fn)
        except Exception as e:
            last_error = e
            if attempt < max_attempts and _is_retryable_network_error(e):
                logger.warning(
                    f"[WARNING] {operation_name} failed (attempt {attempt}/{max_attempts}), retrying: {e}"
                )
                await asyncio.sleep(1)
                continue
            raise
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"{operation_name} failed after {max_attempts} attempts without recording last_error")

def _execute_with_retry_sync(execute_fn, operation_name: str, max_attempts: int = 3):
    """
    Retry transient Supabase calls from sync code paths.
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return execute_fn()
        except Exception as e:
            last_error = e
            if attempt < max_attempts and _is_retryable_network_error(e):
                logger.warning(
                    f"[WARNING] {operation_name} failed (attempt {attempt}/{max_attempts}), retrying: {e}"
                )
                time.sleep(1)
                continue
            raise
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"{operation_name} failed after {max_attempts} attempts without recording last_error")


def extract_drive_file_id(value: Optional[str]) -> Optional[str]:
    """
    Extract a Google Drive file id from the URL format created by lecturer uploads.
    Also accepts a raw Drive id so callers can pass already-normalized values.
    """
    raw = (value or "").strip()
    if not raw:
        return None

    patterns = (
        r"/file/d/([^/?#]+)",
        r"[?&]id=([^&#]+)",
        r"^([A-Za-z0-9_-]{10,})$",
    )
    for pattern in patterns:
        match = re.search(pattern, raw)
        if match:
            return match.group(1)
    return None


def build_library_target_levels(level: Optional[str]) -> list[str]:
    normalized = (level or "").strip()
    if not normalized:
        return []
    return [normalized]


def normalize_material_status(value: Optional[str], *, default: str = "active") -> str:
    normalized = (value or default).strip().lower()
    if normalized not in {"active", "archived"}:
        raise HTTPException(status_code=400, detail="material_status must be active or archived")
    return normalized


def normalize_semester(value: Optional[str]) -> Optional[str]:
    raw = (value or "").strip().lower()
    if not raw:
        return None
    compact = re.sub(r"[\s_-]+", " ", raw).strip()
    aliases = {
        "first": "first",
        "first semester": "first",
        "1st": "first",
        "1st semester": "first",
        "one": "first",
        "second": "second",
        "second semester": "second",
        "2nd": "second",
        "2nd semester": "second",
        "two": "second",
    }
    normalized = aliases.get(compact)
    if not normalized:
        raise HTTPException(status_code=400, detail="semester must be first or second")
    return normalized


async def create_library_document_from_existing_drive_file(
    *,
    background_tasks: BackgroundTasks,
    drive_file_id: str,
    title: str,
    course_code: str,
    lecturer_name: str,
    topic: str,
    file_name: str,
    university_id: Optional[str] = None,
    uploaded_by_email: Optional[str] = None,
    target_levels: Optional[list[str]] = None,
    academic_session: Optional[str] = None,
    semester: Optional[str] = None,
    material_status: Optional[str] = None,
    visibility: Optional[str] = None,
    source_type: Optional[str] = None,
    approval_status: Optional[str] = None,
    lecturer_submission_id: Optional[str] = None,
    queue_ingestion: bool = True,
) -> dict:
    """
    Reuse the normal library ingestion path for a file that is already in Drive.
    This avoids duplicating the file while still creating a pans_library record
    and queueing the same background extraction/embedding worker used by admin uploads.
    """
    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")
    
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    existing_res = await _execute_with_retry_async(
        lambda: db.table("pans_library")
        .select("id,embedding_status,university_id,source_type")
        .eq("drive_file_id", drive_file_id)
        .limit(1)
        .execute(),
        f"Find existing library document for Drive file {drive_file_id}",
    )
    existing_rows = existing_res.data or []
    if existing_rows:
        row = existing_rows[0]
        existing_university_id = (row.get("university_id") or "").strip() or None
        requested_university_id = (university_id or "").strip() or None
        if existing_university_id != requested_university_id:
            raise HTTPException(
                status_code=409,
                detail="A document with this Drive file already exists under a different university. Please review manually.",
            )

        existing_source_type = (row.get("source_type") or "").strip().lower()
        if existing_source_type and existing_source_type not in {"lecturer"}:
            raise HTTPException(
                status_code=409,
                detail="A document with this Drive file already exists with an incompatible source. Please review manually.",
            )

        if lecturer_submission_id:
            linked_submission_res = await _execute_with_retry_async(
                lambda: db.table("lecturer_material_submissions")
                .select("id,university_id")
                .eq("pans_library_id", row.get("id"))
                .limit(1)
                .execute(),
                f"Check lecturer submission linkage for library doc {row.get('id')}",
            )
            linked_rows = linked_submission_res.data or []
            if linked_rows:
                linked = linked_rows[0]
                linked_id = linked.get("id")
                linked_university_id = (linked.get("university_id") or "").strip() or None
                if linked_id and linked_id != lecturer_submission_id:
                    raise HTTPException(
                        status_code=409,
                        detail="This library document is already linked to another lecturer submission.",
                    )
                if linked_university_id != requested_university_id:
                    raise HTTPException(
                        status_code=409,
                        detail="This library document is linked under a different university.",
                    )
        return {
            "document_id": row.get("id"),
            "status": row.get("embedding_status") or "pending",
            "created": False,
        }

    try:
        metadata = await asyncio.to_thread(drive_service.get_file_metadata, drive_file_id)
        raw_size = metadata.get("size") if isinstance(metadata, dict) else None
        file_size = int(raw_size) if raw_size else 0
    except Exception as exc:
        logger.warning("Could not read Drive metadata for lecturer material %s: %s", drive_file_id, exc)
        file_size = 0

    # visibility and approval_status are retained as legacy DB columns only.
    # They no longer control app behavior and are forced to non-blocking values.
    academic_context = await get_current_academic_context(university_id)
    default_academic_session = academic_context.get("current_academic_session") if academic_context else None
    default_semester = academic_context.get("current_semester") if academic_context else None
    ingestion_run_id = str(uuid4()) if queue_ingestion else None
    data = {
        "title": title,
        "course_code": course_code,
        "lecturer_name": lecturer_name,
        "topic": topic,
        "drive_file_id": drive_file_id,
        "file_name": file_name,
        "file_size": file_size,
        "university_id": university_id,
        "uploaded_by_email": uploaded_by_email,
        "target_levels": target_levels or [],
        "academic_session": (academic_session or "").strip() or default_academic_session,
        "semester": normalize_semester(semester) or default_semester,
        "material_status": normalize_material_status(material_status),
        "visibility": "visible",
        "source_type": source_type or "admin",
        "approval_status": "approved",
        "embedding_status": "processing" if queue_ingestion else "pending",
        "embedding_progress": 0,
        "total_chunks": 100 if queue_ingestion else 0,
        "embedding_error": None,
        "ingestion_run_id": ingestion_run_id,
        "ingestion_worker_id": None,
        "ingestion_worker_claimed_at": None,
        "ingestion_worker_heartbeat_at": None,
    }

    response = await _execute_with_retry_async(
        lambda: db.table("pans_library").insert([data]).execute(),
        "Insert lecturer material library metadata",
    )
    document_id = response.data[0].get("id") if response.data else None
    if not document_id:
        raise HTTPException(status_code=500, detail="Failed to create library document")

    if queue_ingestion:
        try:
            content = await asyncio.to_thread(drive_service.download_file_bytes, drive_file_id)
            if not content:
                raise ValueError("Downloaded file is empty")
        except Exception as exc:
            logger.error("Failed to download lecturer material from Drive %s: %s", drive_file_id, exc)
            raise HTTPException(status_code=500, detail="Unable to download material from storage. Please try again.")

        ingestion_worker_id = str(uuid4())
        background_tasks.add_task(
            process_document_background,
            content,
            document_id,
            ingestion_run_id,
            ingestion_worker_id,
            file_name,
            uploaded_by_email,
        )
        logger.info("[INFO] Lecturer material ingestion queued for document %s", document_id)

    return {
        "document_id": document_id,
        "status": "processing" if queue_ingestion else "pending",
        "created": True,
    }

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
gemini_client = None
if GOOGLE_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
        logger.info("[INFO] Gemini Client initialized for RAG")
    except Exception as e:
        logger.error(f"[ERROR] Failed to init Gemini Client: {e}")

else:
    logger.warning("[WARNING] GOOGLE_API_KEY not set, RAG ingestion will fail")


# --- Models ---
class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    course_code: Optional[str] = None
    lecturer_name: Optional[str] = None
    topic: Optional[str] = None
    target_levels: Optional[list[str]] = None
    academic_session: Optional[str] = None
    semester: Optional[str] = None
    material_status: Optional[str] = None
    version_label: Optional[str] = None


class ProgressUpsert(BaseModel):
    current_page: int
    total_pages: int

# --- Google Vision Client (OpenAI Compatible) ---
# Note: Using Synchronous Client for background threads
from openai import OpenAI

# Initialize Google Client
vision_client = None
if GOOGLE_API_KEY:
    try:
        vision_client = OpenAI(
            api_key=GOOGLE_API_KEY,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )
        logger.info("[INFO] Google Vision Client Initialized")
    except Exception as e:
        logger.error(f"[ERROR] Failed to init Vision Client: {e}")
else:
    logger.warning("[WARNING] GOOGLE_API_KEY not set, Vision features will fail")

# --- Global Model Constants ---
HEAVY_VISION_MODEL = "gemma-4-31b-it"  # For images/multimodal
FAST_TEXT_MODEL = "gemma-4-31b-it"     # For pure text
MAX_VISION_RETRIES = 5
VISION_RETRY_BASE_DELAY_SECONDS = 1.0
VISION_REQUEST_THROTTLE_SECONDS = 2.1
MAX_IMAGES_PER_PAGE = 3


# --- Hybrid Extraction Helpers ---

def merge_system_into_user_sync(messages: list[dict]) -> list[dict]:
    """
    Merges all 'system' role messages into the first 'user' role message.
    Required for Google AI Studio's OpenAI-compatible endpoint.
    """
    system_content = []
    cleaned_messages = []
    
    # 1. Extract system messages
    for msg in messages:
        if msg.get("role") == "system":
            content = msg.get("content")
            if content:
                system_content.append(content)
        else:
            cleaned_messages.append(msg)
            
    if not system_content:
        return cleaned_messages
        
    full_system_prompt = "\n\n".join(system_content)

    return [
        {
            "role": "assistant",
            "content": (
                "Conversation guidance for this response:\n"
                f"{full_system_prompt}"
            ),
        },
        *cleaned_messages,
    ]

def _apply_ingestion_run_filter(query, ingestion_run_id: Optional[str]):
    if ingestion_run_id:
        return query.eq("ingestion_run_id", ingestion_run_id)
    return query


def _apply_ingestion_worker_filter(query, ingestion_worker_id: Optional[str]):
    if ingestion_worker_id:
        return query.eq("ingestion_worker_id", ingestion_worker_id)
    return query


async def _mark_document_failed(
    document_id: str,
    reason: str,
    ingestion_run_id: Optional[str] = None,
    ingestion_worker_id: Optional[str] = None,
) -> None:
    """
    Mark a document as failed in Supabase.
    """
    db = _db_client()
    if not db:
        return
    try:
        query = db.table("pans_library").update({
            "embedding_status": "failed",
            "embedding_error": reason,
            "last_updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", document_id)
        query = _apply_ingestion_run_filter(query, ingestion_run_id)
        query = _apply_ingestion_worker_filter(query, ingestion_worker_id)
        await _execute_with_retry_async(
            lambda: query.execute(),
            "Mark document as failed",
        )
    except Exception as update_err:
        logger.error(f"Failed to persist failed status for {document_id}: {update_err}")


async def _get_document_ingestion_state(document_id: str) -> Optional[dict]:
    db = _db_client()
    if not db:
        return None
    try:
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library")
            .select("embedding_status,ingestion_run_id,ingestion_worker_id,ingestion_worker_heartbeat_at,sections_status")
            .eq("id", document_id)
            .limit(1)
            .execute(),
            f"Fetch worker document state for {document_id}",
        )
        rows = response.data or []
        if not rows:
            return None
        row = rows[0]
        return {
            "embedding_status": str(row.get("embedding_status") or "").strip().lower() or None,
            "ingestion_run_id": str(row.get("ingestion_run_id") or "").strip() or None,
            "ingestion_worker_id": str(row.get("ingestion_worker_id") or "").strip() or None,
            "ingestion_worker_heartbeat_at": row.get("ingestion_worker_heartbeat_at"),
            "sections_status": str(row.get("sections_status") or "").strip().lower() or None,
        }
    except Exception as exc:
        logger.warning("Could not read ingestion state for %s: %s", document_id, exc)
        return None


async def _get_document_embedding_status(document_id: str) -> Optional[str]:
    state = await _get_document_ingestion_state(document_id)
    return state.get("embedding_status") if state else None


async def _ensure_current_ingestion_run(
    document_id: str,
    ingestion_run_id: str,
    phase: str,
    ingestion_worker_id: Optional[str] = None,
) -> None:
    state = await _get_document_ingestion_state(document_id)
    if not state:
        raise StaleIngestionRun(f"Document {document_id} no longer exists during {phase}")
    current_status = state.get("embedding_status")
    current_run_id = state.get("ingestion_run_id")
    current_worker_id = state.get("ingestion_worker_id")
    if (
        current_status != "processing"
        or current_run_id != ingestion_run_id
        or (ingestion_worker_id and current_worker_id != ingestion_worker_id)
    ):
        raise StaleIngestionRun(
            f"Stale ingestion worker for {document_id} stopped during {phase}; "
            f"status={current_status}, current_run_id={current_run_id}, "
            f"current_worker_id={current_worker_id}, worker_run_id={ingestion_run_id}, worker_id={ingestion_worker_id}"
        )


async def _claim_document_ingestion_worker(document_id: str, ingestion_run_id: str, ingestion_worker_id: str) -> bool:
    db = _db_client()
    if not db:
        return False
    response = await _execute_with_retry_async(
        lambda: db.rpc(
            "claim_document_ingestion_worker",
            {
                "p_document_id": document_id,
                "p_ingestion_run_id": ingestion_run_id,
                "p_worker_id": ingestion_worker_id,
            },
        ).execute(),
        f"Claim ingestion worker {ingestion_worker_id} for document {document_id}",
    )
    rows = response.data or []
    return bool(rows and rows[0].get("claimed"))


async def _heartbeat_document_ingestion_worker(document_id: str, ingestion_run_id: str, ingestion_worker_id: str) -> bool:
    db = _db_client()
    if not db:
        return False
    try:
        response = await _execute_with_retry_async(
            lambda: db.rpc(
                "heartbeat_document_ingestion_worker",
                {
                    "p_document_id": document_id,
                    "p_ingestion_run_id": ingestion_run_id,
                    "p_worker_id": ingestion_worker_id,
                },
            ).execute(),
            f"Heartbeat ingestion worker {ingestion_worker_id} for document {document_id}",
        )
        data = response.data
        if isinstance(data, bool):
            return data
        if isinstance(data, list) and data:
            return bool(data[0])
        return bool(data)
    except Exception as exc:
        logger.warning("Worker heartbeat failed for document %s worker %s: %s", document_id, ingestion_worker_id, exc)
        return False


async def analyze_image_with_llama(
    image_bytes: bytes,
    document_id: str,
    page_num: int,
    ingestion_run_id: Optional[str] = None,
    ingestion_worker_id: Optional[str] = None,
) -> str:
    """Sends image bytes to Gemma Vision (via Google) for a concise description.
    Retries with capped exponential backoff on transient/rate-limit failures."""
    if not vision_client:
        logger.warning("Vision client not configured, skipping image analysis")
        return ""

    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    for attempt in range(MAX_VISION_RETRIES):
        try:
            messages = [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this diagram or chart in detail for study notes. Be concise."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            }]
            messages = merge_system_into_user_sync(messages)

            response = await asyncio.to_thread(
                partial(
                    vision_client.chat.completions.create,
                    model=HEAVY_VISION_MODEL,
                    messages=messages,
                    max_tokens=500
                )
            )
            description = strip_thinking_tokens(response.choices[0].message.content or "")
            return f"\n\n[Visual Description: {description}]\n\n"
        except Exception as e:
            error_str = str(e).lower()
            retryable = (
                "429" in str(e)
                or "rate" in error_str
                or "rate_limit" in error_str
                or "timeout" in error_str
                or "tempor" in error_str
                or _is_retryable_provider_error(e)
            )
            if not retryable:
                logger.error(f"Vision analysis error on page {page_num} (non-retryable): {e}")
                return ""

            if attempt == MAX_VISION_RETRIES - 1:
                failure_reason = (
                    f"Vision analysis failed after {MAX_VISION_RETRIES} retries "
                    f"(document={document_id}, page={page_num}): {e}"
                )
                logger.critical(failure_reason)
                await _mark_document_failed(document_id, failure_reason, ingestion_run_id, ingestion_worker_id)
                raise RuntimeError(failure_reason)

            delay = VISION_RETRY_BASE_DELAY_SECONDS * (2 ** attempt)
            logger.warning(
                f"Vision transient error on page {page_num}, "
                f"retry {attempt + 1}/{MAX_VISION_RETRIES} in {delay:.1f}s: {e}"
            )
            await asyncio.sleep(delay)

    return ""


def process_page_images(page) -> list[bytes]:
    """Extracts valid images from a single fitz page, filtering junk."""
    valid_images = []
    image_list = page.get_images(full=True)

    for img in image_list:
        xref = img[0]
        try:
            base_image = page.parent.extract_image(xref)
            image_bytes = base_image["image"]

            # --- Junk Filter ---
            pil_image = Image.open(io.BytesIO(image_bytes))

            # 1. Filter by Size (Ignore icons/lines < 100px)
            if pil_image.width < 100 or pil_image.height < 100:
                continue

            # 2. Filter by Aspect Ratio (Ignore tiny banners)
            if pil_image.width / pil_image.height > 5 or pil_image.height / pil_image.width > 5:
                continue

            valid_images.append(image_bytes)
            if len(valid_images) >= MAX_IMAGES_PER_PAGE:
                break

        except Exception:
            continue

    return valid_images


# --- Progress Helper with Throttling & Retry ---
# Simple in-memory tracker to avoid hitting DB too often
_progress_cache = {}

def _update_progress(
    doc_id: str,
    current_step: int,
    total_steps: int = 100,
    ingestion_run_id: Optional[str] = None,
    ingestion_worker_id: Optional[str] = None,
) -> bool:
    """
    Updates Supabase progress with throttling (only saves every 5%) and retry logic.
    """
    try:
        db = _db_client()
        if not db:
            return False
        # 1. Calculate Percentage
        if total_steps == 0: return False
        # Support both (id, 42) where 42 is % and (id, 5, 10) where 5/10 is 50%
        raw_progress = (current_step / total_steps) * 100
        new_progress = max(0, min(100, int(raw_progress)))

        # 2. Throttle: Don't write if we haven't moved much
        cache_key = f"{doc_id}:{ingestion_run_id or 'default'}"
        last_saved = _progress_cache.get(cache_key, -1)
        
        # Only save if:
        # a) We jumped at least 5%
        # b) We are finished (100%)
        # c) It's the very first update
        if new_progress < 100 and (new_progress - last_saved) < 5:
            return True

        # 3. Retry Logic for Supabase
        try:
            query = db.table('pans_library').update({
                'embedding_progress': new_progress,
                'last_updated_at': datetime.now(timezone.utc).isoformat(),
            }).eq('id', doc_id)
            query = _apply_ingestion_run_filter(query, ingestion_run_id)
            query = _apply_ingestion_worker_filter(query, ingestion_worker_id)
            _execute_with_retry_sync(
                lambda: query.execute(),
                f"Update embedding progress for {doc_id}",
            )
            # Update cache ONLY after successful commit
            _progress_cache[cache_key] = new_progress
            return True
        except Exception as e:
            logger.warning(f"[WARNING] Progress update failed for {doc_id}: {e}")
            return False

    except Exception as e:
        logger.error(f"[ERROR] Progress Calculation Error: {e}")
        return False


def extract_hybrid_content(file_content: bytes, document_id: str, ingestion_run_id: str, ingestion_worker_id: str):
    """
    Main ingestion: Text via fitz + Vision via Llama for images.
    Updates progress in real-time as work completes.
    Extraction phase occupies 0%  40% of total progress.
    """
    doc = fitz.open(stream=file_content, filetype="pdf")
    total_pages = len(doc)
    page_segments = []  # [PAGE TRACKING]

    # --- Pre-scan: Count total images to know denominator ---
    total_images = 0
    for page in doc:
        total_images += len(process_page_images(page))
    
    total_steps = total_pages + total_images
    steps_done = 0
    pending_images = []  # Collect (page_num, image_bytes) for sequential processing
    
    logger.info(f"[INFO] Extraction plan: {total_pages} pages + {total_images} images = {total_steps} steps")

    # --- PHASE 1: Text Extraction (fast) ---
    for page_num, page in enumerate(doc):
        text = page.get_text()
        page_segments.append([page_num + 1, text])  # [PAGE TRACKING]

        # Update progress per page
        steps_done += 1
        extraction_pct = int((steps_done / max(total_steps, 1)) * 40)  # 0-40%
        if not _update_progress(
            document_id,
            extraction_pct,
            ingestion_run_id=ingestion_run_id,
            ingestion_worker_id=ingestion_worker_id,
        ):
            raise StaleIngestionRun(f"Progress update rejected during extraction for {document_id}")
        logger.info(f"[INFO] Page {page_num + 1}/{total_pages} text extracted ({extraction_pct}%)")

        # Queue valid images for sequential vision analysis
        images = process_page_images(page)
        for img_bytes in images:
            pending_images.append((page_num + 1, img_bytes))
            logger.info(f"[INFO] Queued image from page {page_num + 1}")

    doc.close()
    return page_segments, pending_images, steps_done, total_steps  # [PAGE TRACKING]


# [SECTION OUTLINE]
async def _ensure_current_sectioning_run(
    document_id: str,
    ingestion_run_id: str,
    phase: str,
    ingestion_worker_id: Optional[str] = None,
) -> None:
    state = await _get_document_ingestion_state(document_id)
    if not state:
        raise StaleIngestionRun(f"Document {document_id} no longer exists during sectioning phase {phase}")
    current_status = state.get("sections_status")
    current_run_id = state.get("ingestion_run_id")
    current_worker_id = state.get("ingestion_worker_id")
    if (
        current_status != "processing"
        or current_run_id != ingestion_run_id
        or (ingestion_worker_id and current_worker_id != ingestion_worker_id)
    ):
        raise StaleIngestionRun(
            f"Stale ingestion worker for {document_id} stopped during sectioning phase {phase}; "
            f"sections_status={current_status}, current_run_id={current_run_id}, "
            f"current_worker_id={current_worker_id}, worker_run_id={ingestion_run_id}, worker_id={ingestion_worker_id}"
        )


# [SECTION OUTLINE]
async def generate_document_sections(
    document_id: str,
    page_tagged_chunks: list[dict],
    ingestion_run_id: str,
    ingestion_worker_id: str,
) -> bool:
    """
    Asynchronously generates a logical, topic-based section outline for the document
    using the TEXT_PRIMARY LLM and saves it to the document_sections table.
    Ensures heartbeats are sent so recovery worker does not reap the job.
    """
    try:
        db = _db_client()
        if not db:
            raise RuntimeError("Database client not configured")

        # 1. Update sections_status to 'processing'
        await _execute_with_retry_async(
            lambda: db.table('pans_library').update({
                'sections_status': 'processing',
                'last_updated_at': datetime.now(timezone.utc).isoformat(),
            })
            .eq('id', document_id)
            .eq('ingestion_run_id', ingestion_run_id)
            .eq('ingestion_worker_id', ingestion_worker_id)
            .execute(),
            f"Set sections_status to processing for {document_id}",
        )

        await _ensure_current_sectioning_run(document_id, ingestion_run_id, "start", ingestion_worker_id)
        await _heartbeat_document_ingestion_worker(document_id, ingestion_run_id, ingestion_worker_id)

        # 2. Format the chunks for the prompt
        formatted_chunks = []
        for idx, chunk in enumerate(page_tagged_chunks):
            formatted_chunks.append(
                f"--- Chunk {idx + 1} (Pages {chunk['page_start']}-{chunk['page_end']}) ---\n"
                f"{chunk['content']}"
            )
        
        chunks_input = "\n\n".join(formatted_chunks)
        
        system_prompt = (
            "You are an expert system that analyzes a document's sequential chunks and generates a high-level logical section outline.\n"
            "Your task is to divide the document into logical topic-based sections (NOT fixed page ranges, but real conceptual boundaries).\n"
            "Each section must cover a range of pages, and together the sections must cover the entire document from page 1 to the last page with no gaps.\n"
            "Make sure the page ranges are continuous (e.g., section 1: pages 1-3, section 2: pages 4-7, etc.).\n"
            "You must respond ONLY with a JSON object containing a key 'sections' which is an array of objects. "
            "Do not include any explanation or markdown formatting, just the raw JSON."
        )

        user_prompt = (
            f"Here are the sequential chunks of the document:\n\n{chunks_input}\n\n"
            "Please generate the section outline. "
            "Respond with a JSON object of this structure:\n"
            "{\n"
            "  \"sections\": [\n"
            "    {\n"
            "      \"section_title\": \"descriptive title of the topic block\",\n"
            "      \"page_start\": 1,\n"
            "      \"page_end\": 3,\n"
            "      \"summary\": \"Brief summary of this conceptual section.\"\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        messages = merge_system_into_user_sync([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ])

        logger.info(f"[SECTION OUTLINE] Generating section outline for document {document_id}")
        
        await _ensure_current_sectioning_run(document_id, ingestion_run_id, "llm_call", ingestion_worker_id)
        await _heartbeat_document_ingestion_worker(document_id, ingestion_run_id, ingestion_worker_id)

        response = await llm_engine.generate_completion_with_failover(
            messages=messages,
            temperature=0.2,
            max_tokens=4000,
            has_images=False,
            stream=False,
            force_google=False,
            requested_model=llm_engine.TEXT_PRIMARY,
            response_format={"type": "json_object"},
            audit_meta={"document_id": document_id, "request_type": "document_processing", "action": "generate_document_sections"}
        )

        if not response:
            raise RuntimeError("LLM returned no response for document sections")

        choice = response.choices[0] if response.choices else None
        content = choice.message.content if choice else None
        if not content:
            raise RuntimeError("LLM returned empty content for document sections")

        content = strip_thinking_tokens(content)
        data = json.loads(content)
        sections = data.get("sections", [])
        
        if not isinstance(sections, list) or len(sections) == 0:
            raise ValueError("Parsed JSON does not contain a list of sections")

        await _ensure_current_sectioning_run(document_id, ingestion_run_id, "db_insert", ingestion_worker_id)
        await _heartbeat_document_ingestion_worker(document_id, ingestion_run_id, ingestion_worker_id)

        await _execute_with_retry_async(
            lambda: db.table("document_sections").delete().eq("document_id", document_id).execute(),
            f"Delete existing document sections for {document_id}"
        )

        for idx, sec in enumerate(sections):
            section_data = {
                "document_id": document_id,
                "section_index": idx,
                "title": sec.get("section_title") or sec.get("title") or f"Section {idx + 1}",
                "page_start": int(sec.get("page_start", 1)),
                "page_end": int(sec.get("page_end", 1)),
                "summary": sec.get("summary", "")
            }
            await _execute_with_retry_async(
                lambda: db.table("document_sections").insert(section_data).execute(),
                f"Insert document section {idx} for {document_id}"
            )
        
        await _ensure_current_sectioning_run(document_id, ingestion_run_id, "finalize", ingestion_worker_id)
        await _execute_with_retry_async(
            lambda: db.table('pans_library').update({
                'sections_status': 'completed',
                'sections_error': None,
                'last_updated_at': datetime.now(timezone.utc).isoformat(),
            })
            .eq('id', document_id)
            .eq('ingestion_run_id', ingestion_run_id)
            .eq('ingestion_worker_id', ingestion_worker_id)
            .execute(),
            f"Finalize sections_status to completed for {document_id}",
        )
        
        logger.info(f"[SECTION OUTLINE] Successfully generated and stored sections for document {document_id}")
        return True

    except Exception as e:
        err_msg = str(e)
        logger.error(f"[SECTION OUTLINE] Failed to generate sections for {document_id}: {err_msg}", exc_info=True)
        try:
            db = _db_client()
            if db:
                await _execute_with_retry_async(
                    lambda: db.table('pans_library').update({
                        'sections_status': 'failed',
                        'sections_error': err_msg,
                        'last_updated_at': datetime.now(timezone.utc).isoformat(),
                    })
                    .eq('id', document_id)
                    .eq('ingestion_run_id', ingestion_run_id)
                    .eq('ingestion_worker_id', ingestion_worker_id)
                    .execute(),
                    f"Set sections_status to failed for {document_id}",
                )
        except Exception as db_err:
            logger.error(f"[SECTION OUTLINE] Failed to update sections_status to failed for {document_id}: {db_err}")
        return False


# --- RAG Processing Function ---
async def process_and_embed(
    file_content: bytes,
    document_id: str,
    ingestion_run_id: str,
    ingestion_worker_id: str,
    file_name: str = "document.pdf",
):
    """
    Hybrid Extraction Strategy with Real-Time Progress:
    Phase 1 (0-40%):  Extract text + analyze images via Llama Vision.
    Phase 2 (40-100%): Chunk content, generate embeddings, save to Supabase.
    Progress is percentage-based (total_chunks = 100).
    Critical: Uses asyncio.to_thread to avoid blocking the main event loop.
    """
    try:
        db = _db_client()
        if not db:
            raise RuntimeError("Database client is not configured")
        await _ensure_current_ingestion_run(document_id, ingestion_run_id, "worker start", ingestion_worker_id)
        logger.info(f"[INFO] WORKER STARTED: Processing document {document_id} run {ingestion_run_id} worker {ingestion_worker_id}")
        
        # 1. Setup: Status is already set to 'processing' by the upload endpoint.
        
        # 2. Hybrid Extraction (Text + Vision)  0%  40%
        # This is CPU heavy (PDF parse) and I/O blocking (Groq + Supabase sync calls)
        # We run the ENTIRE function in a separate thread.
        try:
            logger.info("[INFO] Starting extraction in separate thread...")
            page_segments, pending_images, steps_done, total_steps = await asyncio.to_thread(  # [PAGE TRACKING]
                extract_hybrid_content,
                file_content,
                document_id,
                ingestion_run_id,
                ingestion_worker_id,
            )
            # --- PHASE 2: Image Analysis (sequential + throttled, async-safe) ---
            for page_num, img_bytes in pending_images:
                await _ensure_current_ingestion_run(document_id, ingestion_run_id, "image analysis", ingestion_worker_id)
                await _heartbeat_document_ingestion_worker(document_id, ingestion_run_id, ingestion_worker_id)
                description = await analyze_image_with_llama(
                    img_bytes,
                    document_id,
                    page_num,
                    ingestion_run_id,
                    ingestion_worker_id,
                )
                if description:
                    # [PAGE TRACKING] Append image analysis description directly to matching page
                    for segment in page_segments:
                        if segment[0] == page_num:
                            segment[1] += f"\n[From Page {page_num}] {description}"
                            break

                steps_done += 1
                extraction_pct = int((steps_done / max(total_steps, 1)) * 40)  # 0-40%
                progress_saved = await asyncio.to_thread(
                    _update_progress,
                    document_id,
                    extraction_pct,
                    100,
                    ingestion_run_id,
                    ingestion_worker_id,
                )
                if not progress_saved:
                    raise StaleIngestionRun(f"Progress update rejected during image analysis for {document_id}")
                logger.info(f"Image done ({steps_done}/{total_steps}, {extraction_pct}%)")

                # Throttle to stay under provider rate limits without blocking the event loop.
                await asyncio.sleep(VISION_REQUEST_THROTTLE_SECONDS)

            # [PAGE TRACKING] Reconstruct full_text and track ranges for chunk-to-page mapping
            full_text = ""
            page_ranges = []
            for page_num, page_text in page_segments:
                start_idx = len(full_text)
                page_content = f"\n--- Page {page_num} ---\n{page_text}"
                full_text += page_content
                end_idx = len(full_text)
                page_ranges.append((page_num, start_idx, end_idx))

            if not full_text.strip():
                raise ValueError("No text or visual content could be extracted from PDF")
                
            logger.info(f"[INFO] Hybrid extraction complete: {len(full_text)} characters")
            
        except Exception as e:
            logger.error(f"Hybrid extraction failed: {e}")
            if isinstance(e, StaleIngestionRun):
                logger.info("[INFO] %s", e)
                return
            await _mark_document_failed(document_id, str(e), ingestion_run_id, ingestion_worker_id)
            return
        
        # 3. Chunk text (CPU Heavy)
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        logger.info("[INFO] Chunking text in separate thread...")
        chunks = await asyncio.to_thread(splitter.split_text, full_text)
        
        logger.info(f"[INFO] Split into {len(chunks)} chunks")
        # Wrap progress update
        progress_saved = await asyncio.to_thread(
            _update_progress,
            document_id,
            42,
            100,
            ingestion_run_id,
            ingestion_worker_id,
        )
        if not progress_saved:
            raise StaleIngestionRun(f"Progress update rejected after chunking for {document_id}")
        
        # 4. Embedding Loop  42%  100%
        failed_chunks_count = 0
        error_log = ""
        cursor = 0  # [PAGE TRACKING]
        page_tagged_chunks = []  # [SECTION OUTLINE]
        
        for idx, chunk_text in enumerate(chunks):
            # Check if admin cancelled this ingestion
            if document_id in _cancelled_ingestions:
                _cancelled_ingestions.discard(document_id)
                logger.info(f"[INFO] Ingestion cancelled by admin for {document_id} at chunk {idx}/{len(chunks)}")
                await _mark_document_failed(
                    document_id,
                    f'Cancelled by admin at chunk {idx} of {len(chunks)}.',
                    ingestion_run_id,
                    ingestion_worker_id,
                )
                return

            # [PAGE TRACKING] Find position of the chunk to determine page range
            chunk_start = full_text.find(chunk_text, cursor)
            if chunk_start == -1:
                chunk_start = full_text.find(chunk_text)
                if chunk_start == -1:
                    logger.warning(f"[PAGE TRACKING] Could not locate chunk {idx+1}/{len(chunks)} text in full_text for document {document_id} — falling back to cursor position. Page mapping for this chunk may be inaccurate.")  # [PAGE TRACKING]
                    chunk_start = cursor
            
            chunk_end = chunk_start + len(chunk_text)
            cursor = chunk_start + 1

            # [PAGE TRACKING] Determine starting and ending pages for this chunk
            overlapping_pages = []
            for p_num, p_start, p_end in page_ranges:
                if p_start < chunk_end and chunk_start < p_end:
                    overlapping_pages.append(p_num)

            if overlapping_pages:
                page_start = min(overlapping_pages)
                page_end = max(overlapping_pages)
            else:
                logger.warning(f"[PAGE TRACKING] No overlapping page range found for chunk {idx+1}/{len(chunks)} in document {document_id} (chunk_start={chunk_start}, chunk_end={chunk_end}) — defaulting to page 1. Page mapping for this chunk is likely inaccurate.")  # [PAGE TRACKING]
                page_start = 1
                page_end = 1

            # [SECTION OUTLINE] Save chunk with its page tracking metadata
            page_tagged_chunks.append({
                "content": chunk_text,
                "page_start": page_start,
                "page_end": page_end
            })

            # --- Rate-limit aware embedding with 429 retry ---
            MAX_EMBED_RETRIES = 5
            embed_success = False
            for embed_attempt in range(MAX_EMBED_RETRIES):
                try:
                    if not gemini_client:
                        raise ValueError("Gemini Client not initialized")

                    await _ensure_current_ingestion_run(document_id, ingestion_run_id, f"chunk {idx+1} embed", ingestion_worker_id)
                    await _heartbeat_document_ingestion_worker(document_id, ingestion_run_id, ingestion_worker_id)
                    response = await asyncio.to_thread(
                        partial(
                            gemini_client.models.embed_content,
                            model="models/gemini-embedding-001",
                            contents=chunk_text,
                            config=types.EmbedContentConfig(output_dimensionality=768)
                        )
                    )

                    embedding = response.embeddings[0].values
                    await _ensure_current_ingestion_run(document_id, ingestion_run_id, f"chunk {idx+1} insert", ingestion_worker_id)

                    await _execute_with_retry_async(
                        lambda: db.table('document_embeddings').insert({
                            'document_id': document_id,
                            'ingestion_run_id': ingestion_run_id,
                            'ingestion_worker_id': ingestion_worker_id,
                            'content': chunk_text,
                            'embedding': embedding,
                            'page_start': page_start,  # [PAGE TRACKING]
                            'page_end': page_end  # [PAGE TRACKING]
                        }).execute(),
                        f"Insert document embedding chunk {idx+1}",
                    )
                    await _heartbeat_document_ingestion_worker(document_id, ingestion_run_id, ingestion_worker_id)

                    logger.info(f"[INFO] Chunk {idx+1}/{len(chunks)} embedded")
                    embed_success = True

                    # Stay under 100 req/min free tier limit
                    await asyncio.sleep(0.65)
                    break

                except Exception as e:
                    error_lower = str(e).lower()
                    is_rate_limit = "429" in str(e) or "quota" in error_lower or "resource_exhausted" in error_lower
                    is_retryable_network = _is_retryable_provider_error(e)
                    if (is_rate_limit or is_retryable_network) and embed_attempt < MAX_EMBED_RETRIES - 1:
                        wait = 15 * (embed_attempt + 1) if is_rate_limit else min(2 ** embed_attempt, 10)
                        retry_reason = "rate limited" if is_rate_limit else "transient provider/network error"
                        logger.warning(
                            f"[WARNING] Chunk {idx+1} {retry_reason}, retrying in {wait}s "
                            f"(attempt {embed_attempt+1}/{MAX_EMBED_RETRIES}): {e}"
                        )
                        await asyncio.sleep(wait)
                        continue
                    # Non-retryable or exhausted retries
                    failed_chunks_count += 1
                    error_msg = f"Chunk {idx+1} failed: {str(e)}"
                    error_log += error_msg + "\n"
                    logger.error(f"[ERROR] {error_msg}")
                    break

            # Update progress: map chunk index to 42% → 99%
            embed_pct = 42 + int(((idx + 1) / len(chunks)) * 58)
            progress_saved = await asyncio.to_thread(
                _update_progress,
                document_id,
                embed_pct,
                100,
                ingestion_run_id,
                ingestion_worker_id,
            )
            if not progress_saved:
                raise StaleIngestionRun(f"Progress update rejected after chunk {idx+1} for {document_id}")

        # 5. Final Status
        final_status = 'completed'
        final_error = None
        
        if failed_chunks_count > 0:
            if failed_chunks_count == len(chunks):
                final_status = 'failed'
                final_error = f"All {len(chunks)} chunks failed to process.\n{error_log}"
            else:
                final_status = 'completed' 
                final_error = f"Completed with {failed_chunks_count} failed chunks.\n{error_log}"
        
        # Wrap final update
        await _ensure_current_ingestion_run(document_id, ingestion_run_id, "final status", ingestion_worker_id)
        await _execute_with_retry_async(
            lambda: db.table('pans_library').update({
                'embedding_status': final_status,
                'embedding_progress': 100,  # 100% done
                'total_chunks': len(chunks),
                'embedding_error': final_error,
                'failed_chunks_count': failed_chunks_count,
                'error_log': error_log or None,
                'last_updated_at': datetime.now(timezone.utc).isoformat(),
            })
            .eq('id', document_id)
            .eq('ingestion_run_id', ingestion_run_id)
            .eq('ingestion_worker_id', ingestion_worker_id)
            .execute(),
            f"Finalize ingestion status for {document_id}",
        )
        
        logger.info(f"[INFO] RAG ingestion finished for {document_id}. Status: {final_status}")

        # [SECTION OUTLINE] If embedding succeeded, generate section outline asynchronously
        if final_status == 'completed':
            asyncio.create_task(
                generate_document_sections(
                    document_id=document_id,
                    page_tagged_chunks=page_tagged_chunks,
                    ingestion_run_id=ingestion_run_id,
                    ingestion_worker_id=ingestion_worker_id,
                )
            )
        
    except StaleIngestionRun as e:
        logger.info("[INFO] %s", e)
    except Exception as e:
        logger.error(f"[ERROR] RAG ingestion CRITICAL FAILURE for {document_id}: {e}")
        try:
            error_msg = str(e)
            await _mark_document_failed(document_id, f"Critical failures: {error_msg}", ingestion_run_id, ingestion_worker_id)
        except Exception as update_err:
            logger.error(f"[ERROR] Failed to update error status: {update_err}")

async def process_document_background(
    file_content: bytes,
    document_id: str,
    ingestion_run_id: str,
    ingestion_worker_id: str,
    file_name: str = "document.pdf",
    uploaded_by: Optional[str] = None,
) -> None:
    # [GRACEFUL SHUTDOWN]
    from utils import background_task_tracker
    background_task_tracker.increment()
    try:
        queued_worker_id = ingestion_worker_id
        ingestion_worker_id = str(uuid4())
        try:
            claimed = await _claim_document_ingestion_worker(document_id, ingestion_run_id, ingestion_worker_id)
            if not claimed:
                logger.info(
                    "[INFO] Duplicate ingestion worker skipped for document %s run %s worker %s queued_worker %s",
                    document_id,
                    ingestion_run_id,
                    ingestion_worker_id,
                    queued_worker_id,
                )
                return
            state = await _get_document_ingestion_state(document_id)
            current_status = state.get("embedding_status") if state else None
            current_run_id = state.get("ingestion_run_id") if state else None
            current_worker_id = state.get("ingestion_worker_id") if state else None
            if current_status != "processing" or current_run_id != ingestion_run_id or current_worker_id != ingestion_worker_id:
                logger.info(
                    "[INFO] Skipping ingestion worker for %s because status/run/worker is %s/%s/%s, worker run/id is %s/%s queued_worker %s",
                    document_id,
                    current_status or "missing",
                    current_run_id or "missing",
                    current_worker_id or "missing",
                    ingestion_run_id,
                    ingestion_worker_id,
                    queued_worker_id,
                )
                return
            await process_and_embed(file_content, document_id, ingestion_run_id, ingestion_worker_id, file_name)
        except StaleIngestionRun as e:
            logger.info("[INFO] %s", e)
        except Exception as e:
            logger.error(f"[ERROR] Background processing failed for {document_id}: {e}")
            await _mark_document_failed(document_id, str(e), ingestion_run_id, ingestion_worker_id)
    finally:
        background_task_tracker.decrement() # [GRACEFUL SHUTDOWN]

# --- Endpoints ---
@router.post("/upload", dependencies=[Depends(verify_api_key)])
async def admin_upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    course_code: str = Form(...),
    lecturer: str = Form(...),
    topic: str = Form(...),
    uploaded_by: Optional[str] = Form(None),
    university_id: Optional[str] = Form(None),
    target_levels: Optional[str] = Form(None),  # JSON-encoded list e.g. '["400lvl","500lvl"]'
    academic_session: Optional[str] = Form(None),
    semester: Optional[str] = Form(None),
    material_status: str = Form("active"),
    current_user: User = Depends(get_current_admin),
):
    """
    Admin Endpoint: Upload PDF or supported Office files, save metadata to Supabase, and trigger RAG ingestion.
    Office files are converted to PDF before Drive upload and ingestion.
    """
    logger.debug(f"[DEBUG] DEBUG: Received Upload Request for '{title}' (Course: {course_code})")
    logger.info(f"[INFO] Upload Request: {title} by {uploaded_by}")

    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")
    if not (GOOGLE_DRIVE_FOLDER_ID or "").strip():
        raise HTTPException(status_code=503, detail="Google Drive upload folder is not configured.")
    
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    scoped_university_id = await resolve_admin_workspace_university(current_user, university_id)
    normalized_material_status = normalize_material_status(material_status)
    academic_context = await get_current_academic_context(scoped_university_id)
    default_academic_session = academic_context.get("current_academic_session") if academic_context else None
    default_semester = academic_context.get("current_semester") if academic_context else None
    normalized_semester = normalize_semester(semester) or default_semester

    original_file_name = (file.filename or "").strip()
    if not original_file_name:
        raise HTTPException(status_code=400, detail="A file is required.")

    detected_file_type, normalized_mime_type, is_supported_file, requires_conversion = detect_admin_upload_file_type(
        original_file_name,
        file.content_type,
    )
    if not is_supported_file:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOC, DOCX, PPT, and PPTX files are supported.",
        )

    # 1. Read the source file once so the same bytes can be reused for conversion, upload, and ingestion.
    try:
        source_content = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to process the file. Please try again.")
    if not source_content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    effective_file_name = original_file_name
    effective_content_type = normalized_mime_type or file.content_type or "application/octet-stream"
    effective_content = source_content

    if requires_conversion:
        try:
            effective_file_name, effective_content = await asyncio.to_thread(
                convert_office_file_to_pdf,
                source_bytes=source_content,
                source_file_name=original_file_name,
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Admin library conversion failed for %s: %s", original_file_name, exc)
            raise HTTPException(status_code=500, detail="Unable to convert the file to PDF. Please try again.")
        effective_content_type = "application/pdf"

    file_size = len(effective_content)

    # 2. Upload the final PDF asset to Google Drive.
    try:
        file_ext = os.path.splitext(effective_file_name)[1]
        if not file_ext:
            file_ext = ".pdf"
        unique_filename = f"{uuid4()}{file_ext}"

        drive_file_id = drive_service.upload_file(
            file_name=unique_filename,
            file_obj=io.BytesIO(effective_content),
            mime_type=effective_content_type,
            folder_id=GOOGLE_DRIVE_FOLDER_ID,
            file_size=file_size,
        )
    except Exception as exc:
        if "scope" in str(exc).lower():
            raise HTTPException(status_code=500, detail="Unable to upload file. Please contact support.")
        raise HTTPException(status_code=500, detail="File upload failed. Please try again.")

    # 4. Parse target_levels from JSON string
    levels_list = []
    if target_levels:
        try:
            levels_list = json.loads(target_levels)
            if not isinstance(levels_list, list):
                levels_list = []
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Invalid target_levels JSON: {target_levels}")
            levels_list = []

    # 5. Insert into Supabase
    try:
        ingestion_run_id = str(uuid4())
        data = {
            "title": title,
            "course_code": course_code,
            "lecturer_name": lecturer,
            "topic": topic,
            "drive_file_id": drive_file_id,
            "file_name": effective_file_name,
            "file_size": file_size,
            "university_id": scoped_university_id,
            "uploaded_by_email": uploaded_by,
            "target_levels": levels_list,
            "academic_session": (academic_session or "").strip() or default_academic_session,
            "semester": normalized_semester,
            "material_status": normalized_material_status,
            "visibility": "visible",
            "approval_status": "approved",
            # Initialize status immediately
            "embedding_status": "processing",
            "embedding_progress": 0,
            "total_chunks": 100,
            "embedding_error": None,
            "ingestion_run_id": ingestion_run_id,
            "ingestion_worker_id": None,
            "ingestion_worker_claimed_at": None,
            "ingestion_worker_heartbeat_at": None,
        }

        response = await _execute_with_retry_async(
            lambda: db.table("pans_library").insert([data]).execute(),
            "Insert uploaded document metadata",
        )
        document_id = response.data[0]['id'] if response.data else None
        
        logger.debug(f"[DEBUG] DEBUG: Supabase insert successful. Document ID: {document_id}")

        if not document_id:
            raise HTTPException(status_code=500, detail="Failed to create document record")

        try:
            role_info = await get_current_user_role_info(current_user)
            if role_info.is_super_admin:
                await _execute_with_retry_async(
                    lambda: db.table("access_control_audit_logs").insert({
                        "actor_user_id": current_user.id,
                        "university_id": scoped_university_id,
                        "action": "super_admin_library_upload_override",
                        "target_type": "pans_library",
                        "target_id": document_id,
                        "metadata": {
                            "course_code": course_code,
                            "title": title,
                            "file_name": file.filename,
                        },
                    }).execute(),
                    "Log super-admin library upload override",
                )
        except Exception as audit_exc:
            logger.warning("Super-admin upload override audit log failed for document %s: %s", document_id, audit_exc)

        # 5. Offload heavy parsing/chunking/embedding to background task.
        ingestion_worker_id = str(uuid4())
        background_tasks.add_task(
            process_document_background,
            effective_content,
            document_id,
            ingestion_run_id,
            ingestion_worker_id,
            effective_file_name,
            uploaded_by,
        )
        logger.info(f"[INFO] Background processing queued for document {document_id}")

        # Return immediately to avoid blocking request lifecycle.
        return JSONResponse(
            status_code=202,
            content={
                "message": "Upload started",
                "status": "processing",
                "document_id": document_id
            }
        )

    except Exception as e:
        logger.error(f"Supabase Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to save the document. Please try again.")

@router.get("/documents", dependencies=[Depends(verify_api_key)])
async def admin_list_documents(
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
):
    """
    Admin Endpoint: List all documents from Supabase.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)
    
    try:
        query = db.table("pans_library").select("*")
        query = _apply_admin_scope_to_query(query, admin_scope)
        response = await _execute_with_retry_async(
            lambda: query.order("created_at", desc=True).execute(),
            "List documents",
        )
        return {"documents": response.data}
    except Exception as e:
        logger.error(f"List Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load documents. Please try again.")

@router.post("/documents/repair-progress", dependencies=[Depends(verify_api_key)])
async def admin_repair_document_progress(
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
):
    """
    Admin utility: force embedding_progress=100 for rows already marked as completed.
    Useful for repairing stale progress values from earlier runs.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

    try:
        query = db.table("pans_library").select("id, embedding_status, embedding_progress").eq("embedding_status", "completed")
        query = _apply_admin_scope_to_query(query, admin_scope)
        response = await _execute_with_retry_async(
            lambda: query.execute(),
            "Fetch completed documents for progress repair",
        )
        rows = response.data or []

        stale_ids = []
        for row in rows:
            raw_progress = row.get("embedding_progress", 0)
            try:
                normalized_progress = int(float(raw_progress))
            except (TypeError, ValueError):
                normalized_progress = 0

            if normalized_progress < 100:
                stale_ids.append(row.get("id"))

        repaired = 0
        for doc_id in stale_ids:
            if not doc_id:
                continue
            await _execute_with_retry_async(
                lambda doc_id=doc_id: db.table("pans_library").update({
                    "embedding_progress": 100
                }).eq("id", doc_id).execute(),
                f"Repair embedding progress for {doc_id}",
            )
            repaired += 1

        return {
            "status": "ok",
            "scanned": len(rows),
            "repaired": repaired,
            "document_ids": [doc_id for doc_id in stale_ids if doc_id],
        }
    except Exception as e:
        logger.error(f"Repair Progress Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to repair document progress. Please try again.")

@router.delete("/documents/{doc_id}", dependencies=[Depends(verify_api_key)])
async def admin_delete_document(
    doc_id: str,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
):
    """
    Admin Endpoint: Delete document from Google Drive and Supabase.
    """
    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")
    
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)
        
    try:
        # 1. Fetch drive_file_id from Supabase
        document_row = await _get_document_row_for_admin(db, doc_id, admin_scope, "id,drive_file_id,university_id")
        drive_file_id = document_row['drive_file_id']

        linked_submission_res = await _execute_with_retry_async(
            lambda: db.table("lecturer_material_submissions")
            .select("id")
            .eq("pans_library_id", doc_id)
            .eq("status", "approved")
            .limit(1)
            .execute(),
            f"Check approved lecturer submission link for document {doc_id}",
        )
        if linked_submission_res.data:
            raise HTTPException(
                status_code=409,
                detail="This document is linked to an approved lecturer submission. Archive it instead. Hard deletion is reserved for controlled cleanup.",
            )

        # 2. Delete from Drive (with Retry & Graceful Degradation)
        drive_deletion_success = False
        drive_error_msg = None
        
        for attempt in range(3):
            try:
                drive_service.delete_file(drive_file_id)
                drive_deletion_success = True
                logger.info(f"[INFO] Drive file {drive_file_id} deleted successfully.")
                break
            except Exception as e:
                drive_error_msg = str(e)
                if "404" in drive_error_msg:
                    logger.info("Drive file already gone (404), proceeding.")
                    drive_deletion_success = True
                    break
                logger.warning(f"[WARNING] Drive delete failed (Attempt {attempt+1}/3): {e}")
                await asyncio.sleep(2)

        if not drive_deletion_success:
            logger.error(f"[ERROR] CRITICAL: Failed to delete Drive file {drive_file_id} after 3 attempts. Proceeding to clear DB.")
            # We explicitly do NOT raise an exception here. We want to clear the DB entry
            # so the user doesn't get stuck with a "ghost" document in their library.

        # 3. Delete embeddings from Supabase (Best Effort)
        try:
            await _execute_with_retry_async(
                lambda: db.table("document_embeddings").delete().eq("document_id", doc_id).execute(),
                f"Delete embeddings for document {doc_id}",
            )
        except Exception as e:
            logger.warning(f"Failed to delete embeddings: {e}")

        # 4. Delete from Supabase (Always proceed)
        try:
            await _execute_with_retry_async(
                lambda: db.table("pans_library").delete().eq("id", doc_id).execute(),
                f"Delete pans_library row for {doc_id}",
            )
        except Exception as e:
            logger.error(f"[ERROR] Database Delete Failed: {e}")
            raise HTTPException(status_code=500, detail="Unable to delete the document. Please try again.")

        if not drive_deletion_success:
             return {"message": "Document removed from database, but Drive file may require manual cleanup.", "warning": drive_error_msg}
             
        return {"message": "Document deleted successfully"}



    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete Operation Failed: {e}")
        raise HTTPException(status_code=500, detail="Unable to complete the delete operation. Please try again.")

@router.patch("/documents/{doc_id}", dependencies=[Depends(verify_api_key)])
async def admin_update_document(
    doc_id: str,
    updates: DocumentUpdate,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
):
    """
    Admin Endpoint: Update document metadata in Supabase.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

    try:
        raw_updates = updates.dict()
        provided_fields = getattr(updates, "model_fields_set", getattr(updates, "__fields_set__", set()))
        nullable_clear_fields = {"academic_session", "semester"}
        update_data = {
            k: v
            for k, v in raw_updates.items()
            if v is not None or (k in nullable_clear_fields and k in provided_fields)
        }
        if "material_status" in update_data:
            update_data["material_status"] = normalize_material_status(update_data.get("material_status"))
        if "semester" in update_data:
            update_data["semester"] = normalize_semester(update_data.get("semester"))
        if "academic_session" in update_data:
            update_data["academic_session"] = (update_data.get("academic_session") or "").strip() or None
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No updates provided")

        await _get_document_row_for_admin(db, doc_id, admin_scope, "id,university_id")

        logger.info(f"[INFO] Updating document {doc_id}: {update_data}")
        
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library").update(update_data).eq("id", doc_id).execute(),
            f"Update document metadata for {doc_id}",
        )
        
        if not response.data:
            logger.warning(f"Update returned no data for {doc_id}")
            
        return {"message": "Document updated successfully", "data": response.data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to update the document. Please try again.")

@router.post("/documents/{document_id}/cancel", dependencies=[Depends(verify_api_key)])
async def cancel_document_ingestion(
    document_id: str,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
):
    """
    Cancel an in-progress document ingestion.
    Adds the document_id to the cancellation registry — the embedding loop
    checks this on every chunk and stops cleanly when it sees the flag.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable.")
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

    # Verify document exists and is currently processing
    try:
        document_row = await _get_document_row_for_admin(db, document_id, admin_scope, "id,university_id,embedding_status,ingestion_run_id")
        status = document_row.get('embedding_status')
        if status != 'processing':
            return {"status": "skipped", "reason": f"Document is not processing (current status: {status})"}
        cancel_query = db.table("pans_library").update({
            "embedding_status": "failed",
            "embedding_error": "Cancelled by admin.",
            "ingestion_run_id": None,
            "ingestion_worker_id": None,
            "ingestion_worker_claimed_at": None,
            "ingestion_worker_heartbeat_at": None,
            "last_updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", document_id).eq("embedding_status", "processing")
        cancel_query = _apply_ingestion_run_filter(cancel_query, document_row.get("ingestion_run_id"))
        await _execute_with_retry_async(
            lambda: cancel_query.execute(),
            f"Invalidate ingestion run for cancelled document {document_id}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel ingestion check failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel ingestion.")

    _cancelled_ingestions.add(document_id)
    logger.info(f"[INFO] Admin requested cancellation for document {document_id}")
    return {"status": "cancellation_requested", "document_id": document_id}


@router.get("/documents/{document_id}/status", dependencies=[Depends(verify_api_key)])
async def get_document_status(
    document_id: str,
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
):
    """
    Get the real-time embedding status of a document.
    Frontend polls this to update progress bars.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)
    
    try:
        await _get_document_row_for_admin(db, document_id, admin_scope, "id,university_id")
        # [SECTION RETRY] Lightweight query for status fields only
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library")
            .select("embedding_status, embedding_progress, total_chunks, embedding_error, sections_status, sections_error")  # [SECTION RETRY]
            .eq("id", document_id)
            .execute(),
            f"Fetch document status for {document_id}",
        )
            
        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Document not found")
            
        data = response.data[0]
        status_value = data.get("embedding_status", "pending")
        progress_value = data.get("embedding_progress", 0)
        if status_value == "completed":
            progress_value = 100

        return {
            "status": status_value,
            "progress": progress_value,
            "total": data.get("total_chunks", 0),
            "error": data.get("embedding_error"),
            "sections_status": data.get("sections_status", "pending"),  # [SECTION RETRY]
            "sections_error": data.get("sections_error")  # [SECTION RETRY]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status Check Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to check upload status. Please try again.")


# [SECTION RETRY]
@router.post("/documents/{document_id}/retry-sections", dependencies=[Depends(verify_api_key)])  # [SECTION RETRY]
async def admin_retry_document_sections(  # [SECTION RETRY]
    document_id: str,  # [SECTION RETRY]
    university_id: Optional[str] = Query(None),  # [SECTION RETRY]
    current_user: User = Depends(get_current_admin),  # [SECTION RETRY]
):  # [SECTION RETRY]
    """
    [SECTION RETRY]
    Admin Endpoint: Regenerate document section outline without deleting or rebuilding embeddings.
    """
    db = _db_client()  # [SECTION RETRY]
    if not db:  # [SECTION RETRY]
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")  # [SECTION RETRY]
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)  # [SECTION RETRY]

    doc_row = await _get_document_row_for_admin(db, document_id, admin_scope, "id,university_id,embedding_status,sections_status")  # [SECTION RETRY]
    
    emb_status = (doc_row.get("embedding_status") or "").strip().lower()  # [SECTION RETRY]
    sec_status = (doc_row.get("sections_status") or "").strip().lower()  # [SECTION RETRY]

    if emb_status != "completed":  # [SECTION RETRY]
        raise HTTPException(  # [SECTION RETRY]
            status_code=400,  # [SECTION RETRY]
            detail="This document must finish AI indexing before its section outline can be regenerated."  # [SECTION RETRY]
        )  # [SECTION RETRY]

    if sec_status == "processing":  # [SECTION RETRY]
        raise HTTPException(  # [SECTION RETRY]
            status_code=409,  # [SECTION RETRY]
            detail="Section outline generation is already in progress for this document."  # [SECTION RETRY]
        )  # [SECTION RETRY]

    chunks_res = await _execute_with_retry_async(  # [SECTION RETRY]
        lambda: db.table("document_embeddings")  # [SECTION RETRY]
        .select("content, page_start, page_end")  # [SECTION RETRY]
        .eq("document_id", document_id)  # [SECTION RETRY]
        .order("id", desc=False)  # [SECTION RETRY]
        .execute(),  # [SECTION RETRY]
        f"Fetch document_embeddings for retry-sections {document_id}",  # [SECTION RETRY]
    )  # [SECTION RETRY]
    chunks_rows = chunks_res.data or []  # [SECTION RETRY]
    if not chunks_rows:  # [SECTION RETRY]
        raise HTTPException(  # [SECTION RETRY]
            status_code=400,  # [SECTION RETRY]
            detail="No processed content found for this document to generate sections."  # [SECTION RETRY]
        )  # [SECTION RETRY]

    page_tagged_chunks = [  # [SECTION RETRY]
        {  # [SECTION RETRY]
            "content": row.get("content", ""),  # [SECTION RETRY]
            "page_start": row.get("page_start") or 1,  # [SECTION RETRY]
            "page_end": row.get("page_end") or 1,  # [SECTION RETRY]
        }  # [SECTION RETRY]
        for row in chunks_rows  # [SECTION RETRY]
    ]  # [SECTION RETRY]

    new_run_id = str(uuid4())  # [SECTION RETRY]
    new_worker_id = str(uuid4())  # [SECTION RETRY]

    await _execute_with_retry_async(  # [SECTION RETRY]
        lambda: db.table("pans_library").update({  # [SECTION RETRY]
            "ingestion_run_id": new_run_id,  # [SECTION RETRY]
            "ingestion_worker_id": new_worker_id,  # [SECTION RETRY]
            "sections_status": "processing",  # [SECTION RETRY]
            "sections_error": None,  # [SECTION RETRY]
            "last_updated_at": datetime.now(timezone.utc).isoformat(),  # [SECTION RETRY]
        }).eq("id", document_id).execute(),  # [SECTION RETRY]
        f"Update ingestion tokens and sections_status for retry-sections {document_id}",  # [SECTION RETRY]
    )  # [SECTION RETRY]

    asyncio.create_task(  # [SECTION RETRY]
        generate_document_sections(  # [SECTION RETRY]
            document_id=document_id,  # [SECTION RETRY]
            page_tagged_chunks=page_tagged_chunks,  # [SECTION RETRY]
            ingestion_run_id=new_run_id,  # [SECTION RETRY]
            ingestion_worker_id=new_worker_id,  # [SECTION RETRY]
        )  # [SECTION RETRY]
    )  # [SECTION RETRY]

    return {  # [SECTION RETRY]
        "status": "processing",  # [SECTION RETRY]
        "sections_status": "processing",  # [SECTION RETRY]
        "sections_error": None,  # [SECTION RETRY]
        "document_id": document_id,  # [SECTION RETRY]
    }  # [SECTION RETRY]

# --- Smart Resume: Reading Progress Endpoints ---

@router.get("/documents/{document_id}/progress", dependencies=[Depends(verify_api_key)])
async def get_reading_progress(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Fetch the authenticated user's reading progress for a specific document.
    Returns current_page=1 and total_pages=0 if no progress record exists yet.
    Dual-protected: requires both x-api-key (gateway) and JWT (user identity).
    """
    if not supabase_service_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        await _assert_user_can_access_progress_document(supabase_service_client, current_user, document_id)
        response = await _execute_with_retry_async(
            lambda: supabase_service_client.table("document_progress")
                .select("current_page, total_pages")
                .eq("user_id", current_user.id)
                .eq("document_id", document_id)
                .execute(),
            f"Fetch reading progress for user={current_user.id} doc={document_id}",
        )

        if not response.data:
            # No record yet — return sensible defaults so frontend stays functional
            return {"current_page": 1, "total_pages": 0}

        record = response.data[0]
        return {
            "current_page": record.get("current_page", 1),
            "total_pages": record.get("total_pages", 0),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ERROR] Failed to fetch reading progress: {e}")
        raise HTTPException(status_code=500, detail="Unable to load your reading progress. Please try again.")


@router.post("/documents/{document_id}/progress", dependencies=[Depends(verify_api_key)])
async def upsert_reading_progress(
    document_id: str,
    body: ProgressUpsert,
    current_user: User = Depends(get_current_user),
):
    """
    Upsert the authenticated user's reading progress for a specific document.
    Uses Supabase upsert with on_conflict targeting the unique (user_id, document_id) index.
    Dual-protected: requires both x-api-key (gateway) and JWT (user identity).
    """
    if not supabase_service_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    if body.current_page < 1:
        raise HTTPException(status_code=422, detail="current_page must be >= 1")
    if body.total_pages < 1:
        raise HTTPException(status_code=422, detail="total_pages must be >= 1")

    try:
        await _assert_user_can_access_progress_document(supabase_service_client, current_user, document_id)
        await _execute_with_retry_async(
            lambda: supabase_service_client.table("document_progress")
                .upsert(
                    {
                        "user_id": current_user.id,
                        "document_id": document_id,
                        "current_page": body.current_page,
                        "total_pages": body.total_pages,
                    },
                    on_conflict="user_id,document_id",
                )
                .execute(),
            f"Upsert reading progress for user={current_user.id} doc={document_id}",
        )
        return {"ok": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ERROR] Failed to upsert reading progress: {e}")
        raise HTTPException(status_code=500, detail="Unable to save your reading progress. Please try again.")


@router.post("/documents/{doc_id}/reembed", dependencies=[Depends(verify_api_key)])
async def admin_reembed_document(
    doc_id: str,
    background_tasks: BackgroundTasks,
    allow_stale_processing_retry: bool = Query(False),
    university_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin),
):
    """
    Admin Endpoint: Re-trigger embedding for a document that has failed or partial chunks.
    Downloads the PDF from Google Drive and re-runs the full ingestion pipeline.
    Existing embeddings for this document are cleared first to avoid duplicates.
    """
    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")

    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    admin_scope = await resolve_admin_workspace_university(current_user, university_id)

    # 1. Fetch document metadata
    try:
        doc = await _get_document_row_for_admin(
            db,
            doc_id,
            admin_scope,
            "id,drive_file_id,file_name,embedding_status,university_id",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Unable to fetch document. Please try again.")

    if (doc.get("embedding_status") or "").strip().lower() == "processing" and not allow_stale_processing_retry:
        raise HTTPException(
            status_code=409,
            detail=PROCESSING_CONFLICT_DETAIL,
        )

    # 2. Download PDF from Google Drive
    try:
        file_content = await asyncio.to_thread(
            drive_service.download_file_bytes,
            doc["drive_file_id"]
        )
        if not file_content:
            raise ValueError("Downloaded file is empty")
    except Exception as e:
        logger.error(f"[ERROR] Failed to download {doc_id} from Drive: {e}")
        raise HTTPException(status_code=500, detail="Unable to download file from storage. Please try again.")

    # 3. Atomically clear embeddings and mark the document ready for one new worker.
    try:
        rpc_response = await _execute_with_retry_async(
            lambda: db.rpc(
                "prepare_document_reembed",
                {
                    "p_document_id": doc_id,
                    "p_allow_stale_processing_retry": allow_stale_processing_retry,
                },
            ).execute(),
            f"Prepare reembed for {doc_id}",
        )
        rpc_rows = rpc_response.data or []
        if not rpc_rows or not rpc_rows[0].get("should_queue_ingestion"):
            raise HTTPException(status_code=500, detail="Retry preparation did not return a queueable document")
        ingestion_run_id = str(rpc_rows[0].get("ingestion_run_id") or "").strip()
        if not ingestion_run_id:
            raise HTTPException(status_code=500, detail="Retry preparation did not return an ingestion run token")
    except HTTPException:
        raise
    except Exception as e:
        message = str(e)
        if "already being processed" in message:
            raise HTTPException(
                status_code=409,
                detail=PROCESSING_CONFLICT_DETAIL,
            )
        if "Document not found" in message:
            raise HTTPException(status_code=404, detail="Document not found")
        logger.error(f"[ERROR] Failed to prepare reembed for {doc_id}: {e}")
        raise HTTPException(status_code=500, detail="Unable to prepare document retry. Please try again.")

    # 4. Queue background reprocessing only after the atomic preparation succeeds.
    ingestion_worker_id = str(uuid4())
    background_tasks.add_task(
        process_document_background,
        file_content,
        doc_id,
        ingestion_run_id,
        ingestion_worker_id,
        doc.get("file_name", "document.pdf"),
    )

    logger.info(f"[INFO] Reembed queued for document {doc_id}")
    return {"message": "Re-embedding started", "document_id": doc_id, "status": "processing"}


# Function to set dependencies (called from main api.py)
def set_dependencies(drive_svc, supabase, api_key_verifier, folder_id, supabase_service=None):
    global drive_service, supabase_client, verify_api_key_handler, GOOGLE_DRIVE_FOLDER_ID, supabase_service_client
    drive_service = drive_svc
    supabase_client = supabase
    verify_api_key_handler = api_key_verifier
    GOOGLE_DRIVE_FOLDER_ID = folder_id
    supabase_service_client = supabase_service
    if supabase_service_client:
        logger.info("[INFO] Library router using service-role Supabase client for admin/background operations.")
    else:
        logger.warning("[WARNING] Library router running without service-role Supabase client; RLS may block some writes.")

# [GRACEFUL SHUTDOWN]
async def recover_orphaned_document_ingestions(sb) -> int:
    """
    On startup, query pans_library for any rows with embedding_status = 'processing'
    or sections_status = 'processing' where ingestion_worker_heartbeat_at (or
    ingestion_worker_claimed_at if heartbeat is null) is older than 10 minutes.
    Mark them as 'failed' with appropriate error message.
    """
    from datetime import timedelta
    try:
        res = await asyncio.to_thread(
            lambda: sb.table("pans_library")
            .select("id, embedding_status, sections_status, ingestion_worker_heartbeat_at, ingestion_worker_claimed_at, last_updated_at")
            .or_("embedding_status.eq.processing,sections_status.eq.processing")
            .execute()
        )
        processing_docs = res.data or []
        if not processing_docs:
            return 0
        
        stale_embeddings = []
        stale_sections = []
        now_dt = datetime.now(timezone.utc)
        ten_mins = timedelta(minutes=10)
        
        for doc in processing_docs:
            heartbeat_str = doc.get("ingestion_worker_heartbeat_at")
            claimed_str = doc.get("ingestion_worker_claimed_at")
            updated_str = doc.get("last_updated_at")
            
            ref_str = heartbeat_str or claimed_str or updated_str
            is_stale = False
            if ref_str:
                try:
                    ref_dt = datetime.fromisoformat(ref_str.replace("Z", "+00:00"))
                    if now_dt - ref_dt > ten_mins:
                        is_stale = True
                except Exception:
                    is_stale = True
            else:
                is_stale = True
                
            if is_stale:
                if doc.get("embedding_status") == "processing":
                    stale_embeddings.append(doc["id"])
                if doc.get("sections_status") == "processing":
                    stale_sections.append(doc["id"])
                
        recovered_count = 0
        if stale_embeddings:
            update_res = await asyncio.to_thread(
                lambda: sb.table("pans_library")
                .update({
                    "embedding_status": "failed",
                    "embedding_error": "Interrupted by server restart",
                    "last_updated_at": now_dt.isoformat(),
                })
                .in_("id", stale_embeddings)
                .execute()
            )
            recovered_count += len(update_res.data or [])
            
        if stale_sections:
            update_res = await asyncio.to_thread(
                lambda: sb.table("pans_library")
                .update({
                    "sections_status": "failed",
                    "sections_error": "Interrupted by server restart",
                    "last_updated_at": now_dt.isoformat(),
                })
                .in_("id", stale_sections)
                .execute()
            )
            recovered_count += len(update_res.data or [])
            
        if recovered_count > 0:
            logger.info(f"[GRACEFUL SHUTDOWN] Recovered {recovered_count} stale document ingestion phases.")
        return recovered_count
    except Exception as exc:
        logger.error(f"[GRACEFUL SHUTDOWN] Failed to recover stale document ingestions: {exc}")
        return 0
