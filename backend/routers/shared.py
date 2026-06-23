"""
Chat Router: AI Conversation Endpoint with RAG Support
Handles AI-powered chat interactions using Groq with vector search.
"""
from fastapi import APIRouter, HTTPException, Depends, Header, File, UploadFile, Request, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, field_validator
from typing import Any, AsyncIterator, List, Optional, Literal
import logging
import os
import asyncio
import tempfile
import re
import google.generativeai as genai
from cachetools import TTLCache
import time
import uuid
import json
import csv
import io
from datetime import datetime, timezone, timedelta
from services import llm_engine, chat_history
from services import web_search
from groq import AsyncGroq
from dependencies import (
    get_current_user,
    require_super_admin_role,
    User,
    UNIVERSITY_SUSPENDED_MESSAGE,
)
from restrictions import build_university_candidates, normalize_university_name

logger = logging.getLogger("PansGPT")
RAG_NETWORK_TIMEOUT_MESSAGE = (
    "Network timeout. Please check your internet connection, or try disabling your VPN/Firewall if you are using one."
)
# RAG similarity threshold  tune this value if RAG returns too many or too few results.
# Lower = more results but less relevant. Higher = fewer but more precise.
# Default is 0.65. Override via environment variable RAG_MATCH_THRESHOLD.
RAG_MATCH_THRESHOLD = float(os.getenv("RAG_MATCH_THRESHOLD", "0.65"))


try:
    import grpc  # type: ignore
except ImportError:
    grpc = None


# These will be injected from main api.py
supabase_client = None
supabase_service_client = None
verify_api_key_handler = None
groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None
if groq_client is None:
    logger.warning("GROQ_API_KEY not set! /transcribe endpoint will be unavailable.")

GRACEFUL_ASSISTANT_ERROR_PAYLOAD = {
    "role": "assistant",
    "content": "I encountered an error doing what you asked. Could you check your internet connection and try again?"
}
STOPPED_ASSISTANT_NOTE = "You stopped this response"


def _clean_generated_title(raw_title: str) -> str:
    """
    Normalize model output into a single-line title.
    """
    title = (raw_title or "")
    # Strip <thought> and <think> blocks and contents
    title = re.sub(r"<thought>.*?</thought>", "", title, flags=re.IGNORECASE | re.DOTALL)
    title = re.sub(r"<think>.*?</think>", "", title, flags=re.IGNORECASE | re.DOTALL)
    title = re.sub(r"<thought>.*", "", title, flags=re.IGNORECASE | re.DOTALL)
    title = re.sub(r"<think>.*", "", title, flags=re.IGNORECASE | re.DOTALL)
    
    title = title.strip().strip('"').strip("'")
    title = re.sub(r"[\r\n\t]+", " ", title)
    title = re.sub(r"\s{2,}", " ", title).strip()
    return title


def _is_generic_title(title: str) -> bool:
    """
    Heuristic guard to catch bland auto-titles.
    """
    cleaned = _clean_generated_title(title)
    if not cleaned:
        return True

    lower = cleaned.lower()
    generic_phrases = {
        "new chat",
        "chat",
        "discussion",
        "general help",
        "help",
        "question",
        "questions",
        "pharmacy question",
        "study help",
        "conversation",
        "untitled",
    }
    if lower in generic_phrases:
        return True

    words = [w for w in re.split(r"\s+", lower) if w]
    if len(words) < 1:
        return True

    weak_words = {
        "chat", "discussion", "help", "question", "questions", "about",
        "topic", "general", "new", "conversation", "session"
    }
    meaningful = [w for w in words if w not in weak_words]
    if len(meaningful) < 1:
        return True

    return False

async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected endpoints.
    """
    if verify_api_key_handler is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return await verify_api_key_handler(x_api_key)

def _is_retryable_network_error(exc: Exception) -> bool:
    """
    Return True for transient SSL/timeout/connection failures that should be retried.
    """
    msg = str(exc).lower()
    retry_markers = (
        "timed out",
        "timeout",
        "the handshake operation timed out",
        "the read operation timed out",
        "_ssl.c",
        "ssl",
        # httpx.RemoteProtocolError raised when the server closes the connection
        # mid-request (common after SSE client disconnects reset the connection pool)
        "server disconnected",
        "remote protocol error",
        "connection reset",
        "peer closed",
        "broken pipe",
    )
    return any(marker in msg for marker in retry_markers)


def _is_rag_network_timeout_error(exc: Exception) -> bool:
    """
    Detect timeout/network/gRPC-unavailable failures that should surface a user-friendly message.
    """
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True

    # Match common gRPC 503 / transport timeout signatures.
    msg = str(exc).lower()
    network_markers = (
        "503",
        "tcp stream",
        "service unavailable",
        "statuscode.unavailable",
        "deadline exceeded",
        "timed out",
        "timeout",
        "connection reset",
    )
    if any(marker in msg for marker in network_markers):
        return True

    # If grpc is available, include RpcError type checks.
    if grpc is not None:
        try:
            if isinstance(exc, grpc.RpcError):
                return True
        except Exception:
            pass

    return False


async def _execute_with_retry(execute_fn, operation_name: str, max_attempts: int = 3):
    """
    Retry transient Supabase calls that fail due to timeout/SSL/network jitter.
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await asyncio.to_thread(execute_fn)
        except Exception as e:
            last_error = e
            if attempt < max_attempts and _is_retryable_network_error(e):
                logger.warning(
                    f"{operation_name} failed (attempt {attempt}/{max_attempts}), retrying: {e}"
                )
                await asyncio.sleep(1)
                continue
            raise
    raise last_error

