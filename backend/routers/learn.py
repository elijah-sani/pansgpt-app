"""
Learn Mode router – Phase 2.

Endpoints:
  POST /api/learn/documents/{document_id}/start
  GET  /api/learn/documents/{document_id}/sections
  GET  /api/learn/documents/{document_id}/sections/{section_index}
  POST /api/learn/documents/{document_id}/sections/{section_index}/answer
  POST /api/learn/documents/{document_id}/sections/{section_index}/complete

All endpoints enforce the same document access-control check already used
by the rest of the application (_can_user_access_library_document from api.py).
"""
import asyncio
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from dependencies import get_current_user, User
from services import llm_engine

logger = logging.getLogger("PansGPT")

# ─────────────────────────────────────────────────────────────
# Module-level client references (injected at startup from api.py)
# ─────────────────────────────────────────────────────────────
_supabase = None          # service-role client (preferred)
_supabase_anon = None     # anon/user client (fallback)

def set_dependencies(supabase_client, supabase_service_client):
    global _supabase, _supabase_anon
    _supabase = supabase_service_client or supabase_client
    _supabase_anon = supabase_client


def _db():
    """Return the best available Supabase client."""
    return _supabase or _supabase_anon


# ─────────────────────────────────────────────────────────────
# Router
# ─────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/learn", tags=["learn"])


# ─────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────
async def _run(fn, label: str = "DB"):
    """Run a synchronous Supabase call in a thread, with one retry on transient errors."""
    for attempt in range(1, 3):
        try:
            return await asyncio.to_thread(fn)
        except Exception as exc:
            msg = str(exc).lower()
            if attempt < 2 and any(m in msg for m in ("timeout", "connection", "server disconnected")):
                logger.warning("[LEARN] %s attempt %d failed, retrying: %s", label, attempt, exc)
                await asyncio.sleep(0.75)
                continue
            raise


