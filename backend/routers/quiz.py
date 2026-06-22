"""
Quiz router – Generate, submit, and retrieve quizzes.
"""
from fastapi import APIRouter, HTTPException, Request, Depends, Header, BackgroundTasks, Query
from fastapi.responses import JSONResponse, StreamingResponse
from dependencies import get_current_user, User, UNIVERSITY_SUSPENDED_MESSAGE
from pydantic import BaseModel, ValidationError, field_validator, Field, model_validator
from typing import Optional, List, Union, Any
import json
import logging
import jwt
import time
import re
import uuid
import os
import asyncio
from datetime import datetime, timezone
from cachetools import TTLCache
from restrictions import build_restriction_block_payload, get_applicable_user_restriction
from utils.thinking_token_utils import strip_thinking_tokens

from services import llm_engine

logger = logging.getLogger("PansGPT")

STREAM_TOKEN_SECRET = uuid.uuid4().hex

def generate_stream_token(user_id: str, quiz_id: str) -> str:
    payload = {
        "sub": user_id,
        "quiz_id": quiz_id,
        "exp": int(time.time()) + 120,
        "type": "quiz_stream"
    }
    return jwt.encode(payload, STREAM_TOKEN_SECRET, algorithm="HS256")

def verify_stream_token(token: str, quiz_id: str) -> str:
    try:
        payload = jwt.decode(token, STREAM_TOKEN_SECRET, algorithms=["HS256"])
        if payload.get("type") != "quiz_stream":
            raise HTTPException(status_code=401, detail="Invalid token type")
        if payload.get("quiz_id") != quiz_id:
            raise HTTPException(status_code=403, detail="Token does not match quiz_id")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Stream token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid stream token")

router = APIRouter(prefix="/api/quiz", tags=["quiz"])

QUIZ_GENERATION_TEMPERATURE = 0.25
QUIZ_GENERATION_MAX_TOKENS = 2048
QUIZ_GRADING_TEMPERATURE = 0.1
QUIZ_GRADING_MAX_TOKENS = 2048
QUIZ_BATCH_SIZE = max(1, int(os.getenv("QUIZ_BATCH_SIZE", "5")))
QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS = max(1, int(os.getenv("QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS", "60")))
QUIZ_CONTEXT_CACHE_TTL_SECONDS = 900
QUIZ_CONTEXT_CACHE_MAXSIZE = 128

_supabase = None
_supabase_service = None
_verify_api_key_fn = None
_embeddings_ready = False
_quiz_context_cache: TTLCache = TTLCache(maxsize=QUIZ_CONTEXT_CACHE_MAXSIZE, ttl=QUIZ_CONTEXT_CACHE_TTL_SECONDS)

try:
    import google.generativeai as genai
except Exception:
    genai = None


def set_dependencies(supabase_client, verify_api_key_fn, supabase_service_client=None):
    global _supabase, _supabase_service, _verify_api_key_fn
    _supabase = supabase_client
    _supabase_service = supabase_service_client
    _verify_api_key_fn = verify_api_key_fn


def _get_supabase():
    """Return service role client for DB writes (bypasses RLS), fall back to anon client."""
    client = _supabase_service or _supabase
    if client is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return client


async def _verify_api_key(x_api_key: str = Header(...)):
    if _verify_api_key_fn is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return await _verify_api_key_fn(x_api_key)


async def _execute_quiz_query(query_fn, _operation_name: str):
    return await asyncio.to_thread(query_fn)


async def _get_quiz_restriction_if_any(current_user: User):
    sb = _get_supabase()
    return await get_applicable_user_restriction(
        sb,
        current_user,
        execute_fn=_execute_quiz_query,
    )


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _quiz_timing_log(event: str, duration_ms: float, **metadata: Any) -> None:
    safe_meta = {
        key: value
        for key, value in metadata.items()
        if value is not None and value != ""
    }
    meta_str = " ".join(f"{key}={safe_meta[key]}" for key in sorted(safe_meta))
    logger.info(
        "[quiz_generation_timing] event=%s duration_ms=%.2f%s",
        event,
        duration_ms,
        f" {meta_str}" if meta_str else "",
    )


def _quiz_context_cache_key(body: "QuizGenerateRequest", student_university_id: str) -> tuple:
    return (
        student_university_id,
        (body.courseCode or "").strip().lower(),
        (body.level or "").strip().lower(),
        (body.academic_session or "").strip().lower(),
        (normalize_semester(body.semester) or "").strip().lower() if body.semester else "",
        (body.topic or "").strip().lower(),
        (body.questionType or "").strip().lower(),
        (body.difficulty or "").strip().lower(),
    )


def _job_payload_without_count_fields(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if key not in {"generated_question_count", "target_question_count"}
    }


def merge_system_into_user(messages: List[dict]) -> List[dict]:
    system_parts: list[str] = []
    next_messages: list[dict] = []

    for message in messages:
        if message.get("role") == "system":
            content = message.get("content")
            if content:
                system_parts.append(str(content))
        else:
            next_messages.append(message)

    if not system_parts:
        return next_messages

    merged_system = "\n\n".join(system_parts).strip()
    for message in next_messages:
        if message.get("role") == "user":
            user_content = str(message.get("content") or "")
            message["content"] = f"{merged_system}\n\n{user_content}".strip()
            return next_messages

    return [{"role": "user", "content": merged_system}, *next_messages]


async def get_current_academic_context(university_id: Optional[str]) -> Optional[dict]:
    normalized_university_id = _normalize_optional_text(university_id)
    if not normalized_university_id:
        return None

    sb = _get_supabase()
    try:
        res = await _execute_quiz_query(
            lambda: sb.table("academic_contexts")
            .select("id,university_id,current_academic_session,current_semester,updated_at,updated_by")
            .eq("university_id", normalized_university_id)
            .limit(1)
            .execute(),
            "Fetch quiz academic context",
        )
        row = (res.data or [None])[0]
        if not row:
            return None
        return {
            "id": row.get("id"),
            "university_id": row.get("university_id"),
            "current_academic_session": row.get("current_academic_session"),
            "current_semester": normalize_semester(row.get("current_semester")),
            "updated_at": row.get("updated_at"),
            "updated_by": row.get("updated_by"),
        }
    except Exception as exc:
        logger.warning("Could not fetch quiz academic context for university_id=%s: %s", normalized_university_id, exc)
        return None


async def _resolve_active_university_by_text(sb, university_name: Optional[str]) -> Optional[dict]:
    normalized_name = _normalize_optional_text(university_name)
    if not normalized_name:
        return None

    try:
        res = await _execute_quiz_query(
            lambda: sb.table("universities")
            .select("id,name,status")
            .ilike("name", normalized_name)
            .limit(1)
            .execute(),
            "Resolve quiz university by name",
        )
        rows = res.data or []
        if rows:
            return rows[0]

        fallback = await _execute_quiz_query(
            lambda: sb.table("universities")
            .select("id,name,status")
            .ilike("name", f"%{normalized_name}%")
            .limit(1)
            .execute(),
            "Resolve quiz university by partial name",
        )
        fallback_rows = fallback.data or []
        return fallback_rows[0] if fallback_rows else None
    except Exception as exc:
        logger.warning("Could not resolve quiz university by name=%s: %s", normalized_name, exc)
        return None


async def resolve_student_university_context(current_user: User) -> dict:
    sb = _get_supabase()
    try:
        profile_res = await _execute_quiz_query(
            lambda: sb.table("profiles")
            .select("id,first_name,other_names,level,university,university_id")
            .eq("id", current_user.id)
            .limit(1)
            .execute(),
            "Fetch quiz student context",
        )
    except Exception as exc:
        logger.warning("Could not fetch quiz student context for user_id=%s: %s", current_user.id, exc)
        return {"profile": None, "university_id": None, "university_name": None, "level": ""}

    profile = (profile_res.data or [None])[0] or {}
    explicit_university_id = _normalize_optional_text(profile.get("university_id"))
    university_name = _normalize_optional_text(profile.get("university"))
    resolved_university_id = explicit_university_id

    if explicit_university_id:
        try:
            university_res = await _execute_quiz_query(
                lambda: sb.table("universities")
                .select("id,name,status")
                .eq("id", explicit_university_id)
                .limit(1)
                .execute(),
                "Validate quiz student university",
            )
            university_row = (university_res.data or [None])[0]
            university_status = (university_row.get("status") or "").strip().lower() if university_row else None
            if university_status == "suspended":
                raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)
            if university_row and university_status == "active":
                university_name = _normalize_optional_text(university_row.get("name")) or university_name
            else:
                resolved_university_id = None
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Could not validate quiz student university_id=%s: %s", explicit_university_id, exc)
            resolved_university_id = None
    elif university_name:
        matched_university = await _resolve_active_university_by_text(sb, university_name)
        if matched_university:
            university_status = (matched_university.get("status") or "").strip().lower()
            if university_status == "suspended":
                raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)
            if university_status == "active":
                resolved_university_id = _normalize_optional_text(matched_university.get("id"))
                university_name = _normalize_optional_text(matched_university.get("name")) or university_name

    return {
        "profile": profile or None,
        "university_id": resolved_university_id,
        "university_name": university_name,
        "level": _normalize_optional_text(profile.get("level")) or "",
    }


# ---------- Models ----------
class QuizQuestionModel(BaseModel):
    questionText: str = Field(..., min_length=10)
    questionType: str = Field(..., min_length=3)
    options: Optional[List[str]] = None
    correctAnswer: str = Field(..., min_length=1)
    explanation: str = Field(..., min_length=10)

    @model_validator(mode="after")
    def validate_options_by_type(self) -> "QuizQuestionModel":
        q_type = self.questionType.upper()
        opts = self.options

        if q_type == "SHORT_ANSWER":
            if opts is not None and len(opts) > 0:
                raise ValueError("SHORT_ANSWER questions must not have options.")
        elif q_type == "TRUE_FALSE":
            if opts is None or len(opts) != 2:
                raise ValueError("TRUE_FALSE questions must have exactly 2 options (e.g. ['True', 'False']).")
        elif q_type in ("MCQ", "MULTIPLE_CHOICE", "OBJECTIVE"):
            if q_type == "MCQ":
                if opts is None or len(opts) != 5:
                    raise ValueError("MCQ questions must have exactly 5 options.")
            else:
                if opts is None or not (4 <= len(opts) <= 5):
                    raise ValueError("multiple_choice/OBJECTIVE questions must have between 4 and 5 options.")
        
        return self

class QuizBatchModel(BaseModel):
    questions: List[QuizQuestionModel] = Field(..., min_length=1)

class QuizGenerateRequest(BaseModel):
    courseCode: str
    courseTitle: str
    topic: Optional[str] = None
    level: Optional[str] = None
    difficulty: str = "medium"
    numQuestions: int = 10
    timeLimit: Optional[int] = None
    questionType: str = "OBJECTIVE"
    academic_session: Optional[str] = None
    semester: Optional[str] = None

    @field_validator("semester", mode="before")
    @classmethod
    def normalize_semester_field(cls, value: Optional[str]) -> Optional[str]:
        return normalize_semester(value)


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
        raise ValueError("semester must be first or second")
    return normalized


class AnswerItem(BaseModel):
    questionId: str
    selectedAnswer: Union[List[str], str]


class QuizSubmitRequest(BaseModel):
    quizId: str
    answers: List[AnswerItem]
    timeTaken: Optional[int] = None


def _strip_option_label(text: str) -> str:
    import re

    cleaned = (text or "").strip()
    cleaned = re.sub(r"^\s*[\(\[]?[A-Ea-e1-5][\)\].:-]\s*", "", cleaned)
    return cleaned.strip()


def _normalize_option(text: str) -> str:
    return " ".join(_strip_option_label(text).lower().split())