async def _assert_session_owner(session_id: str, current_user: User):
    """
    Strict ownership check used before any chat-message mutation.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    session_res = await _execute_with_retry(
        lambda: supabase_client.table("chat_sessions").select("id").eq("id", session_id).eq("user_id", current_user.id).execute(),
        "Assert session ownership",
    )
    if not session_res.data:
        raise HTTPException(status_code=403, detail="Unauthorized")


async def _assert_super_admin(current_user: User):
    await require_super_admin_role(current_user)

# Settings Cache (TTL = 5 minutes)
_settings_cache = TTLCache(maxsize=1, ttl=300)
_faculty_cache = TTLCache(maxsize=10, ttl=300)
_timetable_cache = TTLCache(maxsize=10, ttl=300)
_profile_cache = TTLCache(maxsize=100, ttl=300)
_student_scope_cache = TTLCache(maxsize=100, ttl=300)
_drive_metadata_cache = TTLCache(maxsize=200, ttl=7200)
_academic_context_cache = TTLCache(maxsize=100, ttl=300)

def invalidate_settings_cache() -> None:
    """
    Clear cached system settings so prompt/temperature changes apply immediately.
    """
    _settings_cache.clear()
    logger.info("System settings cache invalidated")


def invalidate_academic_context_cache(university_id: Optional[str] = None) -> None:
    if university_id:
        _academic_context_cache.pop(university_id, None)
    else:
        _academic_context_cache.clear()

async def get_cached_settings():
    """
    Fetch system settings with 5-minute cache to reduce DB queries.
    """
    cache_key = "system_settings"
    if cache_key in _settings_cache:
        return _settings_cache[cache_key]
    
    sb = supabase_service_client or supabase_client
    if not sb:
        return None
    
    try:
        res = await _execute_with_retry(
            lambda: sb.table("system_settings").select("system_prompt, temperature, rag_threshold").eq("id", 1).execute(),
            "Fetch cached system settings",
        )
        if res.data and len(res.data) > 0:
            _settings_cache[cache_key] = res.data[0]
            logger.info("System settings refreshed from database")
            return res.data[0]
    except Exception as e:
        logger.warning(f"Could not fetch settings: {e}")
    
    return None


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


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


async def get_current_academic_context(university_id: Optional[str]) -> Optional[dict]:
    normalized_university_id = _normalize_optional_text(university_id)
    if not normalized_university_id:
        return None

    if normalized_university_id in _academic_context_cache:
        return _academic_context_cache[normalized_university_id]

    sb = supabase_service_client or supabase_client
    if not sb:
        return None

    try:
        res = await _execute_with_retry(
            lambda: sb.table("academic_contexts")
            .select("id,university_id,current_academic_session,current_semester,updated_at,updated_by")
            .eq("university_id", normalized_university_id)
            .limit(1)
            .execute(),
            "Fetch current academic context",
        )
        row = (res.data or [None])[0]
        if not row:
            return None
        context = {
            "id": row.get("id"),
            "university_id": row.get("university_id"),
            "current_academic_session": row.get("current_academic_session"),
            "current_semester": normalize_semester(row.get("current_semester")),
            "updated_at": row.get("updated_at"),
            "updated_by": row.get("updated_by"),
        }
        _academic_context_cache[normalized_university_id] = context
        return context
    except Exception as exc:
        logger.warning("Could not fetch academic context for university_id=%s: %s", normalized_university_id, exc)
        return None


def _level_candidates(level: str) -> set[str]:
    raw = (level or "").strip()
    if not raw:
        return set()
    candidates = {raw, raw.lower()}
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        candidates.update({digits, f"{digits}lvl", f"{digits}l", f"{digits} level"})
    return {c.strip().lower() for c in candidates if c.strip()}


def _doc_matches_level(target_levels, user_level: str) -> bool:
    user_tokens = _level_candidates(user_level)
    if not user_tokens:
        return False

    if isinstance(target_levels, str):
        levels = [target_levels]
    elif isinstance(target_levels, list):
        levels = [str(item) for item in target_levels]
    else:
        levels = []

    if not levels:
        return False

    doc_tokens = set()
    for lvl in levels:
        token = str(lvl or "").strip().lower()
        if not token:
            continue
        doc_tokens.add(token)
        digits = "".join(ch for ch in token if ch.isdigit())
        if digits:
            doc_tokens.update({digits, f"{digits}lvl", f"{digits}l", f"{digits} level"})

    return bool(user_tokens.intersection(doc_tokens))


def _is_ai_retrievable_document(document_row: Optional[dict]) -> bool:
    if not document_row:
        return False
    embedding_status = str(document_row.get("embedding_status") or "").strip().lower()
    material_status = str(document_row.get("material_status") or "").strip().lower()
    return (
        embedding_status == "completed"
        and material_status == "active"
    )


async def _resolve_university_by_text(sb, university_text: Optional[str]) -> Optional[dict]:
    candidates = build_university_candidates(university_text)
    if not candidates:
        return None

    res = await _execute_with_retry(
        lambda: sb.table("universities").select("id,name,short_name,status").execute(),
        "Resolve university by text",
    )
    candidate_set = set(candidates)
    matches = [
        row for row in (res.data or [])
        if normalize_university_name(row.get("name")) in candidate_set
        or normalize_university_name(row.get("short_name")) in candidate_set
    ]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        logger.warning("Ambiguous university text match for profile university='%s'", university_text)
    return None


async def resolve_student_university_context(current_user: User, *, persist_resolution: bool = True) -> dict:
    cache_key = current_user.id

    sb = supabase_service_client or supabase_client
    if not sb:
        return {
            "profile": None,
            "university_id": None,
            "university_name": None,
            "level": "",
        }

    profile_res = await _execute_with_retry(
        lambda: sb.table("profiles")
        .select("id,first_name,other_names,level,university,university_id")
        .eq("id", current_user.id)
        .limit(1)
        .execute(),
        "Fetch student university context",
    )
    profile = (profile_res.data or [None])[0] or {}
    explicit_university_id = _normalize_optional_text(profile.get("university_id"))
    university_name = _normalize_optional_text(profile.get("university"))
    resolved_university_id = explicit_university_id

    if explicit_university_id:
        university_res = await _execute_with_retry(
            lambda: sb.table("universities")
            .select("id,name,status")
            .eq("id", explicit_university_id)
            .limit(1)
            .execute(),
            "Validate student university_id",
        )
        university_row = (university_res.data or [None])[0]
        university_status = (university_row.get("status") or "").strip().lower() if university_row else None
        if university_status == "suspended":
            _student_scope_cache.pop(cache_key, None)
            raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)
        if university_row and university_status == "active":
            university_name = _normalize_optional_text(university_row.get("name")) or university_name
        else:
            logger.warning("Student user_id=%s has missing or inactive university_id=%s", current_user.id, explicit_university_id)
            resolved_university_id = None
    elif university_name:
        matched_university = await _resolve_university_by_text(sb, university_name)
        if matched_university:
            university_status = (matched_university.get("status") or "").strip().lower()
            if university_status == "suspended":
                _student_scope_cache.pop(cache_key, None)
                raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)
            if university_status != "active":
                logger.info("Student user_id=%s matched non-active university by text", current_user.id)
            else:
                resolved_university_id = _normalize_optional_text(matched_university.get("id"))
                university_name = _normalize_optional_text(matched_university.get("name")) or university_name
            if persist_resolution and resolved_university_id:
                try:
                    await _execute_with_retry(
                        lambda: sb.table("profiles")
                        .update({"university_id": resolved_university_id, "university": university_name})
                        .eq("id", current_user.id)
                        .execute(),
                        "Persist resolved student university_id",
                    )
                    profile["university_id"] = resolved_university_id
                    profile["university"] = university_name
                except Exception as exc:
                    logger.warning("Could not persist resolved university_id for user_id=%s: %s", current_user.id, exc)
        else:
            logger.info("Student user_id=%s has no safely resolvable university_id", current_user.id)

    result = {
        "profile": profile or None,
        "university_id": resolved_university_id,
        "university_name": university_name,
        "level": _normalize_optional_text(profile.get("level")) or "",
    }
    _student_scope_cache[cache_key] = result
    return result

async def get_cached_faculty_knowledge(level: str, current_user: Optional[User] = None) -> str:
    """
    Fetch faculty knowledge for a specific level and university with 5-minute cache.
    """
    normalized_level = (level or "Unknown").strip() or "Unknown"
    if current_user is None:
        return ""

    student_context = await resolve_student_university_context(current_user)
    university_id = student_context.get("university_id")
    if not university_id:
        logger.info("Skipping faculty knowledge injection for user_id=%s because university_id is missing", current_user.id)
        return ""

    cache_key = f"{university_id}:{normalized_level.lower()}"
    if cache_key in _faculty_cache:
        return _faculty_cache[cache_key]

    sb = supabase_service_client or supabase_client
    if not sb:
        return ""

    try:
        res = await _execute_with_retry(
            lambda: sb.table("faculty_knowledge")
            .select("id,level,knowledge_text")
            .eq("university_id", university_id)
            .execute(),
            "Fetch university-scoped faculty knowledge",
        )
        rows = res.data or []

        rows_by_level = {}
        for row in rows:
            lvl = (row.get("level") or "").strip().lower()
            if lvl:
                rows_by_level[lvl] = row
                digits = "".join(filter(str.isdigit, lvl))
                if digits:
                    rows_by_level[digits] = row

        user_lvl_raw = normalized_level.lower()
        user_lvl_digits = "".join(filter(str.isdigit, user_lvl_raw))
        level_row = rows_by_level.get(user_lvl_raw)
        if not level_row and user_lvl_digits:
            level_row = rows_by_level.get(user_lvl_digits)

        combined = (level_row.get("knowledge_text") or "").strip() if level_row else ""
        _faculty_cache[cache_key] = combined
        return combined
    except Exception as e:
        logger.warning(f"Could not fetch faculty knowledge for university_id='{university_id}' level '{normalized_level}': {e}")
        return ""

async def get_cached_student_timetable(level: str, current_user: Optional[User] = None) -> str:
    normalized_level = (level or "Unknown").strip() or "Unknown"
    if current_user is None:
        return ""

    student_context = await resolve_student_university_context(current_user)
    university_id = student_context.get("university_id")
    if not university_id:
        logger.info("Skipping timetable injection for user_id=%s because university_id is missing", current_user.id)
        return ""

    cache_key = f"{university_id}:{normalized_level.lower()}"
    if cache_key in _timetable_cache:
        return _timetable_cache[cache_key]

    sb = supabase_service_client or supabase_client
    if not sb:
        return ""

    try:
        user_lvl_digits = "".join(filter(str.isdigit, normalized_level))
        if not user_lvl_digits:
            return ""

        # Fetch all classes for this level
        res = await _execute_with_retry(
            lambda: sb.table("timetables")
            .select("*")
            .eq("university_id", university_id)
            .ilike("level", f"%{user_lvl_digits}%")
            .order("start_time")
            .execute(),
            "Fetch university-scoped student timetable for LLM",
        )
        rows = res.data or []
        if not rows:
            return ""

        # Group the classes by Day of the week
        schedule = {"Monday": [], "Tuesday": [], "Wednesday": [], "Thursday": [], "Friday": [], "Saturday": [], "Sunday": []}
        for r in rows:
            day = (r.get("day") or "").strip().capitalize()
            time_slot = (r.get("time_slot") or "").strip()
            start_time = str(r.get("start_time") or "").strip()
            course_code = (r.get("course_code") or "").strip()
            course_title = (r.get("course_title") or "").strip()
            
            if day in schedule:
                # Force an exact, machine-readable format so the LLM doesn't guess
                schedule[day].append(f"  * [Time: {time_slot}] (Start: {start_time}) -> {course_code}: {course_title}")

        # Build the final string
        output = []
        for d, classes in schedule.items():
            if classes:
                output.append(f"{d}:\n" + "\n".join(classes))

        combined = "\n\n".join(output)
        _timetable_cache[cache_key] = combined
        return combined

    except Exception as e:
        logger.warning(f"Could not fetch timetable for LLM (university_id '{university_id}', level '{normalized_level}'): {e}")
        return ""

# --- Models ---
class Message(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class ChatRequest(BaseModel):
    text: str
    mode: str  # 'explain', 'example', 'memory', 'chat'
    context: Optional[str] = None
    messages: Optional[List[Message]] = []
    document_id: Optional[str] = None  # For RAG: restricts search to specific PDF
    academic_session: Optional[str] = None
    semester: Optional[str] = None
    image: Optional[str] = None      # Base64 image string for DB storage
    images: Optional[List[str]] = []    # New: multiple images
    system_instruction: Optional[str] = None # For decoupled prompt logic (hidden instructions)
    session_id: Optional[str] = None # For history persistence
    is_retry: bool = False  # If True, skip saving user message (already in DB from failed attempt)
    web_search: bool = False  # If True, augment response with live Tavily web search results
    thinking_mode: bool = False  # If True, strip+stream thinking tokens via ThinkingStreamParser

    @field_validator('text', mode='before')  # changed: strip HTML tags, null bytes, enforce 4000-char limit
    @classmethod
    def sanitize_text_field(cls, v: str) -> str:
        import re, html as _h
        if not v:
            return ''
        v = _h.unescape(str(v))
        v = re.sub(r'<[^>]+>', '', v)
        v = v.replace('\x00', '')
        return v.strip()[:4000]

    @field_validator('semester', mode='before')
    @classmethod
    def normalize_semester_field(cls, v: Optional[str]) -> Optional[str]:
        return normalize_semester(v)

class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"
    context_id: Optional[str] = None

class ChatSession(BaseModel):
    id: str
    title: str
    context_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    search_preview: Optional[str] = None
    search_match_source: Optional[str] = None

class CreateSessionResponse(BaseModel):
    id: str
    title: str
    context_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class FeedbackRequest(BaseModel):
    message_id: Optional[int] = None
    session_id: Optional[str] = None
    rating: Literal["up", "down", "report"]
    category: Optional[str] = None
    comments: Optional[str] = None

class FacultyKnowledgeCreateRequest(BaseModel):
    level: str
    knowledge_text: str
    university_id: Optional[str] = None

class FacultyKnowledgeUpdateRequest(BaseModel):
    level: Optional[str] = None
    knowledge_text: Optional[str] = None
    university_id: Optional[str] = None

class TimetableUpdateRequest(BaseModel):
    day: Optional[str] = None
    time_slot: Optional[str] = None
    start_time: Optional[str] = None
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    university_id: Optional[str] = None

# Function to set dependencies (called from main api.py)

PHARMACY_SYSTEM_PROMPT = """
You are PansGPT, an expert Pharmacy Tutor and Study Assistant.
Your Goal: Help pharmacy students understand complex concepts, drugs, and mechanisms clearly.