async def _assert_document_access(document_id: str, current_user: User) -> dict:
    """
    Fetch the pans_library row for document_id and enforce university/level access.
    Returns the pans_library row on success.
    Raises 404 if not found, 403 if the user cannot access it.
    """
    db = _db()
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")

    res = await _run(
        lambda: db.table("pans_library")
        .select("*")
        .eq("id", document_id)
        .limit(1)
        .execute(),
        "fetch pans_library row",
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")

    row = rows[0]

    # Lazy import to avoid circular reference (defined in api.py; same lazy-import pattern used by library.py:129)
    from api import _can_user_access_library_document
    if not await _can_user_access_library_document(db, current_user, row):
        raise HTTPException(status_code=403, detail="You do not have access to this document")

    return row


async def _get_sections(document_id: str) -> list:
    """Return document_sections rows ordered by section_index."""
    db = _db()
    res = await _run(
        lambda: db.table("document_sections")
        .select("id,document_id,section_index,title,summary,page_start,page_end,explanation,check_questions")
        .eq("document_id", document_id)
        .order("section_index")
        .execute(),
        "fetch document_sections",
    )
    return res.data or []


async def _get_section(document_id: str, section_index: int) -> Optional[dict]:
    db = _db()
    res = await _run(
        lambda: db.table("document_sections")
        .select("id,document_id,section_index,title,summary,page_start,page_end,explanation,check_questions")
        .eq("document_id", document_id)
        .eq("section_index", section_index)
        .limit(1)
        .execute(),
        f"fetch section {section_index}",
    )
    rows = res.data or []
    return rows[0] if rows else None


async def _get_section_chunks(document_id: str, page_start: Optional[int], page_end: Optional[int]) -> list:
    """
    Fetch document_embeddings chunks that overlap with the section's page range.
    Falls back to returning all chunks for the document if page tracking is unavailable.
    """
    db = _db()
    query = db.table("document_embeddings").select("content").eq("document_id", document_id)

    if page_start is not None and page_end is not None:
        # page_start/page_end on embeddings column names are the same as documented in add_page_tracking.sql
        query = query.gte("page_end", page_start).lte("page_start", page_end)

    res = await _run(lambda: query.execute(), "fetch section chunks")
    return res.data or []


async def _get_progress(user_id: str, document_id: str, section_index: int) -> Optional[dict]:
    db = _db()
    res = await _run(
        lambda: db.table("document_learn_progress")
        .select("*")
        .eq("user_id", user_id)
        .eq("document_id", document_id)
        .eq("section_index", section_index)
        .limit(1)
        .execute(),
        "fetch section progress",
    )
    rows = res.data or []
    return rows[0] if rows else None


async def _upsert_progress(user_id: str, document_id: str, section_index: int, **fields) -> dict:
    """Upsert a learn progress row. `fields` contains keys like status, last_score."""
    db = _db()
    payload = {
        "user_id": user_id,
        "document_id": document_id,
        "section_index": section_index,
        **fields,
    }
    res = await _run(
        lambda: db.table("document_learn_progress")
        .upsert(payload, on_conflict="user_id,document_id,section_index")
        .execute(),
        "upsert section progress",
    )
    rows = res.data or []
    return rows[0] if rows else payload


# ─────────────────────────────────────────────────────────────
# LLM generation helpers
# ─────────────────────────────────────────────────────────────
_EXPLAIN_SYSTEM = (
    "You are a pharmacy study tutor. Write a clear, concise plain-English explanation of the "
    "document section described below. Aim for 3-6 paragraphs. Use markdown for clarity. "
    "Do not repeat the section title verbatim at the start. Focus on what a student needs to understand."
)

_QUESTIONS_SYSTEM = (
    "You are a pharmacy study tutor. Generate exactly 3 multiple-choice check questions "
    "based on the document section below. "
    "Respond ONLY with a JSON array of objects. Each object must have exactly these keys: "
    "question_text (string), options (object with keys A, B, C, D; each a string), "
    "correct_answer (string, one of A/B/C/D), explanation (string, one sentence). "
    "No preamble, no markdown, only the JSON array."
)

_FOLLOWUP_SYSTEM = (
    "You are a pharmacy study tutor. A student answered a question incorrectly. "
    "Explain in 2-3 sentences why the correct answer is right and briefly clarify the concept. "
    "Be direct and educational."
)


async def _generate_section_content(section: dict, chunks: list) -> tuple[str, list]:
    """
    Generate explanation and check_questions for a section using TEXT_SECONDARY.
    Returns (explanation_text, check_questions_list).
    """
    chunk_text = "\n\n".join(c.get("content", "") for c in chunks if c.get("content"))
    if not chunk_text:
        chunk_text = section.get("summary") or "(No content available for this section)"

    context_block = (
        f"Section title: {section.get('title', 'Untitled')}\n"
        f"Summary: {section.get('summary', '')}\n\n"
        f"Content:\n{chunk_text[:8000]}"   # guard against very long inputs
    )

    # Run both LLM calls concurrently
    explain_messages = [
        {"role": "system", "content": _EXPLAIN_SYSTEM},
        {"role": "user", "content": context_block},
    ]
    questions_messages = [
        {"role": "system", "content": _QUESTIONS_SYSTEM},
        {"role": "user", "content": context_block},
    ]

    try:
        explain_resp, questions_resp = await asyncio.gather(
            llm_engine.generate_small_completion_with_failover(
                messages=explain_messages,
                temperature=0.3,
                max_tokens=1024,
            ),
            llm_engine.generate_small_completion_with_failover(
                messages=questions_messages,
                temperature=0.15,
                max_tokens=1024,
            ),
        )
    except Exception as exc:
        logger.error("[LEARN] LLM generation failed for section %s/%s: %s",
                     section.get("document_id"), section.get("section_index"), exc)
        raise HTTPException(status_code=502, detail="Failed to generate section content. Please try again.")

    # Extract text from completion objects (.choices[0].message.content pattern, same as quiz.py)
    def _extract(resp) -> str:
        if resp is None:
            return ""
        try:
            return (resp.choices[0].message.content or "") if resp.choices else ""
        except Exception:
            return str(resp)  # last-resort fallback if shape is unexpected

    explanation = _extract(explain_resp).strip()

    # Parse questions JSON robustly
    questions: list = []
    raw_q = _extract(questions_resp).strip()
    # Strip markdown fences if the model wrapped the JSON
    if raw_q.startswith("```"):
        raw_q = "\n".join(raw_q.split("\n")[1:])
        raw_q = raw_q.rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(raw_q)
        if isinstance(parsed, list):
            questions = parsed
        else:
            logger.warning("[LEARN] Questions JSON was not a list for section %s/%s",
                           section.get("document_id"), section.get("section_index"))
    except json.JSONDecodeError as exc:
        logger.warning("[LEARN] Could not parse questions JSON for section %s/%s: %s | raw=%s",
                       section.get("document_id"), section.get("section_index"), exc, raw_q[:200])

    return explanation, questions


async def _ensure_section_content(section: dict) -> dict:
    """
    If explanation or check_questions are missing, generate them and persist.
    Returns the updated section dict.
    """
    if section.get("explanation") and section.get("check_questions"):
        return section

    document_id = section["document_id"]
    section_index = section["section_index"]

    chunks = await _get_section_chunks(
        document_id,
        section.get("page_start"),
        section.get("page_end"),
    )

    if not chunks:
        logger.warning("[LEARN] No chunks found for section %s/%s (pages %s-%s)",
                       document_id, section_index, section.get("page_start"), section.get("page_end"))
        raise HTTPException(
            status_code=404,
            detail=(
                "No content chunks are available for this section. "
                "The document may need to be re-processed."
            ),
        )

    explanation, questions = await _generate_section_content(section, chunks)

    # Persist back to document_sections
    db = _db()
    update_payload: dict = {}
    if explanation and not section.get("explanation"):
        update_payload["explanation"] = explanation
    if questions and not section.get("check_questions"):
        update_payload["check_questions"] = questions

    if update_payload:
        try:
            await _run(
                lambda: db.table("document_sections")
                .update(update_payload)
                .eq("document_id", document_id)
                .eq("section_index", section_index)
                .execute(),
                "persist section explanation/questions",
            )
        except Exception as exc:
            logger.error("[LEARN] Failed to persist section content for %s/%s: %s",
                         document_id, section_index, exc)
            # Non-fatal: we still return the generated content this request

    return {
        **section,
        "explanation": explanation or section.get("explanation"),
        "check_questions": questions or section.get("check_questions") or [],
    }


# ─────────────────────────────────────────────────────────────
# Request/Response models
# ─────────────────────────────────────────────────────────────

class StartLearnResponse(BaseModel):
    document_id: str
    total_sections: int
    sections_with_progress: int
    message: str


class SectionProgressItem(BaseModel):
    section_index: int
    title: str
    page_start: Optional[int]
    page_end: Optional[int]
    status: str
    last_score: Optional[int]


class SectionsListResponse(BaseModel):
    document_id: str
    sections: List[SectionProgressItem]


class SectionDetailResponse(BaseModel):
    section_index: int
    title: str
    summary: str
    page_start: Optional[int]
    page_end: Optional[int]
    explanation: str
    check_questions: list
    status: str
    last_score: Optional[int]


class AnswerRequest(BaseModel):
    question_index: int = Field(..., ge=0, description="0-based index into check_questions")
    selected_option: str = Field(..., description="One of A, B, C, D")


class AnswerResponse(BaseModel):
    correct: bool
    correct_answer: str
    explanation: str
    followup_feedback: Optional[str] = None


class CompleteRequest(BaseModel):
    score: int = Field(..., ge=0, le=100, description="Percentage score 0-100")


class CompleteResponse(BaseModel):
    section_index: int
    status: str
    last_score: int
    message: str


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────

@router.post("/documents/{document_id}/start", response_model=StartLearnResponse)
async def start_learn_session(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Initialize Learn Mode for a document.
    Verifies access, returns section count, and shows how many sections
    already have progress rows. Does NOT create progress rows proactively
    (they are created lazily on first visit or completion).
    """
    await _assert_document_access(document_id, current_user)

    sections = await _get_sections(document_id)
    if not sections:
        raise HTTPException(
            status_code=404,
            detail="This document has no sections. It may need to be re-processed.",
        )

    db = _db()
    progress_res = await _run(
        lambda: db.table("document_learn_progress")
        .select("section_index")
        .eq("user_id", current_user.id)
        .eq("document_id", document_id)
        .execute(),
        "count existing progress rows",
    )
    sections_with_progress = len(progress_res.data or [])

    return StartLearnResponse(
        document_id=document_id,
        total_sections=len(sections),
        sections_with_progress=sections_with_progress,
        message=(
            "Learn Mode started. Study each section in order — "
            "use /sections to see your progress."
        ),
    )


@router.get("/documents/{document_id}/sections", response_model=SectionsListResponse)
async def list_learn_sections(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Return all sections for a document with per-user progress status.
    """
    await _assert_document_access(document_id, current_user)

    sections = await _get_sections(document_id)
    if not sections:
        raise HTTPException(status_code=404, detail="No sections found for this document.")

    db = _db()
    progress_res = await _run(
        lambda: db.table("document_learn_progress")
        .select("section_index,status,last_score")
        .eq("user_id", current_user.id)
        .eq("document_id", document_id)
        .execute(),
        "fetch all section progress",
    )
    progress_by_index = {
        p["section_index"]: p for p in (progress_res.data or [])
    }

    items = []
    for sec in sections:
        idx = sec["section_index"]
        prog = progress_by_index.get(idx, {})
        items.append(SectionProgressItem(
            section_index=idx,
            title=sec.get("title") or f"Section {idx + 1}",
            page_start=sec.get("page_start"),
            page_end=sec.get("page_end"),
            status=prog.get("status", "not_started"),
            last_score=prog.get("last_score"),
        ))

    return SectionsListResponse(document_id=document_id, sections=items)


@router.get("/documents/{document_id}/sections/{section_index}", response_model=SectionDetailResponse)
async def get_learn_section(
    document_id: str,
    section_index: int,
    current_user: User = Depends(get_current_user),
):
    """
    Return a single section with its full explanation and check questions.
    If explanation/questions haven't been generated yet, generates them now (lazy)
    using TEXT_SECONDARY and persists them to document_sections.

    Also marks the section as 'in_progress' if it's currently 'not_started'.
    """
    await _assert_document_access(document_id, current_user)

    section = await _get_section(document_id, section_index)
    if not section:
        raise HTTPException(status_code=404, detail=f"Section {section_index} not found.")

    # Lazily generate explanation + check questions if needed
    section = await _ensure_section_content(section)

    # Fetch / upsert progress for this section
    progress = await _get_progress(current_user.id, document_id, section_index)
    current_status = (progress or {}).get("status", "not_started")

    if current_status == "not_started":
        await _upsert_progress(
            current_user.id, document_id, section_index, status="in_progress"
        )
        current_status = "in_progress"

    return SectionDetailResponse(
        section_index=section_index,
        title=section.get("title") or f"Section {section_index + 1}",
        summary=section.get("summary") or "",
        page_start=section.get("page_start"),
        page_end=section.get("page_end"),
        explanation=section.get("explanation") or "",
        check_questions=section.get("check_questions") or [],
        status=current_status,
        last_score=(progress or {}).get("last_score"),
    )


@router.post("/documents/{document_id}/sections/{section_index}/answer", response_model=AnswerResponse)
async def submit_section_answer(
    document_id: str,
    section_index: int,
    body: AnswerRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Grade a single check-question answer.
    On a wrong answer, generates a short diagnostic follow-up using TEXT_SECONDARY.
    """
    await _assert_document_access(document_id, current_user)

    section = await _get_section(document_id, section_index)
    if not section:
        raise HTTPException(status_code=404, detail=f"Section {section_index} not found.")

    questions = section.get("check_questions") or []
    if not questions:
        raise HTTPException(
            status_code=404,
            detail="This section has no check questions yet. Visit the section detail endpoint first to generate them.",
        )

    if body.question_index >= len(questions):
        raise HTTPException(
            status_code=400,
            detail=f"question_index {body.question_index} is out of range (section has {len(questions)} questions).",
        )

    question = questions[body.question_index]
    correct_answer = (question.get("correct_answer") or "").strip().upper()
    selected = (body.selected_option or "").strip().upper()

    is_correct = (selected == correct_answer)
    base_explanation = question.get("explanation") or "No explanation available."
    followup = None

    if not is_correct:
        # Generate a short diagnostic follow-up for wrong answers
        followup_messages = [
            {"role": "system", "content": _FOLLOWUP_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Question: {question.get('question_text', '')}\n"
                    f"Options: {json.dumps(question.get('options', {}))}\n"
                    f"Correct answer: {correct_answer}\n"
                    f"Student selected: {selected}\n"
                    f"Explanation: {base_explanation}"
                ),
            },
        ]
        try:
            followup_resp = await llm_engine.generate_small_completion_with_failover(
                messages=followup_messages,
                temperature=0.2,
                max_tokens=256,
            )
            # Extract text from completion object (.choices[0].message.content)
            if followup_resp and getattr(followup_resp, 'choices', None):
                followup = (followup_resp.choices[0].message.content or "").strip() or None
            else:
                followup = None
        except Exception as exc:
            logger.warning("[LEARN] Follow-up generation failed for section %s/%s q%s: %s",
                           document_id, section_index, body.question_index, exc)
            followup = None  # non-fatal: still return correct/explanation

    return AnswerResponse(
        correct=is_correct,
        correct_answer=correct_answer,
        explanation=base_explanation,
        followup_feedback=followup,
    )


@router.post("/documents/{document_id}/sections/{section_index}/complete", response_model=CompleteResponse)
async def complete_learn_section(
    document_id: str,
    section_index: int,
    body: CompleteRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Mark a section as complete and record the student's score.
    Automatically sets status to 'mastered' (>= 70%) or 'needs_review' (< 70%).
    """
    await _assert_document_access(document_id, current_user)

    section = await _get_section(document_id, section_index)
    if not section:
        raise HTTPException(status_code=404, detail=f"Section {section_index} not found.")

    new_status = "mastered" if body.score >= 70 else "needs_review"
    await _upsert_progress(
        current_user.id,
        document_id,
        section_index,
        status=new_status,
        last_score=body.score,
    )

    if new_status == "mastered":
        message = f"Section mastered with {body.score}% — great work!"
    else:
        message = f"Section marked for review ({body.score}%). Revisit when you're ready."

    return CompleteResponse(
        section_index=section_index,
        status=new_status,
        last_score=body.score,
        message=message,
    )
