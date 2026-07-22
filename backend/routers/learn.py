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
import re
import uuid
<<<<<<< HEAD
from typing import List, Literal, Optional  # [LEARN MODE TIERS] added Literal
=======
from typing import List, Optional
>>>>>>> main

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks  # [LEARN RETEST]
from pydantic import BaseModel, Field

from dependencies import get_current_user, User
from services import llm_engine

logger = logging.getLogger("PansGPT")

def _is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except ValueError:
        return False

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
    if not _is_valid_uuid(document_id):
        raise HTTPException(status_code=404, detail="Document not found")

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
<<<<<<< HEAD
        .select("id,document_id,section_index,title,summary,page_start,page_end,explanation,check_questions,tiered_content")  # [LEARN MODE TIERS] added tiered_content
=======
        .select("id,document_id,section_index,title,summary,page_start,page_end,explanation,check_questions")
>>>>>>> main
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
<<<<<<< HEAD
        .select("id,document_id,section_index,title,summary,page_start,page_end,explanation,check_questions,tiered_content")  # [LEARN MODE TIERS] added tiered_content
=======
        .select("id,document_id,section_index,title,summary,page_start,page_end,explanation,check_questions")
>>>>>>> main
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
<<<<<<< HEAD

# [LEARN MODE TIERS] Per-tier explanation system prompts.
# Each variant is calibrated to the student's declared prior exposure.
_EXPLAIN_SYSTEM_BY_TIER = {  # [LEARN MODE TIERS]
    "new": (  # [LEARN MODE TIERS]
        "You are a pharmacy study tutor writing for a student with ZERO prior exposure to this topic. "
        "Your job is to build their foundation from scratch, section by section. "
        "Rules: (1) Define every key term before you use it. (2) Open with a one-sentence 'why this matters' "
        "framing so the student knows why they should care. (3) Prefer plain language over jargon — introduce "
        "clinical/pharmacology terms only after a plain-language equivalent. (4) Use clear, short paragraphs "
        "(3–6 total) with markdown headings to break up concepts. (5) Do NOT repeat the section title verbatim "
        "at the start. Scaffold step by step; assume nothing."
    ),  # [LEARN MODE TIERS]
    "familiar": (  # [LEARN MODE TIERS]
        "You are a pharmacy study tutor writing for a student who has read this material before but finds it "
        "isn't sticking. Your job is reinforcement, not re-introduction. "
        "Rules: (1) Skip 101-level framing — do not define basic terminology the student already knows. "
        "(2) Focus on the concepts that are most commonly confused or misremembered in this topic area. "
        "(3) Highlight the distinctions and edge cases students trip over — contrast similar mechanisms, "
        "drugs, or conditions explicitly. (4) Use 3–6 paragraphs with markdown for clarity. "
        "(5) Do NOT repeat the section title verbatim at the start."
    ),  # [LEARN MODE TIERS]
    "confident": (  # [LEARN MODE TIERS]
        "You are a pharmacy study tutor writing a high-yield exam-prep reference for a student with a strong "
        "baseline who needs to test their retrieval. Be terse — this is not a tutorial. "
        "Rules: (1) Lead immediately with the most exam-relevant distinctions and must-know facts. "
        "(2) No hand-holding: skip introductory framing entirely. (3) Use bullet points and markdown tables "
        "where they compress information most efficiently. (4) Prioritise clinical decision points, "
        "mechanism nuances, and commonly-tested edge cases over narrative explanation. "
        "(5) Aim for 2–4 concise sections; cut anything a well-prepared student already knows cold. "
        "(6) Do NOT repeat the section title verbatim at the start."
    ),  # [LEARN MODE TIERS]
}  # [LEARN MODE TIERS]

