"""
Quiz router – Generate, submit, and retrieve quizzes.
"""
from fastapi import APIRouter, HTTPException, Request, Depends, Header, BackgroundTasks
from fastapi.responses import JSONResponse
from dependencies import get_current_user, User
from pydantic import BaseModel, field_validator
from typing import Optional, List, Union, Any
import json
import logging
import re
import uuid
import os
import asyncio
from datetime import datetime, timezone
from restrictions import build_restriction_block_payload, get_applicable_user_restriction
from .shared import get_current_academic_context, merge_system_into_user, resolve_student_university_context
from utils.thinking_token_utils import strip_thinking_tokens

from services import llm_engine

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/api/quiz", tags=["quiz"])

QUIZ_GENERATION_TEMPERATURE = 0.25
QUIZ_GENERATION_MAX_TOKENS = 2048
QUIZ_GRADING_TEMPERATURE = 0.1
QUIZ_GRADING_MAX_TOKENS = 2048

_supabase = None
_supabase_service = None
_verify_api_key_fn = None
_embeddings_ready = False

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


# ---------- Models ----------
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


def _build_recent_question_block(sb, user_id: str, course_code: str, topic: Optional[str]) -> str:
    """
    Pull recent quiz questions for this user/course (and topic when present)
    so the generator can avoid repeating them.
    """
    try:
        quiz_query = sb.table("quizzes").select("id,topic").eq("user_id", user_id).eq("course_code", course_code).order("created_at", desc=True).limit(20)
        quiz_rows = (quiz_query.execute().data or [])
        if topic:
            topic_norm = topic.strip().lower()
            quiz_rows = [q for q in quiz_rows if (q.get("topic") or "").strip().lower() == topic_norm]

        quiz_ids = [q.get("id") for q in quiz_rows if q.get("id")]
        if not quiz_ids:
            return ""

        q_rows = sb.table("quiz_questions").select("question_text").in_("quiz_id", quiz_ids).limit(120).execute().data or []
        recent_questions = [str(r.get("question_text", "")).strip() for r in q_rows if str(r.get("question_text", "")).strip()]
        if not recent_questions:
            return ""

        # Keep prompt bounded.
        recent_questions = recent_questions[:40]
        lines = "\n".join([f"- {q}" for q in recent_questions])
        return (
            "RECENTLY USED QUESTIONS (DO NOT REUSE OR PARAPHRASE THESE):\n"
            f"{lines}\n"
            "You must generate a fresh set that covers different concepts/sections.\n"
        )
    except Exception as exc:
        logger.warning(f"Could not load recent quiz questions for anti-repeat: {exc}")
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

    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GEMINI_API_KEY")
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


async def _build_quiz_context_from_embeddings(sb, body: QuizGenerateRequest, *, student_university_id: str) -> str:
    """
    Retrieval layer for quiz generation:
    - filters documents by course/topic/level
    - retrieves a broad candidate set from vector index
    - diversifies selected chunks across documents and content regions
    """
    if not _prepare_embedding_client():
        return ""

    try:
        docs_res = sb.table("pans_library").select(
            "id,file_name,course_code,topic,target_levels,embedding_status,material_status,university_id,academic_session,semester"
        ).eq("course_code", body.courseCode).eq("university_id", student_university_id).eq("embedding_status", "completed").eq("material_status", "active").execute()
        docs = docs_res.data or []
    except Exception as exc:
        logger.warning(f"Quiz retrieval document lookup failed: {exc}")
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
        return ""

    try:
        rpc_res = sb.rpc(
            "match_documents_global",
            {
                "query_embedding": query_vector,
                "match_threshold": 0.18,
                "match_count": 120,
                "allowed_doc_ids": allowed_doc_ids,
            },
        ).execute()
        rows = rpc_res.data or []
    except Exception as exc:
        logger.warning(f"Quiz retrieval RPC failed: {exc}")
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

    return (
        "CURRICULUM CONTEXT (RETRIEVED FROM EMBEDDINGS):\n"
        + "\n\n".join(context_lines)
    )