Guidelines:
Tone: Professional, encouraging, and academic but accessible.
Emoji Use: Strictly Minimal. Use max 1 emoji per response, and only if it acts as a helpful visual bullet point. Do not use emojis in every sentence.
Accuracy: Prioritize clinical accuracy. If a concept has exceptions (e.g., side effects), mention them briefly.
Formatting: Use Markdown (bolding, lists) to break up walls of text.
Greetings: Do NOT greet the user first. Jump straight into answering their query. Only greet back if the user explicitly greets you (e.g., "hi", "hello", "good morning").
"""



# --- Helper Functions ---
def contains_image(messages: List[dict]) -> bool:
    """
    Checks if any message in the list contains an image (base64 or URL).
    """
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and (block.get("type") == "image_url" or "image" in block):
                    return True
    return False

def merge_system_into_user(messages: List[dict]) -> List[dict]:
    """
    Merges all 'system' role messages into the first 'user' role message.
    Required for Google AI Studio's OpenAI-compatible endpoint which rejects 'system' roles.
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
    full_system_prompt = f"SYSTEM INSTRUCTIONS:\n{full_system_prompt}\n\nUSER REQUEST:\n"
    
    # 2. Prepend to first user message
    for msg in cleaned_messages:
        if msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, str):
                msg["content"] = full_system_prompt + content
            elif isinstance(content, list):
                # Multimodal content list -> insert text block at start
                content.insert(0, {"type": "text", "text": full_system_prompt})
            break
            
    return cleaned_messages


async def _build_student_profile_text(current_user: User) -> tuple[str, str]:
    """
    Build a compact student profile block for system-prompt personalization.
    """
    cache_key = current_user.id

    first_name = ""
    other_names = ""
    level = ""
    university = ""
    try:
        student_context = await resolve_student_university_context(current_user)
        profile = student_context.get("profile") or {}
        first_name = (profile.get("first_name") or "").strip()
        other_names = (profile.get("other_names") or "").strip()
        level = (student_context.get("level") or "").strip()
        university = (student_context.get("university_name") or profile.get("university") or "").strip()
    except HTTPException:
        raise
    except Exception as profile_err:
        logger.warning(f"Could not fetch user profile context: {profile_err}")

    full_name = " ".join(part for part in [first_name, other_names] if part).strip() or "Student"
    student_level = level or "Unknown"
    profile_text = (
        f"Name: {full_name}\n"
        f"Level: {student_level}\n"
        f"University: {university or 'Unknown'}"
    )
    if not university:
        profile_text += (
            "\nUniversity Scope Status: Missing. University-specific document retrieval, faculty knowledge, "
            "and timetable context are unavailable until the student completes their profile university."
        )
    result = (profile_text, student_level)
    if first_name or other_names or level or university:
        _profile_cache[cache_key] = result
    return result