def _is_valid_correct_answer(correct_val: str, options: Optional[List[str]], q_type: str) -> bool:
    if not correct_val or not isinstance(correct_val, str):
        return False
    correct_val = correct_val.strip()
    if not correct_val:
        return False
        
    q_type_upper = q_type.upper()
    if q_type_upper == "SHORT_ANSWER":
        return True
        
    if q_type_upper == "TRUE_FALSE":
        return correct_val.lower() in ("true", "false")
        
    if not options:
        return False
        
    if q_type_upper == "MCQ":
        parts = [p.strip().upper() for p in correct_val.split(",") if p.strip()]
        if not parts:
            return False
        letter_to_index = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
        normalized_option_map = {_normalize_option(opt): opt for opt in options}
        for part in parts:
            if part in letter_to_index and letter_to_index[part] < len(options):
                continue
            if part.isdigit() and 1 <= int(part) <= len(options):
                continue
            if _normalize_option(part) in normalized_option_map:
                continue
            return False
        return True
        
    letter_to_index = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
    upper_val = correct_val.upper()
    if upper_val in letter_to_index and letter_to_index[upper_val] < len(options):
        return True
    if correct_val.isdigit() and 1 <= int(correct_val) <= len(options):
        return True
    
    normalized_option_map = {_normalize_option(opt) for opt in options}
    if _normalize_option(correct_val) in normalized_option_map:
        return True
        
    stripped_correct = _strip_option_label(correct_val).lower().strip()
    for opt in options:
        if _strip_option_label(opt).lower().strip() == stripped_correct:
            return True
            
    return False


def _inline_schema_defs(schema: dict) -> dict:
    import copy
    schema_copy = copy.deepcopy(schema)
    defs = schema_copy.pop("$defs", {})
    if not defs:
        return schema_copy

    def resolve_refs(node):
        if isinstance(node, dict):
            if "$ref" in node:
                ref_path = node["$ref"]
                if ref_path.startswith("#/$defs/"):
                    def_name = ref_path.split("/")[-1]
                    if def_name in defs:
                        resolved = copy.deepcopy(defs[def_name])
                        node.pop("$ref")
                        for k, v in resolved.items():
                            node[k] = v
                        resolve_refs(node)
                        return
            for val in node.values():
                resolve_refs(val)
        elif isinstance(node, list):
            for item in node:
                resolve_refs(item)

    resolve_refs(schema_copy)
    return schema_copy


def _parse_quiz_batch(raw: str, *, timing_meta: Optional[dict[str, Any]] = None) -> list[dict]:
    parse_started = time.perf_counter()
    # Before parsing, add an explicit empty-response check
    if not raw or not raw.strip():
        _quiz_timing_log("parse_quiz_batch_empty", (time.perf_counter() - parse_started) * 1000, **(timing_meta or {}))
        raise ValueError("LLM returned empty response")

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    if cleaned.lower().startswith("json"):
        cleaned = cleaned[4:].strip()

    # Find the bounds of the JSON structure (either '{'/'}' or '['/']')
    first_brace = cleaned.find('{')
    first_bracket = cleaned.find('[')
    
    start_idx = -1
    end_idx = -1
    if first_brace != -1 and (first_bracket == -1 or first_brace < first_bracket):
        start_idx = first_brace
        end_idx = cleaned.rfind('}')
    elif first_bracket != -1:
        start_idx = first_bracket
        end_idx = cleaned.rfind(']')
        
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned = cleaned[start_idx:end_idx+1]

    # Additional empty-response check after cleaning
    if not cleaned or not cleaned.strip():
        _quiz_timing_log("parse_quiz_batch_empty_after_clean", (time.perf_counter() - parse_started) * 1000, **(timing_meta or {}))
        raise ValueError("LLM returned empty response after cleaning JSON structure")

    try:
        try:
            parsed = json.loads(cleaned)
        except Exception as e:
            logger.warning(f"Standard JSON parsing failed, attempting repair: {e}")
            import json_repair
            repair_started = time.perf_counter()
            parsed = json_repair.loads(cleaned)
            _quiz_timing_log("json_repair", (time.perf_counter() - repair_started) * 1000, **(timing_meta or {}))

        if isinstance(parsed, list):
            parsed = {"questions": parsed}

        # Validate using Pydantic
        batch_model = QuizBatchModel.model_validate(parsed)
        _quiz_timing_log("parse_quiz_batch_success", (time.perf_counter() - parse_started) * 1000, **(timing_meta or {}))
        return [q.model_dump() for q in batch_model.questions]
    except Exception as e:
        preview = (raw or "")[:1000]
        logger.error(f"Failed to parse/validate quiz batch: {e}. Raw preview (1000 chars):\n{preview}")
        _quiz_timing_log(
            "parse_quiz_batch_failure",
            (time.perf_counter() - parse_started) * 1000,
            error_type=type(e).__name__,
            **(timing_meta or {}),
        )
        raise e




def _extract_mcq_true_options(question: dict) -> list[str]:
    """
    Parse and normalize the stored MCQ answer key into canonical option strings.
    Supports JSON arrays, comma-separated labels, and direct option text.
    """
    options = question.get("options") or []
    if not isinstance(options, list) or not options:
        return []

    raw = question.get("correct_answer", "")
    parsed: list[str] = []

    if isinstance(raw, list):
        parsed = [str(item).strip() for item in raw if str(item).strip()]
    elif isinstance(raw, str):
        raw = raw.strip()
        if raw.startswith("[") and raw.endswith("]"):
            try:
                arr = json.loads(raw)
                if isinstance(arr, list):
                    parsed = [str(item).strip() for item in arr if str(item).strip()]
            except Exception:
                parsed = []
        if not parsed and raw:
            parsed = [part.strip() for part in raw.split(",") if part.strip()]

    letter_to_index = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
    normalized_option_map = {_normalize_option(opt): opt for opt in options}
    true_options: list[str] = []

    for token in parsed:
        upper = token.upper()
        if upper in letter_to_index and letter_to_index[upper] < len(options):
            true_options.append(options[letter_to_index[upper]])
            continue

        if token.isdigit():
            idx = int(token) - 1
            if 0 <= idx < len(options):
                true_options.append(options[idx])
                continue

        direct = normalized_option_map.get(_normalize_option(token))
        if direct:
            true_options.append(direct)

    deduped: list[str] = []
    seen: set[str] = set()
    for opt in true_options:
        if opt not in seen:
            seen.add(opt)
            deduped.append(opt)
    return deduped


def _extract_selected_mcq_options(selected_answer: Union[str, List[str]], options: list[str]) -> list[str]:
    """
    Robust parser for user checkbox selections.
    Preferred input is a JSON array/list from frontend.
    Legacy comma-joined strings are handled best-effort.
    """
    letter_to_index = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
    normalized_option_map = {_normalize_option(opt): opt for opt in options}

    def _map_tokens(tokens: list[str]) -> list[str]:
        mapped: list[str] = []
        for token in tokens:
            t = str(token).strip()
            if not t:
                continue

            upper = t.upper()
            if upper in letter_to_index and letter_to_index[upper] < len(options):
                mapped.append(options[letter_to_index[upper]])
                continue

            if t.isdigit():
                idx = int(t) - 1
                if 0 <= idx < len(options):
                    mapped.append(options[idx])
                    continue

            direct = normalized_option_map.get(_normalize_option(t))
            if direct:
                mapped.append(direct)
                continue

        deduped: list[str] = []
        seen: set[str] = set()
        for opt in mapped:
            if opt not in seen:
                seen.add(opt)
                deduped.append(opt)
        return deduped

    if isinstance(selected_answer, list):
        return _map_tokens([str(item).strip() for item in selected_answer if str(item).strip()])

    raw = (selected_answer or "").strip()
    if not raw:
        return []

    if raw.startswith("[") and raw.endswith("]"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return _map_tokens([str(item).strip() for item in parsed if str(item).strip()])
        except Exception:
            pass

        # Handle Python repr list strings like "['A', 'C']"
        try:
            import ast
            parsed = ast.literal_eval(raw)
            if isinstance(parsed, list):
                return _map_tokens([str(item).strip() for item in parsed if str(item).strip()])
        except Exception:
            pass

    # Legacy fallback: infer selections by exact option inclusion.
    # This avoids naive comma splitting because option texts can contain commas.
    picked = []
    for option in options:
        if option and option in raw:
            picked.append(option)
    if picked:
        return picked

    # Final fallback for very old payloads with simple labels.
    return _map_tokens([part.strip() for part in raw.split(",") if part.strip()])


def _normalize_question_text(text: str) -> str:
    cleaned = (text or "").strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"[^a-z0-9 ]", "", cleaned)
    return cleaned


def _sanitize_question_stem(question_text: str, options: Optional[list]) -> str:
    """
    Remove option text accidentally embedded inside the question stem.
    This keeps the stem clean while options remain in the dedicated options array.
    """
    raw = (question_text or "").strip()
    if not raw:
        return raw

    cut_index = len(raw)

    marker_patterns = [
        r"\bselect\s+one\s+or\s+more\b",
        r"\bselect\s+all\s+that\s+apply\b",
        r"\b[a-e]\s*[.)]\s+",
    ]
    for pattern in marker_patterns:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match and match.start() > 0:
            cut_index = min(cut_index, match.start())

    if isinstance(options, list):
        question_lower = raw.lower()
        for opt in options:
            opt_core = _strip_option_label(str(opt or ""))
            if not opt_core:
                continue
            idx = question_lower.find(opt_core.lower())
            if idx > 0:
                cut_index = min(cut_index, idx)

    return raw[:cut_index].strip()


def _question_similarity(a: str, b: str) -> float:
    a_norm = _normalize_question_text(a)
    b_norm = _normalize_question_text(b)
    if not a_norm or not b_norm:
        return 0.0
    if a_norm == b_norm:
        return 1.0

    a_tokens = set(a_norm.split())
    b_tokens = set(b_norm.split())
    if not a_tokens or not b_tokens:
        return 0.0

    overlap = len(a_tokens.intersection(b_tokens))
    denom = max(len(a_tokens), len(b_tokens))
    return overlap / denom if denom > 0 else 0.0


def _has_internal_repetition(questions: list[dict], threshold: float = 0.8) -> bool:
    texts = [str(q.get("questionText", "")).strip() for q in questions if str(q.get("questionText", "")).strip()]
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            if _question_similarity(texts[i], texts[j]) >= threshold:
                return True
    return False


async def _build_recent_question_block(
    sb,
    user_id: str,
    course_code: str,
    topic: Optional[str],
    *,
    job_id: Optional[str] = None,
) -> str:
    """
    Pull recent quiz questions for this user/course (and topic when present)
    so the generator can avoid repeating them.
    """
    started = time.perf_counter()
    try:
        quiz_rows = (
            await asyncio.to_thread(
                lambda: sb.table("quizzes")
                .select("id,topic")
                .eq("user_id", user_id)
                .eq("course_code", course_code)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
            )
        ).data or []
        if topic:
            topic_norm = topic.strip().lower()
            quiz_rows = [q for q in quiz_rows if (q.get("topic") or "").strip().lower() == topic_norm]

        quiz_ids = [q.get("id") for q in quiz_rows if q.get("id")]
        if not quiz_ids:
            return ""

        q_rows = (
            await asyncio.to_thread(
                lambda: sb.table("quiz_questions")
                .select("question_text")
                .in_("quiz_id", quiz_ids)
                .limit(120)
                .execute()
            )
        ).data or []
        recent_questions = [str(r.get("question_text", "")).strip() for r in q_rows if str(r.get("question_text", "")).strip()]
        if not recent_questions:
            _quiz_timing_log(
                "build_recent_question_block",
                (time.perf_counter() - started) * 1000,
                job_id=job_id,
                courseCode=course_code,
                topic=topic or "General",
                recent_question_count=0,
            )
            return ""

        # Keep prompt bounded.
        recent_questions = recent_questions[:40]
        lines = "\n".join([f"- {q}" for q in recent_questions])
        result = (
            "RECENTLY USED QUESTIONS (DO NOT REUSE OR PARAPHRASE THESE):\n"
            f"{lines}\n"
            "You must generate a fresh set that covers different concepts/sections.\n"
        )
        _quiz_timing_log(
            "build_recent_question_block",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            courseCode=course_code,
            topic=topic or "General",
            recent_question_count=len(recent_questions),
        )
        return result
    except Exception as exc:
        logger.warning(f"Could not load recent quiz questions for anti-repeat: {exc}")
        _quiz_timing_log(
            "build_recent_question_block_failure",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            courseCode=course_code,
            topic=topic or "General",
            error_type=type(exc).__name__,
        )
        return ""