def _serialize_http_detail(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    try:
        return json.dumps(detail)
    except Exception:
        return str(detail)


def _update_quiz_generation_job(
    sb,
    job_id: Optional[str],
    *,
    status: str,
    progress: int,
    current_step: str,
    error_message: Optional[str] = None,
    quiz_id: Optional[str] = None,
) -> None:
    if not job_id:
        return

    payload = {
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "current_step": current_step,
        "error_message": error_message,
    }
    if quiz_id is not None:
        payload["quiz_id"] = quiz_id
    if status in {"completed", "failed", "cancelled"}:
        payload["completed_at"] = datetime.now(timezone.utc).isoformat()

    try:
        sb.table("quiz_generation_jobs").update(payload).eq("id", job_id).execute()
    except Exception as exc:
        logger.warning("Failed to update quiz generation job %s: %s", job_id, exc)


async def _generate_quiz_json_response(system_prompt: str, user_prompt: str) -> str:
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
    )
    if response is None:
        raise RuntimeError("LLM generation failed on all available clients")

    content = response.choices[0].message.content
    if isinstance(content, list):
        content = "\n".join(
            str(part.get("text", "")) if isinstance(part, dict) else str(part)
            for part in content
        )

    visible_text, _thinking_text = strip_thinking_tokens(str(content or ""))
    return str(visible_text).strip()


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
    restriction = await _get_quiz_restriction_if_any(current_user)
    if restriction:
        return JSONResponse(status_code=423, content=build_restriction_block_payload(restriction))

    sb = _get_supabase()
    _update_quiz_generation_job(
        sb,
        job_id,
        status="retrieving",
        progress=12,
        current_step="Finding course materials",
    )
    student_context = await resolve_student_university_context(current_user)
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
- "options": an array of exactly 5 option strings
- "correctAnswer": an array of exactly 3 option labels from ["A","B","C","D","E"], e.g. ["A","C","E"]
- Include in the question stem: "Select one or more."
- EXACTLY 3 options must be true and EXACTLY 2 options must be false.
- The false options must be plausible and easily confusable with true ones.'''
        else:
            format_reqs = '''- "questionType": "multiple_choice"