async def get_relevant_context(
    user_question: str,
    document_id: Optional[str] = None,
    user_level: Optional[str] = None,
    current_user: Optional[User] = None,
    academic_session: Optional[str] = None,
    semester: Optional[str] = None,
    rag_match_count: Optional[int] = None,  # [AGENTIC LAYER] — planner-supplied chunk count overrides heuristic
    *,
    _out_rpc_rows: Optional[list] = None,
) -> tuple[str, list[dict]]:
    """
    RAG Helper: Embed user question and retrieve relevant chunks via vector search.
    
    Args:
        user_question: The user's question/text
        document_id: Drive file ID or Supabase UUID of the PDF (Local RAG)
        user_level: Student level for Global RAG filtering
        
    Returns:
        Tuple of:
        - context text containing concatenated relevant chunks
        - citations list: [{"title": str, "course": str, "lecturer": str}, ...]
    """
    if not user_question or not str(user_question).strip():
        logger.info("Empty text query (likely image only), skipping vector search.")
        return "", []

    if not supabase_client:
        logger.warning("Supabase not available for RAG")
        return "", []

    student_university_id = None
    resolved_level = (user_level or "").strip()
    requested_academic_session = _normalize_optional_text(academic_session)
    requested_semester = normalize_semester(semester)
    context_filter_source = "request" if (requested_academic_session or requested_semester) else None
    if current_user is not None:
        student_context = await resolve_student_university_context(current_user)
        student_university_id = student_context.get("university_id")
        if not resolved_level:
            resolved_level = (student_context.get("level") or "").strip()

    try:
        # Step 1: Embed the user's question using Gemini
        # CRITICAL: Must match ingestion settings (model, dimensions)
        embed_result = await asyncio.to_thread(
            genai.embed_content,
            model="models/gemini-embedding-001",
            content=user_question,
            task_type="retrieval_query",
            output_dimensionality=768,
        )
        query_vector = embed_result['embedding']
        logger.info(f"Embedded query: {len(query_vector)} dimensions")

        # Fetch dynamic settings for threshold
        settings = await get_cached_settings()
        match_threshold = float(settings.get("rag_threshold", 0.50)) if settings and settings.get("rag_threshold") is not None else float(os.getenv("RAG_MATCH_THRESHOLD", "0.50"))

        # [AGENTIC LAYER - superseded] Detect broad/listing queries — kept as fallback when no planner count provided
        _BROAD_QUERY_KEYWORDS = {
            "list all", "list the", "what are all", "what topics", "what does this cover",
            "what is covered", "how many groups", "how many topics", "how many sections",
            "all topics", "all groups", "all sections", "all chapters",
            "complete list", "full list", "entire list",
            "what groups", "who presented", "summarize the material",
            "overview of this", "outline of this", "contents of this",
        }
        question_lower = user_question.lower()
        is_broad_query = any(kw in question_lower for kw in _BROAD_QUERY_KEYWORDS)
        # [AGENTIC LAYER] — use planner-supplied count if provided; fall back to broad-query heuristic
        if rag_match_count is not None:  # [AGENTIC LAYER]
            _resolved_match_count = rag_match_count  # [AGENTIC LAYER]
        else:  # [AGENTIC LAYER]
            _resolved_match_count = 20 if is_broad_query else 4  # [AGENTIC LAYER - superseded heuristic]
        rag_match_count = _resolved_match_count  # [AGENTIC LAYER]
        rag_threshold = 0.25 if is_broad_query else match_threshold

        # ----------------------------
        # Branch A: Local RAG (Study Mode) - keep existing behavior
        # ----------------------------
        if document_id:
            if not student_university_id:
                logger.info("Skipping study-mode retrieval for user_id=%s because university_id is missing", getattr(current_user, "id", "unknown"))
                return "", []

            # Step 0: Convert Drive file ID to Supabase UUID if needed
            # The frontend sends drive_file_id, but we need the pans_library.id (UUID)
            supabase_doc_id = document_id
            doc_metadata = None

            # Check if this is a valid UUID format (UUIDs are 36 chars with 4 hyphens)
            # Drive IDs are typically not valid UUIDs (longer, different format)
            try:
                import uuid
                uuid.UUID(document_id)
                # Valid UUID - use it directly and fetch metadata
                logger.info(f"Using UUID directly: {document_id}")
                try:
                    meta_response = await _execute_with_retry(
                        lambda: supabase_client.table("pans_library")
                        .select("id,file_name,topic,lecturer_name,course_code,university_id,embedding_status,material_status")
                        .eq("id", document_id)
                        .execute(),
                        "Fetch document metadata by UUID",
                    )
                    if meta_response.data and len(meta_response.data) > 0:
                        doc_metadata = meta_response.data[0]
                except Exception as meta_err:
                    logger.warning(f"Could not fetch metadata: {meta_err}")
            except (ValueError, AttributeError):
                # Not a UUID - must be a Drive file ID, lookup the Supabase UUID and metadata
                if document_id in _drive_metadata_cache:
                    cached_data = _drive_metadata_cache[document_id]
                    supabase_doc_id = cached_data['id']
                    doc_metadata = cached_data
                    logger.info(f"Using cached Drive ID to UUID metadata: {supabase_doc_id}")
                else:
                    try:
                        doc_response = await _execute_with_retry(
                            lambda: supabase_client.table("pans_library")
                            .select("id,file_name,topic,lecturer_name,course_code,university_id,embedding_status,material_status")
                            .eq("drive_file_id", document_id)
                            .execute(),
                            "Fetch document metadata by Drive ID",
                        )
                        if doc_response.data and len(doc_response.data) > 0:
                            supabase_doc_id = doc_response.data[0]['id']
                            doc_metadata = doc_response.data[0]
                            _drive_metadata_cache[document_id] = doc_metadata
                            logger.info(f"Converted Drive ID to UUID: {supabase_doc_id}")
                        else:
                            logger.warning(f"No document found for Drive ID: {document_id}")
                            return "", []
                    except Exception as lookup_err:
                        logger.error(f"Document ID lookup failed: {lookup_err}")
                        return "", []

            if not doc_metadata:
                logger.info("Skipping study-mode retrieval because document metadata could not be resolved for document_id=%s", document_id)
                return "", []
            if (doc_metadata.get("university_id") or None) != student_university_id:
                logger.warning(
                    "Skipping study-mode retrieval for user_id=%s document_id=%s because document university_id=%s does not match user university_id=%s",
                    getattr(current_user, "id", "unknown"),
                    doc_metadata.get("id") or document_id,
                    doc_metadata.get("university_id"),
                    student_university_id,
                )
                return "", []
            if not _is_ai_retrievable_document(doc_metadata):
                logger.info(
                    "Skipping study-mode retrieval for document_id=%s because document is not AI-retrievable (embedding/material state)",
                    doc_metadata.get("id") or document_id,
                )
                return "", []

            # Step 2: Retrieve chunks
            # For broad/listing queries in study mode: fetch ALL chunks for this document
            # This is the key difference from normal RAG — we don't filter by similarity,
            # we get everything so the AI can do exhaustive listing (like Gemini/Claude do
            # with full context window ingestion).
            if is_broad_query:
                logger.info(f"Broad query detected in study mode — fetching ALL chunks for doc '{supabase_doc_id}'")
                all_chunks_response = await _execute_with_retry(
                    lambda: supabase_client.table("document_embeddings")
                        .select("id, content")
                        .eq("document_id", supabase_doc_id)
                        .order("id", desc=False)
                        .execute(),
                    "Fetch all document chunks for broad query",
                )
                raw_chunks = all_chunks_response.data or []
                # Sample evenly across the full document so no section is missed
                # 40 samples × 80 chars = ~3200 chars = ~800 tokens — well under free tier
                total = len(raw_chunks)
                if total <= 40:
                    sampled = raw_chunks
                else:
                    step = total / 40
                    sampled = [raw_chunks[int(i * step)] for i in range(40)]
                condensed_chunks = [
                    {**row, 'content': (row.get('content') or '')[:80]}
                    for row in sampled
                ]
                class _MergedResponse:
                    def __init__(self, data): self.data = data
                response = _MergedResponse(condensed_chunks)
                logger.info(f"Fetched {len(condensed_chunks)} condensed chunks for exhaustive listing")
                if _out_rpc_rows is not None:
                    _out_rpc_rows.extend(condensed_chunks)
            else:
                # Normal focused query — use vector similarity search
                response = await _execute_with_retry(
                    lambda: supabase_client.rpc(
                        'match_documents',
                        {
                            'query_embedding': query_vector,
                            'match_threshold': rag_threshold,
                            'match_count': rag_match_count,
                            'filter_doc_id': supabase_doc_id
                        }
                    ).execute(),
                    "Match document embeddings",
                )
                if _out_rpc_rows is not None:
                    _out_rpc_rows.extend(response.data or [])

            # Step 3: Build enhanced context with metadata + chunks
            context_parts = []

            # Add document metadata at the top
            if doc_metadata:
                metadata_text = "DOCUMENT INFORMATION:\n"
                if doc_metadata.get('file_name'):
                    metadata_text += f"Title: {doc_metadata['file_name']}\n"
                if doc_metadata.get('topic'):
                    metadata_text += f"Topic: {doc_metadata['topic']}\n"
                if doc_metadata.get('lecturer_name'):
                    metadata_text += f"Lecturer: {doc_metadata['lecturer_name']}\n"
                if doc_metadata.get('course_code'):
                    metadata_text += f"Course Code: {doc_metadata['course_code']}\n"
                context_parts.append(metadata_text)

            # Add retrieved chunks
            if not response.data or len(response.data) == 0:
                logger.warning(
                    f"RAG returned no chunks for local document '{supabase_doc_id}'. "
                    f"Query: '{user_question[:80]}...' | Threshold: {match_threshold}"
                )
                # --- TEXT SEARCH FALLBACK ---
                # Vector similarity found nothing. Try keyword search on chunk content.
                # Extracts meaningful words from the query and searches for them directly.
                fallback_chunks = []
                try:
                    # Build keyword list — strip common stop words, keep meaningful terms
                    _STOP_WORDS = {
                        "a","an","the","is","are","was","were","be","been","being",
                        "have","has","had","do","does","did","will","would","could",
                        "should","may","might","shall","can","need","dare","ought",
                        "what","which","who","whom","whose","when","where","why","how",
                        "this","that","these","those","i","you","he","she","it","we","they",
                        "me","him","her","us","them","my","your","his","its","our","their",
                        "and","or","but","if","as","at","by","for","in","of","on","to","up",
                        "tell","give","show","list","about","explain","define","describe",
                    }
                    words = [
                        w for w in user_question.lower().split()
                        if len(w) > 2 and w not in _STOP_WORDS
                    ]
                    if words:
                        # Search for chunks containing any of the top 3 keywords
                        keywords = words[:3]
                        logger.info(f"Text search fallback — keywords: {keywords}")
                        fb_response = await _execute_with_retry(
                            lambda: supabase_client.table("document_embeddings")
                                .select("id, content")
                                .eq("document_id", supabase_doc_id)
                                .or_(",".join([f"content.ilike.%{kw}%" for kw in keywords]))
                                .limit(4)
                                .execute(),
                            "Text search fallback",
                        )
                        fallback_chunks = fb_response.data or []
                        if fallback_chunks:
                            logger.info(f"Text search fallback found {len(fallback_chunks)} chunks")
                            if _out_rpc_rows is not None:
                                _out_rpc_rows.extend(fallback_chunks)
                except Exception as fb_err:
                    logger.warning(f"Text search fallback failed: {fb_err}")

                if fallback_chunks:
                    context_parts.append("RELEVANT CONTENT FROM LECTURE:")
                    context_parts.append("\n\n---\n\n".join(c['content'] for c in fallback_chunks))
                    context_text = "\n\n".join(context_parts)
                    citation = {
                        "document_id": doc_metadata.get("id"),
                        "topic": (doc_metadata or {}).get("topic") or None,
                        "title": (doc_metadata or {}).get("file_name") or "Unknown Document",
                        "course": (doc_metadata or {}).get("course_code") or "N/A",
                        "lecturer": (doc_metadata or {}).get("lecturer_name") or "N/A",
                    }
                    return context_text, [citation]

                if doc_metadata:
                    logger.info(f"Using metadata only, no vector or text chunks found")
                    citation = {
                        "document_id": doc_metadata.get("id"),
                        "topic": doc_metadata.get("topic") or None,
                        "title": doc_metadata.get("file_name") or "Unknown Document",
                        "course": doc_metadata.get("course_code") or "N/A",
                        "lecturer": doc_metadata.get("lecturer_name") or "N/A",
                    }
                    return "\n".join(context_parts), [citation]
                return "", []

            context_parts.append("RELEVANT CONTENT FROM LECTURE:")
            context_chunks = [item['content'] for item in response.data]
            context_parts.append("\n\n---\n\n".join(context_chunks))

            context_text = "\n\n".join(context_parts)
            logger.info(f"Retrieved {len(response.data)} chunks + metadata ({len(context_text)} chars)")
            citations_list: list[dict] = []
            citations_list.append(
                {
                    "document_id": (doc_metadata or {}).get("id"),
                    "topic": (doc_metadata or {}).get("topic") or None,
                    "title": (doc_metadata or {}).get("file_name") or "Unknown Document",
                    "course": (doc_metadata or {}).get("course_code") or "N/A",
                    "lecturer": (doc_metadata or {}).get("lecturer_name") or "N/A",
                }
            )
            return context_text, citations_list

        # ----------------------------
        # Branch B: Global RAG (Main Chat) with user-level filtering + multi-source citations
        # ----------------------------
        if not student_university_id:
            logger.info("Skipping global chat retrieval for user_id=%s because university_id is missing", getattr(current_user, "id", "unknown"))
            return "", []
        if not resolved_level:
            logger.info("Skipping global chat retrieval for user_id=%s because level is missing", getattr(current_user, "id", "unknown"))
            return "", []

        if not requested_academic_session and not requested_semester:
            academic_context = await get_current_academic_context(student_university_id)
            if academic_context:
                requested_academic_session = _normalize_optional_text(academic_context.get("current_academic_session"))
                requested_semester = normalize_semester(academic_context.get("current_semester"))
                context_filter_source = "current_academic_context"

        # Build candidate level strings to handle format mismatches
        # User profile might store "400" but documents use "400lvl", "400l", etc.
        docs_res = await _execute_with_retry(
            lambda: supabase_client.table("pans_library")
            .select("id,target_levels,university_id,embedding_status,material_status,academic_session,semester")
            .eq("university_id", student_university_id)
            .eq("embedding_status", "completed")
            .eq("material_status", "active")
            .execute(),
            "Fetch university-scoped global RAG documents",
        )
        scoped_docs = docs_res.data or []
        base_scoped_docs = scoped_docs
        if requested_academic_session:
            scoped_docs = [
                row for row in scoped_docs
                if (row.get("academic_session") or "").strip() == requested_academic_session
            ]
        if requested_semester:
            scoped_docs = [
                row for row in scoped_docs
                if normalize_semester(row.get("semester")) == requested_semester
            ]
        allowed_doc_ids = [
            row.get("id")
            for row in scoped_docs
            if row.get("id") and _doc_matches_level(row.get("target_levels"), resolved_level)
        ]
        if not allowed_doc_ids and context_filter_source == "current_academic_context":
            logger.info(
                "No global RAG documents matched current academic context for user_id=%s university_id=%s session=%s semester=%s; falling back to active university/level documents",
                getattr(current_user, "id", "unknown"),
                student_university_id,
                requested_academic_session,
                requested_semester,
            )
            allowed_doc_ids = [
                row.get("id")
                for row in base_scoped_docs
                if row.get("id") and _doc_matches_level(row.get("target_levels"), resolved_level)
            ]

        if not allowed_doc_ids:
            logger.info(
                "No university-scoped active documents found for user_id=%s university_id=%s level=%s",
                getattr(current_user, "id", "unknown"),
                student_university_id,
                resolved_level,
            )
            return "", []

        rpc_response = await _execute_with_retry(
            lambda: supabase_client.rpc(
                "match_documents_global",
                {
                    "query_embedding": query_vector,
                    "match_threshold": rag_threshold,
                    "match_count": rag_match_count,
                    "allowed_doc_ids": allowed_doc_ids,
                },
            ).execute(),
            "Match global documents",
        )

        rows = rpc_response.data or []
        if _out_rpc_rows is not None:
            _out_rpc_rows.extend(rows)
        if not rows:
            logger.warning(
                f"RAG returned no chunks for global search. "
                f"Query: '{user_question[:80]}...' | Threshold: {match_threshold} | "
                f"Allowed docs: {len(allowed_doc_ids)}"
            )
            return "", []

        # Collect unique document IDs from chunks
        unique_doc_ids = []
        seen_doc_ids = set()
        for row in rows:
            doc_id = row.get("document_id") or row.get("doc_id")
            if doc_id and doc_id not in seen_doc_ids:
                seen_doc_ids.add(doc_id)
                unique_doc_ids.append(doc_id)

        if not unique_doc_ids:
            logger.info("Global retrieval returned chunks without document identifiers")
            return "", []
        logger.info(
            f"Global RAG: {len(rows)} chunks matched from {len(unique_doc_ids)} documents. "
            f"Threshold: {match_threshold}"
        )

        # Single metadata query for all matched documents
        meta_res = await _execute_with_retry(
            lambda: supabase_client.table("pans_library")
            .select("id,file_name,course_code,lecturer_name,topic")
            .in_("id", unique_doc_ids)
            .execute(),
            "Fetch global source metadata",
        )
        meta_by_id = {item.get("id"): item for item in (meta_res.data or [])}

        context_parts = []
        for row in rows:
            chunk_text = (row.get("content") or "").strip()
            if not chunk_text:
                continue

            doc_id = row.get("document_id") or row.get("doc_id")
            source_meta = meta_by_id.get(doc_id, {})
            file_name = source_meta.get("file_name") or "Unknown Document"
            course_code = source_meta.get("course_code") or "N/A"
            lecturer_name = source_meta.get("lecturer_name") or "N/A"

            context_parts.append(
                f"--- Source: {file_name} (Course: {course_code}) | Lecturer: {lecturer_name} ---\n{chunk_text}"
            )

        context_text = "\n\n".join(context_parts)
        citations_list = []
        for doc_id in unique_doc_ids:
            source_meta = meta_by_id.get(doc_id, {})
            citations_list.append(
                {
                    "document_id": doc_id,
                    "topic": source_meta.get("topic") or None,
                    "title": source_meta.get("file_name") or "Unknown Document",
                    "course": source_meta.get("course_code") or "N/A",
                    "lecturer": source_meta.get("lecturer_name") or "N/A",
                }
            )
        logger.info(f"Retrieved {len(context_parts)} globally-ranked chunks ({len(context_text)} chars)")
        return context_text, citations_list
        
    except Exception as e:
        if _is_rag_network_timeout_error(e):
            logger.warning(f"RAG network timeout/unavailable: {e}", exc_info=True)
            raise HTTPException(
                status_code=503,
                detail=RAG_NETWORK_TIMEOUT_MESSAGE,
            )

        logger.error(f"RAG context retrieval failed: {e}", exc_info=True)
        return "", []

