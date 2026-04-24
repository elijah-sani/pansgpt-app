"""
Quiz router – Generate, submit, and retrieve quizzes.
"""
from fastapi import APIRouter, HTTPException, Request, Depends, Header
from dependencies import get_current_user, User
from pydantic import BaseModel
from typing import Optional, List, Union
import json
import logging
import re
import uuid
import os
import asyncio

from services import llm_engine

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/api/quiz", tags=["quiz"])

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


# ---------- Models ----------
class QuizGenerateRequest(BaseModel):
    courseCode: str
    courseTitle: str
    topic: Optional[str] = None
    level: str
    difficulty: str = "medium"
    numQuestions: int = 10
    timeLimit: Optional[int] = None
    questionType: str = "OBJECTIVE"


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


def _is_chunk_novel(content: str, selected_contents: list[str], threshold: float = 0.78) -> bool:
    for existing in selected_contents:
        if _question_similarity(content, existing) >= threshold:
            return False
    return True


async def _build_quiz_context_from_embeddings(sb, body: QuizGenerateRequest) -> str:
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
            "id,file_name,course_code,topic,target_levels,embedding_status"
        ).eq("course_code", body.courseCode).execute()
        docs = docs_res.data or []
    except Exception as exc:
        logger.warning(f"Quiz retrieval document lookup failed: {exc}")
        return ""
    if not docs:
        return ""

    filtered_docs = []
    for doc in docs:
        if (doc.get("embedding_status") or "").lower() != "completed":
            continue
        if not _doc_matches_level(doc.get("target_levels") or [], body.level):
            continue
        filtered_docs.append(doc)

    if not filtered_docs:
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


# ---------- Routes ----------

@router.post("/generate", dependencies=[Depends(_verify_api_key)])
async def generate_quiz(body: QuizGenerateRequest, current_user: User = Depends(get_current_user)):
    """Generate quiz questions using LLM and save to database."""
    sb = _get_supabase()

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
        retrieved_context_block = await _build_quiz_context_from_embeddings(sb, body)
    except Exception as exc:
        logger.warning(f"Could not build embedding context block: {exc}")
        retrieved_context_block = ""

    # Keep prompt size bounded for high question counts.
    recent_lines = _extract_recent_question_lines(recent_question_block, limit=20)
    recent_block_small = (
        "RECENTLY USED QUESTIONS (DO NOT REUSE OR PARAPHRASE THESE):\n"
        + "\n".join([f"- {q}" for q in recent_lines])
        + "\n"
    ) if recent_lines else ""
    context_block_small = _truncate_block(retrieved_context_block, max_chars=9000)

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

    def _build_prompt(batch_count: int, already_used: list[str], compact: bool = False) -> str:
        nonce = str(uuid.uuid4())[:8]
        used_block = ""
        if already_used:
            used_lines = "\n".join([f"- {q}" for q in already_used[:40]])
            used_block = (
                "ALREADY GENERATED IN THIS QUIZ (DO NOT REUSE/PARAPHRASE):\n"
                f"{used_lines}\n"
            )

        prompt = f"""Generate {batch_count} {type_desc} quiz questions about {body.courseTitle} ({body.courseCode}).
Topic: {body.topic or 'General'}
Difficulty: {body.difficulty}
Level: {body.level}
Generation nonce: {nonce}

DIVERSITY REQUIREMENTS:
- Avoid repeating any previously asked questions or close paraphrases.
- Spread questions across different concepts/sections of the material.
- Avoid clustering on a single subsection.
- Vary question phrasing and scenario framing.

Return ONLY a valid JSON array of question objects. Each object must have:
- "questionText": the question string
{format_reqs}
- "explanation": a brief explanation of the correct answer

{context_block_small if not compact else ""}

{recent_block_small}
{used_block}

Do NOT include any markdown, code fences, or extra text. Return ONLY the JSON array."""

        if context_block_small and not compact:
            prompt += """

GROUNDING RULES:
- Build questions from the retrieved curriculum context above.
- Cover multiple different excerpts/sources in the context, not just one narrow subsection.
- Do not invent facts outside the retrieved context unless needed for wording clarity.
"""
        return prompt

    try:
        target_count = max(1, int(body.numQuestions or 10))
        batch_size = 10 if target_count > 12 else target_count
        questions: list[dict] = []

        while len(questions) < target_count:
            remaining = target_count - len(questions)
            current_batch = min(batch_size, remaining)
            generated_this_batch = None

            already_used = [str(q.get("questionText", "")).strip() for q in questions if str(q.get("questionText", "")).strip()]
            for attempt in range(1, 4):
                compact_mode = attempt >= 2 and target_count >= 15
                prompt = _build_prompt(current_batch, already_used, compact=compact_mode)
                raw = await llm_engine.generate_response_async(prompt, [], force_google=True)

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
                from services.llm_engine import generate_response_async

                # Build the grading prompt with all short-answer questions
                grading_entries = []
                for idx, (fb_index, answer, question) in enumerate(short_answer_items):
                    grading_entries.append(
                        f"Q{idx+1}:\n"
                        f"  Question: {question.get('question_text', '')}\n"
                        f"  Reference Answer: {question['correct_answer']}\n"
                        f"  Student Answer: {answer.selectedAnswer}"
                    )

                grading_prompt = (
                    "You are a university exam grader. Grade the following short-answer questions.\n"
                    "For each question, compare the student's answer to the reference answer CONTEXTUALLY.\n"
                    "The student does NOT need to use the exact same words. As long as the meaning is correct or substantially correct, award marks.\n\n"
                    "For each question, respond with a JSON object on a separate line:\n"
                    '{"q": <question_number>, "score": <0 or 0.5 or 1>, "feedback": "<brief explanation>"}\n\n'
                    "Score guide:\n"
                    "- 1.0 = Correct or substantially correct (meaning matches even if wording differs)\n"
                    "- 0.5 = Partially correct (captures some key points but misses others)\n"
                    "- 0.0 = Incorrect or irrelevant\n\n"
                    "Questions:\n" + "\n\n".join(grading_entries) + "\n\n"
                    "Respond ONLY with the JSON lines, one per question. No other text."
                )

                ai_response = await generate_response_async(grading_prompt, force_google=True)
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