- "options": an array of 4 option strings ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correctAnswer": the letter of the correct option (e.g. "A")'''
    elif q_type == "TRUE_FALSE":
        type_desc = "true/false"
        format_reqs = '''- "questionType": "TRUE_FALSE"
- "options": ["True", "False"]
- "correctAnswer": "True" or "False"'''
    elif q_type == "SHORT_ANSWER":
        type_desc = "short answer"
        format_reqs = '''- "questionType": "SHORT_ANSWER"
- "correctAnswer": the exact short phrase or word that answers the question
(Do not include an "options" field)'''
    else:
        type_desc = "multiple-choice"
        format_reqs = '''- "questionType": "multiple_choice"
- "options": an array of 4 option strings ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correctAnswer": the letter of the correct option (e.g. "A")'''

    try:
        recent_question_block = _build_recent_question_block(
            sb=sb,
            user_id=current_user.id,
            course_code=body.courseCode,
            topic=body.topic,
        )
    except Exception as exc:
        logger.warning(f"Could not build recent-question block: {exc}")
        recent_question_block = ""

    try:
        retrieved_context_block = await _build_quiz_context_from_embeddings(
            sb,
            body,
            student_university_id=student_university_id,
        )
    except Exception as exc:
        logger.warning(f"Could not build embedding context block: {exc}")
        retrieved_context_block = ""

    if not (retrieved_context_block or "").strip():
        raise HTTPException(
            status_code=404,
            detail="No active processed materials were found for this course in your university.",
        )

    _update_quiz_generation_job(
        sb,
        job_id,
        status="generating",
        progress=42,
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

    def _parse_json_array(raw: str) -> list:
        cleaned = (raw or "").strip()
        match = re.search(r'\[\s*\{.*\}\s*\]', cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)
        else:
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].strip()

        parsed = json.loads(cleaned)
        if not isinstance(parsed, list):
            raise ValueError("LLM did not return a JSON array")
        return parsed

    def _build_generation_prompts(batch_count: int, already_used: list[str], compact: bool = False) -> tuple[str, str]:
        nonce = str(uuid.uuid4())[:8]
        used_block = ""
        if already_used:
            used_lines = "\n".join([f"- {q}" for q in already_used[:40]])
            used_block = (
                "ALREADY GENERATED IN THIS QUIZ (DO NOT REUSE/PARAPHRASE):\n"
                f"{used_lines}\n"
            )

        system_prompt = f"""You are PANSGPT's quiz generation engine for pharmacy students.

You must return only machine-parseable JSON. Do not include markdown, code fences, prose, comments, headings, or thinking tags.

Output contract:
- Return a JSON array only.
- The array must contain exactly {batch_count} question objects.
- Each object must include:
  - "questionText": the question string
{format_reqs}
  - "explanation": a brief explanation of the correct answer

Diversity rules:
- Avoid repeating any previously asked questions or close paraphrases.
- Spread questions across different concepts/sections of the material.
- Avoid clustering on a single subsection.
- Vary question phrasing and scenario framing.

Grounding rules:
- Build questions from the retrieved curriculum context when provided.
- Cover multiple different excerpts/sources in the context, not just one narrow subsection.
- Do not invent facts outside the retrieved context unless needed for wording clarity."""

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