async def determine_pipeline_parameters(
    user_text: str,
    student_profile_text: str,
    llm_engine_instance,
) -> dict:
    """
    Agentic Thinking Layer: makes a single pre-pipeline LLM call (thinking ON)
    that returns structured routing decisions for the chat pipeline.

    Decides:
      - rag_chunk_count  : how many RAG chunks to retrieve (3, 6, or 10)
      - run_web_search   : whether live web search should be performed
      - fetch_timetable  : whether to inject the student's weekly timetable
      - fetch_faculty    : whether to inject faculty/curriculum knowledge

    Always returns a safe dict — never raises. Falls back to defaults on any error.
    """
    _PLANNER_DEFAULTS = {
        "rag_chunk_count": 6,
        "run_web_search": False,
        "fetch_timetable": True,
        "fetch_faculty": True,
        "search_queries": [],
    }

    try:
        planning_prompt = f"""You are the routing brain of PansGPT, an AI pharmacy study assistant.
Your job is to analyse the student's message and decide which pipeline components to activate.
Think carefully, then output ONLY a single JSON object — no explanation, no markdown fences.

STUDENT PROFILE:
{student_profile_text}

STUDENT MESSAGE:
{user_text}

ROUTING RULES:
1. rag_chunk_count — how many curriculum chunks to retrieve from the vector database.
   - 3  → short factual recall, greeting, yes/no, or simple one-word answer ("what is aspirin?")
   - 6  → standard academic question requiring a paragraph-level answer (default for most questions)
   - 10 → complex multi-part question, comparison, mechanism breakdown, or the user asks to "list all", "summarise", "explain in detail", "compare", or asks about an entire topic/chapter
2. run_web_search — set true ONLY when the question clearly requires real-world current information
   that is unlikely to be in lecture materials: drug recalls, recent news, live prices, current events,
   research published after 2023, or the student explicitly says "search the web" / "look it up online".
   Always false for greetings, conversational replies, or standard curriculum questions.
3. fetch_timetable — set true when the student mentions schedule, class, timetable, lecture time,
   "when is", "what day", "do I have class", or any day-of-week reference.
   Set false for purely academic/drug/clinical questions with no schedule component.
4. fetch_faculty — set true when the student asks about courses, lecturers, curriculum, course codes,
   faculty rules, department policies, or anything that requires knowledge of their specific programme.
   Set false for pure greetings, simple maths, general world-knowledge questions, or small talk
   that has nothing to do with their degree programme.
5. search_queries — if and only if fetch_faculty or RAG is needed, include a list of 1 to 3 distinct search queries to query the document database. Each item in the list must be a JSON object with:
   - "query": a concise keyword search string (max 4-5 words) to find matching documents.
   - "status": a short, student-friendly status action string that describes what is being searched (max 100 characters). Follow safety rules: do not mention database/RAG/AI jargon (e.g. "RAG", "chunks", "embeddings", "vector database"), file IDs, lecturer names, page numbers, or private reasoning.
   Example:
   "search_queries": [
     {{"query": "aspirin COX inhibition", "status": "Searching for relevant material on aspirin and COX inhibition..."}}
   ]

OUTPUT — respond with ONLY this JSON (no extra text, no markdown):
{{
  "rag_chunk_count": <3|6|10>,
  "run_web_search": <true|false>,
  "fetch_timetable": <true|false>,
  "fetch_faculty": <true|false>,
  "search_queries": [
    {{"query": "<keywords>", "status": "<custom status action message>"}}
  ]
}}"""

        response = await llm_engine_instance.generate_completion_with_failover(
            messages=[{"role": "user", "content": planning_prompt}],
            temperature=0.1,
            max_tokens=800,
            has_images=False,
            stream=False,
        )

        if response is None:
            raise RuntimeError("Planner LLM returned None")

        raw_content = response.choices[0].message.content or ""

        # Strip any <think>...</think> / <thinking>...</thinking> blocks the model emits
        # using the same compiled pattern already in thinking_token_utils._BATCH_PATTERN.
        # We import inline to avoid making shared.py depend on a utils import at module level.
        _think_re = re.compile(
            r"<(think|thinking|thought|scratchpad)\b[^>]*>(.*?)</\1>",
            re.DOTALL | re.IGNORECASE,
        )
        clean_text = _think_re.sub("", raw_content).strip()

        # Extract the JSON object — handle any stray whitespace or partial prose
        json_match = re.search(r"\{[\s\S]*\}", clean_text)
        if not json_match:
            raise ValueError(f"No JSON object found in planner output: {clean_text[:200]!r}")

        parsed = json.loads(json_match.group())
        result = _validate_pipeline_plan(parsed)

        logger.info(
            "Agentic planner decision: rag_chunks=%d web_search=%s timetable=%s faculty=%s queries=%d",
            result["rag_chunk_count"],
            result["run_web_search"],
            result["fetch_timetable"],
            result["fetch_faculty"],
            len(result["search_queries"]),
        )
        return result

    except Exception as e:
        logger.warning("Agentic planner failed, using defaults: %s", e)
        return _PLANNER_DEFAULTS.copy()