def _overlap_with_recent(questions: list[dict], recent_block: str, threshold: float = 0.8) -> float:
    if not recent_block:
        return 0.0
    recent_lines = [
        line[2:].strip()
        for line in recent_block.splitlines()
        if line.startswith("- ")
    ]
    if not recent_lines:
        return 0.0

    new_texts = [str(q.get("questionText", "")).strip() for q in questions if str(q.get("questionText", "")).strip()]
    if not new_texts:
        return 0.0

    repeats = 0
    for q in new_texts:
        if any(_question_similarity(q, prev) >= threshold for prev in recent_lines):
            repeats += 1
    return repeats / len(new_texts)


def _truncate_block(text: str, max_chars: int) -> str:
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n...[truncated for prompt budget]..."


def _extract_recent_question_lines(recent_block: str, limit: int = 20) -> list[str]:
    lines = [line[2:].strip() for line in (recent_block or "").splitlines() if line.startswith("- ")]
    return lines[:limit]


def _level_candidates(level: str) -> set[str]:
    raw = (level or "").strip()
    if not raw:
        return set()
    candidates = {raw, raw.lower()}
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        candidates.update({digits, f"{digits}lvl", f"{digits}l", f"{digits} level"})
    return {c.strip().lower() for c in candidates if c.strip()}


def _doc_matches_level(doc_levels: list, user_level: str) -> bool:
    if not doc_levels:
        return True
    user = _level_candidates(user_level)
    if not user:
        return True

    doc_tokens = set()
    for lvl in doc_levels:
        token = str(lvl or "").strip().lower()
        if token:
            doc_tokens.add(token)
            digits = "".join(ch for ch in token if ch.isdigit())
            if digits:
                doc_tokens.update({digits, f"{digits}lvl", f"{digits}l", f"{digits} level"})
    return bool(user.intersection(doc_tokens))


def _topic_match_score(topic: str, doc_topic: Optional[str]) -> int:
    requested = (topic or "").strip().lower()
    actual = (doc_topic or "").strip().lower()
    if not requested or not actual:
        return 0
    if requested == actual:
        return 3
    if requested in actual or actual in requested:
        return 2
    requested_tokens = set(requested.split())
    actual_tokens = set(actual.split())
    return 1 if requested_tokens.intersection(actual_tokens) else 0


def _prepare_embedding_client() -> bool:
    global _embeddings_ready
    if _embeddings_ready:
        return True
    if genai is None:
        return False

    api_key = os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return False

    try:
        genai.configure(api_key=api_key)
        _embeddings_ready = True
        return True
    except Exception as exc:
        logger.warning(f"Failed to configure embedding client: {exc}")
        return False


def _is_ai_retrievable_doc(doc: dict) -> bool:
    return (
        (doc.get("embedding_status") or "").strip().lower() == "completed"
        and (doc.get("material_status") or "").strip().lower() == "active"
    )


def _is_chunk_novel(content: str, selected_contents: list[str], threshold: float = 0.78) -> bool:
    for existing in selected_contents:
        if _question_similarity(content, existing) >= threshold:
            return False
    return True