Return only the JSON array."""

        return system_prompt, user_prompt

    try:
        target_count = max(1, int(body.numQuestions or 10))
        batch_size = 5
        questions: list[dict] = []

        while len(questions) < target_count:
            remaining = target_count - len(questions)
            current_batch = min(batch_size, remaining)
            generated_this_batch = None

            already_used = [str(q.get("questionText", "")).strip() for q in questions if str(q.get("questionText", "")).strip()]
            for attempt in range(1, 4):
                compact_mode = attempt >= 2 and target_count >= 15
                system_prompt, user_prompt = _build_generation_prompts(current_batch, already_used, compact=compact_mode)
                raw = await _generate_quiz_json_response(system_prompt, user_prompt)

                try:
                    parsed = _parse_json_array(raw)
                except Exception:
                    logger.warning(f"Quiz batch parse failed (batch={current_batch}, attempt={attempt})")
                    continue

                # Dynamic repetition tolerance: slightly relaxed for larger requested sets.
                overlap_limit = 0.55 if target_count >= 20 else 0.40
                internal_repeat = _has_internal_repetition(parsed, threshold=0.85)
                overlap_ratio = _overlap_with_recent(parsed, recent_block_small, threshold=0.8)

                # Remove items that duplicate already generated questions.
                deduped = []
                for item in parsed:
                    text = str(item.get("questionText", "")).strip()
                    if not text:
                        continue
                    if any(_question_similarity(text, prev) >= 0.82 for prev in already_used):
                        continue
                    deduped.append(item)

                if (internal_repeat or overlap_ratio > overlap_limit) and attempt < 3:
                    logger.warning(
                        f"Quiz batch repetition high (attempt={attempt}, internal={internal_repeat}, overlap={overlap_ratio:.2f})"
                    )
                    continue

                if not deduped and attempt < 3:
                    continue

                generated_this_batch = deduped[:current_batch]
                break

            if not generated_this_batch:
                raise HTTPException(
                    status_code=500,
                    detail="Unable to generate enough diverse questions right now. Please try fewer questions or try again.",
                )

            questions.extend(generated_this_batch)

        questions = questions[:target_count]

        _update_quiz_generation_job(
            sb,
            job_id,
            status="saving",
            progress=86,
            current_step="Saving quiz",
        )

        try:
            # Save quiz to database
            quiz_res = sb.table("quizzes").insert({
                "user_id": current_user.id,
                "title": f"{body.courseTitle} - {body.topic or 'General'} Quiz",
                "course_code": body.courseCode,
                "course_title": body.courseTitle,
                "topic": body.topic,
                "level": body.level,
                "difficulty": body.difficulty,
                "num_questions": len(questions),
                "time_limit": body.timeLimit,
            }).execute()

            quiz_id = quiz_res.data[0]["id"]

            # Save questions
            questions_to_insert = []
            for idx, q in enumerate(questions):
                question_type = q.get("questionType", "multiple_choice")
                options = q.get("options")
                correct_answer = q.get("correctAnswer", "")
                points = 1

                if q_type == "MCQ":
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

                questions_to_insert.append({
                    "quiz_id": quiz_id,
                    "question_text": _sanitize_question_stem(q["questionText"], options),
                    "question_type": question_type,
                    "options": options,
                    "correct_answer": correct_answer,
                    "explanation": q.get("explanation"),
                    "points": points,
                    "question_order": idx + 1,
                })

            sb.table("quiz_questions").insert(questions_to_insert).execute()
        except Exception as db_err:
            logger.error(f"[ERROR] Quiz DB Insertion Failed: {db_err}")
            raise HTTPException(status_code=500, detail="Quiz was generated but could not be saved. Please try again.")

        _update_quiz_generation_job(
            sb,
            job_id,
            status="completed",
            progress=100,
            current_step="Quiz ready",
            quiz_id=quiz_id,
        )

        # Return the created quiz
        return await get_quiz(quiz_id, current_user)

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Quiz generation: JSON parse error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response into quiz questions")
    except Exception as e:
        logger.error(f"Quiz generation error: {e}")
        raise HTTPException(status_code=500, detail="Unable to generate quiz. Please try again.")


async def _process_quiz_generation_job(job_id: str, body_payload: dict, user_payload: dict) -> None:
    sb = _get_supabase()
    try:
        body = QuizGenerateRequest.model_validate(body_payload)
        current_user = User.model_validate(user_payload)
        await _generate_quiz_now(body, current_user, job_id=job_id)
    except HTTPException as exc:
        _update_quiz_generation_job(
            sb,
            job_id,
            status="failed",
            progress=100,
            current_step="Could not generate quiz",
            error_message=_serialize_http_detail(exc.detail),
        )
    except Exception as exc:
        logger.error("Quiz generation job %s failed: %s", job_id, exc)
        _update_quiz_generation_job(
            sb,
            job_id,
            status="failed",
            progress=100,
            current_step="Could not generate quiz",
            error_message="Unable to generate quiz. Please try again.",
        )


def _normalize_quiz_generation_job(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "status": row.get("status"),
        "progress": row.get("progress") or 0,
        "current_step": row.get("current_step") or "Preparing quiz",
        "error_message": row.get("error_message"),
        "quiz_id": row.get("quiz_id"),
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
    }

    try:
        job_res = sb.table("quiz_generation_jobs").insert(job_payload).execute()
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


@router.get("/jobs/{job_id}", dependencies=[Depends(_verify_api_key)])
async def get_quiz_generation_job(job_id: str, current_user: User = Depends(get_current_user)):
    sb = _get_supabase()
    try:
        res = (
            sb.table("quiz_generation_jobs")
            .select("id,status,progress,current_step,error_message,quiz_id,request_payload,created_at,updated_at,completed_at")
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

    return {"job": _normalize_quiz_generation_job(rows[0])}


@router.get("/history", dependencies=[Depends(_verify_api_key)])
async def quiz_history(limit: int = 50, current_user: User = Depends(get_current_user)):
    """Get user's quiz history with results."""
    sb = _get_supabase()
    try:
        # Fetch quizzes
        quiz_res = sb.table("quizzes") \
            .select("*") \
            .eq("user_id", current_user.id) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()

        quizzes = []
        for quiz in (quiz_res.data or []):
            # Get results for this quiz
            result_res = sb.table("quiz_results") \
                .select("*") \
                .eq("quiz_id", quiz["id"]) \
                .eq("user_id", current_user.id) \
                .order("completed_at", desc=True) \
                .limit(1) \
                .execute()

            result = result_res.data[0] if result_res.data else None
            quizzes.append({
                **quiz,
                "result": result,
            })

        return {"quizzes": quizzes}

    except Exception as e:
        logger.error(f"Quiz history error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load your quiz history. Please try again.")


