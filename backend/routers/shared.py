"""
Chat Router: AI Conversation Endpoint with RAG Support
Handles AI-powered chat interactions using Groq with vector search.
"""
from fastapi import APIRouter, HTTPException, Depends, Header, File, UploadFile, Request, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, field_validator
from typing import List, Optional, Literal
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
    title = (raw_title or "").strip().strip('"').strip("'")
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
    if len(words) < 3:
        return True

    weak_words = {
        "chat", "discussion", "help", "question", "questions", "about",
        "topic", "general", "new", "conversation", "session"
    }
    meaningful = [w for w in words if w not in weak_words]
    if len(meaningful) < 2:
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

def invalidate_settings_cache() -> None:
    """
    Clear cached system settings so prompt/temperature changes apply immediately.
    """
    _settings_cache.clear()
    logger.info("System settings cache invalidated")

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
    visibility = str(document_row.get("visibility") or "").strip().lower()
    approval_status = str(document_row.get("approval_status") or "").strip().lower()
    return (
        embedding_status == "completed"
        and material_status == "active"
        and visibility == "visible"
        and approval_status == "approved"
    )


async def _resolve_active_university_by_text(sb, university_text: Optional[str]) -> Optional[dict]:
    candidates = build_university_candidates(university_text)
    if not candidates:
        return None

    res = await _execute_with_retry(
        lambda: sb.table("universities").select("id,name,short_name,status").eq("status", "active").execute(),
        "Resolve active university by text",
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
    if cache_key in _student_scope_cache:
        return _student_scope_cache[cache_key]

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
        if university_row and (university_row.get("status") or "").strip().lower() == "active":
            university_name = _normalize_optional_text(university_row.get("name")) or university_name
        else:
            logger.warning("Student user_id=%s has missing or inactive university_id=%s", current_user.id, explicit_university_id)
            resolved_university_id = None
    elif university_name:
        matched_university = await _resolve_active_university_by_text(sb, university_name)
        if matched_university:
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

class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"
    context_id: Optional[str] = None

class ChatSession(BaseModel):
    id: str
    title: str
    context_id: Optional[str] = None
    created_at: datetime

class CreateSessionResponse(BaseModel):
    id: str
    title: str
    context_id: Optional[str] = None
    created_at: datetime


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
    if cache_key in _profile_cache:
        return _profile_cache[cache_key]

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

        # Detect broad/listing queries — fetch more chunks at lower threshold
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
        rag_match_count = 20 if is_broad_query else 4
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
                        .select("id,file_name,topic,lecturer_name,course_code,university_id,embedding_status,material_status,visibility,approval_status")
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
                            .select("id,file_name,topic,lecturer_name,course_code,university_id,embedding_status,material_status,visibility,approval_status")
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
                    "Skipping study-mode retrieval for document_id=%s because document is not AI-retrievable (embedding/material/visibility/approval state)",
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

        # Build candidate level strings to handle format mismatches
        # User profile might store "400" but documents use "400lvl", "400l", etc.
        docs_res = await _execute_with_retry(
            lambda: supabase_client.table("pans_library")
            .select("id,target_levels,university_id,embedding_status,material_status,visibility,approval_status")
            .eq("university_id", student_university_id)
            .eq("embedding_status", "completed")
            .eq("material_status", "active")
            .eq("visibility", "visible")
            .eq("approval_status", "approved")
            .execute(),
            "Fetch university-scoped global RAG documents",
        )
        scoped_docs = docs_res.data or []
        allowed_doc_ids = [
            row.get("id")
            for row in scoped_docs
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

# Function to set dependencies (called from main api.py)
def set_dependencies(supabase, api_key_verifier, supabase_service=None):
    global supabase_client, supabase_service_client, verify_api_key_handler
    supabase_client = supabase
    supabase_service_client = supabase_service
    verify_api_key_handler = api_key_verifier
    chat_history.set_dependencies(supabase, _execute_with_retry)
    web_search.set_dependencies(supabase_service, _execute_with_retry)