STREAMING_PLANNER_DEFAULTS = {
    "rag_chunk_count": 6,
    "run_web_search": False,
    "fetch_timetable": True,
    "fetch_faculty": True,
    "enable_deep_final_reasoning": False,
    "search_queries": [],
}

FAST_MODE_DEFAULTS = {
    "rag_chunk_count": 4,
    "run_web_search": False,
    "fetch_timetable": False,
    "fetch_faculty": True,
    "enable_deep_final_reasoning": False,
    "search_queries": [],
}
PUBLIC_PLANNER_FALLBACK = (
    "The question is clear and focused. I will retrieve the relevant academic material "
    "and organise the key points into a clear, easy-to-follow explanation."
)
_PUBLIC_PLANNER_LEAK_MARKERS = (
    "role:",
    "constraints:",
    "system prompt",
    "system:",
    "context:",
    "no headings",
    "student profile",
    "<think",
    "<scratchpad",
    "<routing",
    "rag_chunk_count",
    "run_web_search",
    "fetch_timetable",
    "fetch_faculty",
    "internal instruction",
    "hidden instruction",
    "lecturer name",
    "page number",
    "model name",
    "vector search",
    "embedding",
    "database",
    "chunk",
    "json",
    "planner",
    "routing",
)


def _validate_pipeline_plan(parsed: dict[str, Any]) -> dict:
    result = {
        "rag_chunk_count": int(parsed.get("rag_chunk_count", STREAMING_PLANNER_DEFAULTS["rag_chunk_count"])),
        "run_web_search": bool(parsed.get("run_web_search", STREAMING_PLANNER_DEFAULTS["run_web_search"])),
        "fetch_timetable": bool(parsed.get("fetch_timetable", STREAMING_PLANNER_DEFAULTS["fetch_timetable"])),
        "fetch_faculty": bool(parsed.get("fetch_faculty", STREAMING_PLANNER_DEFAULTS["fetch_faculty"])),
        "enable_deep_final_reasoning": bool(parsed.get("enable_deep_final_reasoning", STREAMING_PLANNER_DEFAULTS["enable_deep_final_reasoning"])),
    }
    if result["rag_chunk_count"] not in (3, 4, 6, 10):
        result["rag_chunk_count"] = STREAMING_PLANNER_DEFAULTS["rag_chunk_count"]

    # Validate search_queries: must be a list of dicts/strings, max 3
    raw_queries = parsed.get("search_queries", [])
    search_queries = []
    if isinstance(raw_queries, list):
        for q in raw_queries[:3]:
            if isinstance(q, dict) and "query" in q:
                search_queries.append({
                    "query": str(q["query"]).strip(),
                    "status": str(q.get("status") or f"Searching for {q['query']}...").strip()
                })
            elif isinstance(q, str) and q.strip():
                search_queries.append({
                    "query": q.strip(),
                    "status": f"Searching for {q.strip()}..."
                })
    result["search_queries"] = search_queries
    return result


def _is_safe_public_planner_text(text: str) -> bool:
    clean = (text or "").strip()
    if not clean or len(clean) > 1400:
        return False
    lowered = clean.lower()
    return not any(marker in lowered for marker in _PUBLIC_PLANNER_LEAK_MARKERS)


def _extract_public_thought(raw_text: str) -> str:
    start_match = re.search(r"<public_thought>", raw_text, re.IGNORECASE)
    if not start_match:
        return ""
    after_start = raw_text[start_match.end():]
    end_match = re.search(r"</public_thought>", after_start, re.IGNORECASE)
    if end_match:
        return after_start[:end_match.start()]
    routing_match = re.search(r"<routing>", after_start, re.IGNORECASE)
    if routing_match:
        return after_start[:routing_match.start()]
    return after_start


def _extract_routing_plan(raw_text: str) -> dict:
    routing_match = re.search(
        r"<routing>\s*(\{[\s\S]*?\})\s*</routing>",
        raw_text,
        re.IGNORECASE,
    )
    if routing_match:
        payload = routing_match.group(1)
    else:
        json_match = re.search(r"\{[\s\S]*\}", raw_text)
        if not json_match:
            return STREAMING_PLANNER_DEFAULTS.copy()
        payload = json_match.group()

    try:
        parsed = json.loads(payload)
        return _validate_pipeline_plan(parsed)
    except Exception as exc:
        logger.warning("Streaming planner routing parse failed, using defaults: %s", exc)
        return STREAMING_PLANNER_DEFAULTS.copy()


def _take_public_planner_emit(pending: str, force: bool = False) -> tuple[str, str]:
    if not pending:
        return "", ""
    if force:
        return pending.strip(), ""

    paragraph_idx = pending.rfind("\n\n")
    if paragraph_idx != -1:
        return pending[:paragraph_idx + 2], pending[paragraph_idx + 2:]

    if len(pending) >= 220:
        sentence_match = list(re.finditer(r"[.!?]\s+", pending))
        if sentence_match:
            end = sentence_match[-1].end()
            return pending[:end], pending[end:]
    return "", pending



def get_holdback_length(raw_text: str) -> int:
    target_tags = [
        "<public_thought>", "</public_thought>",
        "<routing>", "</routing>",
        "<think>", "</think>",
        "<thinking>", "</thinking>",
        "<thought>", "</thought>",
        "<scratchpad>", "</scratchpad>"
    ]
    lowered = raw_text.lower()
    max_check = max(len(t) for t in target_tags) - 1
    for k in range(min(len(lowered), max_check), 0, -1):
        suffix = lowered[-k:]
        for tag in target_tags:
            if tag.startswith(suffix) and k < len(tag):
                return k
    return 0