@router.get("/{quiz_id}", dependencies=[Depends(_verify_api_key)])
async def get_quiz(quiz_id: str, current_user: User = Depends(get_current_user)):
    """Get a quiz with its questions."""
    sb = _get_supabase()
    try:
        quiz_res = sb.table("quizzes") \
            .select("*") \
            .eq("id", quiz_id) \
            .limit(1) \
            .execute()

        quiz_rows = quiz_res.data or []
        if not quiz_rows:
            raise HTTPException(status_code=404, detail="Quiz not found")

        questions_res = sb.table("quiz_questions") \
            .select("*") \
            .eq("quiz_id", quiz_id) \
            .order("question_order", desc=False) \
            .execute()

        return {
            "quiz": {
                **quiz_rows[0],
                "questions": questions_res.data or [],
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get quiz error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load this quiz. Please try again.")


@router.post("/submit", dependencies=[Depends(_verify_api_key)])
async def submit_quiz(body: QuizSubmitRequest, current_user: User = Depends(get_current_user)):
    """Submit quiz answers, calculate score, save result."""
    sb = _get_supabase()
    try:
        # Fetch questions for scoring
        questions_res = sb.table("quiz_questions") \
            .select("*") \
            .eq("quiz_id", body.quizId) \
            .order("question_order", desc=False) \
            .execute()

        questions = {q["id"]: q for q in (questions_res.data or [])}

        score = 0
        max_score = 0
        feedback_items = []

        # Separate short-answer questions for AI grading
        short_answer_items = []  # (index_in_feedback, answer, question)
        deterministic_items = []

        for answer in body.answers:
            question = questions.get(answer.questionId)
            if not question:
                continue
            # max_score is updated per question type below

            q_type = question.get("question_type", "")
            if q_type == "SHORT_ANSWER":
                max_score += question.get("points", 1)
                short_answer_items.append((len(feedback_items), answer, question))
                # Placeholder — will be filled by AI grading
                feedback_items.append({
                    "questionId": answer.questionId,
                    "questionText": question.get("question_text", ""),
                    "selectedAnswer": ", ".join(answer.selectedAnswer) if isinstance(answer.selectedAnswer, list) else answer.selectedAnswer,
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

                selected_options = _extract_selected_mcq_options(answer.selectedAnswer, options)

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

                max_points = len(options)
                max_score += max_points
                score += question_score
                feedback_items.append({
                    "questionId": answer.questionId,
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
                # Deterministic grading for OBJECTIVE, TRUE_FALSE, multiple_choice
                raw_answer = answer.selectedAnswer
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
                    "questionId": answer.questionId,
                    "questionText": question.get("question_text", ""),
                    "selectedAnswer": ", ".join(answer.selectedAnswer) if isinstance(answer.selectedAnswer, list) else answer.selectedAnswer,
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

    except Exception as e:
        logger.error(f"Quiz submit error: {e}")
        raise HTTPException(status_code=500, detail="Unable to submit your answers. Please try again.")


@router.get("/results/{result_id}", dependencies=[Depends(_verify_api_key)])
async def get_quiz_result(result_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific quiz result."""
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