# [LEARN MODE TIERS] Per-tier check-question system prompts.
# Difficulty and question style ramp with the tier.
_QUESTIONS_SYSTEM_BY_TIER = {  # [LEARN MODE TIERS]
    "new": (  # [LEARN MODE TIERS]
        "You are a pharmacy study tutor. Generate exactly 3 multiple-choice check questions for a student "
        "with no prior exposure to this topic. Questions must test recall and recognition of key facts "
        "just introduced in the section — clear, unambiguous stems, straightforward distractors that are "
        "obviously wrong to anyone who read the material carefully. Avoid tricky wording. "
        "Respond ONLY with a JSON array of objects. Each object must have exactly these keys: "
        "question_text (string), options (object with keys A, B, C, D; each a string), "
        "correct_answer (string, one of A/B/C/D), explanation (string, one sentence). "
        "No preamble, no markdown, only the JSON array."
    ),  # [LEARN MODE TIERS]
    "familiar": (  # [LEARN MODE TIERS]
        "You are a pharmacy study tutor. Generate exactly 3 multiple-choice check questions for a student "
        "who has read this material but needs reinforcement. Mix recall and application-level questions. "
        "Target the concepts most likely to be misremembered or confused — use plausible distractors "
        "that reflect common sticking points, not obviously wrong choices. "
        "Respond ONLY with a JSON array of objects. Each object must have exactly these keys: "
        "question_text (string), options (object with keys A, B, C, D; each a string), "
        "correct_answer (string, one of A/B/C/D), explanation (string, one sentence). "
        "No preamble, no markdown, only the JSON array."
    ),  # [LEARN MODE TIERS]
    "confident": (  # [LEARN MODE TIERS]
        "You are a pharmacy study tutor. Generate exactly 3 high-difficulty multiple-choice questions "
        "for a student preparing for an exam who already knows the basics. Questions must be application "
        "or analysis level — scenario-based stems, clinical vignette framing, or mechanism-comparison "
        "questions that require active reasoning, not just recall. Distractors must be highly plausible "
        "(common exam traps, near-misses, or contraindicated alternatives a weak student might choose). "
        "Respond ONLY with a JSON array of objects. Each object must have exactly these keys: "
        "question_text (string), options (object with keys A, B, C, D; each a string), "
        "correct_answer (string, one of A/B/C/D), explanation (string, one sentence). "
        "No preamble, no markdown, only the JSON array."
    ),  # [LEARN MODE TIERS]
}  # [LEARN MODE TIERS]
=======
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
>>>>>>> main

_FOLLOWUP_SYSTEM = (
    "You are a pharmacy study tutor. A student answered a question incorrectly. "
    "Explain in 2-3 sentences why the correct answer is right and briefly clarify the concept. "
    "Be direct and educational."
)

_RETEST_QUESTION_SYSTEM = (  # [LEARN RETEST]
    "You are a pharmacy study tutor. A student has answered a question incorrectly. "  # [LEARN RETEST]
    "Based on the original question, their incorrect choice, the correct answer, and the explanation, "  # [LEARN RETEST]
    "identify the specific sub-concept the mistake reveals and generate exactly ONE new multiple-choice check question "  # [LEARN RETEST]
    "testing that same concept from a different angle (do not create a reworded duplicate of the original question). "  # [LEARN RETEST]
    "Respond ONLY with a JSON object. The object must have exactly these keys: "  # [LEARN RETEST]
    "question_text (string), options (object with keys A, B, C, D; each a string), "  # [LEARN RETEST]
    "correct_answer (string, one of A/B/C/D), explanation (string, one sentence). "  # [LEARN RETEST]
    "No preamble, no markdown, only the JSON object."  # [LEARN RETEST]
)  # [LEARN RETEST]


async def _generate_retest_question(question: dict, selected: str, correct_answer: str, base_explanation: str) -> Optional[dict]:  # [LEARN RETEST]
    """Generate ONE targeted retest question testing the same concept from a different angle."""  # [LEARN RETEST]
    retest_messages = [  # [LEARN RETEST]
        {"role": "system", "content": _RETEST_QUESTION_SYSTEM},  # [LEARN RETEST]
        {  # [LEARN RETEST]
            "role": "user",  # [LEARN RETEST]
            "content": (  # [LEARN RETEST]
                f"Original Question: {question.get('question_text', '')}\n"  # [LEARN RETEST]
                f"Options: {json.dumps(question.get('options', {}))}\n"  # [LEARN RETEST]
                f"Correct answer: {correct_answer}\n"  # [LEARN RETEST]
                f"Student's incorrect choice: {selected}\n"  # [LEARN RETEST]
                f"Explanation: {base_explanation}"  # [LEARN RETEST]
            ),  # [LEARN RETEST]
        },  # [LEARN RETEST]
    ]  # [LEARN RETEST]
    try:  # [LEARN RETEST]