def _generate_retrieval_progress_update(citations: list[dict], pipeline_params: dict) -> str:
    if citations:
        valid_materials = []
        seen = set()
        for c in citations:
            course = (c.get("course") or "").strip()
            topic = (c.get("topic") or "").strip()
            title = (c.get("title") or "").strip()
            
            if title.lower().endswith(".pdf"):
                title = title[:-4].strip()
                
            if course.lower() in ("n/a", "none", "null", ""):
                course = ""
            if topic.lower() in ("n/a", "none", "null", ""):
                topic = ""
            if title.lower() in ("n/a", "none", "null", "unknown document", ""):
                title = ""

            parts = []
            if course and topic:
                parts.append(f"{course} — {topic}")
            elif course:
                parts.append(course)
            elif topic:
                parts.append(topic)
            elif title:
                parts.append(title)
                
            if parts:
                material_str = parts[0].replace("**", "").replace("*", "").replace("`", "").strip()
                material_str = os.path.basename(material_str)
                if material_str and material_str not in seen:
                    seen.add(material_str)
                    valid_materials.append(material_str)
                    
        if len(valid_materials) == 1:
            return f"I found the relevant details in **{valid_materials[0]}** and will use them to prepare a focused explanation."
        elif len(valid_materials) > 1:
            return "I found relevant details across the available course materials and will combine the key points into a clear explanation."
            
    if pipeline_params.get("fetch_timetable"):
        return "I checked the available class schedule and will use it to prepare the response."
    if pipeline_params.get("fetch_faculty"):
        return "I found the relevant curriculum details and will use them to prepare the response."
    return "I checked the available materials and will use them to prepare the response."


async def stream_pipeline_plan(
    user_text: str,
    student_profile_text: str,
    llm_engine_instance,
) -> AsyncIterator[dict]:
    """
    Stream safe public planner text and finish with private routing parameters.
    Yields thinking_update events plus one pipeline_params event.
    """
    planning_prompt = f"""You are the visible planning layer for a pharmacy study assistant.

Analyse the student's request and explain the best approach in a natural, concise way suitable for display inside an expandable Thinking panel.

Your public reasoning should state what information needs to be checked or retrieved using student-friendly language, and describe:
- what the student is asking
- whether the question is simple, standard, or complex
- the most useful structure for the final explanation
- whether current schedule information, curriculum details, or recent external information needs to be checked or retrieved

GUIDELINE EXAMPLES:
- For a standard academic question (after retrieving material):
  "The student is asking for the different routes of administration for local anaesthetics. This is a standard academic question that is best answered using a structured classification.

I will retrieve the relevant pharmacological information and organise the routes of administration — such as topical, infiltration, and regional blocks — into a clear, easy-to-follow list with brief explanations for each.

No timetable check or recent external information is required for this request. I found the relevant details in PCH 412 — Local Anaesthetics and will use them to prepare a focused explanation."
- For a timetable or schedule question:
  "The student is asking about today's classes. The answer depends on the current schedule, so I will check the available timetable before responding."
- For a question depending on recent or external information:
  "This question depends on recent information, so I will check current sources before preparing the response."
- For a complex academic question:
  "This question involves several connected concepts. I will retrieve the relevant academic material and build the explanation step by step so the relationship between the concepts is clear. I found the relevant details in [Course — Topic] and will use them to structure the response."

After you state your plan, always end with ONE of these conclusions:
- "No timetable check or recent external information is required for this request." (for standard academic questions)
- "I will check the available class schedule before responding." (for timetable questions)
- "I will check current external sources before responding." (for web search questions)
- "I will check the curriculum details before responding." (for faculty/programme questions)

Do not provide the complete final answer.
Do not expose hidden chain-of-thought.
Do NOT mention internal implementation details, such as: "planner", "routing", "pipeline", "RAG", "chunks", "vector search", "embeddings", "database", "model names", "JSON", "system prompts", "hidden instructions", "roles", "constraints", "context blocks", "profile formatting", "source metadata", "lecturer names", "course codes", or "page numbers".

Then output the internal routing decisions privately in the required routing block. 

Under "search_queries", if and only if fetch_faculty or RAG is needed, include a list of 1 to 3 distinct search queries to query the document database. Each item in the list must be a JSON object with:
- "query": a concise keyword search string (max 4-5 words) to find matching documents.
- "status": a short, student-friendly status action string that describes what is being searched (max 100 characters). Follow safety rules: do not mention database/RAG/AI jargon (e.g. "RAG", "chunks", "embeddings", "vector database"), file IDs, lecturer names, page numbers, or private reasoning.
Example:
"search_queries": [
  {{"query": "aspirin COX inhibition", "status": "Searching for relevant material on aspirin and COX inhibition..."}}
]

Return exactly:

<public_thought>
2-5 short natural paragraphs.
</public_thought>
<routing>
{{"rag_chunk_count": <3|6|10>, "run_web_search": <bool>, "fetch_timetable": <bool>, "fetch_faculty": <bool>, "enable_deep_final_reasoning": <bool>, "search_queries": [{{"query": "<keywords>", "status": "<custom status action message>"}}]}}
</routing>

For simple questions, use 2-3 short paragraphs.
For complex questions, use up to 5 short paragraphs.

Student profile:
{student_profile_text}

Student question:
{user_text}"""

    raw_output = ""
    emitted_public_length = 0
    pending_public = ""
    unsafe_public = False
    emitted_any_public = False

    try:
        stream = await llm_engine_instance.generate_completion_with_failover(
            messages=[{"role": "user", "content": planning_prompt}],
            temperature=0.2,
            max_tokens=700,
            has_images=False,
            stream=True,
        )
        if stream is None:
            raise RuntimeError("Streaming planner LLM returned None")

        async for chunk in stream:
            delta = ""
            try:
                if chunk and chunk.choices and chunk.choices[0].delta:
                    delta = chunk.choices[0].delta.content or ""
            except Exception:
                delta = ""
            if not delta:
                continue

            raw_output += delta
            holdback = get_holdback_length(raw_output)
            safe_raw = raw_output[:-holdback] if holdback > 0 else raw_output
            public_text = _extract_public_thought(safe_raw)
            if len(public_text) <= emitted_public_length:
                continue

            new_public = public_text[emitted_public_length:]
            emitted_public_length = len(public_text)
            if not new_public or re.search(r"</?public_thought|</?routing", new_public, re.IGNORECASE):
                continue

            candidate = pending_public + new_public
            if not _is_safe_public_planner_text(candidate):
                unsafe_public = True
                pending_public = ""
                continue

            pending_public = candidate
            emit_text, pending_public = _take_public_planner_emit(pending_public)
            if emit_text and _is_safe_public_planner_text(emit_text):
                emitted_any_public = True
                yield {"thinking_update": emit_text}

        holdback = get_holdback_length(raw_output)
        safe_final_raw = raw_output[:-holdback] if holdback > 0 else raw_output
        final_public = _extract_public_thought(safe_final_raw)
        
        if not emitted_any_public:
            if _is_safe_public_planner_text(final_public):
                fallback_or_final = final_public.strip()
            else:
                fallback_or_final = PUBLIC_PLANNER_FALLBACK
            emitted_any_public = True
            yield {"thinking_update": fallback_or_final}
        elif pending_public and not unsafe_public:
            emit_text, _ = _take_public_planner_emit(pending_public, force=True)
            if emit_text and _is_safe_public_planner_text(emit_text):
                yield {"thinking_update": emit_text}

        yield {"pipeline_params": _extract_routing_plan(raw_output)}
    except Exception as exc:
        logger.warning("Streaming planner failed, using defaults: %s", exc)
        yield {"thinking_update": PUBLIC_PLANNER_FALLBACK}
        yield {"pipeline_params": STREAMING_PLANNER_DEFAULTS.copy()}



def sanitize_status_message(status: str, default_fallback: str = "Reviewing the relevant course material...") -> str:
    if not status or not isinstance(status, str):
        return default_fallback
    
    status = status.strip()
    # Enforce 100 character limit
    if len(status) > 100:
        return default_fallback
        
    # Check for banned database/RAG/AI/internal jargon
    _BANNED_WORDS = {
        "rag", "embedding", "embeddings", "vector", "chunk", "chunks", 
        "database", "db", "model", "planner", "pipeline", "routing", 
        "parameter", "parameters", "json", "llm", "ai", "retrieve", 
        "retrieval", "supabase", "postgres", "sql"
    }
    
    # We also check for signs of private reasoning tags or file paths/lecturers
    status_lower = status.lower()
    
    # Simple check for forbidden words
    words = re.findall(r'\b\w+\b', status_lower)
    for word in words:
        if word in _BANNED_WORDS:
            return default_fallback
            
    # Check for file extension patterns (e.g. .pdf, .docx, file_123, uuid patterns)
    if ".pdf" in status_lower or ".docx" in status_lower:
        return default_fallback
        
    # Check for uuid-like patterns or large numbers of digits
    if re.search(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}', status_lower):
        return default_fallback
        
    # Check for html or private tags
    if "<" in status or ">" in status:
        return default_fallback
        
    return status


def safe_topic_from_query(query: str) -> str:
    """
    Extract/format a safe, concise topic string from a search query to be used in student-facing status messages.
    """
    if not query:
        return ""
    # Strip quotes, question marks, standard punctuation
    topic = query.strip().strip('"\'?.')
    # Limit size so "Refining the search around {topic}..." fits in 100 chars
    # "Refining the search around " is 27 chars, "..." is 3. Max topic length = 100 - 30 = 70.
    if len(topic) > 65:
        topic = topic[:62] + "..."
    return topic