async def _build_quiz_context_from_embeddings(
    sb,
    body: QuizGenerateRequest,
    *,
    student_university_id: str,
    job_id: Optional[str] = None,
) -> str:
    """
    Retrieval layer for quiz generation:
    - filters documents by course/topic/level
    - retrieves a broad candidate set from vector index
    - diversifies selected chunks across documents and content regions
    """
    started = time.perf_counter()
    cache_key = _quiz_context_cache_key(body, student_university_id)
    cached_context = _quiz_context_cache.get(cache_key)
    if cached_context:
        logger.info(
            "[quiz_context_cache] status=hit job_id=%s courseCode=%s topic=%s numQuestions=%s",
            job_id,
            body.courseCode,
            body.topic or "General",
            body.numQuestions,
        )
        _quiz_timing_log(
            "build_quiz_context_from_embeddings_cache_hit",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            courseCode=body.courseCode,
            topic=body.topic or "General",
            numQuestions=body.numQuestions,
        )
        return cached_context

    logger.info(
        "[quiz_context_cache] status=miss job_id=%s courseCode=%s topic=%s numQuestions=%s",
        job_id,
        body.courseCode,
        body.topic or "General",
        body.numQuestions,
    )

    if not _prepare_embedding_client():
        _quiz_timing_log(
            "build_quiz_context_from_embeddings_unavailable",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            courseCode=body.courseCode,
            topic=body.topic or "General",
            numQuestions=body.numQuestions,
        )
        return ""

    try:
        docs_res = await asyncio.to_thread(
            lambda: sb.table("pans_library")
            .select(
                "id,file_name,course_code,topic,target_levels,embedding_status,material_status,university_id,academic_session,semester"
            )
            .eq("course_code", body.courseCode)
            .eq("university_id", student_university_id)
            .eq("embedding_status", "completed")
            .eq("material_status", "active")
            .execute()
        )
        docs = docs_res.data or []
    except Exception as exc:
        logger.warning(f"Quiz retrieval document lookup failed: {exc}")
        _quiz_timing_log(
            "build_quiz_context_from_embeddings_failure",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            courseCode=body.courseCode,
            topic=body.topic or "General",
            numQuestions=body.numQuestions,
            stage="document_lookup",
            error_type=type(exc).__name__,
        )
        return ""
    if not docs:
        logger.info(
            "No quiz source documents found for university_id=%s course_code=%s",
            student_university_id,
            body.courseCode,
        )
        return ""

    requested_academic_session = (body.academic_session or "").strip()
    requested_semester = normalize_semester(body.semester)
    context_filter_source = "request" if (requested_academic_session or requested_semester) else None
    if not requested_academic_session and not requested_semester:
        academic_context = await get_current_academic_context(student_university_id)
        if academic_context:
            requested_academic_session = (academic_context.get("current_academic_session") or "").strip()
            requested_semester = normalize_semester(academic_context.get("current_semester"))
            context_filter_source = "current_academic_context"

    def _filter_docs(*, apply_academic_context: bool) -> list[dict]:
        next_docs = []
        for doc in docs:
            if not _is_ai_retrievable_doc(doc):
                continue
            if apply_academic_context:
                if requested_academic_session and (doc.get("academic_session") or "").strip() != requested_academic_session:
                    continue
                if requested_semester and normalize_semester(doc.get("semester")) != requested_semester:
                    continue
            if not _doc_matches_level(doc.get("target_levels") or [], body.level):
                continue
            next_docs.append(doc)
        return next_docs

    filtered_docs = _filter_docs(apply_academic_context=bool(requested_academic_session or requested_semester))
    if not filtered_docs and context_filter_source == "current_academic_context":
        logger.info(
            "No quiz documents matched current academic context for university_id=%s course_code=%s session=%s semester=%s; falling back to active course/level documents",
            student_university_id,
            body.courseCode,
            requested_academic_session,
            requested_semester,
        )
        filtered_docs = _filter_docs(apply_academic_context=False)

    if not filtered_docs:
        logger.info(
            "No AI-retrievable quiz documents found for university_id=%s course_code=%s level=%s",
            student_university_id,
            body.courseCode,
            body.level,
        )
        return ""

    if body.topic:
        topic_scored = [(_topic_match_score(body.topic, d.get("topic")), d) for d in filtered_docs]
        strong = [d for score, d in topic_scored if score >= 2]
        if strong:
            filtered_docs = strong

    allowed_doc_ids = [d.get("id") for d in filtered_docs if d.get("id")]
    if not allowed_doc_ids:
        return ""

    retrieval_query = (
        f"{body.courseTitle} ({body.courseCode}) "
        f"Topic: {body.topic or 'General'} "
        f"Level: {body.level} Difficulty: {body.difficulty} "
        f"Question type: {body.questionType}. "
        "Find diverse examinable concepts across different sections."
    )

    try:
        embed_result = await asyncio.to_thread(
            genai.embed_content,
            model="models/gemini-embedding-001",
            content=retrieval_query,
            task_type="retrieval_query",
            output_dimensionality=768,
        )
        query_vector = embed_result["embedding"]
    except Exception as exc:
        logger.warning(f"Quiz retrieval embedding failed: {exc}")
        _quiz_timing_log(
            "build_quiz_context_from_embeddings_failure",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            courseCode=body.courseCode,
            topic=body.topic or "General",
            numQuestions=body.numQuestions,
            stage="embedding",
            error_type=type(exc).__name__,
        )
        return ""

    try:
        rpc_res = await asyncio.to_thread(
            lambda: sb.rpc(
                "match_documents_global",
                {
                    "query_embedding": query_vector,
                    "match_threshold": 0.18,
                    "match_count": 120,
                    "allowed_doc_ids": allowed_doc_ids,
                },
            ).execute()
        )
        rows = rpc_res.data or []
    except Exception as exc:
        logger.warning(f"Quiz retrieval RPC failed: {exc}")
        _quiz_timing_log(
            "build_quiz_context_from_embeddings_failure",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            courseCode=body.courseCode,
            topic=body.topic or "General",
            numQuestions=body.numQuestions,
            stage="vector_rpc",
            error_type=type(exc).__name__,
        )
        return ""

    if not rows:
        return ""

    # Rank docs by best score first for balanced sampling.
    doc_best: dict[str, float] = {}
    for row in rows:
        doc_id = row.get("document_id")
        sim = float(row.get("similarity") or 0.0)
        if not doc_id:
            continue
        doc_best[doc_id] = max(doc_best.get(doc_id, 0.0), sim)

    doc_order = [d for d, _ in sorted(doc_best.items(), key=lambda x: x[1], reverse=True)]
    rows_by_doc: dict[str, list[dict]] = {}
    for row in sorted(rows, key=lambda r: float(r.get("similarity") or 0.0), reverse=True):
        doc_id = row.get("document_id")
        if not doc_id:
            continue
        rows_by_doc.setdefault(doc_id, []).append(row)

    max_chunks = max(12, min(32, body.numQuestions * 3))
    per_doc_cap = max(2, min(6, max_chunks // max(1, min(len(doc_order), 5))))

    selected_rows: list[dict] = []
    selected_contents: list[str] = []
    selected_per_doc: dict[str, int] = {}

    made_progress = True
    while len(selected_rows) < max_chunks and made_progress:
        made_progress = False
        for doc_id in doc_order:
            if len(selected_rows) >= max_chunks:
                break
            if selected_per_doc.get(doc_id, 0) >= per_doc_cap:
                continue
            candidates = rows_by_doc.get(doc_id) or []
            while candidates:
                candidate = candidates.pop(0)
                content = str(candidate.get("content") or "").strip()
                if not content:
                    continue
                if not _is_chunk_novel(content, selected_contents):
                    continue
                selected_rows.append(candidate)
                selected_contents.append(content)
                selected_per_doc[doc_id] = selected_per_doc.get(doc_id, 0) + 1
                made_progress = True
                break

    if not selected_rows:
        return ""

    meta_by_id = {d.get("id"): d for d in filtered_docs if d.get("id")}
    context_lines = []
    for idx, row in enumerate(selected_rows, start=1):
        doc_id = row.get("document_id")
        meta = meta_by_id.get(doc_id, {})
        title = meta.get("file_name") or "Unknown Source"
        topic = meta.get("topic") or "General"
        snippet = str(row.get("content") or "").strip()
        snippet = re.sub(r"\s+", " ", snippet)
        if len(snippet) > 700:
            snippet = snippet[:700].rstrip() + "..."
        context_lines.append(f"[{idx}] Source: {title} | Topic: {topic}\n{snippet}")

    result = (
        "CURRICULUM CONTEXT (RETRIEVED FROM EMBEDDINGS):\n"
        + "\n\n".join(context_lines)
    )
    _quiz_context_cache[cache_key] = result
    _quiz_timing_log(
        "build_quiz_context_from_embeddings",
        (time.perf_counter() - started) * 1000,
        job_id=job_id,
        courseCode=body.courseCode,
        topic=body.topic or "General",
        numQuestions=body.numQuestions,
        context_chunks=len(selected_rows),
    )
    return result


def _serialize_http_detail(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    try:
        return json.dumps(detail)
    except Exception:
        return str(detail)


# [QUIZ BATCH FIX] — make async
async def _update_quiz_generation_job(
    sb,
    job_id: Optional[str],
    *,
    status: str,
    progress: int,
    current_step: str,
    error_message: Optional[str] = None,
    quiz_id: Optional[str] = None,
    generated_question_count: Optional[int] = None,
    target_question_count: Optional[int] = None,
) -> None:
    if not job_id:
        return

    started = time.perf_counter()
    payload = {
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "current_step": current_step,
        "error_message": error_message,
    }
    if quiz_id is not None:
        payload["quiz_id"] = quiz_id
    if generated_question_count is not None:
        payload["generated_question_count"] = max(0, int(generated_question_count))
    if target_question_count is not None:
        payload["target_question_count"] = max(0, int(target_question_count))
    if status in {"completed", "failed", "cancelled"}:
        payload["completed_at"] = datetime.now(timezone.utc).isoformat()

    try:
        def _update():
            query = sb.table("quiz_generation_jobs").update(payload).eq("id", job_id)
            if status != "cancelled":
                query = query.neq("status", "cancelled")
            try:
                query.execute()
            except Exception as exc:
                if "generated_question_count" not in str(exc) and "target_question_count" not in str(exc):
                    raise
                fallback_payload = _job_payload_without_count_fields(payload)
                fallback_query = sb.table("quiz_generation_jobs").update(fallback_payload).eq("id", job_id)
                if status != "cancelled":
                    fallback_query = fallback_query.neq("status", "cancelled")
                fallback_query.execute()
        await asyncio.to_thread(_update)
        _quiz_timing_log(
            "update_quiz_generation_job",
            (time.perf_counter() - started) * 1000,
            job_id=job_id,
            quiz_id=quiz_id,
            status=status,
            progress=payload["progress"],
        )
    except Exception as exc:
        logger.warning("Failed to update quiz generation job %s: %s", job_id, exc)
# [QUIZ BATCH FIX]


async def _generate_quiz_json_response(
    system_prompt: str,
    user_prompt: str,
    response_format: Optional[dict] = None,
    *,
    audit_meta: Optional[dict[str, Any]] = None,
) -> str:
    messages = merge_system_into_user([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ])
    response = await llm_engine.generate_completion_with_failover(
        messages=messages,
        temperature=QUIZ_GENERATION_TEMPERATURE,
        max_tokens=QUIZ_GENERATION_MAX_TOKENS,
        has_images=False,
        stream=False,
        force_google=False,
        requested_model=llm_engine.TEXT_SECONDARY,  # [QUIZ BATCH FIX]
        response_format=response_format,
        audit_meta=audit_meta,
    )
    if response is None:
        raise RuntimeError("LLM generation failed on all available clients")

    choice = response.choices[0] if response.choices else None
    content = choice.message.content if choice else None

    # Safe response metadata logging when content is empty or whitespace
    if not content or not str(content).strip():
        choices_len = len(response.choices) if response.choices else 0
        finish_reason = choice.finish_reason if choice else "N/A"
        is_none = content is None
        is_empty = content == ""
        logger.warning(
            f"[WARNING] LLM returned empty response content. "
            f"Metadata: choices_len={choices_len}, finish_reason={finish_reason}, "
            f"content_is_None={is_none}, content_is_empty={is_empty}"
        )

    if isinstance(content, list):
        content = "\n".join(
            str(part.get("text", "")) if isinstance(part, dict) else str(part)
            for part in content
        )

    visible_text, _thinking_text = strip_thinking_tokens(str(content or ""))
    return str(visible_text).strip()


def _classify_quiz_generation_exception(exc: Exception) -> str:
    if isinstance(exc, asyncio.TimeoutError):
        return "llm_timeout"

    if isinstance(exc, ValidationError):
        return "schema_validation_failure"

    message = str(exc or "").strip().lower()
    if "empty response" in message:
        return "empty_response"
    if "json" in message and ("parse" in message or "decode" in message or "repair" in message):
        return "parse_failure"
    if "validation" in message or "pydantic" in message:
        return "schema_validation_failure"
    if "provider" in message or "client" in message or "model" in message:
        return "provider_error"
    return "provider_error"



async def _generate_quiz_grading_response(system_prompt: str, user_prompt: str) -> str:
    messages = merge_system_into_user([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ])
    response = await llm_engine.generate_completion_with_failover(
        messages=messages,
        temperature=QUIZ_GRADING_TEMPERATURE,
        max_tokens=QUIZ_GRADING_MAX_TOKENS,
        has_images=False,
        stream=False,
        force_google=False,
    )
    if response is None:
        raise RuntimeError("LLM grading failed on all available clients")

    content = response.choices[0].message.content
    if isinstance(content, list):
        content = "\n".join(
            str(part.get("text", "")) if isinstance(part, dict) else str(part)
            for part in content
        )

    visible_text, _thinking_text = strip_thinking_tokens(str(content or ""))
    return str(visible_text).strip()


# ---------- Internal generation ----------

async def _generate_quiz_now(
    body: QuizGenerateRequest,
    current_user: User,
    *,
    job_id: Optional[str] = None,
):
    """Generate quiz questions using LLM and save to database."""
    request_meta = {
        "job_id": job_id,
        "courseCode": body.courseCode,
        "topic": body.topic or "General",
        "numQuestions": body.numQuestions,
    }
    restriction_started = time.perf_counter()
    restriction = await _get_quiz_restriction_if_any(current_user)
    _quiz_timing_log("restriction_check", (time.perf_counter() - restriction_started) * 1000, **request_meta)
    if restriction:
        return JSONResponse(status_code=423, content=build_restriction_block_payload(restriction))

    sb = _get_supabase()
    # [QUIZ BATCH FIX] — await async update
    await _update_quiz_generation_job(
        sb,
        job_id,
        status="retrieving",
        progress=12,
        current_step="Finding course materials",
        generated_question_count=0,
        target_question_count=max(1, int(body.numQuestions or 10)),
    )
    student_context_started = time.perf_counter()
    student_context = await resolve_student_university_context(current_user)
    _quiz_timing_log("resolve_student_university_context", (time.perf_counter() - student_context_started) * 1000, **request_meta)
    student_university_id = student_context.get("university_id")
    if not student_university_id:
        raise HTTPException(
            status_code=400,
            detail="Complete your profile with your university before generating document-based quizzes.",
        )
    student_level = (student_context.get("level") or "").strip()
    if not student_level:
        raise HTTPException(
            status_code=400,
            detail="Complete your profile with your academic level before generating quizzes.",
        )
    body.level = student_level

    q_type = getattr(body, "questionType", "OBJECTIVE") or "OBJECTIVE"
    if q_type in ("OBJECTIVE", "multiple_choice", "MCQ"):
        type_desc = "multiple-choice"
        if q_type == "MCQ":
            format_reqs = '''- "questionType": "MCQ"
- "options": an array of exactly 5 option strings, e.g. ["A. Option A", "B. Option B", "C. Option C", "D. Option D", "E. Option E"]
- "correctAnswer": a string of comma-separated option labels from ["A","B","C","D","E"], e.g. "A, C, E"
- Include in the question stem: "Select one or more."
- EXACTLY 3 options must be true and EXACTLY 2 options must be false.'''
            example_json = '''{
  "questions": [
    {
      "questionText": "Which of the following are primary side effects of drug X? Select one or more.",
      "questionType": "MCQ",
      "options": ["A. Side effect 1", "B. Side effect 2", "C. Side effect 3", "D. Side effect 4", "E. Side effect 5"],
      "correctAnswer": "A, C, E",
      "explanation": "Brief explanation of why A, C, and E are the correct side effects."
    }
  ]
}'''
        else:
            format_reqs = '''- "questionType": "multiple_choice"
- "options": an array of exactly 4 option strings, e.g. ["A. Option A", "B. Option B", "C. Option C", "D. Option D"]
- "correctAnswer": the letter of the correct option (e.g. "A") or the full labeled option (e.g. "A. Option A")'''
            example_json = '''{
  "questions": [
    {
      "questionText": "Example pharmacy question?",
      "questionType": "multiple_choice",
      "options": ["A. Option one", "B. Option two", "C. Option three", "D. Option four"],
      "correctAnswer": "A. Option one",
      "explanation": "Brief explanation of why A is correct."
    }
  ]
}'''
    elif q_type == "TRUE_FALSE":
        type_desc = "true/false"
        format_reqs = '''- "questionType": "TRUE_FALSE"
- "options": ["True", "False"]
- "correctAnswer": "True" or "False"'''
        example_json = '''{
  "questions": [
    {
      "questionText": "Drug X is classified as a beta-blocker.",
      "questionType": "TRUE_FALSE",
      "options": ["True", "False"],
      "correctAnswer": "True",
      "explanation": "Brief explanation of why it is True."
    }
  ]
}'''
    elif q_type == "SHORT_ANSWER":
        type_desc = "short answer"
        format_reqs = '''- "questionType": "SHORT_ANSWER"
- "correctAnswer": the exact short phrase or word that answers the question
(Do not include an options field)'''
        example_json = '''{
  "questions": [
    {
      "questionText": "What is the chemical name of drug Y?",
      "questionType": "SHORT_ANSWER",
      "options": null,
      "correctAnswer": "Y-name",
      "explanation": "Brief explanation of why Y-name is correct."
    }
  ]
}'''
    else:
        type_desc = "multiple-choice"
        format_reqs = '''- "questionType": "multiple_choice"
- "options": an array of 4 option strings ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correctAnswer": the letter of the correct option (e.g. "A") or the full labeled option (e.g. "A. Option A")'''
        example_json = '''{
  "questions": [
    {
      "questionText": "Example pharmacy question?",
      "questionType": "multiple_choice",
      "options": ["A. Option one", "B. Option two", "C. Option three", "D. Option four"],
      "correctAnswer": "A. Option one",
      "explanation": "Brief explanation of why A is correct."
    }
  ]
}'''


    try:
        recent_question_block = await _build_recent_question_block(
            sb=sb,
            user_id=current_user.id,
            course_code=body.courseCode,
            topic=body.topic,
            job_id=job_id,
        )
    except Exception as exc:
        logger.warning(f"Could not build recent-question block: {exc}")
        recent_question_block = ""

    try:
        retrieved_context_block = await _build_quiz_context_from_embeddings(
            sb,
            body,
            student_university_id=student_university_id,
            job_id=job_id,
        )
    except Exception as exc:
        logger.warning(f"Could not build embedding context block: {exc}")
        retrieved_context_block = ""

    if not (retrieved_context_block or "").strip():
        raise HTTPException(
            status_code=404,
            detail="No active processed materials were found for this course in your university.",
        )

    await _update_quiz_generation_job(
        sb,
        job_id,
        status="generating",
        progress=20,
        current_step="Generating questions",
    )

    # Keep prompt size bounded for high question counts.
    recent_lines = _extract_recent_question_lines(recent_question_block, limit=20)
    recent_block_small = (
        "RECENTLY USED QUESTIONS (DO NOT REUSE OR PARAPHRASE THESE):\n"
        + "\n".join([f"- {q}" for q in recent_lines])
        + "\n"
    ) if recent_lines else ""
    context_block_small = _truncate_block(retrieved_context_block, max_chars=6000)



    def _build_generation_prompts(batch_count: int, already_used: list[str], compact: bool = False) -> tuple[str, str]:
        nonce = str(uuid.uuid4())[:8]
        used_block = ""
        if already_used:
            used_lines = "\n".join([f"- {q}" for q in already_used[:40]])
            used_block = (
                "ALREADY GENERATED IN THIS QUIZ (DO NOT REUSE/PARAPHRASE):\n"
                f"{used_lines}\n"
            )

        system_prompt = f"""/no_think
You are PANSGPT's quiz generation engine for pharmacy students.

You must return only machine-parseable JSON conforming to the requested schema. Do not include markdown, code fences, prose, comments, headings, or thinking tags.

Output contract:
- Return a JSON object containing a "questions" key which holds a list of exactly {batch_count} question objects.
- Each object must include:
  - "questionText": the question string (minimum 10 characters)
  - "questionType": one of ["mcq", "multiple_choice", "TRUE_FALSE", "SHORT_ANSWER"]
  - "options": options list or null
  - "correctAnswer": the correct answer string
  - "explanation": a detailed explanation of the correct answer (minimum 10 characters)

Specific rules by type:
{format_reqs}

Example output format:
{example_json}

Diversity rules:
- Avoid repeating any previously asked questions or close paraphrases.
- Spread questions across different concepts/sections of the material.
- Vary question phrasing and scenario framing.

Grounding rules:
- Build questions from the retrieved curriculum context when provided.
- Cover multiple different excerpts/sources in the context, not just one narrow subsection.
- Do not invent facts outside the retrieved context unless needed for wording clarity.
- Do not copy sentences verbatim from the retrieved context. Rephrase questions, options, and explanations in your own words to avoid copying/recitation safety filters."""

        user_prompt = f"""Generate {batch_count} {type_desc} quiz questions.

Course title: {body.courseTitle}
Course code: {body.courseCode}
Topic: {body.topic or 'General'}
Difficulty: {body.difficulty}
Academic level: {body.level}
Generation nonce: {nonce}

{context_block_small if not compact else "CURRICULUM CONTEXT: Use the same course/topic constraints, but keep the prompt compact for this retry."}

{recent_block_small}
{used_block}

Return only the JSON object."""

        return system_prompt, user_prompt

    try:
        target_count = max(1, int(body.numQuestions or 10))
        batch_size = QUIZ_BATCH_SIZE
        questions: list[dict] = []

        # [QUIZ BATCH FIX] — Insert quiz header BEFORE the generation loop
        quiz_insert_started = time.perf_counter()
        quiz_res = await asyncio.to_thread(
            lambda: sb.table("quizzes").insert({
                "user_id": current_user.id,
                "title": f"{body.courseTitle} - {body.topic or 'General'} Quiz",
                "course_code": body.courseCode,
                "course_title": body.courseTitle,
                "topic": body.topic,
                "level": body.level,
                "difficulty": body.difficulty,
                "num_questions": target_count,
                "time_limit": body.timeLimit,
            }).execute()
        )
        quiz_id = quiz_res.data[0]["id"]
        _quiz_timing_log("quiz_header_insert", (time.perf_counter() - quiz_insert_started) * 1000, quiz_id=quiz_id, **request_meta)

        # Expose quiz_id in the job record now that the quiz row exists.
        # The frontend polls this and navigates as soon as the first batch
        # of questions is inserted — no need to wait for full completion.
        await _update_quiz_generation_job(
            sb,
            job_id,
            status="generating",
            progress=20,
            current_step="Generating questions",
            generated_question_count=0,
            target_question_count=target_count,
            quiz_id=quiz_id,
        )

        # Resolve $refs and remove $defs from the final schema passed to Gemini
        inlined_schema = _inline_schema_defs(QuizBatchModel.model_json_schema())
        if os.getenv("ENVIRONMENT", "development").lower() != "production":
            has_defs = "$defs" in inlined_schema
            has_refs = "$ref" in json.dumps(inlined_schema)
            logger.info(f"[DEBUG] Final inlined schema info: has_defs={has_defs}, has_refs={has_refs}")

        # JSON Schema format dictionary for structured outputs
        batch_schema = {
            "type": "json_schema",
            "json_schema": {
                "name": "quiz_batch",
                "schema": inlined_schema,
                "strict": True
            }
        }

        batch_number = 0
        while len(questions) < target_count:
            batch_number += 1
            remaining = target_count - len(questions)
            current_batch = min(batch_size, remaining)
            generated_this_batch = None
            last_failure_code = "provider_error"

            already_used = [str(q.get("questionText", "")).strip() for q in questions if str(q.get("questionText", "")).strip()]
            for attempt in range(1, 4):
                compact_mode = attempt >= 2 and target_count >= 15
                prompt_started = time.perf_counter()
                system_prompt, user_prompt = _build_generation_prompts(current_batch, already_used, compact=compact_mode)
                _quiz_timing_log(
                    "build_generation_prompts",
                    (time.perf_counter() - prompt_started) * 1000,
                    quiz_id=quiz_id,
                    batch_number=batch_number,
                    batch_size=current_batch,
                    attempt_number=attempt,
                    generated_count_so_far=len(questions),
                    **request_meta,
                )
                
                # Determine current response format for progressive fallback sequence
                if attempt == 1:
                    current_response_format = batch_schema
                    response_format_mode = "json_schema"
                elif attempt == 2:
                    current_response_format = {"type": "json_object"}
                    response_format_mode = "json_object"
                else:  # attempt == 3
                    current_response_format = None
                    response_format_mode = "plain_text"

                batch_attempt_started = time.perf_counter()
                _quiz_timing_log(
                    "llm_attempt_started",
                    0.0,
                    quiz_id=quiz_id,
                    batch_number=batch_number,
                    batch_size=current_batch,
                    attempt_number=attempt,
                    response_format_mode=response_format_mode,
                    generated_count_so_far=len(questions),
                    model=llm_engine.TEXT_SECONDARY,
                    timeout_seconds=QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                    **request_meta,
                )
                try:
                    llm_started = time.perf_counter()
                    raw = await asyncio.wait_for(
                        _generate_quiz_json_response(
                            system_prompt,
                            user_prompt,
                            response_format=current_response_format,
                            audit_meta={
                                **request_meta,
                                "quiz_id": quiz_id,
                                "batch_number": batch_number,
                                "batch_size": current_batch,
                                "attempt_number": attempt,
                                "generated_count_so_far": len(questions),
                                "timeout_seconds": QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                            },
                        ),
                        timeout=QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                    )
                    _quiz_timing_log(
                        "llm_attempt_completed",
                        (time.perf_counter() - llm_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        model=llm_engine.TEXT_SECONDARY,
                        timeout_seconds=QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                        **request_meta,
                    )
                    _quiz_timing_log(
                        "generate_quiz_json_response",
                        (time.perf_counter() - llm_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        **request_meta,
                    )
                    parsed = _parse_quiz_batch(
                        raw,
                        timing_meta={
                            **request_meta,
                            "quiz_id": quiz_id,
                            "batch_number": batch_number,
                            "batch_size": current_batch,
                            "attempt_number": attempt,
                            "response_format_mode": response_format_mode,
                            "generated_count_so_far": len(questions),
                        },
                    )
                except asyncio.TimeoutError:
                    last_failure_code = "llm_timeout"
                    _quiz_timing_log(
                        "llm_attempt_timeout",
                        (time.perf_counter() - llm_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        model=llm_engine.TEXT_SECONDARY,
                        timeout_seconds=QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                        failure_code="llm_timeout",
                        **request_meta,
                    )
                    _quiz_timing_log(
                        "generate_quiz_json_response_timeout",
                        (time.perf_counter() - llm_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        timeout_seconds=QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                        **request_meta,
                    )
                    _quiz_timing_log(
                        "llm_batch_attempt_failure",
                        (time.perf_counter() - batch_attempt_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        error_type="TimeoutError",
                        timeout_seconds=QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                        **request_meta,
                    )
                    continue
                except Exception as e:
                    logger.warning(f"Quiz batch generation or parse failed (batch={current_batch}, attempt={attempt}): {e}")
                    failure_code = _classify_quiz_generation_exception(e)
                    last_failure_code = failure_code
                    _quiz_timing_log(
                        "llm_attempt_failed",
                        (time.perf_counter() - llm_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        model=llm_engine.TEXT_SECONDARY,
                        timeout_seconds=QUIZ_LLM_ATTEMPT_TIMEOUT_SECONDS,
                        failure_code=failure_code,
                        error_type=type(e).__name__,
                        **request_meta,
                    )
                    _quiz_timing_log(
                        "llm_batch_attempt_failure",
                        (time.perf_counter() - batch_attempt_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        error_type=type(e).__name__,
                        failure_code=failure_code,
                        **request_meta,
                    )
                    continue

                # Dynamic repetition tolerance: slightly relaxed for larger requested sets.
                overlap_limit = 0.55 if target_count >= 20 else 0.40
                dedupe_started = time.perf_counter()
                internal_repeat = _has_internal_repetition(parsed, threshold=0.85)
                overlap_ratio = _overlap_with_recent(parsed, recent_block_small, threshold=0.8)

                # Remove items that duplicate already generated questions or fail quality validation.
                deduped = []
                for item in parsed:
                    text = str(item.get("questionText", "")).strip()
                    if not text or len(text) < 10:
                        continue
                    if any(_question_similarity(text, prev) >= 0.82 for prev in already_used):
                        continue

                    # Manual Quality Checks
                    opt_type = item.get("questionType", q_type)
                    opts = item.get("options")
                    correct = item.get("correctAnswer")
                    
                    # Normalise option types for manual check
                    opt_type_upper = opt_type.upper()
                    if opt_type_upper == "SHORT_ANSWER":
                        if opts is not None and len(opts) > 0:
                            continue
                    elif opt_type_upper == "TRUE_FALSE":
                        if opts is None or len(opts) != 2:
                            continue
                    elif opt_type_upper in ("MCQ", "MULTIPLE_CHOICE", "OBJECTIVE"):
                        if opt_type_upper == "MCQ":
                            if opts is None or len(opts) != 5:
                                continue
                        else:
                            if opts is None or not (4 <= len(opts) <= 5):
                                continue

                    # Ensure options do not contain duplicates
                    if opts:
                        seen_opts = set()
                        has_dup = False
                        for opt in opts:
                            norm_opt = _normalize_option(opt)
                            if norm_opt in seen_opts:
                                has_dup = True
                                break
                            seen_opts.add(norm_opt)
                        if has_dup:
                            continue

                    # Ensure correctAnswer is not empty and matches a valid option or label index
                    if not _is_valid_correct_answer(correct, opts, opt_type_upper):
                        continue

                    deduped.append(item)
                _quiz_timing_log(
                    "deduplication_filtering",
                    (time.perf_counter() - dedupe_started) * 1000,
                    quiz_id=quiz_id,
                    batch_number=batch_number,
                    batch_size=current_batch,
                    attempt_number=attempt,
                    response_format_mode=response_format_mode,
                    generated_count_so_far=len(questions),
                    parsed_count=len(parsed),
                    accepted_count=len(deduped),
                    **request_meta,
                )

                if (internal_repeat or overlap_ratio > overlap_limit) and attempt < 3:
                    last_failure_code = "dedupe_rejected_all"
                    _quiz_timing_log(
                        "llm_batch_attempt_rejected",
                        (time.perf_counter() - batch_attempt_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        failure_code="dedupe_rejected_all",
                        internal_repeat=internal_repeat,
                        overlap_ratio=round(overlap_ratio, 4),
                        **request_meta,
                    )
                    logger.warning(
                        f"Quiz batch repetition high (attempt={attempt}, internal={internal_repeat}, overlap={overlap_ratio:.2f})"
                    )
                    continue

                if not deduped and attempt < 3:
                    last_failure_code = "quality_validation_rejected_all"
                    _quiz_timing_log(
                        "llm_batch_attempt_rejected",
                        (time.perf_counter() - batch_attempt_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=current_batch,
                        attempt_number=attempt,
                        response_format_mode=response_format_mode,
                        generated_count_so_far=len(questions),
                        failure_code="quality_validation_rejected_all",
                        parsed_count=len(parsed),
                        **request_meta,
                    )
                    continue

                generated_this_batch = deduped[:current_batch]
                _quiz_timing_log(
                    "llm_batch_attempt_success",
                    (time.perf_counter() - batch_attempt_started) * 1000,
                    quiz_id=quiz_id,
                    batch_number=batch_number,
                    batch_size=current_batch,
                    attempt_number=attempt,
                    response_format_mode=response_format_mode,
                    generated_count_so_far=len(questions),
                    accepted_count=len(generated_this_batch),
                    **request_meta,
                )
                break

            if not generated_this_batch:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "code": last_failure_code,
                        "message": "Unable to generate enough diverse questions right now. Please try fewer questions or try again.",
                    },
                )

            questions.extend(generated_this_batch)

            # [QUIZ BATCH FIX] — save this batch immediately, don't wait for loop end
            questions_saved_so_far = len(questions) - len(generated_this_batch)
            batch_to_insert = []
            for idx, q in enumerate(generated_this_batch):
                question_order = questions_saved_so_far + idx + 1
                question_type = q.get("questionType", "multiple_choice")
                options = q.get("options")
                correct_answer = q.get("correctAnswer", "")
                points = 1

                # Normalize standard question type labels for DB compatibility
                if question_type.upper() in ("MULTIPLE_CHOICE", "OBJECTIVE"):
                    question_type = "multiple_choice"
                elif question_type.upper() == "TRUE_FALSE":
                    question_type = "TRUE_FALSE"
                elif question_type.upper() == "SHORT_ANSWER":
                    question_type = "SHORT_ANSWER"

                # Normalise option types for manual check
                if q_type == "MCQ" or question_type.upper() == "MCQ":
                    question_type = "MCQ"
                    if not isinstance(options, list):
                        options = []
                    options = [str(opt).strip() for opt in options if str(opt).strip()]
                    if len(options) > 5:
                        options = options[:5]
                    while len(options) < 5:
                        options.append(f"Option {len(options) + 1}")

                    label_to_option = {
                        "A": options[0],
                        "B": options[1],
                        "C": options[2],
                        "D": options[3],
                        "E": options[4],
                    }

                    labels = []
                    if isinstance(correct_answer, list):
                        labels = [str(item).strip().upper() for item in correct_answer]
                    elif isinstance(correct_answer, str):
                        labels = [part.strip().upper() for part in correct_answer.split(",") if part.strip()]

                    normalized_option_map = {_normalize_option(opt): opt for opt in options}
                    true_options = []
                    for label in labels:
                        if label in label_to_option:
                            true_options.append(label_to_option[label])
                            continue
                        if label.isdigit() and 1 <= int(label) <= 5:
                            true_options.append(options[int(label) - 1])
                            continue
                        direct = normalized_option_map.get(_normalize_option(label))
                        if direct:
                            true_options.append(direct)

                    deduped_true_options = []
                    seen = set()
                    for opt in true_options:
                        if opt not in seen:
                            seen.add(opt)
                            deduped_true_options.append(opt)

                    if len(deduped_true_options) > 3:
                        deduped_true_options = deduped_true_options[:3]
                    if len(deduped_true_options) < 3:
                        for fallback_opt in options:
                            if fallback_opt not in deduped_true_options:
                                deduped_true_options.append(fallback_opt)
                            if len(deduped_true_options) == 3:
                                break

                    correct_answer = json.dumps(deduped_true_options)
                    points = 5

                else:
                    # Single select MCQ correction / label mapping
                    if question_type == "multiple_choice" and options:
                        norm_correct = _normalize_option(correct_answer)
                        letter_to_index = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
                        index_to_letter = {0: "A", 1: "B", 2: "C", 3: "D", 4: "E"}
                        
                        found_letter = None
                        upper_correct = correct_answer.strip().upper()
                        if upper_correct in letter_to_index and letter_to_index[upper_correct] < len(options):
                            found_letter = upper_correct
                        else:
                            for i, opt in enumerate(options):
                                if _normalize_option(opt) == norm_correct:
                                    found_letter = index_to_letter[i]
                                    break
                            if not found_letter:
                                stripped_correct = _strip_option_label(correct_answer).lower().strip()
                                for i, opt in enumerate(options):
                                    if _strip_option_label(opt).lower().strip() == stripped_correct:
                                        found_letter = index_to_letter[i]
                                        break
                        if found_letter:
                            correct_answer = found_letter

                    elif question_type == "TRUE_FALSE":
                        if correct_answer.strip().lower() == "true":
                            correct_answer = "True"
                        else:
                            correct_answer = "False"

                batch_to_insert.append({
                    "quiz_id": quiz_id,
                    "question_text": _sanitize_question_stem(q["questionText"], options),
                    "question_type": question_type,
                    "options": options,
                    "correct_answer": correct_answer,
                    "explanation": q.get("explanation"),
                    "points": points,
                    "question_order": question_order,
                })

            if batch_to_insert:
                try:
                    insert_started = time.perf_counter()
                    await asyncio.to_thread(
                        lambda b=batch_to_insert: sb.table("quiz_questions").insert(b).execute()
                    )
                    _quiz_timing_log(
                        "quiz_questions_insert",
                        (time.perf_counter() - insert_started) * 1000,
                        quiz_id=quiz_id,
                        batch_number=batch_number,
                        batch_size=len(batch_to_insert),
                        generated_count_so_far=len(questions),
                        **request_meta,
                    )
                except Exception as db_err:
                    logger.error(f"[ERROR] Quiz DB Insertion Failed: {db_err}")
                    raise HTTPException(status_code=500, detail="Quiz was generated but could not be saved. Please try again.")

            # [QUIZ BATCH FIX] — update progress after each batch
            batch_progress = int((len(questions) / target_count) * 65) + 20
            batch_progress = min(batch_progress, 85)
            await _update_quiz_generation_job(
                sb, job_id,
                status="generating",
                progress=batch_progress,
                current_step=f"Generated {len(questions)} of {target_count} questions",
                generated_question_count=len(questions),
                target_question_count=target_count,
            )
            # [QUIZ BATCH FIX]

        questions = questions[:target_count]

        # [QUIZ BATCH FIX] — update job progress to saving phase
        await _update_quiz_generation_job(
            sb,
            job_id,
            status="saving",
            progress=86,
            current_step="Saving quiz",
            generated_question_count=len(questions),
            target_question_count=target_count,
        )
        # [QUIZ BATCH FIX] — completed progress update
        await _update_quiz_generation_job(
            sb,
            job_id,
            status="completed",
            progress=100,
            current_step="Quiz ready",
            quiz_id=quiz_id,
            generated_question_count=len(questions),
            target_question_count=target_count,
        )

        # Return the created quiz
        final_fetch_started = time.perf_counter()
        result = await get_quiz(quiz_id, current_user)
        _quiz_timing_log("final_get_quiz", (time.perf_counter() - final_fetch_started) * 1000, quiz_id=quiz_id, **request_meta)
        return result

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Quiz generation: JSON parse error: {e}")
        raise HTTPException(status_code=500, detail={"code": "parse_failure", "message": "Failed to parse AI response into quiz questions"})
    except Exception as e:
        logger.error(f"Quiz generation error: {e}")
        raise HTTPException(status_code=500, detail={"code": _classify_quiz_generation_exception(e), "message": "Unable to generate quiz. Please try again."})


async def _process_quiz_generation_job(job_id: str, body_payload: dict, user_payload: dict) -> None:
    sb = _get_supabase()
    try:
        body = QuizGenerateRequest.model_validate(body_payload)
        current_user = User.model_validate(user_payload)
        await _generate_quiz_now(body, current_user, job_id=job_id)
    except HTTPException as exc:
        # [QUIZ BATCH FIX] — await async update
        await _update_quiz_generation_job(
            sb,
            job_id,
            status="failed",
            progress=100,
            current_step="Could not generate quiz",
            error_message=_serialize_http_detail(exc.detail),
        )
    except Exception as exc:
        logger.error("Quiz generation job %s failed: %s", job_id, exc)
        # [QUIZ BATCH FIX] — await async update
        await _update_quiz_generation_job(
            sb,
            job_id,
            status="failed",
            progress=100,
            current_step="Could not generate quiz",
            error_message=_serialize_http_detail({"code": _classify_quiz_generation_exception(exc), "message": "Unable to generate quiz. Please try again."}),
        )


def _normalize_quiz_generation_job(row: dict) -> dict:
        return {
            "id": row.get("id"),
            "status": row.get("status"),
            "progress": row.get("progress") or 0,
            "current_step": row.get("current_step") or "Preparing quiz",
            "error_message": row.get("error_message"),
            "quiz_id": row.get("quiz_id"),
            "generated_question_count": row.get("generated_question_count") or 0,
            "target_question_count": row.get("target_question_count") or row.get("request_payload", {}).get("numQuestions", 0),
            "request_payload": row.get("request_payload") or {},
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
            "completed_at": row.get("completed_at"),
        }


@router.post("/generate", dependencies=[Depends(_verify_api_key)])
async def generate_quiz(body: QuizGenerateRequest, current_user: User = Depends(get_current_user)):
    return await _generate_quiz_now(body, current_user)


@router.post("/jobs", dependencies=[Depends(_verify_api_key)])
async def create_quiz_generation_job(
    body: QuizGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Create a background quiz generation job and return immediately."""
    await resolve_student_university_context(current_user)

    restriction = await _get_quiz_restriction_if_any(current_user)
    if restriction:
        return JSONResponse(status_code=423, content=build_restriction_block_payload(restriction))

    sb = _get_supabase()
    job_payload = {
        "user_id": current_user.id,
        "request_payload": body.model_dump(),
        "status": "queued",
        "progress": 3,
        "current_step": "Queued",
        "generated_question_count": 0,
        "target_question_count": max(1, int(body.numQuestions or 10)),
    }

    try:
        try:
            job_res = sb.table("quiz_generation_jobs").insert(job_payload).execute()
        except Exception as exc:
            if "generated_question_count" not in str(exc) and "target_question_count" not in str(exc):
                raise
            job_res = sb.table("quiz_generation_jobs").insert(_job_payload_without_count_fields(job_payload)).execute()
        job_rows = job_res.data or []
        if not job_rows:
            raise RuntimeError("No quiz job row returned")
        job = job_rows[0]
    except Exception as exc:
        logger.error("Could not create quiz generation job: %s", exc)
        raise HTTPException(status_code=500, detail="Could not start quiz generation. Please try again.")

    background_tasks.add_task(
        _process_quiz_generation_job,
        job["id"],
        body.model_dump(),
        current_user.model_dump(),
    )

    return {"job": _normalize_quiz_generation_job(job)}


@router.post("/{quiz_id}/stream-token", dependencies=[Depends(_verify_api_key)])
async def generate_quiz_stream_token(quiz_id: str, current_user: User = Depends(get_current_user)):
    """Generate a short-lived transient JWT for the EventSource route to verify ownership."""
    sb = _get_supabase()
    
    try:
        quiz_res = sb.table("quizzes").select("user_id").eq("id", quiz_id).limit(1).execute()
        if not quiz_res.data:
            raise HTTPException(status_code=404, detail="Quiz not found")
        if quiz_res.data[0].get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Forbidden: You do not own this quiz")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking quiz ownership for token generation: {e}")
        raise HTTPException(status_code=500, detail="Database access error")
        
    token = generate_stream_token(current_user.id, quiz_id)
    return {"stream_token": token, "expires_in": 120}


@router.get("/{quiz_id}/events")
async def quiz_generation_events(
    quiz_id: str,
    request: Request,
    stream_token: str = Query(...),
    after: int = Query(0),
):
    """
    Server-Sent Events endpoint to stream quiz questions as they are generated.
    Auth is performed using the quiz-specific stream_token.
    """
    user_id = verify_stream_token(stream_token, quiz_id)
    sb = _get_supabase()
    
    async def event_generator():
        last_sent_order = after
        heartbeat_interval = 10.0
        check_interval = 1.0
        last_heartbeat = time.time()
        
        while True:
            if await request.is_disconnected():
                logger.info(f"Client disconnected from SSE for quiz {quiz_id}")
                break
                
            try:
                questions_res = await asyncio.to_thread(
                    lambda: sb.table("quiz_questions")
                    .select("*")
                    .eq("quiz_id", quiz_id)
                    .gt("question_order", last_sent_order)
                    .order("question_order", desc=False)
                    .execute()
                )
                new_questions = questions_res.data or []
            except Exception as e:
                logger.error(f"Error fetching questions in SSE generator: {e}")
                new_questions = []
                
            try:
                try:
                    job_res = await asyncio.to_thread(
                        lambda: sb.table("quiz_generation_jobs")
                        .select("status,error_message,progress,request_payload,generated_question_count,target_question_count")
                        .eq("quiz_id", quiz_id)
                        .order("created_at", desc=True)
                        .limit(1)
                        .execute()
                    )
                except Exception as exc:
                    if "generated_question_count" not in str(exc) and "target_question_count" not in str(exc):
                        raise
                    job_res = await asyncio.to_thread(
                        lambda: sb.table("quiz_generation_jobs")
                        .select("status,error_message,progress,request_payload")
                        .eq("quiz_id", quiz_id)
                        .order("created_at", desc=True)
                        .limit(1)
                        .execute()
                    )
                job = job_res.data[0] if job_res.data else None
            except Exception as e:
                logger.error(f"Error fetching job status in SSE generator: {e}")
                job = None
                
            for q in new_questions:
                payload = {
                    "quiz_id": quiz_id,
                    "question": q,
                    "generated_question_count": q["question_order"],
                    "target_question_count": 0,
                }
                
                if job:
                    payload["generated_question_count"] = int(job.get("generated_question_count") or q["question_order"])
                    payload["target_question_count"] = int(
                        job.get("target_question_count")
                        or (job.get("request_payload") or {}).get("numQuestions")
                        or 10
                    )
                
                yield f"id: {q['question_order']}\n"
                yield f"event: question_added\n"
                yield f"data: {json.dumps(payload)}\n\n"
                
                last_sent_order = q["question_order"]
                last_heartbeat = time.time()
                
            if job:
                status = job.get("status")
                error_msg = job.get("error_message")
                target_count = int(job.get("target_question_count") or job.get("request_payload", {}).get("numQuestions", 10))
                gen_count = int(job.get("generated_question_count") or last_sent_order)
                if "generated_question_count" not in job:
                    try:
                        count_res = await asyncio.to_thread(
                            lambda: sb.table("quiz_questions").select("id", count="exact").eq("quiz_id", quiz_id).execute()
                        )
                        gen_count = int(count_res.count or gen_count)
                    except Exception:
                        pass
                
                if status == "completed":
                    payload = {
                        "quiz_id": quiz_id,
                        "status": "completed",
                        "generated_question_count": gen_count,
                        "target_question_count": target_count
                    }
                    yield f"event: completed\n"
                    yield f"data: {json.dumps(payload)}\n\n"
                    break
                    
                elif status in ("failed", "cancelled"):
                    payload = {
                        "quiz_id": quiz_id,
                        "status": status,
                        "generated_question_count": gen_count,
                        "target_question_count": target_count,
                        "error": error_msg or "Generation stopped."
                    }
                    yield f"event: failed\n"
                    yield f"data: {json.dumps(payload)}\n\n"
                    break
                    
            if time.time() - last_heartbeat >= heartbeat_interval:
                yield f": keep-alive\n\n"
                last_heartbeat = time.time()
                
            await asyncio.sleep(check_interval)

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@router.get("/jobs/{job_id}", dependencies=[Depends(_verify_api_key)])
async def get_quiz_generation_job(job_id: str, current_user: User = Depends(get_current_user)):
    sb = _get_supabase()
    started = time.perf_counter()
    try:
        try:
            res = await asyncio.to_thread(
                lambda: sb.table("quiz_generation_jobs")
                .select("id,user_id,status,progress,current_step,error_message,quiz_id,generated_question_count,target_question_count,request_payload,created_at,updated_at,completed_at")
                .eq("id", job_id)
                .eq("user_id", current_user.id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            if "generated_question_count" not in str(exc) and "target_question_count" not in str(exc):
                raise
            res = await asyncio.to_thread(
                lambda: sb.table("quiz_generation_jobs")
                .select("id,user_id,status,progress,current_step,error_message,quiz_id,request_payload,created_at,updated_at,completed_at")
                .eq("id", job_id)
                .eq("user_id", current_user.id)
                .limit(1)
                .execute()
            )
        rows = res.data or []
    except Exception as exc:
        logger.error("Could not load quiz generation job %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load quiz generation status.")

    if not rows:
        raise HTTPException(status_code=404, detail="Quiz generation job not found.")

    row = rows[0]
    generated_question_count = int(row.get("generated_question_count") or 0)
    target_question_count = int(row.get("target_question_count") or (row.get("request_payload") or {}).get("numQuestions") or 0)
    quiz_id = row.get("quiz_id")
    if quiz_id and ("generated_question_count" not in row or "target_question_count" not in row):
        try:
            count_res = await asyncio.to_thread(
                lambda: sb.table("quiz_questions").select("id", count="exact").eq("quiz_id", quiz_id).execute()
            )
            generated_question_count = int(count_res.count or 0)
        except Exception as exc:
            logger.warning("Could not count generated quiz questions for job %s: %s", job_id, exc)

    normalized = _normalize_quiz_generation_job(
        {
            **row,
            "generated_question_count": generated_question_count,
            "target_question_count": target_question_count,
        }
    )
    _quiz_timing_log(
        "get_quiz_generation_job",
        (time.perf_counter() - started) * 1000,
        job_id=job_id,
        quiz_id=quiz_id,
        generated_question_count=generated_question_count,
        target_question_count=target_question_count,
        status=normalized.get("status"),
    )
    return {"job": normalized}


@router.post("/jobs/{job_id}/cancel", dependencies=[Depends(_verify_api_key)])
async def cancel_quiz_generation_job(job_id: str, current_user: User = Depends(get_current_user)):
    await resolve_student_university_context(current_user)

    sb = _get_supabase()
    try:
        res = (
            sb.table("quiz_generation_jobs")
            .select("id,status")
            .eq("id", job_id)
            .eq("user_id", current_user.id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
    except Exception as exc:
        logger.error("Could not load quiz generation job %s for cancellation: %s", job_id, exc)
        raise HTTPException(status_code=500, detail="Unable to cancel quiz generation.")

    if not rows:
        raise HTTPException(status_code=404, detail="Quiz generation job not found.")

    current_status = rows[0].get("status")
    if current_status in {"completed", "failed", "cancelled"}:
        return {"job": _normalize_quiz_generation_job(rows[0])}

    payload = {
        "status": "cancelled",
        "progress": 100,
        "current_step": "Quiz generation cancelled",
        "error_message": "Quiz generation was cancelled.",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        cancel_res = (
            sb.table("quiz_generation_jobs")
            .update(payload)
            .eq("id", job_id)
            .eq("user_id", current_user.id)
            .execute()
        )
        cancelled_rows = cancel_res.data or []
    except Exception as exc:
        logger.error("Could not cancel quiz generation job %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail="Unable to cancel quiz generation.")

    return {"job": _normalize_quiz_generation_job(cancelled_rows[0] if cancelled_rows else {**rows[0], **payload})}


@router.get("/history", dependencies=[Depends(_verify_api_key)])
async def quiz_history(limit: int = 50, current_user: User = Depends(get_current_user)):
    """Get user's quiz history with results."""
    await resolve_student_university_context(current_user)

    sb = _get_supabase()
    try:
        quiz_res = await asyncio.to_thread(
            lambda: sb.table("quizzes")
            .select("*")
            .eq("user_id", current_user.id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        quiz_rows = quiz_res.data or []
        quiz_ids = [quiz.get("id") for quiz in quiz_rows if quiz.get("id")]

        latest_results_by_quiz: dict[str, dict] = {}
        if quiz_ids:
            result_res = await asyncio.to_thread(
                lambda: sb.table("quiz_results")
                .select("*")
                .eq("user_id", current_user.id)
                .in_("quiz_id", quiz_ids)
                .order("completed_at", desc=True)
                .order("created_at", desc=True)
                .execute()
            )
            for result in (result_res.data or []):
                quiz_id = result.get("quiz_id")
                if quiz_id and quiz_id not in latest_results_by_quiz:
                    latest_results_by_quiz[quiz_id] = result

        quizzes = [
            {
                **quiz,
                "result": latest_results_by_quiz.get(quiz.get("id")),
            }
            for quiz in quiz_rows
        ]

        return {"quizzes": quizzes}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quiz history error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load your quiz history. Please try again.")


@router.get("/{quiz_id}", dependencies=[Depends(_verify_api_key)])
async def get_quiz(quiz_id: str, current_user: User = Depends(get_current_user)):
    """Get a quiz with its questions."""
    sb = _get_supabase()
    started = time.perf_counter()
    try:
        quiz_res = await asyncio.to_thread(
            lambda: sb.table("quizzes")
            .select("*")
            .eq("id", quiz_id)
            .eq("user_id", current_user.id)
            .limit(1)
            .execute()
        )

        quiz_rows = quiz_res.data or []
        if not quiz_rows:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions_res = await asyncio.to_thread(
            lambda: sb.table("quiz_questions")
            .select("*")
            .eq("quiz_id", quiz_id)
            .order("question_order", desc=False)
            .execute()
        )

        try:
            job_res = await asyncio.to_thread(
                lambda: sb.table("quiz_generation_jobs")
                .select("status,error_message,generated_question_count,target_question_count")
                .eq("quiz_id", quiz_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            if "generated_question_count" not in str(exc) and "target_question_count" not in str(exc):
                raise
            job_res = await asyncio.to_thread(
                lambda: sb.table("quiz_generation_jobs")
                .select("status,error_message")
                .eq("quiz_id", quiz_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )

        job_status = "completed"
        job_error = None
        generated_question_count = len(questions_res.data or [])
        target_question_count = quiz_rows[0].get("num_questions", generated_question_count)
        if job_res.data:
            job_status = job_res.data[0].get("status")
            job_error = job_res.data[0].get("error_message")
            generated_question_count = int(job_res.data[0].get("generated_question_count") or generated_question_count)
            target_question_count = int(job_res.data[0].get("target_question_count") or target_question_count)

        result = {
            "quiz": {
                **quiz_rows[0],
                "questions": questions_res.data or [],
                "target_question_count": target_question_count,
                "generated_question_count": generated_question_count,
                "generation_job_status": job_status,
                "generation_job_error": job_error,
            }
        }
        _quiz_timing_log(
            "get_quiz",
            (time.perf_counter() - started) * 1000,
            quiz_id=quiz_id,
            generated_question_count=len(questions_res.data or []),
            generation_job_status=job_status,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load this quiz. Please try again.")


@router.post("/submit", dependencies=[Depends(_verify_api_key)])
async def submit_quiz(body: QuizSubmitRequest, current_user: User = Depends(get_current_user)):
    """Submit quiz answers, calculate score, save result."""
    await resolve_student_university_context(current_user)

    sb = _get_supabase()
    try:
        # Fetch questions for scoring
        questions_res = sb.table("quiz_questions") \
            .select("*") \
            .eq("quiz_id", body.quizId) \
            .order("question_order", desc=False) \
            .execute()

        questions = {q["id"]: q for q in (questions_res.data or [])}

        # Create a mapping from questionId to user answer
        answers_map = {ans.questionId: ans for ans in body.answers}

        score = 0
        max_score = 0
        feedback_items = []

        # Separate short-answer questions for AI grading
        short_answer_items = []  # (index_in_feedback, answer, question)

        for q_id, question in questions.items():
            ans_obj = answers_map.get(q_id)
            selected_answer = ans_obj.selectedAnswer if ans_obj else ""

            q_type = question.get("question_type", "")
            if q_type == "SHORT_ANSWER":
                max_score += question.get("points", 1)
                if not selected_answer or (isinstance(selected_answer, str) and not selected_answer.strip()):
                    feedback_items.append({
                        "questionId": q_id,
                        "questionText": question.get("question_text", ""),
                        "selectedAnswer": "",
                        "correctAnswer": question["correct_answer"],
                        "isCorrect": False,
                        "partiallyCorrect": False,
                        "earnedPoints": 0,
                        "points": question.get("points", 1),
                        "explanation": question.get("explanation"),
                    })
                else:
                    short_answer_items.append((len(feedback_items), ans_obj, question))
                    # Placeholder — will be filled by AI grading
                    feedback_items.append({
                        "questionId": q_id,
                        "questionText": question.get("question_text", ""),
                        "selectedAnswer": ", ".join(ans_obj.selectedAnswer) if isinstance(ans_obj.selectedAnswer, list) else ans_obj.selectedAnswer,
                        "correctAnswer": question["correct_answer"],
                        "isCorrect": False,
                        "partiallyCorrect": False,
                        "earnedPoints": 0,
                        "points": question.get("points", 1),
                        "explanation": question.get("explanation"),
                    })
            elif q_type == "MCQ":
                options = question.get("options") or []
                if not isinstance(options, list):
                    options = []

                max_points = len(options)
                max_score += max_points

                # If no answer was submitted for this MCQ, score is 0 without penalty
                if not selected_answer or (isinstance(selected_answer, list) and not selected_answer) or (isinstance(selected_answer, str) and not selected_answer.strip()):
                    option_details = []
                    true_options = _extract_mcq_true_options(question)
                    true_norm = {_normalize_option(item) for item in true_options}
                    for option in options:
                        norm = _normalize_option(option)
                        is_true_option = norm in true_norm
                        option_details.append({
                            "option": option,
                            "isCorrect": is_true_option,
                            "userSelected": False,
                            "score": 0,
                        })

                    feedback_items.append({
                        "questionId": q_id,
                        "questionText": question.get("question_text", ""),
                        "selectedAnswer": "",
                        "correctAnswer": ", ".join(true_options),
                        "isCorrect": False,
                        "partiallyCorrect": False,
                        "earnedPoints": 0,
                        "points": max_points,
                        "optionDetails": option_details,
                        "explanation": question.get("explanation"),
                    })
                else:
                    selected_options = _extract_selected_mcq_options(selected_answer, options)
                    true_options = _extract_mcq_true_options(question)
                    selected_norm = {_normalize_option(item) for item in selected_options}
                    true_norm = {_normalize_option(item) for item in true_options}

                    option_details = []
                    question_score = 0
                    for option in options:
                        norm = _normalize_option(option)
                        user_selected = norm in selected_norm
                        is_true_option = norm in true_norm
                        decision_correct = user_selected == is_true_option
                        delta = 1 if decision_correct else -1
                        question_score += delta
                        option_details.append({
                            "option": option,
                            "isCorrect": is_true_option,
                            "userSelected": user_selected,
                            "score": delta,
                        })

                    score += question_score
                    feedback_items.append({
                        "questionId": q_id,
                        "questionText": question.get("question_text", ""),
                        "selectedAnswer": ", ".join(selected_options),
                        "correctAnswer": ", ".join(true_options),
                        "isCorrect": question_score == max_points,
                        "partiallyCorrect": (question_score > 0 and question_score < max_points),
                        "earnedPoints": question_score,
                        "points": max_points,
                        "optionDetails": option_details,
                        "explanation": question.get("explanation"),
                    })
            else:
                max_score += question.get("points", 1)
                
                if not selected_answer or (isinstance(selected_answer, list) and not selected_answer) or (isinstance(selected_answer, str) and not selected_answer.strip()):
                    feedback_items.append({
                        "questionId": q_id,
                        "questionText": question.get("question_text", ""),
                        "selectedAnswer": "",
                        "correctAnswer": question["correct_answer"],
                        "isCorrect": False,
                        "partiallyCorrect": False,
                        "earnedPoints": 0,
                        "points": question.get("points", 1),
                        "explanation": question.get("explanation"),
                    })
                else:
                    # Deterministic grading for OBJECTIVE, TRUE_FALSE, multiple_choice
                    raw_answer = selected_answer
                    if isinstance(raw_answer, list):
                        ans_str = (str(raw_answer[0]).strip().upper() if raw_answer else "")
                    else:
                        ans_str = str(raw_answer).strip().upper()
                    corr_str = question["correct_answer"].strip().upper()
                    if q_type in ("multiple_choice", "OBJECTIVE"):
                        is_correct = bool(ans_str and corr_str and ans_str[0] == corr_str[0])
                    else:
                        is_correct = ans_str == corr_str
                    if is_correct:
                        score += question.get("points", 1)
                    feedback_items.append({
                        "questionId": q_id,
                        "questionText": question.get("question_text", ""),
                        "selectedAnswer": ", ".join(selected_answer) if isinstance(selected_answer, list) else selected_answer,
                        "correctAnswer": question["correct_answer"],
                        "isCorrect": is_correct,
                        "partiallyCorrect": False,
                        "earnedPoints": question.get("points", 1) if is_correct else 0,
                        "points": question.get("points", 1),
                        "explanation": question.get("explanation"),
                    })


        # ── AI grading for short-answer questions ──
        if short_answer_items:
            try:
                # Build the grading prompt with all short-answer questions
                grading_entries = []
                for idx, (fb_index, answer, question) in enumerate(short_answer_items):
                    grading_entries.append(
                        f"Q{idx+1}:\n"
                        f"  Question: {question.get('question_text', '')}\n"
                        f"  Reference Answer: {question['correct_answer']}\n"
                        f"  Student Answer: {answer.selectedAnswer}"
                    )

                grading_system_prompt = (
                    "You are PANSGPT's short-answer quiz grading engine for university pharmacy students.\n"
                    "Grade answers contextually against the reference answer.\n"
                    "The student does not need exact wording if the meaning is correct.\n\n"
                    "Return only JSON lines. Do not include markdown, prose, headings, comments, or thinking tags.\n"
                    "Each line must be one JSON object with this shape:\n"
                    '{"q": <question_number>, "score": <0 or 0.5 or 1>, "feedback": "<brief explanation>"}\n\n'
                    "Score guide:\n"
                    "- 1.0 = Correct or substantially correct.\n"
                    "- 0.5 = Partially correct; captures some key points but misses others.\n"
                    "- 0.0 = Incorrect, unsafe, or irrelevant."
                )
                grading_user_prompt = (
                    "Grade these short-answer quiz responses.\n\n"
                    "Questions:\n"
                    + "\n\n".join(grading_entries)
                    + "\n\nReturn only the JSON lines, one per question."
                )

                ai_response = await _generate_quiz_grading_response(grading_system_prompt, grading_user_prompt)
                logger.info(f"AI grading response: {ai_response}")

                # Parse AI response
                import json
                import re
                # Extract all JSON objects from response
                json_pattern = re.compile(r'\{[^}]+\}')
                grading_results = []
                for match in json_pattern.finditer(ai_response):
                    try:
                        grading_results.append(json.loads(match.group()))
                    except json.JSONDecodeError:
                        continue

                # Apply AI grades
                for grade in grading_results:
                    q_num = grade.get("q", 0)
                    if q_num < 1 or q_num > len(short_answer_items):
                        continue
                    fb_index, answer, question = short_answer_items[q_num - 1]
                    ai_score = float(grade.get("score", 0))
                    ai_feedback = grade.get("feedback", "")
                    points = question.get("points", 1)

                    earned = round(ai_score * points, 1)
                    score += earned

                    feedback_items[fb_index]["isCorrect"] = ai_score >= 1.0
                    feedback_items[fb_index]["partiallyCorrect"] = 0 < ai_score < 1.0
                    feedback_items[fb_index]["earnedPoints"] = earned
                    if ai_feedback:
                        feedback_items[fb_index]["explanation"] = ai_feedback

            except Exception as ai_err:
                logger.error(f"AI grading failed, falling back to exact match: {ai_err}")
                # Fallback: exact match for short-answer if AI fails
                for fb_index, answer, question in short_answer_items:
                    ans_str = answer.selectedAnswer.strip().upper()
                    corr_str = question["correct_answer"].strip().upper()
                    is_correct = ans_str == corr_str
                    if is_correct:
                        score += question.get("points", 1)
                    feedback_items[fb_index]["isCorrect"] = is_correct
                    feedback_items[fb_index]["earnedPoints"] = question.get("points", 1) if is_correct else 0
                    feedback_items[fb_index]["explanation"] = question.get("explanation")

        percentage = (score / max_score * 100) if max_score > 0 else 0

        # Save result
        result_res = sb.table("quiz_results").insert({
            "quiz_id": body.quizId,
            "user_id": current_user.id,
            "answers": [a.dict() for a in body.answers],
            "score": score,
            "max_score": max_score,
            "percentage": round(percentage, 1),
            "time_taken": body.timeTaken,
            "feedback": feedback_items,
        }).execute()

        return {
            "result": result_res.data[0] if result_res.data else None,
            "score": score,
            "maxScore": max_score,
            "percentage": round(percentage, 1),
            "feedback": feedback_items,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quiz submit error: {e}")
        raise HTTPException(status_code=500, detail="Unable to submit your answers. Please try again.")


@router.get("/results/{result_id}", dependencies=[Depends(_verify_api_key)])
async def get_quiz_result(result_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific quiz result."""
    await resolve_student_university_context(current_user)

    sb = _get_supabase()
    try:
        res = sb.table("quiz_results") \
            .select("*") \
            .eq("id", result_id) \
            .single() \
            .execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Result not found")

        # Fetch the quiz info too
        quiz_res = sb.table("quizzes") \
            .select("*") \
            .eq("id", res.data["quiz_id"]) \
            .single() \
            .execute()

        return {
            "result": res.data,
            "quiz": quiz_res.data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz result error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load this result. Please try again.")


@router.get("/share/{quiz_id}")
async def share_quiz(quiz_id: str):
    """Get shareable quiz data (public, no auth required)."""
    sb = _get_supabase()
    try:
        quiz_res = sb.table("quizzes") \
            .select("*") \
            .eq("id", quiz_id) \
            .single() \
            .execute()

        if not quiz_res.data:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions_res = sb.table("quiz_questions") \
            .select("*") \
            .eq("quiz_id", quiz_id) \
            .order("question_order", desc=False) \
            .execute()

        # Get the best result for this quiz
        result_res = sb.table("quiz_results") \
            .select("*") \
            .eq("quiz_id", quiz_id) \
            .order("percentage", desc=True) \
            .limit(1) \
            .execute()

        return {
            "quiz": {
                **quiz_res.data,
                "questions": questions_res.data or [],
            },
            "bestResult": result_res.data[0] if result_res.data else None,
        }

    except Exception as e:
        logger.error(f"Share quiz error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load this quiz. Please try again.")