<<<<<<< HEAD
        resp = await llm_engine.generate_learn_completion_with_failover(  # [LEARN RETEST]
=======
        resp = await llm_engine.generate_small_completion_with_failover(  # [LEARN RETEST]
>>>>>>> main
            messages=retest_messages,  # [LEARN RETEST]
            temperature=0.3,  # [LEARN RETEST]
            max_tokens=512,  # [LEARN RETEST]
        )  # [LEARN RETEST]
        if resp and getattr(resp, 'choices', None):  # [LEARN RETEST]
            raw_text = (resp.choices[0].message.content or "").strip()  # [LEARN RETEST]
            raw_text = re.sub(r"<thought>.*?(?:</thought>|$)", "", raw_text, flags=re.DOTALL).strip()  # [LEARN RETEST]
            if raw_text.startswith("```"):  # [LEARN RETEST]
                raw_text = "\n".join(raw_text.split("\n")[1:])  # [LEARN RETEST]
                raw_text = raw_text.rsplit("```", 1)[0].strip()  # [LEARN RETEST]
            try:  # [LEARN RETEST]
                parsed = json.loads(raw_text)  # [LEARN RETEST]
                if isinstance(parsed, dict) and "question_text" in parsed and "options" in parsed:  # [LEARN RETEST]
                    return parsed  # [LEARN RETEST]
            except json.JSONDecodeError:  # [LEARN RETEST]
                logger.warning("[LEARN RETEST] Failed to parse retest question JSON: %s", raw_text)  # [LEARN RETEST]
    except Exception as exc:  # [LEARN RETEST]
        logger.warning("[LEARN RETEST] Failed to generate retest question: %s", exc)  # [LEARN RETEST]
    return None  # [LEARN RETEST]


async def _background_generate_and_save_retest(  # [LEARN RETEST]
    user_id: str,  # [LEARN RETEST]
    document_id: str,  # [LEARN RETEST]
    section_index: int,  # [LEARN RETEST]
    question: dict,  # [LEARN RETEST]
    selected: str,  # [LEARN RETEST]
    correct_answer: str,  # [LEARN RETEST]
    base_explanation: str,  # [LEARN RETEST]
):  # [LEARN RETEST]
    """Generate and insert retest question in background without blocking response."""  # [LEARN RETEST]
    from utils import background_task_tracker  # [LEARN RETEST]
    background_task_tracker.increment()  # [LEARN RETEST]
    try:  # [LEARN RETEST]
        retest_q = await _generate_retest_question(question, selected, correct_answer, base_explanation)  # [LEARN RETEST]
        if retest_q:  # [LEARN RETEST]
            db = _db()  # [LEARN RETEST]
            payload = {  # [LEARN RETEST]
                "user_id": user_id,  # [LEARN RETEST]
                "document_id": document_id,  # [LEARN RETEST]
                "origin_section_index": section_index,  # [LEARN RETEST]
                "target_section_index": section_index + 1,  # [LEARN RETEST]
                "question": retest_q,  # [LEARN RETEST]
                "resolved": False,  # [LEARN RETEST]
            }  # [LEARN RETEST]
            try:  # [LEARN RETEST]
                await _run(  # [LEARN RETEST]
                    lambda: db.table("document_learn_pending_retests")  # [LEARN RETEST]
                    .insert(payload)  # [LEARN RETEST]
                    .execute(),  # [LEARN RETEST]
                    "insert pending retest"  # [LEARN RETEST]
                )  # [LEARN RETEST]
            except Exception as exc:  # [LEARN RETEST]
                logger.error("[LEARN RETEST] Failed to insert pending retest to DB: %s", exc)  # [LEARN RETEST]
    finally:  # [LEARN RETEST]
        background_task_tracker.decrement()  # [LEARN RETEST]



<<<<<<< HEAD
async def _generate_section_content(section: dict, chunks: list, tier: str) -> tuple[str, list]:  # [LEARN MODE TIERS] added tier param
    """
    Generate explanation and check_questions for a section using TEXT_SECONDARY.
    Selects system prompts from _EXPLAIN_SYSTEM_BY_TIER / _QUESTIONS_SYSTEM_BY_TIER based on tier.
=======
async def _generate_section_content(section: dict, chunks: list) -> tuple[str, list]:
    """
    Generate explanation and check_questions for a section using TEXT_SECONDARY.
>>>>>>> main
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

<<<<<<< HEAD
    explain_sys = _EXPLAIN_SYSTEM_BY_TIER[tier]    # [LEARN MODE TIERS]
    questions_sys = _QUESTIONS_SYSTEM_BY_TIER[tier]  # [LEARN MODE TIERS]

    # Run both LLM calls concurrently
    explain_messages = [
        {"role": "system", "content": explain_sys},    # [LEARN MODE TIERS]
        {"role": "user", "content": context_block},
    ]
    questions_messages = [
        {"role": "system", "content": questions_sys},  # [LEARN MODE TIERS]
=======
    # Run both LLM calls concurrently
    explain_messages = [
        {"role": "system", "content": _EXPLAIN_SYSTEM},
        {"role": "user", "content": context_block},
    ]
    questions_messages = [
        {"role": "system", "content": _QUESTIONS_SYSTEM},
>>>>>>> main
        {"role": "user", "content": context_block},
    ]

    try:
        explain_resp, questions_resp = await asyncio.gather(
<<<<<<< HEAD
            llm_engine.generate_learn_completion_with_failover(
=======
            llm_engine.generate_small_completion_with_failover(
>>>>>>> main
                messages=explain_messages,
                temperature=0.3,
                max_tokens=1024,
            ),
<<<<<<< HEAD
            llm_engine.generate_learn_completion_with_failover(
=======
            llm_engine.generate_small_completion_with_failover(
>>>>>>> main
                messages=questions_messages,
                temperature=0.15,
                max_tokens=1024,
            ),
        )
    except Exception as exc:
<<<<<<< HEAD
        logger.error("[LEARN] LLM generation failed for section %s/%s tier=%s: %s",
                     section.get("document_id"), section.get("section_index"), tier, exc)  # [LEARN MODE TIERS]
=======
        logger.error("[LEARN] LLM generation failed for section %s/%s: %s",
                     section.get("document_id"), section.get("section_index"), exc)
>>>>>>> main
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
    explanation = re.sub(r"<thought>.*?(?:</thought>|$)", "", explanation, flags=re.DOTALL).strip()

    # Parse questions JSON robustly
    questions: list = []
    raw_q = _extract(questions_resp).strip()
    raw_q = re.sub(r"<thought>.*?(?:</thought>|$)", "", raw_q, flags=re.DOTALL).strip()
    # Strip markdown fences if the model wrapped the JSON
    if raw_q.startswith("```"):
        raw_q = "\n".join(raw_q.split("\n")[1:])
        raw_q = raw_q.rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(raw_q)
        if isinstance(parsed, list):
            questions = parsed
        else:
<<<<<<< HEAD
            logger.warning("[LEARN] Questions JSON was not a list for section %s/%s tier=%s",
                           section.get("document_id"), section.get("section_index"), tier)  # [LEARN MODE TIERS]
    except json.JSONDecodeError as exc:
        logger.warning("[LEARN] Could not parse questions JSON for section %s/%s tier=%s: %s | raw=%s",
                       section.get("document_id"), section.get("section_index"), tier, exc, raw_q[:200])  # [LEARN MODE TIERS]
=======
            logger.warning("[LEARN] Questions JSON was not a list for section %s/%s",
                           section.get("document_id"), section.get("section_index"))
    except json.JSONDecodeError as exc:
        logger.warning("[LEARN] Could not parse questions JSON for section %s/%s: %s | raw=%s",
                       section.get("document_id"), section.get("section_index"), exc, raw_q[:200])
>>>>>>> main

    return explanation, questions


<<<<<<< HEAD
async def _get_confidence_tier(user_id: str, document_id: str) -> str:  # [LEARN MODE TIERS]
    """
    Look up the confidence tier the student selected for this document.
    Defaults to 'familiar' if no session row exists (e.g. student accesses /sections
    without calling /start first, or this is an old session predating this feature).
    """
    db = _db()  # [LEARN MODE TIERS]
    try:  # [LEARN MODE TIERS]
        res = await _run(  # [LEARN MODE TIERS]
            lambda: db.table("document_learn_sessions")  # [LEARN MODE TIERS]
            .select("confidence_level")  # [LEARN MODE TIERS]
            .eq("user_id", user_id)  # [LEARN MODE TIERS]
            .eq("document_id", document_id)  # [LEARN MODE TIERS]
            .limit(1)  # [LEARN MODE TIERS]
            .execute(),  # [LEARN MODE TIERS]
            "fetch confidence tier",  # [LEARN MODE TIERS]
        )  # [LEARN MODE TIERS]
        rows = res.data or []  # [LEARN MODE TIERS]
        if rows:  # [LEARN MODE TIERS]
            return rows[0]["confidence_level"]  # [LEARN MODE TIERS]
    except Exception as exc:  # [LEARN MODE TIERS]
        logger.warning(  # [LEARN MODE TIERS]
            "[LEARN MODE TIERS] Could not fetch confidence tier for user %s / doc %s — defaulting to 'familiar': %s",  # [LEARN MODE TIERS]
            user_id, document_id, exc,  # [LEARN MODE TIERS]
        )  # [LEARN MODE TIERS]
    logger.warning(  # [LEARN MODE TIERS]
        "[LEARN MODE TIERS] No session row found for user %s / doc %s — defaulting tier to 'familiar'.",  # [LEARN MODE TIERS]
        user_id, document_id,  # [LEARN MODE TIERS]
    )  # [LEARN MODE TIERS]
    return "familiar"  # [LEARN MODE TIERS]


async def _ensure_section_content(section: dict, tier: str) -> dict:  # [LEARN MODE TIERS] added tier param
    """
    If the requested tier's content is missing from tiered_content, generate it and
    persist atomically via merge_section_tiered_content() (race-safe jsonb merge).
    Returns a section-like dict with 'explanation' and 'check_questions' populated
    from the requested tier slot.
    """
    tiered_content: dict = section.get("tiered_content") or {}  # [LEARN MODE TIERS]
    tier_slot: dict = tiered_content.get(tier, {})              # [LEARN MODE TIERS]

    if tier_slot.get("explanation") and tier_slot.get("check_questions"):  # [LEARN MODE TIERS]
        # Cache hit — return immediately from tiered_content
        return {  # [LEARN MODE TIERS]
            **section,  # [LEARN MODE TIERS]
            "explanation": tier_slot["explanation"],              # [LEARN MODE TIERS]
            "check_questions": tier_slot["check_questions"],      # [LEARN MODE TIERS]
        }  # [LEARN MODE TIERS]

    # Cache miss — generate for this tier
    document_id = section["document_id"]
    section_index = section["section_index"]
    section_id = section["id"]  # [LEARN MODE TIERS] needed for RPC call
=======
async def _ensure_section_content(section: dict) -> dict:
    """
    If explanation or check_questions are missing, generate them and persist.
    Returns the updated section dict.
    """
    if section.get("explanation") and section.get("check_questions"):
        return section

    document_id = section["document_id"]
    section_index = section["section_index"]
>>>>>>> main

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

<<<<<<< HEAD
    explanation, questions = await _generate_section_content(section, chunks, tier)  # [LEARN MODE TIERS]

    # Persist atomically — merge only the new tier key into tiered_content.
    # merge_section_tiered_content() uses Postgres's || operator inside a single
    # UPDATE so concurrent writes for different tiers never clobber each other.
    if explanation:
        patch = {tier: {"explanation": explanation, "check_questions": questions or []}}  # [LEARN MODE TIERS]
        db = _db()  # [LEARN MODE TIERS]
        try:
            await _run(
                lambda: db.rpc(  # [LEARN MODE TIERS]
                    "merge_section_tiered_content",  # [LEARN MODE TIERS]
                    {"p_section_id": section_id, "p_patch": patch},  # [LEARN MODE TIERS]
                ).execute(),  # [LEARN MODE TIERS]
                "merge tiered section content",  # [LEARN MODE TIERS]
            )
        except Exception as exc:
            logger.error("[LEARN] Failed to persist tiered content for %s/%s tier=%s: %s",
                         document_id, section_index, tier, exc)  # [LEARN MODE TIERS]
            # Non-fatal: we still return the generated content for this request

    return {
        **section,
        "explanation": explanation or "",               # [LEARN MODE TIERS]
        "check_questions": questions or [],             # [LEARN MODE TIERS]
=======
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
>>>>>>> main
    }


# ─────────────────────────────────────────────────────────────
# Request/Response models
# ─────────────────────────────────────────────────────────────

<<<<<<< HEAD
class StartLearnRequest(BaseModel):               # [LEARN MODE TIERS]
    confidence: Literal["new", "familiar", "confident"]  # [LEARN MODE TIERS]


=======
>>>>>>> main
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
    immediate_retest_question: Optional[dict] = None  # [LEARN RETEST]


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
<<<<<<< HEAD
    body: StartLearnRequest,                       # [LEARN MODE TIERS] accept confidence tier from request body
=======
>>>>>>> main
    current_user: User = Depends(get_current_user),
):
    """
    Initialize Learn Mode for a document.
<<<<<<< HEAD
    Verifies access, persists the student's confidence tier selection, returns
    section count, and shows how many sections already have progress rows.
    Does NOT create progress rows proactively (they are created lazily on first visit).
=======
    Verifies access, returns section count, and shows how many sections
    already have progress rows. Does NOT create progress rows proactively
    (they are created lazily on first visit or completion).
>>>>>>> main
    """
    await _assert_document_access(document_id, current_user)

    sections = await _get_sections(document_id)
    if not sections:
        raise HTTPException(
            status_code=404,
            detail="This document has no sections. It may need to be re-processed.",
        )

    db = _db()
<<<<<<< HEAD

    # [LEARN MODE TIERS] Upsert the student's confidence tier.
    # on_conflict overwrites confidence_level if the student restarts with a different tier.
    session_payload = {                            # [LEARN MODE TIERS]
        "user_id": current_user.id,               # [LEARN MODE TIERS]
        "document_id": document_id,               # [LEARN MODE TIERS]
        "confidence_level": body.confidence,      # [LEARN MODE TIERS]
    }                                             # [LEARN MODE TIERS]
    try:                                          # [LEARN MODE TIERS]
        await _run(                               # [LEARN MODE TIERS]
            lambda: db.table("document_learn_sessions")  # [LEARN MODE TIERS]
            .upsert(session_payload, on_conflict="user_id,document_id")  # [LEARN MODE TIERS]
            .execute(),                           # [LEARN MODE TIERS]
            "upsert learn session tier",          # [LEARN MODE TIERS]
        )                                         # [LEARN MODE TIERS]
    except Exception as exc:                      # [LEARN MODE TIERS]
        # Non-fatal: log and continue — tier selection failing must not block the student
        logger.error(                             # [LEARN MODE TIERS]
            "[LEARN MODE TIERS] Failed to upsert session tier for user %s / doc %s: %s",  # [LEARN MODE TIERS]
            current_user.id, document_id, exc,   # [LEARN MODE TIERS]
        )                                         # [LEARN MODE TIERS]

=======
>>>>>>> main
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
<<<<<<< HEAD
    Content is served from the per-tier cache in tiered_content; if missing for the
    student's current tier, generates and persists it lazily.
=======
    If explanation/questions haven't been generated yet, generates them now (lazy)
    using TEXT_SECONDARY and persists them to document_sections.
>>>>>>> main

    Also marks the section as 'in_progress' if it's currently 'not_started'.
    """
    await _assert_document_access(document_id, current_user)

    section = await _get_section(document_id, section_index)
    if not section:
        raise HTTPException(status_code=404, detail=f"Section {section_index} not found.")

<<<<<<< HEAD
    # [LEARN MODE TIERS] Look up the student's confidence tier, then ensure tier-specific content
    tier = await _get_confidence_tier(current_user.id, document_id)         # [LEARN MODE TIERS]
    section = await _ensure_section_content(section, tier)                  # [LEARN MODE TIERS]
=======
    # Lazily generate explanation + check questions if needed
    section = await _ensure_section_content(section)
>>>>>>> main

    # Fetch / upsert progress for this section
    progress = await _get_progress(current_user.id, document_id, section_index)
    current_status = (progress or {}).get("status", "not_started")

    if current_status == "not_started":
        await _upsert_progress(
            current_user.id, document_id, section_index, status="in_progress"
        )
        current_status = "in_progress"

    # Query unresolved pending retests for target_section_index = section_index
    db = _db()  # [LEARN RETEST]
    retests_res = await _run(  # [LEARN RETEST]
        lambda: db.table("document_learn_pending_retests")  # [LEARN RETEST]
        .select("id,origin_section_index,question")  # [LEARN RETEST]
        .eq("user_id", current_user.id)  # [LEARN RETEST]
        .eq("document_id", document_id)  # [LEARN RETEST]
        .eq("target_section_index", section_index)  # [LEARN RETEST]
        .eq("resolved", False)  # [LEARN RETEST]
        .order("id")  # [LEARN RETEST]
        .execute(),  # [LEARN RETEST]
        "fetch pending retests for section",  # [LEARN RETEST]
    )  # [LEARN RETEST]
    retests = retests_res.data or []  # [LEARN RETEST]

    questions_list = list(section.get("check_questions") or [])  # [LEARN RETEST]
    for r in retests:  # [LEARN RETEST]
        q_data = dict(r.get("question") or {})  # [LEARN RETEST]
        q_data["is_retest"] = True  # [LEARN RETEST]
        q_data["origin_section_index"] = r.get("origin_section_index")  # [LEARN RETEST]
        questions_list.append(q_data)  # [LEARN RETEST]

    return SectionDetailResponse(
        section_index=section_index,
        title=section.get("title") or f"Section {section_index + 1}",
        summary=section.get("summary") or "",
        page_start=section.get("page_start"),
        page_end=section.get("page_end"),
        explanation=section.get("explanation") or "",
        check_questions=questions_list,  # [LEARN RETEST]
        status=current_status,
        last_score=(progress or {}).get("last_score"),
    )


@router.post("/documents/{document_id}/sections/{section_index}/answer", response_model=AnswerResponse)
async def submit_section_answer(
    document_id: str,
    section_index: int,
    body: AnswerRequest,
    background_tasks: BackgroundTasks,                                                         # [LEARN RETEST]
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

<<<<<<< HEAD
    # [LEARN MODE TIERS] check_questions now live in tiered_content — resolve via tier
    tier = await _get_confidence_tier(current_user.id, document_id)         # [LEARN MODE TIERS]
    section = await _ensure_section_content(section, tier)                  # [LEARN MODE TIERS]
    questions = section.get("check_questions") or []                        # [LEARN MODE TIERS]
=======
    questions = section.get("check_questions") or []
>>>>>>> main

    # Fetch unresolved pending retests for target_section_index = section_index to align question indices
    db = _db()                                                                                  # [LEARN RETEST]
    retests_res = await _run(                                                                   # [LEARN RETEST]
        lambda: db.table("document_learn_pending_retests")                                      # [LEARN RETEST]
        .select("id,origin_section_index,question")                                             # [LEARN RETEST]
        .eq("user_id", current_user.id)                                                         # [LEARN RETEST]
        .eq("document_id", document_id)                                                         # [LEARN RETEST]
        .eq("target_section_index", section_index)                                              # [LEARN RETEST]
        .eq("resolved", False)                                                                  # [LEARN RETEST]
        .order("id")                                                                            # [LEARN RETEST]
        .execute(),                                                                             # [LEARN RETEST]
        "fetch pending retests to grade",                                                       # [LEARN RETEST]
    )                                                                                           # [LEARN RETEST]
    retests = retests_res.data or []                                                            # [LEARN RETEST]

    total_regular = len(questions)                                                              # [LEARN RETEST]
    total_total = total_regular + len(retests)                                                  # [LEARN RETEST]

    if not questions and not retests:                                                           # [LEARN RETEST]
        raise HTTPException(
            status_code=404,
            detail="This section has no check questions yet. Visit the section detail endpoint first to generate them.",
        )

    if body.question_index >= total_total:                                                      # [LEARN RETEST]
        raise HTTPException(
            status_code=400,
            detail=f"question_index {body.question_index} is out of range (section has {total_regular} regular and {len(retests)} retest questions).",
        )

    is_retest_q = (body.question_index >= total_regular)                                        # [LEARN RETEST]

    if is_retest_q:                                                                             # [LEARN RETEST]
        # RETEST RESOLUTION BRANCH                                                              # [LEARN RETEST]
        retest_item = retests[body.question_index - total_regular]                              # [LEARN RETEST]
        question = retest_item.get("question") or {}                                            # [LEARN RETEST]
        correct_answer = (question.get("correct_answer") or "").strip().upper()                 # [LEARN RETEST]
        selected = (body.selected_option or "").strip().upper()                                 # [LEARN RETEST]
        is_correct = (selected == correct_answer)                                               # [LEARN RETEST]
        base_explanation = question.get("explanation") or "No explanation available."           # [LEARN RETEST]

        from datetime import datetime, timezone                                                 # [LEARN RETEST]
        await _run(                                                                             # [LEARN RETEST]
            lambda: db.table("document_learn_pending_retests")                                  # [LEARN RETEST]
            .update({                                                                           # [LEARN RETEST]
                "resolved": True,                                                               # [LEARN RETEST]
                "resolved_correct": is_correct,                                                 # [LEARN RETEST]
                "resolved_at": datetime.now(timezone.utc).isoformat(),                           # [LEARN RETEST]
            })                                                                                  # [LEARN RETEST]
            .eq("id", retest_item.get("id"))                                                    # [LEARN RETEST]
            .execute(),                                                                         # [LEARN RETEST]
            "resolve retest question",                                                          # [LEARN RETEST]
        )                                                                                       # [LEARN RETEST]

        return AnswerResponse(                                                                  # [LEARN RETEST]
            correct=is_correct,                                                                 # [LEARN RETEST]
            correct_answer=correct_answer,                                                      # [LEARN RETEST]
            explanation=base_explanation,                                                       # [LEARN RETEST]
            followup_feedback=None,                                                             # [LEARN RETEST]
            immediate_retest_question=None,                                                     # [LEARN RETEST]
        )                                                                                       # [LEARN RETEST]

    # REGULAR QUESTION BRANCH
    question = questions[body.question_index]
    correct_answer = (question.get("correct_answer") or "").strip().upper()
    selected = (body.selected_option or "").strip().upper()

    is_correct = (selected == correct_answer)
    base_explanation = question.get("explanation") or "No explanation available."
    followup = None
    immediate_retest = None                                                                     # [LEARN RETEST]

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
                followup_text = (followup_resp.choices[0].message.content or "").strip()
                followup_text = re.sub(r"<thought>.*?(?:</thought>|$)", "", followup_text, flags=re.DOTALL).strip()
                followup = followup_text or None
            else:
                followup = None
        except Exception as exc:
            logger.warning("[LEARN] Follow-up generation failed for section %s/%s q%s: %s",
                           document_id, section_index, body.question_index, exc)
            followup = None  # non-fatal: still return correct/explanation

        # DEFERRED RETEST GENERATION BRANCH                                                     # [LEARN RETEST]
        all_sections = await _get_sections(document_id)                                         # [LEARN RETEST]
        max_section_idx = max((s.get("section_index", 0) for s in all_sections), default=0)     # [LEARN RETEST]
        if section_index >= max_section_idx:                                                     # [LEARN RETEST]
            # EDGE CASE: Last section, generate retest question inline                         # [LEARN RETEST]
            immediate_retest = await _generate_retest_question(                                 # [LEARN RETEST]
                question, selected, correct_answer, base_explanation                            # [LEARN RETEST]
            )                                                                                   # [LEARN RETEST]
        else:                                                                                   # [LEARN RETEST]
            # Defer: Generate and store retest question in the background                      # [LEARN RETEST]
            background_tasks.add_task(                                                          # [LEARN RETEST]
                _background_generate_and_save_retest,                                           # [LEARN RETEST]
                current_user.id,                                                                # [LEARN RETEST]
                document_id,                                                                    # [LEARN RETEST]
                section_index,                                                                  # [LEARN RETEST]
                question,                                                                       # [LEARN RETEST]
                selected,                                                                       # [LEARN RETEST]
                correct_answer,                                                                 # [LEARN RETEST]
                base_explanation,                                                               # [LEARN RETEST]
            )                                                                                   # [LEARN RETEST]

    return AnswerResponse(
        correct=is_correct,
        correct_answer=correct_answer,
        explanation=base_explanation,
        followup_feedback=followup,
        immediate_retest_question=immediate_retest,                                             # [LEARN RETEST]
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