async def agentic_rag_loop(
    user_text: str,
    document_id: Optional[str],
    student_level: str,
    current_user: User,
    academic_session: Optional[str],
    semester: Optional[str],
    rag_match_count: int,
    search_queries: list[dict],
    llm_engine,
) -> AsyncIterator[dict]:
    # If search_queries is empty, default to user_text
    if not search_queries:
        search_queries = [{"query": user_text, "status": "Reviewing the relevant course material..."}]

    # Fetch dynamic settings for threshold
    settings = await get_cached_settings()
    match_threshold = float(settings.get("rag_threshold", 0.50)) if settings and settings.get("rag_threshold") is not None else float(os.getenv("RAG_MATCH_THRESHOLD", "0.50"))

    all_citations = []
    all_chunks = []
    
    # Track the outcome of each search query: either "good" (found vector chunks above threshold),
    # "partial" (found keyword chunks or below-threshold chunks after retry), or "none" (found nothing).
    query_outcomes = []

    for item in search_queries:
        query_str = item.get("query", "").strip()
        custom_status = item.get("status", "").strip()
        
        if not query_str:
            continue
            
        sanitized_status = sanitize_status_message(custom_status, "Reviewing the relevant course material...")
        yield {"status": sanitized_status}

        # Step 1: Search using get_relevant_context with _out_rpc_rows
        retrieved_rows = []
        context_text, citations_list = await get_relevant_context(
            user_question=query_str,
            document_id=document_id,
            user_level=None if student_level == "Unknown" else student_level,
            current_user=current_user,
            academic_session=academic_session,
            semester=semester,
            rag_match_count=rag_match_count,
            _out_rpc_rows=retrieved_rows,
        )

        # Step 2: Evaluate retrieved rows using pgvector similarity score
        # A row is considered valid if it has similarity and similarity >= threshold.
        # Fallback keyword chunks won't have a 'similarity' field (or it will be missing/None).
        # We need to distinguish between vector result vs fallback keyword result.
        vector_chunks = []
        keyword_fallback_chunks = []

        for row in retrieved_rows:
            sim = row.get("similarity")
            if sim is not None:
                # Vector match
                if float(sim) >= match_threshold:
                    vector_chunks.append(row)
            else:
                # Fallback keyword match or other result without similarity
                keyword_fallback_chunks.append(row)

        # Step 3: Check confidence and retry if needed
        if vector_chunks:
            # We found good vector chunks!
            all_chunks.extend(vector_chunks)
            all_citations.extend(citations_list)
            query_outcomes.append("good")
        elif keyword_fallback_chunks:
            # We found keyword chunks without similarity score.
            # "keyword fallback without similarity → treat cautiously as partial, not good"
            all_chunks.extend(keyword_fallback_chunks)
            all_citations.extend(citations_list)
            query_outcomes.append("partial")
        else:
            # No chunks above threshold or found at all. Retry once!
            topic = safe_topic_from_query(query_str)
            retry_status = f"Refining the search around {topic}..." if topic else "Refining the search..."
            sanitized_retry = sanitize_status_message(retry_status, "Refining the search...")
            yield {"status": sanitized_retry}

            # LLM rephrase using the fast model (non-streaming)
            rephrase_prompt = (
                f"You are a pharmacy search assistant. Rephrase the following search query to find better matches "
                f"in a lecture note / curriculum database: '{query_str}'. "
                f"Respond with ONLY the new rephrased query string (max 5 words), no markdown, no other text."
            )
            try:
                rephrase_res = await llm_engine.generate_completion_with_failover(
                    messages=[{"role": "user", "content": rephrase_prompt}],
                    temperature=0.1,
                    max_tokens=50,
                    has_images=False,
                    stream=False,
                )
                rephrased_query = rephrase_res.choices[0].message.content.strip().strip('"\'') if rephrase_res else query_str
            except Exception as e:
                logger.warning(f"Failed to rephrase query '{query_str}': {e}")
                rephrased_query = query_str

            # Run retrieval again with rephrased query
            retry_rows = []
            context_text_r, citations_list_r = await get_relevant_context(
                user_question=rephrased_query,
                document_id=document_id,
                user_level=None if student_level == "Unknown" else student_level,
                current_user=current_user,
                academic_session=academic_session,
                semester=semester,
                rag_match_count=rag_match_count,
                _out_rpc_rows=retry_rows,
            )

            # Evaluate retry chunks
            retry_vector = []
            retry_keyword = []
            for row in retry_rows:
                sim = row.get("similarity")
                if sim is not None:
                    if float(sim) >= match_threshold:
                        retry_vector.append(row)
                else:
                    retry_keyword.append(row)

            if retry_vector:
                all_chunks.extend(retry_vector)
                all_citations.extend(citations_list_r)
                query_outcomes.append("partial") # Since it required a retry, we classify as partial/caution
            elif retry_keyword:
                all_chunks.extend(retry_keyword)
                all_citations.extend(citations_list_r)
                query_outcomes.append("partial")
            else:
                query_outcomes.append("none")

    # Step 4: Merge and Deduplicate chunks by ID (or content hash if ID is missing)
    unique_chunks = []
    seen_chunk_ids = set()
    seen_content = set()
    for chunk in all_chunks:
        c_id = chunk.get("id")
        c_content = (chunk.get("content") or "").strip()
        if not c_content:
            continue
            
        content_hash = hash(c_content)
        if c_id is not None:
            if c_id not in seen_chunk_ids:
                seen_chunk_ids.add(c_id)
                unique_chunks.append(chunk)
        else:
            if content_hash not in seen_content:
                seen_content.add(content_hash)
                unique_chunks.append(chunk)

    # Reconstruct merged context text and citations
    unique_doc_ids = list({c.get("document_id") for c in unique_chunks if c.get("document_id")})
    
    # Build context string
    context_parts = []
    if unique_chunks:
        # Fetch metadata for the docs
        meta_by_id = {}
        if unique_doc_ids:
            try:
                meta_res = await _execute_with_retry(
                    lambda: supabase_client.table("pans_library")
                    .select("id,file_name,course_code,lecturer_name,topic")
                    .in_("id", unique_doc_ids)
                    .execute(),
                    "Fetch global source metadata",
                )
                meta_by_id = {item.get("id"): item for item in (meta_res.data or [])}
            except Exception as e:
                logger.error(f"Failed to fetch metadata for agentic RAG loop: {e}")

        # If study mode (document_id is set), we can put a nice metadata header once
        if document_id and unique_chunks:
            doc_meta = meta_by_id.get(document_id) or {}
            metadata_text = "DOCUMENT INFORMATION:\n"
            if doc_meta.get('file_name'):
                metadata_text += f"Title: {doc_meta['file_name']}\n"
            if doc_meta.get('topic'):
                metadata_text += f"Topic: {doc_meta['topic']}\n"
            if doc_meta.get('lecturer_name'):
                metadata_text += f"Lecturer: {doc_meta['lecturer_name']}\n"
            if doc_meta.get('course_code'):
                metadata_text += f"Course Code: {doc_meta['course_code']}\n"
            context_parts.append(metadata_text)
            
            context_parts.append("RELEVANT CONTENT FROM LECTURE:")
            context_parts.append("\n\n---\n\n".join(c.get("content", "") for c in unique_chunks))
        else:
            # Global RAG multi-source format
            for chunk in unique_chunks:
                chunk_text = chunk.get("content", "").strip()
                doc_uuid = chunk.get("document_id")
                source_meta = meta_by_id.get(doc_uuid, {})
                file_name = source_meta.get("file_name") or "Unknown Document"
                course_code = source_meta.get("course_code") or "N/A"
                lecturer_name = source_meta.get("lecturer_name") or "N/A"
                context_parts.append(
                    f"--- Source: {file_name} (Course: {course_code}) | Lecturer: {lecturer_name} ---\n{chunk_text}"
                )
    
    merged_context = "\n\n".join(context_parts)
    
    # Deduplicate citations list
    deduplicated_citations = []
    seen_citation_keys = set()
    for cite in all_citations:
        cite_key = (cite.get("document_id"), cite.get("title"))
        if cite_key not in seen_citation_keys:
            seen_citation_keys.add(cite_key)
            deduplicated_citations.append(cite)

    # Determine final context_quality
    if not unique_chunks:
        context_quality = "none"
    elif "partial" in query_outcomes or "none" in query_outcomes:
        context_quality = "partial"
    else:
        context_quality = "good"

    yield {"final_result": (merged_context, deduplicated_citations, context_quality)}


# Function to set dependencies (called from main api.py)
def set_dependencies(supabase, api_key_verifier, supabase_service=None):
    global supabase_client, supabase_service_client, verify_api_key_handler
    supabase_client = supabase
    supabase_service_client = supabase_service
    verify_api_key_handler = api_key_verifier
    chat_history.set_dependencies(supabase, _execute_with_retry)
    web_search.set_dependencies(supabase_service, _execute_with_retry)
