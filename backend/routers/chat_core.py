from . import shared
from .shared import (
    APIRouter,
    BaseModel,
    ChatRequest,
    ChatSession,
    CreateSessionRequest,
    CreateSessionResponse,
    Depends,
    FacultyKnowledgeCreateRequest,
    FacultyKnowledgeUpdateRequest,
    FeedbackRequest,
    File,
    Form,
    GRACEFUL_ASSISTANT_ERROR_PAYLOAD,
    HTTPException,
    Header,
    JSONResponse,
    List,
    Message,
    Optional,
    PHARMACY_SYSTEM_PROMPT,
    Request,
    STOPPED_ASSISTANT_NOTE,
    StreamingResponse,
    TimetableUpdateRequest,
    UploadFile,
    User,
    _assert_session_owner,
    _assert_super_admin,
    _build_student_profile_text,
    _clean_generated_title,
    _execute_with_retry,
    _faculty_cache,
    _is_generic_title,
    _is_retryable_network_error,
    _timetable_cache,
    asyncio,
    chat_history,
    contains_image,
    csv,
    datetime,
    genai,
    get_cached_faculty_knowledge,
    get_cached_settings,
    get_cached_student_timetable,
    get_current_user,
    get_relevant_context,
    io,
    json,
    llm_engine,
    logger,
    merge_system_into_user,
    os,
    tempfile,
    timedelta,
    timezone,
    uuid,
    verify_api_key,
    stream_pipeline_plan,
    STREAMING_PLANNER_DEFAULTS,
    FAST_MODE_DEFAULTS,
    _generate_retrieval_progress_update,
)
from slowapi import Limiter
from slowapi.util import get_remote_address
from services.web_search import search_web
from utils.thinking_token_utils import (
    strip_thinking_tokens,
    ThinkingStreamParser,
    model_uses_thinking,
)

from .sanitize import sanitize_text, CHAT_MAX, TITLE_MAX
import random
from restrictions import build_restriction_block_payload, get_applicable_user_restriction


def _trim_messages_to_fit(
    messages: list[dict],
    system_prompt: str,
    max_tokens: int = 14000,
    chars_per_token: int = 4,
) -> list[dict]:
    """
    Trims conversation history to fit within the token budget.
    Always keeps the system prompt and the most recent user message.
    Removes oldest messages first when over budget.
    """
    # Estimate token usage
    def estimate_tokens(msgs: list[dict]) -> int:
        total_chars = sum(len(str(m.get("content", ""))) for m in msgs)
        # system prompt text is already inside `msgs` as a system message
        return total_chars // chars_per_token

    # If already within budget, return as-is
    if estimate_tokens(messages) <= max_tokens:
        return messages

    # Separate system messages from conversation messages
    system_msgs = [m for m in messages if m.get("role") == "system"]
    conversation_msgs = [m for m in messages if m.get("role") != "system"]

    # Always keep the last user message
    if not conversation_msgs:
        return system_msgs

    last_msg = conversation_msgs[-1]
    trimable = conversation_msgs[:-1]

    # Remove oldest messages until within budget
    while trimable and estimate_tokens(system_msgs + trimable + [last_msg]) > max_tokens:
        trimable.pop(0)
        logger.warning(f"Trimmed 1 message from context window. Remaining: {len(trimable)}")

    trimmed = system_msgs + trimable + [last_msg]
    logger.info(f"Context window: {len(trimmed)} messages, ~{estimate_tokens(trimmed)} tokens estimated")
    return trimmed


def _normalize_text(text: Optional[str]) -> str:
    if not text:
        return ""
    return " ".join(str(text).strip().lower().split())


def _is_small_talk_or_greeting(text: Optional[str]) -> bool:
    normalized = _normalize_text(text).strip(".,!?")
    if not normalized:
        return False

    exact_phrases = {
        "hi",
        "hello",
        "hey",
        "yo",
        "sup",
        "how are you",
        "how are you doing",
        "how do you do",
        "good morning",
        "good afternoon",
        "good evening",
        "good night",
    }
    if normalized in exact_phrases:
        return True

    tokens = normalized.split()
    if not tokens:
        return False

    # Keep this classifier strict to avoid hijacking normal academic prompts.
    if tokens[0] in {"hi", "hello", "hey", "yo"} and len(tokens) <= 7:
        return True
    if normalized.startswith(("good morning", "good afternoon", "good evening", "good night")) and len(tokens) <= 9:
        return True
    if ("how are you" in normalized or "how's it going" in normalized or "hows it going" in normalized) and len(tokens) <= 12:
        return True

    return False


def is_off_topic_for_document(text: str) -> bool:
    """
    Study mode only: detect questions that are clearly general knowledge
    and won't benefit from searching the open document.
    These should be answered directly from the AI's knowledge.
    """
    normalized = _normalize_text(text).strip(".,!?")
    tokens = normalized.split()

    # Very short questions (< 3 words) without pharmacy context — likely general
    if len(tokens) < 3:
        return False  # too ambiguous, let RAG run

    # Explicit pharmacy/academic indicators — always use RAG
    _PHARMACY_INDICATORS = {
        "drug", "drugs", "medication", "medicine", "dose", "dosage",
        "pharmacology", "pharmacokinetics", "pharmacodynamics",
        "mechanism", "moa", "receptor", "enzyme", "protein",
        "synthesis", "metabol", "excret", "absorpt", "distribut",
        "antibiotic", "antifungal", "antiviral", "analgesic",
        "clinical", "therapeutic", "toxicity", "adverse", "contraindic",
        "lecture", "course", "topic", "curriculum", "exam", "study",
        "material", "notes", "slide", "page", "chapter", "group",
        "presenter", "presentation", "define", "explain", "describe",
        "formula", "structure", "synthesis", "reaction",
    }
    for indicator in _PHARMACY_INDICATORS:
        if indicator in normalized:
            return False  # pharmacy-related → use RAG

    # Patterns that suggest pure general knowledge questions
    _GENERAL_KNOWLEDGE_PATTERNS = [
        "capital of", "population of", "president of", "prime minister of",
        "who is the", "who was the", "when was", "where is", "where was",
        "how tall", "how far", "how old", "what year did", "what country",
        "currency of", "language of", "founded in", "invented by",
        "born in", "died in", "who invented", "who discovered",
        "what sport", "which team", "who won", "world cup",
        "convert ", "calculate ", "translate ",
    ]
    for pattern in _GENERAL_KNOWLEDGE_PATTERNS:
        if pattern in normalized:
            return True

    return False


def is_conversational_message(text: str) -> bool:
    normalized = _normalize_text(text).strip(".,!?")
    if not normalized:
        return False

    tokens = normalized.split()
    if len(tokens) > 15:
        return False

    study_markers = (
        "explain",
        "define",
        "what is",
        "what are",
        "how does",
        "how do",
        "describe",
        "summarize",
        "summary",
        "difference between",
        "compare",
        "mechanism",
        "pathway",
        "symptom",
        "diagnosis",
        "treatment",
        "dose",
        "drug",
        "course",
        "lecture",
        "lecturer",
        "topic",
        "curriculum",
        "pharmacy",
        "disease",
        "exam",
        "quiz",
        "assignment",
        "mnemonic",
        "example",
    )
    if any(marker in normalized for marker in study_markers):
        return False

    conversational_phrases = {
        "hi",
        "hello",
        "hey",
        "yo",
        "sup",
        "good morning",
        "good afternoon",
        "good evening",
        "good night",
        "thanks",
        "thank you",
        "thank you so much",
        "okay",
        "ok",
        "alright",
        "sure",
        "yes",
        "no",
        "maybe",
        "nice",
        "cool",
        "sounds good",
        "that helps",
        "got it",
        "i understand",
        "understood",
        "how are you",
        "how are you doing",
        "how's it going",
        "hows it going",
        "what's up",
        "whats up",
        "bye",
        "goodbye",
        "see you",
    }
    if normalized in conversational_phrases:
        return True

    conversational_starts = (
        "hi ",
        "hello ",
        "hey ",
        "thanks ",
        "thank you ",
        "okay ",
        "ok ",
        "sure ",
        "yes ",
        "no ",
        "bye ",
    )
    if normalized.startswith(conversational_starts):
        return True

    return _is_small_talk_or_greeting(normalized)


def _history_includes_current_user_turn(messages: Optional[List[Message]], current_text: str) -> bool:
    if not messages:
        return False

    current_norm = _normalize_text(current_text)
    if not current_norm:
        return False

    for msg in reversed(messages):
        role = (msg.role or "").strip().lower()
        if role == "system":
            continue
        if role in {"assistant", "ai"}:
            return False
        return _normalize_text(msg.content) == current_norm

    return False


def _has_prior_chat_history(messages: Optional[List[Message]], current_text: str) -> bool:
    if not messages:
        return False

    conversation = [m for m in messages if (m.role or "").strip().lower() != "system"]
    if not conversation:
        return False

    if _history_includes_current_user_turn(messages, current_text):
        conversation = conversation[:-1]

    return len(conversation) > 0


def _allowed_time_greeting(now_local: datetime) -> str:
    minute_of_day = (now_local.hour * 60) + now_local.minute
    if 5 * 60 <= minute_of_day <= (11 * 60 + 59):
        return "Good morning"
    if 12 * 60 <= minute_of_day <= (16 * 60 + 59):
        return "Good afternoon"
    if 17 * 60 <= minute_of_day <= (20 * 60 + 59):
        return "Good evening"
    # Late night (9 PM – 4:59 AM): pick a friendly, student-appropriate greeting
    late_night_greetings = [
        "Hey, night owl \U0001F989",
        "Burning the midnight oil?",
        "Hey there",
        "Late night study, I see \u2014 how are you doing?",
    ]
    return random.choice(late_night_greetings)


def _build_greeting_policy(
    user_text: str,
    has_prior_history: bool,
    now_local: datetime,
) -> str:
    user_sent_greeting = _is_small_talk_or_greeting(user_text)
    should_greet = (not has_prior_history) or user_sent_greeting
    allowed_greeting = _allowed_time_greeting(now_local)
    current_time = now_local.strftime("%I:%M %p")

    return f"""GREETING POLICY (STRICT):
Current Nigeria local time for greeting decisions: {current_time}
Allowed time-based greeting right now: "{allowed_greeting}".
Creativity is allowed, but only after a valid opener.
Valid openers are:
- Neutral opener: "Hi" or "Hello"
- Time-based opener: ONLY "{allowed_greeting}"
You MUST NOT use any other time-based greeting opener.
This turn has prior conversation history: {"YES" if has_prior_history else "NO"}
Current user message is greeting/small talk: {"YES" if user_sent_greeting else "NO"}
Greet on this turn: {"YES" if should_greet else "NO"}
- If "Greet on this turn" is NO, do not include any greeting opener.
- If "Greet on this turn" is YES and the user only greeted, keep response within 2 sentences.
Never start with "Good morning/afternoon/evening" unless it exactly matches the allowed time-based greeting above.
- During late night hours, the allowed greeting may be casual (e.g. "Hey, night owl", "Burning the midnight oil?", "Late night study, I see"). Use the EXACT phrase provided above as your opener."""


def _get_chat_rate_limit_key(request: Request) -> str:
    user = getattr(request.state, "user", None)
    if user and getattr(user, "id", None):
        return f"user:{user.id}"
    return get_remote_address(request)


chat_limiter = Limiter(key_func=_get_chat_rate_limit_key)


def _is_transient_background_llm_error(exc: Exception) -> bool:
    """
    Classify transient/rate-limit/provider hiccups for quiet background-task retries.
    """
    msg = str(exc).lower()
    if _is_retryable_network_error(exc):
        return True
    transient_markers = (
        "connection error",
        "timed out",
        "timeout",
        "temporarily",
        "rate-limited",
        "rate limit",
        "429",
        "service unavailable",
    )
    return any(marker in msg for marker in transient_markers)


def _format_background_llm_error(exc: Exception) -> str:
    msg = " ".join(str(exc).split())
    if len(msg) > 280:
        msg = f"{msg[:277]}..."
    status_code = getattr(exc, "status_code", None)
    response = getattr(exc, "response", None)
    if status_code is None and response is not None:
        status_code = getattr(response, "status_code", None)
    hint = "transient" if _is_transient_background_llm_error(exc) else "non_transient"
    return f"type={type(exc).__name__}, status={status_code or 'n/a'}, class={hint}, message={msg}"


async def _call_background_llm_with_retry(call_fn, operation_name: str, max_attempts: int = 3):
    """
    Retry transient LLM failures for low-priority background tasks.
    """
    for attempt in range(1, max_attempts + 1):
        try:
            return await call_fn()
        except Exception as e:
            if attempt < max_attempts and _is_transient_background_llm_error(e):
                delay = 1.5 * (2 ** (attempt - 1))
                logger.warning(
                    f"{operation_name} failed (attempt {attempt}/{max_attempts}) "
                    f"[{_format_background_llm_error(e)}]. Retrying in {delay:.1f}s"
                )
                await asyncio.sleep(delay)
                continue
            raise


router = APIRouter(tags=["chat"])


async def _get_chat_restriction_if_any(current_user: User):
    if not shared.supabase_client:
        return None

    sb = shared.supabase_service_client or shared.supabase_client
    return await get_applicable_user_restriction(
        sb,
        current_user,
        execute_fn=lambda query_fn, operation_name: _execute_with_retry(query_fn, operation_name),
    )


async def _create_completion_with_failover(
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    is_vision: bool,
    stream: bool = False,
):
    return await llm_engine.generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        has_images=is_vision,
        stream=stream,
    )

async def _stream_completion_events(api_stream):
    try:
        async for chunk in api_stream:
            delta = ""
            try:
                if chunk and chunk.choices and chunk.choices[0].delta:
                    delta = chunk.choices[0].delta.content or ""
            except Exception:
                delta = ""

            if delta:
                yield {"delta": delta}
    finally:
        if api_stream is not None and hasattr(api_stream, "aclose"):
            try:
                await api_stream.aclose()
            except Exception:
                pass

async def _build_streaming_response(
    event_stream,
    request: Request,
    session_id: Optional[str],
    saved_user_message_id: Optional[str] = None,
    citations: Optional[list] = None,
    user_id: Optional[str] = None,
    thinking_mode: bool = True,
    start_time: float = 0.0,
    selected_model: str = "unknown",
    title_task: Optional[asyncio.Task] = None,
) -> StreamingResponse:
    """
    Stream assistant deltas via SSE and persist full assistant response to DB after completion.
    Detects client disconnect via request.is_disconnected() and appends STOPPED_ASSISTANT_NOTE.
    """
    async def stream_generator():
        import time
        nonlocal selected_model
        pipeline_params = {}
        full_text = ""
        saved_assistant_message_id = None
        emitted_graceful = False
        disconnected = False
        cancelled = False
        # track first visible delta
        first_delta_logged = False
        # Accumulates the safe planner <public_thought> narrative that was
        # displayed in the Thinking panel.  This — and only this — is saved
        # to chat_messages.thinking_text so history reload shows the same text.
        planner_narrative_acc: str = ""
        # Always instantiate the parser — even in Fast mode it acts as a safety
        # net to strip any <thought> / <think> blocks the model emits despite
        # /no_think (models occasionally ignore the directive).
        parser = ThinkingStreamParser()

        if saved_user_message_id is not None:
            yield f"data: {json.dumps({'user_message_id': saved_user_message_id})}\n\n"

        try:
            if event_stream is None:
                full_text = GRACEFUL_ASSISTANT_ERROR_PAYLOAD["content"]
                emitted_graceful = True
                yield f"data: {json.dumps({'delta': full_text})}\n\n"
            else:
                async for event in event_stream:
                    if await request.is_disconnected():
                        disconnected = True
                        logger.info("Client disconnected during stream; stopping generation.")
                        break

                    if not isinstance(event, dict):
                        continue

                    model_val = event.get("selected_model")
                    if model_val:
                        selected_model = model_val
                        continue

                    params = event.get("pipeline_params")
                    if params:
                        pipeline_params = params
                        continue

                    status = event.get("status")
                    if isinstance(status, str) and status:
                        yield f"data: {json.dumps({'status': status})}\n\n"

                    thinking_update = event.get("thinking_update")
                    if thinking_update:
                        planner_narrative_acc += thinking_update
                        yield f"data: {json.dumps({'thinking_update': thinking_update})}\n\n"

                    thinking_done = event.get("thinking_done")
                    if thinking_done:
                        yield f"data: {json.dumps({'thinking_done': True})}\n\n"

                    delta = event.get("delta")
                    if delta:
                        visible_chunk, thinking_chunk = parser.feed(delta)
                        if visible_chunk:
                            if not first_delta_logged and start_time > 0.0:
                                first_delta_logged = True
                                elapsed_ms = (time.perf_counter() - start_time) * 1000
                                logger.info(
                                    "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                                    "thinking" if thinking_mode else "fast",
                                    selected_model,
                                    "first_visible_delta_emitted",
                                    elapsed_ms,
                                )
                            full_text += visible_chunk
                            yield f"data: {json.dumps({'delta': visible_chunk})}\n\n"
                        # thinking_chunk: native model reasoning extracted by the parser.
                        # Discarded — never transmitted to frontend, never persisted.
        except asyncio.CancelledError:
            cancelled = True
            logger.info("Stream task cancelled; persisting partial assistant response.")
            # Do not re-raise here so we can still persist and attempt a terminal SSE event.
        except Exception as e:
            logger.error(f"Stream generation error: {e}")
            if not full_text and not disconnected:
                full_text = GRACEFUL_ASSISTANT_ERROR_PAYLOAD["content"]
                emitted_graceful = True
                yield f"data: {json.dumps({'delta': full_text})}\n\n"
        finally:
            if event_stream is not None and hasattr(event_stream, "aclose"):
                try:
                    await event_stream.aclose()
                except Exception:
                    pass

            if not full_text and not emitted_graceful and not disconnected and not cancelled:
                full_text = GRACEFUL_ASSISTANT_ERROR_PAYLOAD["content"]
                yield f"data: {json.dumps({'delta': full_text})}\n\n"

            # Flush any remaining buffered partial tag from the stream parser
            if parser:
                visible_rem, thinking_rem = parser.flush()
                if visible_rem:
                    full_text += visible_rem
                    yield f"data: {json.dumps({'delta': visible_rem})}\n\n"
                if thinking_rem:
                    pass  # Discard — native reasoning is never emitted or persisted.
                # Only fire thinking_done when the user requested Thinking mode.
                # In Fast mode the parser runs silently — the frontend never
                # receives a thinking_done event and shows no reasoning block.
                if thinking_mode:
                    yield f"data: {json.dumps({'thinking_done': True})}\n\n"

            # Save only the safe planner narrative the user already saw in the
            # Thinking panel.  Native model <think> content (parser.get_full_thinking())
            # is discarded — it must never be persisted.
            thinking_text_to_save = planner_narrative_acc.strip()
            # Strip any residual <think> tokens from the final answer before saving.
            # The parser filters them during streaming, but strip_thinking_tokens
            # provides a batch safety net for anything the parser may have missed.
            text_to_save, _ = strip_thinking_tokens(full_text)
            if disconnected or cancelled:
                if text_to_save.strip():
                    if STOPPED_ASSISTANT_NOTE not in text_to_save:
                        text_to_save = f"{text_to_save}\n\n{STOPPED_ASSISTANT_NOTE}"
                else:
                    text_to_save = STOPPED_ASSISTANT_NOTE

            save_failed = False
            if session_id and chat_history.has_client():
                for save_attempt in range(1, 4):
                    try:
                        saved_assistant_message_id = await chat_history.save_assistant_message(
                            session_id=session_id,
                            content=text_to_save,
                            citations=citations,
                            thinking_text=thinking_text_to_save,
                        )
                        save_failed = False
                        break
                    except Exception as db_err:
                        logger.warning(
                            f"Save assistant message attempt {save_attempt}/3 failed: {db_err}"
                        )
                        save_failed = True
                        if save_attempt < 3:
                            await asyncio.sleep(1 * save_attempt)
                if save_failed:
                    logger.error(
                        f"All 3 save attempts failed for session {session_id}. "
                        f"Sending save_failed flag to frontend for fallback."
                    )
                else:
                    # Fire background summarization of previous session after AI reply
                    if user_id and session_id and not (disconnected or cancelled):
                        from routers.chat_sessions import _summarize_previous_session
                        asyncio.create_task(
                            _summarize_previous_session(user_id, session_id)
                        )

            new_title = None
            if title_task:
                try:
                    new_title = await asyncio.wait_for(asyncio.shield(title_task), timeout=4.5)
                except Exception as title_err:
                    logger.warning(f"Could not retrieve generated title for SSE: {title_err}")

            final_event = {
                "done": True,
                "message_id": saved_assistant_message_id,
                "session_id": session_id,
                "citations": citations or [],
                "stopped": bool(disconnected or cancelled),
            }
            if new_title:
                final_event["new_title"] = new_title
            if save_failed:
                final_event["save_failed"] = True
                final_event["full_text"] = text_to_save
            try:
                yield f"data: {json.dumps(final_event)}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as sse_final_err:
                # Expected when the client is already gone; message is still persisted above.
                logger.info(f"Could not emit terminal SSE event: {sse_final_err}")

            if start_time > 0.0:
                elapsed_ms = (time.perf_counter() - start_time) * 1000
                logger.info(
                    "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                    "thinking" if thinking_mode else "fast",
                    selected_model,
                    "stream_complete",
                    elapsed_ms,
                )
                logger.info(
                    "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f thinking_mode=%s selected_model=%s rag_chunk_count=%s fetch_timetable=%s fetch_faculty=%s run_web_search=%s enable_deep_final_reasoning=%s",
                    "thinking" if thinking_mode else "fast",
                    selected_model,
                    "total_request_duration",
                    elapsed_ms,
                    thinking_mode,
                    selected_model,
                    pipeline_params.get("rag_chunk_count", "unknown"),
                    pipeline_params.get("fetch_timetable", "unknown"),
                    pipeline_params.get("fetch_faculty", "unknown"),
                    pipeline_params.get("run_web_search", "unknown"),
                    pipeline_params.get("enable_deep_final_reasoning", "unknown"),
                )

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )

@router.post("/transcribe", dependencies=[Depends(verify_api_key)])
@chat_limiter.limit("10/minute")
async def transcribe_audio(request: Request, audio: UploadFile = File(...)):
    """
    Transcribe uploaded audio using Groq Whisper.
    """
    if shared.groq_client is None:
        raise HTTPException(status_code=503, detail="The transcription service is temporarily unavailable.")

    temp_file_path = None
    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")

        ext = ".webm"
        if audio.content_type in ["audio/mp4", "audio/m4a"]:
            ext = ".m4a"
        elif audio.content_type == "audio/wav":
            ext = ".wav"
        elif audio.content_type == "audio/ogg":
            ext = ".ogg"
        elif audio.content_type == "audio/mpeg":
            ext = ".mp3"

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as temp_file:
            temp_file.write(audio_bytes)
            temp_file_path = temp_file.name

        try:
            with open(temp_file_path, "rb") as temp_audio_file:
                transcription = await shared.groq_client.audio.transcriptions.create(
                    file=temp_audio_file,
                    model="whisper-large-v3-turbo",
                )
            return {"text": transcription.text}
        except Exception as primary_error:
            logger.warning(f"Groq turbo transcription failed, falling back to whisper-large-v3: {primary_error}")
            try:
                with open(temp_file_path, "rb") as temp_audio_file:
                    transcription = await shared.groq_client.audio.transcriptions.create(
                        file=temp_audio_file,
                        model="whisper-large-v3",
                    )
                return {"text": transcription.text}
            except Exception as secondary_error:
                logger.error(f"Groq fallback transcription failed: {secondary_error}")
                return JSONResponse(status_code=429, content={"error": "groq_limits_reached"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio transcription failed: {e}")
        raise HTTPException(status_code=500, detail="Unable to transcribe your audio. Please try again or type your message instead.")
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception as cleanup_error:
                logger.warning(f"Failed to delete temp audio file: {cleanup_error}")


async def _generate_and_save_title(session_id: str, user_text: str, current_user: User):
    try:
        if not session_id or not chat_history.has_client():
            return

        if llm_engine.google_client is None:
            logger.error("Google client not initialized for title generation")
            return

        conversation_excerpt = "(no prior messages)"
        try:
            sb = shared.supabase_service_client or shared.supabase_client
            if sb:
                msg_res = await _execute_with_retry(
                    lambda: sb.table("chat_messages")
                    .select("role,content")
                    .eq("session_id", session_id)
                    .order("created_at", desc=True)
                    .limit(6)
                    .execute(),
                    "Fetch recent messages for title generation",
                )
                rows = list(reversed(msg_res.data or []))
                recent_messages: list[str] = []
                for row in rows:
                    role = (row.get("role") or "").strip().lower()
                    if role not in {"user", "assistant", "ai"}:
                        continue
                    if role == "ai":
                        role = "assistant"
                    content = (row.get("content") or "").strip()
                    if not content:
                        continue
                    recent_messages.append(f"{role}: {content[:180]}")
                if recent_messages:
                    conversation_excerpt = "\n".join(recent_messages)
        except Exception as excerpt_err:
            logger.warning(f"Could not build title conversation excerpt for session {session_id}: {excerpt_err}")

        title_prompt = (
            "/nothink\n"
            "Generate a chat session title based on the conversation below.\n\n"
            "Rules:\n"
            "- Return ONLY the title — no explanation, no punctuation at the end, no quotes.\n"
            "- 3 to 7 words maximum.\n"
            "- Be specific: name the actual topic, concept, drug, disease, or subject discussed.\n"
            "- Never use vague words like 'Chat', 'Question', 'Discussion', 'Help', 'Query', or 'Inquiry'.\n"
            "- If the conversation is purely casual greeting/small talk with no real topic, return exactly: Small Talk\n\n"
            f"Conversation:\n{conversation_excerpt}\n\n"
            f"Latest message:\n{(user_text or '').strip()[:200]}"
        )

        title_completion = None
        try:
            title_completion = await llm_engine.generate_small_completion_with_failover(
                messages=[{"role": "user", "content": title_prompt}],
                temperature=0.7,
                max_tokens=64,
                stream=False,
            )
            logger.info("Background title generation succeeded via small failover chain")
        except Exception as title_err:
            logger.warning(f"Title generation failover failed: {title_err}")

        if title_completion is None:
            raise RuntimeError("Title generation failed on all models")

        new_title = _clean_generated_title(title_completion.choices[0].message.content)
        if _is_generic_title(new_title):
            stricter_prompt = (
                f"{title_prompt}\n\n"
                "Your previous title was too generic. Regenerate a better one.\n"
                "Must include at least one concrete keyword from the conversation "
                "(for example: drug/class, disease, mechanism, course code, or named concept)."
            )
            retry_completion = None
            try:
                retry_completion = await llm_engine.generate_small_completion_with_failover(
                    messages=[{"role": "user", "content": stricter_prompt}],
                    temperature=0.1,
                    max_tokens=64,
                    stream=False,
                )
            except Exception as retry_err:
                logger.warning(f"Title retry failover failed: {retry_err}")
            if retry_completion is not None:
                regenerated = _clean_generated_title(retry_completion.choices[0].message.content)
                if regenerated:
                    new_title = regenerated

        if not new_title:
            new_title = (user_text or "").strip()[:40]

        await chat_history.update_session_title(session_id, new_title)
        logger.info(
            f"AI Auto-renamed session {session_id} to '{new_title}' (via Google AI) "
            f"for user {getattr(current_user, 'id', 'unknown')}"
        )
        return new_title
    except Exception as e:
        err_meta = _format_background_llm_error(e)
        if _is_transient_background_llm_error(e):
            logger.warning(f"Background title generation skipped for session {session_id}: {err_meta}")
        else:
            logger.error(f"Background title generation failed for session {session_id}: {err_meta}")
        return None


async def _get_recent_session_summaries(user_id: str, current_session_id: Optional[str], limit: int = 3) -> str:
    """
    Fetch summaries of the student's most recent past sessions
    to give the AI memory of previously studied topics.
    """
    try:
        sb = shared.supabase_service_client or shared.supabase_client
        if not sb:
            return ""

        res = await _execute_with_retry(
            lambda: sb.table("chat_sessions")
            .select("title, summary")
            .eq("user_id", user_id)
            .neq("id", current_session_id)
            .not_.is_("summary", "null")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute(),
            "Fetch recent session summaries for memory",
        )

        rows = res.data or []
        if not rows:
            return ""

        parts = []
        for row in rows:
            title = (row.get("title") or "").strip()
            summary = (row.get("summary") or "").strip()
            if summary:
                parts.append(f"- {title}: {summary}" if title else f"- {summary}")

        if not parts:
            return ""

        return "PREVIOUS STUDY SESSIONS (for context only  do not repeat unless asked):\n" + "\n".join(parts)

    except Exception as e:
        logger.warning(f"Could not fetch recent session summaries: {e}")
        return ""


# --- Endpoint ---
@router.post("/chat", dependencies=[Depends(verify_api_key)])
@chat_limiter.limit("30/minute")
async def chat(request: Request, chat_request: ChatRequest, current_user: User = Depends(get_current_user)):
    """
    AI Chat Endpoint (formerly /ask-ai).
    Modes: explain, example, memory, chat
    """
    import time
    start_time = time.perf_counter()
    logger.info(
        "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
        "thinking" if chat_request.thinking_mode else "fast",
        "unknown",
        "request_received",
        0.0,
    )
    restriction = await _get_chat_restriction_if_any(current_user)
    chat_request.text = sanitize_text(chat_request.text, CHAT_MAX)
    if restriction:
        return JSONResponse(status_code=423, content=build_restriction_block_payload(restriction))

    http_request = request
    request = chat_request

    if not llm_engine.has_available_client():
        raise HTTPException(status_code=503, detail="The AI service is temporarily unavailable. Please try again in a moment.")
    saved_user_message_id: Optional[str] = None
    title_task = None

    (student_profile_text, student_level), cached_config = await asyncio.gather(
        _build_student_profile_text(current_user),
        get_cached_settings(),
        return_exceptions=False,
    )

    if request.session_id and chat_history.has_client() and not request.is_retry:
        image_payload = None
        if request.images:
            image_payload = json.dumps(request.images)
        elif request.image:
            image_payload = request.image

        save_error = None
        for save_attempt in range(1, 4):
            try:
                saved_user_message_id, current_title = await asyncio.gather(
                    chat_history.save_user_message(
                        session_id=request.session_id,
                        content=request.text,
                        image_data=image_payload,
                    ),
                    chat_history.get_session_title(request.session_id),
                )
                save_error = None
                break
            except Exception as e:
                save_error = e
                logger.warning(f"Save user message attempt {save_attempt}/3 failed: {e}")
                if save_attempt < 3:
                    await asyncio.sleep(1)

        if save_error is not None:
            logger.error(f"All save attempts failed, aborting chat request: {save_error}")
            raise HTTPException(
                status_code=503,
                detail="We're having trouble saving your message. Please try again.",
            )

        if request.session_id and (not current_title or "New Chat" in current_title or _is_generic_title(current_title)):
            title_task = asyncio.create_task(_generate_and_save_title(request.session_id, request.text, current_user))

    logger.info(f"Chat Request: mode={request.mode}, text='{request.text[:30]}...', msgs={len(request.messages or [])}")

    system_prompt = PHARMACY_SYSTEM_PROMPT
    temperature = 0.7
    if cached_config:
        if cached_config.get("system_prompt"):
            system_prompt = cached_config["system_prompt"]
        if cached_config.get("temperature") is not None:
            temperature = float(cached_config["temperature"])
        logger.debug(f"Using Cached Settings: Temp={temperature}")

    web_search_globally_enabled = bool((cached_config or {}).get("web_search_enabled", True))
    citations: list[dict] = []

    async def event_stream():
        import time
        web_search_text = ""
        web_search_limit_reached = False

        if request.thinking_mode:
            pipeline_params = STREAMING_PLANNER_DEFAULTS.copy()
            planner_start = time.perf_counter()
            logger.info(
                "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                "thinking",
                "unknown",
                "planner_start",
                (planner_start - start_time) * 1000,
            )
            async for planner_event in stream_pipeline_plan(
                user_text=request.text,
                student_profile_text=student_profile_text,
                llm_engine_instance=llm_engine,
            ):
                if "thinking_update" in planner_event:
                    yield {"thinking_update": planner_event["thinking_update"]}
                if "pipeline_params" in planner_event:
                    pipeline_params = planner_event["pipeline_params"]
            planner_complete = time.perf_counter()
            logger.info(
                "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                "thinking",
                "unknown",
                "planner_complete",
                (planner_complete - start_time) * 1000,
            )
        else:
            pipeline_params = FAST_MODE_DEFAULTS.copy()

        rag_chunk_count = pipeline_params["rag_chunk_count"]
        should_web_search = pipeline_params["run_web_search"]
        should_timetable = pipeline_params["fetch_timetable"]
        should_faculty = pipeline_params["fetch_faculty"]

        context_start = time.perf_counter()
        logger.info(
            "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
            "thinking" if request.thinking_mode else "fast",
            "unknown",
            "context_gathering_start",
            (context_start - start_time) * 1000,
        )

        should_skip_rag = is_conversational_message(request.text)

        # In study mode: also skip RAG for clearly off-topic general knowledge questions
        # so students can use the AI freely without every question hitting the document
        if not should_skip_rag and request.document_id:
            if is_off_topic_for_document(request.text):
                should_skip_rag = True
                logger.info("Study mode: skipping RAG — off-topic general knowledge question.")

        # Concurrently gather recent summaries, faculty info, timetable info, web search, and RAG retrieval
        gather_tasks = {}
        gather_tasks["summaries"] = _get_recent_session_summaries(current_user.id, request.session_id)
        if should_faculty:
            gather_tasks["faculty"] = get_cached_faculty_knowledge(student_level, current_user)
        if should_timetable:
            gather_tasks["timetable"] = get_cached_student_timetable(student_level, current_user)

        effective_web_search = request.web_search or (should_web_search and web_search_globally_enabled)
        if effective_web_search and request.text.strip():
            gather_tasks["web_search"] = search_web(
                query=request.text,
                user_id=current_user.id,
                web_search_enabled=web_search_globally_enabled,
            )

        run_rag_concurrently = (not should_skip_rag) and (not request.images) and (not request.thinking_mode)
        if run_rag_concurrently:
            if request.document_id:
                gather_tasks["rag"] = get_relevant_context(
                    request.text,
                    request.document_id,
                    None if student_level == "Unknown" else student_level,
                    current_user=current_user,
                    academic_session=request.academic_session,
                    semester=request.semester,
                    rag_match_count=rag_chunk_count,
                )
            else:
                gather_tasks["rag"] = get_relevant_context(
                    request.text,
                    document_id=None,
                    user_level=None if student_level == "Unknown" else student_level,
                    current_user=current_user,
                    academic_session=request.academic_session,
                    semester=request.semester,
                    rag_match_count=rag_chunk_count,
                )

        # Now run all concurrently!
        task_keys = list(gather_tasks.keys())
        task_futures = list(gather_tasks.values())
        gather_results = await asyncio.gather(*task_futures, return_exceptions=True)

        results_map = {}
        for key, res in zip(task_keys, gather_results):
            if isinstance(res, Exception):
                # Re-raise controlled HTTPExceptions (e.g. university suspension gate) immediately.
                # These must never be swallowed and turned into silent empty results.
                if isinstance(res, HTTPException):
                    raise res
                logger.error(f"Error in concurrent task '{key}': {res}")
                results_map[key] = None
            else:
                results_map[key] = res

        recent_summaries = results_map.get("summaries") or ""
        faculty_info = results_map.get("faculty") or ""
        timetable_info = results_map.get("timetable") or ""
        if effective_web_search and request.text.strip():
            ws_result = results_map.get("web_search")
            if ws_result == "__LIMIT_REACHED__":
                web_search_limit_reached = True
            else:
                web_search_text = ws_result or ""

        context_text = ""
        retrieved_citations: list[dict] = []
        extracted_image_text = ""

        context_quality = "good"

        if request.thinking_mode:
            # ----------------------------------------------------
            # Sequential Agentic RAG Path (Thinking Mode Only)
            # ----------------------------------------------------
            if not should_skip_rag:
                if request.images:
                    yield {"status": "reading_image"}
                    try:
                        extraction_messages = [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Extract and summarize the key text, topics, and concepts visible in this image. Be concise and focus on subject matter relevant to pharmacy education.",
                                    },
                                    *[
                                        {
                                            "type": "image_url",
                                            "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                                        }
                                        for img in request.images
                                    ],
                                ],
                            }
                        ]
                        extraction_response = await llm_engine.generate_completion_with_failover(
                            messages=extraction_messages,
                            temperature=0.2,
                            max_tokens=300,
                            has_images=True,
                            stream=False,
                        )
                        if extraction_response is not None:
                            extracted_content = extraction_response.choices[0].message.content
                            if isinstance(extracted_content, list):
                                extracted_image_text = " ".join(
                                    part.get("text", "") for part in extracted_content if isinstance(part, dict)
                                ).strip()
                            else:
                                extracted_image_text = str(extracted_content).strip()
                    except Exception as exc:
                        logger.warning(f"Vision RAG enrichment failed, falling back to text-only query: {exc}")

                rag_query = f"{request.text}\n\n{extracted_image_text}" if extracted_image_text else request.text
                search_queries = pipeline_params.get("search_queries", [])
                if not search_queries:
                    search_queries = [{"query": rag_query, "status": "Reviewing the relevant course material..."}]

                from .shared import agentic_rag_loop
                async for event in agentic_rag_loop(
                    user_text=rag_query,
                    document_id=request.document_id,
                    student_level=student_level,
                    current_user=current_user,
                    academic_session=request.academic_session,
                    semester=request.semester,
                    rag_match_count=rag_chunk_count,
                    search_queries=search_queries,
                    llm_engine=llm_engine,
                ):
                    if "status" in event:
                        yield {"status": event["status"]}
                    elif "final_result" in event:
                        context_text, retrieved_citations, context_quality = event["final_result"]
            else:
                context_quality = "none"

        else:
            # ----------------------------------------------------
            # Fast Mode Path (Single-pass retrieval)
            # ----------------------------------------------------
            if run_rag_concurrently:
                rag_res = results_map.get("rag")
                if rag_res:
                    context_text, retrieved_citations = rag_res
                context_quality = "good" if context_text else "none"
            elif not should_skip_rag and request.images:
                # Sequential extraction and RAG fallback because we have images to process first
                yield {"status": "reading_image"}
                try:
                    extraction_messages = [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Extract and summarize the key text, topics, and concepts visible in this image. Be concise and focus on subject matter relevant to pharmacy education.",
                                },
                                *[
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                                    }
                                    for img in request.images
                                ],
                            ],
                        }
                    ]
                    extraction_response = await llm_engine.generate_completion_with_failover(
                        messages=extraction_messages,
                        temperature=0.2,
                        max_tokens=300,
                        has_images=True,
                        stream=False,
                    )
                    if extraction_response is not None:
                        extracted_content = extraction_response.choices[0].message.content
                        if isinstance(extracted_content, list):
                            extracted_image_text = " ".join(
                                part.get("text", "") for part in extracted_content if isinstance(part, dict)
                            ).strip()
                        else:
                            extracted_image_text = str(extracted_content).strip()
                except Exception as exc:
                    logger.warning(f"Vision RAG enrichment failed, falling back to text-only query: {exc}")

                rag_query = f"{request.text}\n\n{extracted_image_text}" if extracted_image_text else request.text
                yield {"status": "searching_curriculum"}
                yield {"status": "retrieving_context"}
                if request.document_id:
                    context_text, retrieved_citations = await get_relevant_context(
                        rag_query,
                        request.document_id,
                        None if student_level == "Unknown" else student_level,
                        current_user=current_user,
                        academic_session=request.academic_session,
                        semester=request.semester,
                        rag_match_count=rag_chunk_count,
                    )
                else:
                    context_text, retrieved_citations = await get_relevant_context(
                        rag_query,
                        document_id=None,
                        user_level=None if student_level == "Unknown" else student_level,
                        current_user=current_user,
                        academic_session=request.academic_session,
                        semester=request.semester,
                        rag_match_count=rag_chunk_count,
                    )
                context_quality = "good" if context_text else "none"
            else:
                context_quality = "none"

        citations.clear()
        citations.extend(retrieved_citations)

        context_complete = time.perf_counter()
        logger.info(
            "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
            "thinking" if request.thinking_mode else "fast",
            "unknown",
            "context_gathering_complete",
            (context_complete - start_time) * 1000,
        )

        if request.thinking_mode:
            progress_update = _generate_retrieval_progress_update(citations, pipeline_params)
            yield {"thinking_update": progress_update}
            yield {"thinking_done": True}

        nigeria_now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=1)))
        current_time_str = nigeria_now.strftime("%A, %B %d, %Y, %I:%M %p")
        tomorrow = nigeria_now + timedelta(days=1)
        tomorrow_str = tomorrow.strftime("%A, %B %d, %Y")
        has_prior_history = _has_prior_chat_history(request.messages, request.text)
        greeting_policy = _build_greeting_policy(
            user_text=request.text,
            has_prior_history=has_prior_history,
            now_local=nigeria_now,
        )
        final_system_prompt = f"""{system_prompt}

CURRENT TIME & DATE (NIGERIA)  READ THIS FIRST:
Today: {current_time_str}
Tomorrow: {tomorrow_str}

STUDENT PROFILE:
{student_profile_text}

{recent_summaries}

FACULTY & CURRICULUM KNOWLEDGE:
{faculty_info or "Not configured."}

STUDENT WEEKLY TIMETABLE:
{timetable_info}
"""
        # Study mode — student is reading a specific document
        # Keep responses short, direct, no greetings, no salutations
        if request.document_id:
            final_system_prompt += """
STUDY MODE — STRICT RULES (these override ALL other tone and greeting rules above):
- NEVER start with a greeting. Never say "Good morning", "Hi", "Hello", or the student's name. Start directly with the answer.
- NEVER use filler openers like "Great question!", "Sure!", "Of course!", "Alright, let's break this down", "Let me explain".
- Be CONCISE. Match response length to question complexity. Simple question = short answer. No padding.
- Prefer bullet points and bold over long paragraphs.
- Only elaborate if the student explicitly says "explain in detail" or "elaborate".
"""

        # Select instruction based on context_quality
        if context_quality == "none":
            instructions_block = """INSTRUCTIONS:
No relevant curriculum material was found. Answer honestly using general pharmaceutical knowledge. Do not imply that the answer came from the student's materials. Mention the absence of matching material only when it is useful for clarity. Do not cite documents. Tailor your explanation to their academic level."""
        elif context_quality == "partial":
            instructions_block = """INSTRUCTIONS:
Only partial relevant curriculum material was found. Answer prioritizing the retrieved context below, but supplement with general knowledge where needed. Do not imply that the answer came from the student's materials unless retrieved context supports it. Do not cite sources, lecturers, course codes or page numbers inline in your response. Tailor your explanation to their academic level."""
        else:
            instructions_block = """INSTRUCTIONS:
Answer the student's question prioritizing the retrieved context below. Tailor your explanation to their academic level. If the exact answer is not in the retrieved context, answer honestly using general knowledge, but do not imply that the answer came from the student's materials. Do not cite sources, lecturers, course codes or page numbers inline in your response."""

        if context_text:
            final_system_prompt += f"""
{instructions_block}
FACULTY KNOWLEDGE PROTOCOL: You possess hidden knowledge about the student's specific curriculum and general faculty rules. When a user asks about their courses, lecturers, schedule, or faculty, you must scan this knowledge and extract ONLY the precise answer. Do NOT recite the entire curriculum or list unrelated courses unless explicitly asked to do so. Be concise, accurate, and conversational.
TIMETABLE PROTOCOL: You possess the student's exact weekly class schedule under STUDENT WEEKLY TIMETABLE. When asked about classes, you MUST follow these absolute rules:
1. NEVER guess, invent, or modify course codes, titles, or times.
2. List EVERY SINGLE CLASS scheduled for the requested day. You are STRICTLY FORBIDDEN from summarizing, skipping, or omitting any classes.
3. Output the exact time slots and course titles exactly as they appear in the data. Do not alter them.
4. If there are overlapping classes (e.g., practicals at the same time), list all of them.
{greeting_policy}

CONTEXT:
{context_text}
"""
            logger.info(f"Enhanced system prompt with {len(context_text)} chars of context")
        else:
            final_system_prompt += f"""
INSTRUCTIONS:
Answer the student's question prioritizing your general knowledge, but tailor your explanation specifically to their academic level as defined in their profile.
FACULTY KNOWLEDGE PROTOCOL: You possess hidden knowledge about the student's specific curriculum and general faculty rules. When a user asks about their courses, lecturers, schedule, or faculty, you must scan this knowledge and extract ONLY the precise answer. Do NOT recite the entire curriculum or list unrelated courses unless explicitly asked to do so. Be concise, accurate, and conversational.
TIMETABLE PROTOCOL: You possess the student's exact weekly class schedule under STUDENT WEEKLY TIMETABLE. When asked about classes, you MUST follow these absolute rules:
1. NEVER guess, invent, or modify course codes, titles, or times.
2. List EVERY SINGLE CLASS scheduled for the requested day. You are STRICTLY FORBIDDEN from summarizing, skipping, or omitting any classes.
3. Output the exact time slots and course titles exactly as they appear in the data. Do not alter them.
4. If there are overlapping classes (e.g., practicals at the same time), list all of them.
{greeting_policy}
"""

        if web_search_text:
            final_system_prompt += f"""

WEB SEARCH RESULTS (live, retrieved just now - today's date: {current_time_str}):
{web_search_text}

Instructions for web results:
- Cite sources naturally when referencing web results (e.g. "According to [title]...").
- Prefer RAG document context over web results for pharmacy curriculum questions.
- For current events, drug recalls, recent news, or real-world updates - prefer web results.
"""

        if web_search_limit_reached:
            final_system_prompt += """

NOTE: The user requested web search but has reached their daily limit (5 searches/day).
Respond using your existing knowledge and RAG context only.
Do not mention the limit in your response unless the user explicitly asks why web search is unavailable.
"""

        if context_text:
            final_system_prompt += f"\n\nRELEVANT CURRICULUM CONTEXT:\n{context_text}"

        if web_search_text:
            final_system_prompt += f"\n\nLIVE WEB SEARCH RESULTS:\n{web_search_text}"

        final_system_prompt += "\n\nIMPORTANT: Do NOT cite sources, lecturers, course codes, or page numbers inline in your response. Never write things like (Prof. X, PTE 411) or (Source: ...) in your answers. Sources are provided separately to the user."

        prompt_assembled = time.perf_counter()
        logger.info(
            "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
            "thinking" if request.thinking_mode else "fast",
            "unknown",
            "prompt_assembly_complete",
            (prompt_assembled - start_time) * 1000,
        )

        messages = []
        all_images = request.images or []
        if len(all_images) > 4:
            raise HTTPException(status_code=400, detail="Maximum of 4 images allowed per request.")

        if all_images:
            logger.info(f"Vision mode: {len(all_images)} images")
            messages.append({"role": "system", "content": final_system_prompt})

            if request.system_instruction:
                messages.append({"role": "system", "content": request.system_instruction})
                logger.info("Injected hidden system instruction for Vision")

            content_blocks = [{"type": "text", "text": request.text}]
            for img in all_images:
                content_blocks.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                })

            messages.append({"role": "user", "content": content_blocks})

            try:
                messages = _trim_messages_to_fit(messages, final_system_prompt)
                messages = merge_system_into_user(messages)

                selected_model = llm_engine.VISION_PRIMARY
                logger.info(f"Smart Router: Detected images, switching to {selected_model}")
                yield {"status": "thinking"}

                # Yield pipeline_params and selected_model for instrumentation capture
                yield {"pipeline_params": pipeline_params}
                yield {"selected_model": selected_model}

                logger.info(
                    "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                    "thinking" if request.thinking_mode else "fast",
                    selected_model,
                    "selected_model",
                    (time.perf_counter() - start_time) * 1000,
                )

                main_stream_start = time.perf_counter()
                logger.info(
                    "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                    "thinking" if request.thinking_mode else "fast",
                    selected_model,
                    "main_model_stream_start",
                    (main_stream_start - start_time) * 1000,
                )

                completion_stream = llm_engine.generate_dual_cloud_stream(
                    messages=messages,
                    has_images=True,
                    temperature=temperature,
                    max_tokens=2048,
                )
                yield {"status": "preparing_response"}
                async for event in _stream_completion_events(completion_stream):
                    yield event
                return
            except Exception as e:
                logger.error(f"Vision API Error: {e}")
                raise HTTPException(status_code=500, detail="Something went wrong while processing your image. Please try again.")

        messages.append({"role": "system", "content": final_system_prompt})
        if request.system_instruction:
            messages.append({"role": "system", "content": request.system_instruction})
            logger.info("Injected hidden system instruction for Text")

        if request.messages:
            for msg in request.messages:
                sanitized_role = msg.role
                if sanitized_role in ("ai", "assistant"):
                    sanitized_role = "assistant"
                elif sanitized_role == "system":
                    sanitized_role = "system"
                else:
                    sanitized_role = "user"
                messages.append({"role": sanitized_role, "content": msg.content})

        history_includes_current_turn = _history_includes_current_user_turn(request.messages, request.text)
        if not request.messages:
            if request.mode in ["explain", "example", "memory"]:
                mode_instruction = ""
                if request.mode == "explain":
                    mode_instruction = "Explain this concept clearly for a student. Keep it medium length."
                elif request.mode == "example":
                    mode_instruction = "Provide a clinical example or real-world pharmacy application."
                elif request.mode == "memory":
                    mode_instruction = "Create a mnemonic or memory aid."

                user_content = f"Concept: {request.text}\n{mode_instruction}"
                if request.context:
                    user_content += f"\n\nContext from Document: {request.context}"
                messages.append({"role": "user", "content": user_content})
            else:
                user_content = request.text
                if request.context:
                    user_content += f"\n\nContext from Document: {request.context}"
                messages.append({"role": "user", "content": user_content})
        elif not history_includes_current_turn:
            messages.append({"role": "user", "content": request.text})
        else:
            logger.debug("Skipped appending duplicate current user turn because it already exists in request.messages.")

        try:
            if contains_image(messages):
                selected_model = llm_engine.VISION_PRIMARY
                logger.info(f"Smart Router: Found images in history, using {selected_model}")
                is_vision_mode = True
            else:
                selected_model = llm_engine.TEXT_PRIMARY if request.thinking_mode else llm_engine.TEXT_SECONDARY
                logger.info(f"Smart Router: Pure text detected, processing efficiently with {selected_model}")
                is_vision_mode = False

            # Yield pipeline_params and selected_model for instrumentation capture
            yield {"pipeline_params": pipeline_params}
            yield {"selected_model": selected_model}

            logger.info(
                "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                "thinking" if request.thinking_mode else "fast",
                selected_model,
                "selected_model",
                (time.perf_counter() - start_time) * 1000,
            )

            yield {"status": "thinking"}

            # Adaptive final-answer reasoning prepending /no_think
            if not request.thinking_mode:
                prepend_no_think = True
            elif not pipeline_params.get("enable_deep_final_reasoning", False):
                prepend_no_think = True
            else:
                prepend_no_think = False

            if prepend_no_think and model_uses_thinking(selected_model):
                # Mutate the already-appended system message in the messages list
                for msg in messages:
                    if msg["role"] == "system" and msg["content"] == final_system_prompt:
                        msg["content"] = "/no_think\n" + msg["content"]
                        break

            messages = _trim_messages_to_fit(messages, final_system_prompt)

            messages = merge_system_into_user(messages)

            main_stream_start = time.perf_counter()
            logger.info(
                "CHAT LATENCY mode=%s model=%s stage=%s elapsed_ms=%.1f",
                "thinking" if request.thinking_mode else "fast",
                selected_model,
                "main_model_stream_start",
                (main_stream_start - start_time) * 1000,
            )

            completion_stream = llm_engine.generate_dual_cloud_stream(
                messages=messages,
                has_images=is_vision_mode,
                temperature=temperature,
                max_tokens=2048,
                requested_model="TEXT_PRIMARY" if request.thinking_mode else "TEXT_SECONDARY",
            )
            yield {"status": "preparing_response"}
            async for event in _stream_completion_events(completion_stream):
                yield event
        except Exception as e:
            logger.error(f"API Error: {e}")
            raise HTTPException(status_code=500, detail="Something went wrong while generating a response. Please try again.")

    return await _build_streaming_response(
        event_stream(),
        http_request,
        request.session_id,
        str(saved_user_message_id) if saved_user_message_id is not None else None,
        citations=citations,
        user_id=current_user.id,
        thinking_mode=request.thinking_mode,
        start_time=start_time,
        title_task=title_task,
    )

# --- Save Partial (Stopped) Response ---
class SavePartialRequest(BaseModel):
    session_id: str
    content: str

@router.post("/chat/save-partial", dependencies=[Depends(verify_api_key)])
@chat_limiter.limit("30/minute")
async def save_partial_response(
    request: Request,
    payload: SavePartialRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Save or update a partial assistant response when the user stops generation.
    
    Strategy:
    - If the backend disconnect handler already saved a message, UPDATE that row
      rather than inserting a duplicate.
    - Only INSERT a new row if no recent AI message exists for this session.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="Database not active")

    # Session owner check — wrapped so a flaky post-abort connection doesn't kill the save
    try:
        await _assert_session_owner(payload.session_id, current_user)
    except Exception as e:
        # If the owner check itself fails (e.g. "Server disconnected" after abort),
        # fall back to a direct user_id match rather than dropping the save entirely
        logger.warning(f"save-partial: _assert_session_owner failed ({e}), falling back to direct check")
        if shared.supabase_client:
            try:
                sess_res = await _execute_with_retry(
                    lambda: shared.supabase_client.table("chat_sessions")
                        .select("id")
                        .eq("id", payload.session_id)
                        .eq("user_id", current_user.id)
                        .limit(1)
                        .execute(),
                    "save-partial fallback session check",
                )
                if not sess_res.data:
                    raise HTTPException(status_code=403, detail="Not your session")
            except HTTPException:
                raise
            except Exception as e2:
                logger.error(f"save-partial: fallback session check also failed ({e2}), proceeding with JWT trust")

    content = payload.content.strip()
    # Build the saved text — append the stop note if not already present
    if content:
        text_to_save = f"{content}\n\n{STOPPED_ASSISTANT_NOTE}" if STOPPED_ASSISTANT_NOTE not in content else content
    else:
        text_to_save = STOPPED_ASSISTANT_NOTE

    try:
        # Check if there's already an AI message we can update (from backend disconnect handler)
        recent_ai = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages")
                .select("id, content")
                .eq("session_id", payload.session_id)
                .in_("role", ["ai", "assistant"])
                .order("created_at", desc=True)
                .limit(1)
                .execute(),
            "Check for existing AI message on stop",
        )

        if recent_ai.data:
            existing_id = recent_ai.data[0]["id"]
            existing_content = (recent_ai.data[0].get("content") or "").strip()
            existing_created = recent_ai.data[0].get("created_at", "")

            # Only treat as a duplicate if saved in the last 20 seconds
            # (avoids false positives from a prior stopped exchange in the same session)
            is_recent = False
            if existing_created:
                try:
                    from datetime import datetime, timezone
                    created_dt = datetime.fromisoformat(existing_created.replace("Z", "+00:00"))
                    age_seconds = (datetime.now(timezone.utc) - created_dt).total_seconds()
                    is_recent = age_seconds < 20
                except Exception:
                    is_recent = True  # If parsing fails, assume recent

            if existing_content == text_to_save and is_recent:
                return {"status": "already_saved", "message_id": existing_id}

            # If the existing message has the stop note but the frontend has MORE content
            # (more streamed text), update it with the richer version
            if STOPPED_ASSISTANT_NOTE in existing_content:
                # Only update if frontend's version is longer (has more streamed text)
                existing_real = existing_content.replace(STOPPED_ASSISTANT_NOTE, "").strip()
                new_real = content
                if len(new_real) >= len(existing_real):
                    await _execute_with_retry(
                        lambda: shared.supabase_client.table("chat_messages")
                            .update({"content": text_to_save})
                            .eq("id", existing_id)
                            .execute(),
                        "Update existing stopped AI message",
                    )
                    return {"status": "updated", "message_id": existing_id}
                else:
                    return {"status": "already_saved", "message_id": existing_id}

            # Existing AI message does NOT have the stop note — this is the message the
            # backend disconnect handler saved. Update it to include the stop note.
            await _execute_with_retry(
                lambda: shared.supabase_client.table("chat_messages")
                    .update({"content": text_to_save})
                    .eq("id", existing_id)
                    .execute(),
                "Update AI message with stop note",
            )
            return {"status": "updated", "message_id": existing_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Could not check/update existing AI message on stop: {e}")

    # No existing AI message found — insert a new one (edge case: backend disconnect handler
    # failed or message was deleted)
    try:
        saved_id = await chat_history.save_assistant_message(
            session_id=payload.session_id,
            content=text_to_save,
        )
        return {"status": "saved", "message_id": saved_id}
    except Exception as e:
        logger.error(f"Failed to save partial response: {e}")
        raise HTTPException(status_code=500, detail="Failed to save partial response")



# --- Truncate Last Stopped Exchange (early stop cleanup) ---
class TruncateLastStoppedRequest(BaseModel):
    session_id: str

@router.post("/chat/truncate-last-stopped", dependencies=[Depends(verify_api_key)])
@chat_limiter.limit("30/minute")
async def truncate_last_stopped(
    request: Request,
    payload: TruncateLastStoppedRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Called when the user stopped BEFORE the AI started streaming meaningful text.
    Deletes the orphaned exchange from the DB (user message + any empty/note-only AI message)
    so it doesn't reappear on refresh.

    Handles two cases:
    1. Last msg is a user message (backend hasn't saved AI response yet) → delete user msg
    2. Last msg is an AI message with ONLY the stopped note (no real streamed content)
       → delete AI msg + the preceding user msg
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="Database not active")

    await _assert_session_owner(payload.session_id, current_user)

    try:
        msgs_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages")
                .select("id, role, content, created_at")
                .eq("session_id", payload.session_id)
                .order("created_at", desc=True)
                .limit(3)
                .execute(),
            "Fetch last messages for early-stop truncate",
        )
        msgs = msgs_res.data or []
        if not msgs:
            return {"status": "skipped", "reason": "no messages"}

        last_msg = msgs[0]
        last_role = last_msg.get("role", "")
        last_content = (last_msg.get("content") or "").strip()

        ids_to_delete: list[str] = []

        # Case 1: Last message is an orphan user message (backend not yet saved AI response)
        if last_role == "user":
            ids_to_delete.append(last_msg["id"])
            logger.info(f"Truncate early-stop: found orphan user message {last_msg['id']}")

        # Case 2: Last message is an AI-only stop note (no real streamed content)
        # This happens when the backend disconnect handler saved the note before truncate ran
        elif last_role in ("ai", "assistant"):
            is_stop_only = last_content == shared.STOPPED_ASSISTANT_NOTE or last_content == ""
            if is_stop_only:
                ids_to_delete.append(last_msg["id"])
                logger.info(f"Truncate early-stop: found stop-only AI message {last_msg['id']}")
                # Also delete the preceding user message that triggered this exchange
                if len(msgs) > 1:
                    prev_msg = msgs[1]
                    if prev_msg.get("role") == "user":
                        ids_to_delete.append(prev_msg["id"])
                        logger.info(f"Truncate early-stop: also deleting user message {prev_msg['id']}")
            else:
                return {"status": "skipped", "reason": "last AI message has real content, not deleting"}
        else:
            return {"status": "skipped", "reason": f"unexpected last message role: {last_role}"}

        if not ids_to_delete:
            return {"status": "skipped", "reason": "nothing matched deletion criteria"}

        for msg_id in ids_to_delete:
            await _execute_with_retry(
                lambda mid=msg_id: shared.supabase_client.table("chat_messages")
                    .delete()
                    .eq("id", mid)
                    .execute(),
                f"Delete early-stop message {msg_id}",
            )
        logger.info(f"Deleted {len(ids_to_delete)} message(s) for early-stop in session {payload.session_id}")
        return {"status": "deleted", "deleted_ids": ids_to_delete}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to truncate early stop message: {e}")
        raise HTTPException(status_code=500, detail="Failed to clean up message")


# --- Rename Session Endpoint ---
class RenameSessionRequest(BaseModel):
    title: str

@router.patch("/session/{session_id}/rename", dependencies=[Depends(verify_api_key)])
@chat_limiter.limit("20/minute")
async def rename_session(
    session_id: str,
    request: Request,
    payload: RenameSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Rename a chat session. Only the session owner can rename.
    """
    await _assert_session_owner(session_id, current_user)
    new_title = sanitize_text(payload.title, TITLE_MAX)
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    try:
        await chat_history.update_session_title(session_id, new_title)
        return {"status": "ok", "title": new_title}
    except Exception as e:
        logger.error(f"Failed to rename session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to rename chat")

# --- Edit Message Endpoint ---
class EditMessageRequest(BaseModel):
    session_id: str
    message_id: str
    new_text: str
    images: Optional[list[str]] = None
    thinking_mode: bool = False

@router.post("/chat/edit", dependencies=[Depends(verify_api_key)])
@chat_limiter.limit("20/minute")
async def edit_message(
    request: Request,
    payload: EditMessageRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Edit a user message, delete everything after it, and regenerate the AI response.
    """
    payload.new_text = sanitize_text(payload.new_text, CHAT_MAX)
    if not shared.supabase_client or not llm_engine.has_available_client():
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        await _assert_session_owner(payload.session_id, current_user)

        msg_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").select("*").eq("session_id", payload.session_id).order("created_at", desc=False).execute(),
            "Fetch messages for edit",
        )
        messages = msg_res.data or []

        target_msg = next((m for m in messages if str(m.get('id')) == str(payload.message_id)), None)
        if not target_msg:
            raise HTTPException(status_code=400, detail="Message not found")
        target_timestamp = target_msg['created_at']

        await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").delete().eq("session_id", payload.session_id).gte("created_at", target_timestamp).execute(),
            "Delete messages from edit point",
        )

        image_payload = json.dumps(payload.images) if payload.images else None
        insert_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").insert({
                "session_id": payload.session_id,
                "role": "user",
                "content": payload.new_text,
                "image_data": image_payload,
            }).execute(),
            "Save edited user message",
        )
        new_msg_id = insert_res.data[0]['id'] if insert_res.data and len(insert_res.data) > 0 else None

        remaining_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").select("*").eq("session_id", payload.session_id).order("created_at", desc=False).execute(),
            "Fetch remaining messages after edit",
        )
        remaining_msgs = remaining_res.data or []
        logger.info(f"Edit remaining_msgs sample: {[{k: v for k, v in m.items() if k in ('id', 'role', 'image_data', 'images')} for m in remaining_msgs]}")

        (student_profile_text, student_level), cached_config = await asyncio.gather(
            _build_student_profile_text(current_user),
            get_cached_settings(),
            return_exceptions=False,
        )
        system_prompt = PHARMACY_SYSTEM_PROMPT
        temperature = 0.7
        if cached_config:
            if cached_config.get("system_prompt"):
                system_prompt = cached_config["system_prompt"]
            if cached_config.get("temperature") is not None:
                temperature = float(cached_config["temperature"])
        citations: list[dict] = []
        should_skip_rag = is_conversational_message(payload.new_text)

        async def event_stream():
            web_search_text = ""
            web_search_limit_reached = False

            if payload.thinking_mode:
                pipeline_params = STREAMING_PLANNER_DEFAULTS.copy()
                async for planner_event in stream_pipeline_plan(
                    user_text=payload.new_text,
                    student_profile_text=student_profile_text,
                    llm_engine_instance=llm_engine,
                ):
                    if "thinking_update" in planner_event:
                        yield {"thinking_update": planner_event["thinking_update"]}
                    if "pipeline_params" in planner_event:
                        pipeline_params = planner_event["pipeline_params"]
            else:
                pipeline_params = FAST_MODE_DEFAULTS.copy()

            rag_chunk_count = pipeline_params["rag_chunk_count"]
            should_web_search = pipeline_params["run_web_search"]
            should_timetable = pipeline_params["fetch_timetable"]
            should_faculty = pipeline_params["fetch_faculty"]

            # Parse images from remaining_msgs to determine if we can run RAG concurrently
            latest_user_with_images = next(
                (
                    msg for msg in reversed(remaining_msgs)
                    if msg.get("role") == "user" and (msg.get("image_data") or msg.get("images"))
                ),
                None,
            )
            has_images_for_rag = False
            images = []
            if latest_user_with_images:
                image_data = latest_user_with_images.get("image_data")
                images = latest_user_with_images.get("images") or []
                if isinstance(image_data, str) and image_data:
                    try:
                        parsed = json.loads(image_data)
                        if isinstance(parsed, list):
                            images = parsed
                        else:
                            images = [image_data]
                    except Exception:
                        images = [image_data]
                if images:
                    has_images_for_rag = True

            # Concurrently gather recent summaries, faculty info, timetable info, web search, and RAG retrieval
            gather_tasks = {}
            gather_tasks["summaries"] = _get_recent_session_summaries(current_user.id, payload.session_id)
            if should_faculty:
                gather_tasks["faculty"] = get_cached_faculty_knowledge(student_level, current_user)
            if should_timetable:
                gather_tasks["timetable"] = get_cached_student_timetable(student_level, current_user)

            web_search_globally_enabled = bool((cached_config or {}).get("web_search_enabled", True))
            effective_web_search = should_web_search and web_search_globally_enabled
            if effective_web_search and payload.new_text.strip():
                gather_tasks["web_search"] = search_web(
                    query=payload.new_text,
                    user_id=current_user.id,
                    web_search_enabled=web_search_globally_enabled,
                )

            run_rag_concurrently = (not should_skip_rag) and (not has_images_for_rag) and (not payload.thinking_mode)
            if run_rag_concurrently:
                gather_tasks["rag"] = get_relevant_context(
                    user_question=payload.new_text,
                    document_id=None,
                    user_level=None if student_level == "Unknown" else student_level,
                    current_user=current_user,
                    rag_match_count=rag_chunk_count,
                )

            # Run concurrently!
            task_keys = list(gather_tasks.keys())
            task_futures = list(gather_tasks.values())
            gather_results = await asyncio.gather(*task_futures, return_exceptions=True)

            results_map = {}
            for key, res in zip(task_keys, gather_results):
                if isinstance(res, Exception):
                    logger.error(f"Error in concurrent task '{key}': {res}")
                    results_map[key] = None
                else:
                    results_map[key] = res

            recent_summaries = results_map.get("summaries") or ""
            faculty_info = results_map.get("faculty") or ""
            timetable_info = results_map.get("timetable") or ""
            if effective_web_search and payload.new_text.strip():
                ws_result = results_map.get("web_search")
                if ws_result == "__LIMIT_REACHED__":
                    web_search_limit_reached = True
                else:
                    web_search_text = ws_result or ""

            context_text = ""
            retrieved_citations: list[dict] = []
            extracted_image_text = ""

            context_quality = "good"

            if payload.thinking_mode:
                # ----------------------------------------------------
                # Sequential Agentic RAG Path (Thinking Mode Only)
                # ----------------------------------------------------
                if not should_skip_rag:
                    if has_images_for_rag:
                        yield {"status": "reading_image"}
                        try:
                            extraction_messages = [
                                {
                                    "role": "user",
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "Extract and summarize the key text, topics, and concepts visible in this image. Be concise and focus on subject matter relevant to pharmacy education.",
                                        },
                                        *[
                                            {
                                                "type": "image_url",
                                                "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                                            }
                                            for img in images
                                        ],
                                    ],
                                }
                            ]
                            extraction_response = await llm_engine.generate_completion_with_failover(
                                messages=extraction_messages,
                                temperature=0.2,
                                max_tokens=300,
                                has_images=True,
                                stream=False,
                            )
                            if extraction_response is not None:
                                extracted_content = extraction_response.choices[0].message.content
                                if isinstance(extracted_content, list):
                                    extracted_image_text = " ".join(
                                        part.get("text", "") for part in extracted_content if isinstance(part, dict)
                                    ).strip()
                                else:
                                    extracted_image_text = str(extracted_content).strip()
                        except Exception as exc:
                            logger.warning(f"Edit vision RAG enrichment failed, falling back to text-only query: {exc}")

                    rag_query = f"{payload.new_text}\n\n{extracted_image_text}" if extracted_image_text else payload.new_text
                    search_queries = pipeline_params.get("search_queries", [])
                    if not search_queries:
                        search_queries = [{"query": rag_query, "status": "Reviewing the relevant course material..."}]

                    from .shared import agentic_rag_loop
                    async for event in agentic_rag_loop(
                        user_text=rag_query,
                        document_id=None,
                        student_level=student_level,
                        current_user=current_user,
                        academic_session=None,
                        semester=None,
                        rag_match_count=rag_chunk_count,
                        search_queries=search_queries,
                        llm_engine=llm_engine,
                    ):
                        if "status" in event:
                            yield {"status": event["status"]}
                        elif "final_result" in event:
                            context_text, retrieved_citations, context_quality = event["final_result"]
                else:
                    context_quality = "none"

            else:
                # ----------------------------------------------------
                # Fast Mode Path (Single-pass retrieval)
                # ----------------------------------------------------
                if run_rag_concurrently:
                    rag_res = results_map.get("rag")
                    if rag_res:
                        context_text, retrieved_citations = rag_res
                    context_quality = "good" if context_text else "none"
                elif not should_skip_rag and has_images_for_rag:
                    # Sequential image extraction first, then RAG
                    yield {"status": "reading_image"}
                    try:
                        extraction_messages = [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Extract and summarize the key text, topics, and concepts visible in this image. Be concise and focus on subject matter relevant to pharmacy education.",
                                    },
                                    *[
                                        {
                                            "type": "image_url",
                                            "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                                        }
                                        for img in images
                                    ],
                                ],
                            }
                        ]
                        extraction_response = await llm_engine.generate_completion_with_failover(
                            messages=extraction_messages,
                            temperature=0.2,
                            max_tokens=300,
                            has_images=True,
                            stream=False,
                        )
                        if extraction_response is not None:
                            extracted_content = extraction_response.choices[0].message.content
                            if isinstance(extracted_content, list):
                                extracted_image_text = " ".join(
                                    part.get("text", "") for part in extracted_content if isinstance(part, dict)
                                ).strip()
                            else:
                                extracted_image_text = str(extracted_content).strip()
                    except Exception as exc:
                        logger.warning(f"Edit vision RAG enrichment failed, falling back to text-only query: {exc}")

                    rag_query = f"{payload.new_text}\n\n{extracted_image_text}" if extracted_image_text else payload.new_text
                    yield {"status": "searching_curriculum"}
                    yield {"status": "retrieving_context"}
                    context_text, retrieved_citations = await get_relevant_context(
                        rag_query,
                        document_id=None,
                        user_level=None if student_level == "Unknown" else student_level,
                        current_user=current_user,
                        rag_match_count=rag_chunk_count,
                    )
                    context_quality = "good" if context_text else "none"
                else:
                    context_quality = "none"

            citations.clear()
            citations.extend(retrieved_citations)

            if payload.thinking_mode:
                progress_update = _generate_retrieval_progress_update(citations, pipeline_params)
                yield {"thinking_update": progress_update}
                yield {"thinking_done": True}

            nigeria_now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=1)))
            current_time_str = nigeria_now.strftime("%A, %B %d, %Y, %I:%M %p")
            tomorrow = nigeria_now + timedelta(days=1)
            tomorrow_str = tomorrow.strftime("%A, %B %d, %Y")
            has_prior_history = len(remaining_msgs) > 1
            greeting_policy = _build_greeting_policy(
                user_text=payload.new_text,
                has_prior_history=has_prior_history,
                now_local=nigeria_now,
            )

            final_system_prompt = f"""{system_prompt}

CURRENT TIME & DATE (NIGERIA)  READ THIS FIRST:
Today: {current_time_str}
Tomorrow: {tomorrow_str}

STUDENT PROFILE:
{student_profile_text}

{recent_summaries}

FACULTY & CURRICULUM KNOWLEDGE:
{faculty_info or "Not configured."}

STUDENT WEEKLY TIMETABLE:
{timetable_info}
"""
            # Select instruction based on context_quality
            if context_quality == "none":
                instructions_block = """INSTRUCTIONS:
No relevant curriculum material was found. Answer honestly using general pharmaceutical knowledge. Do not imply that the answer came from the student's materials. Mention the absence of matching material only when it is useful for clarity. Do not cite documents. Tailor your explanation to their academic level."""
            elif context_quality == "partial":
                instructions_block = """INSTRUCTIONS:
Only partial relevant curriculum material was found. Answer prioritizing the retrieved context below, but supplement with general knowledge where needed. Do not imply that the answer came from the student's materials unless retrieved context supports it. Do not cite sources, lecturers, course codes or page numbers inline in your response. Tailor your explanation to their academic level."""
            else:
                instructions_block = """INSTRUCTIONS:
Answer the student's question prioritizing the retrieved context below. Tailor your explanation to their academic level. If the exact answer is not in the retrieved context, answer honestly using general knowledge, but do not imply that the answer came from the student's materials. Do not cite sources, lecturers, course codes or page numbers inline in your response."""

            if context_text:
                final_system_prompt += f"""
{instructions_block}
FACULTY KNOWLEDGE PROTOCOL: You possess hidden knowledge about the student's specific curriculum and general faculty rules. When a user asks about their courses, lecturers, schedule, or faculty, you must scan this knowledge and extract ONLY the precise answer. Do NOT recite the entire curriculum or list unrelated courses unless explicitly asked to do so. Be concise, accurate, and conversational.
TIMETABLE PROTOCOL: You possess the student's exact weekly class schedule under STUDENT WEEKLY TIMETABLE. When asked about classes, you MUST follow these absolute rules:
1. NEVER guess, invent, or modify course codes, titles, or times.
2. List EVERY SINGLE CLASS scheduled for the requested day. You are STRICTLY FORBIDDEN from summarizing, skipping, or omitting any classes.
3. Output the exact time slots and course titles exactly as they appear in the data. Do not alter them.
4. If there are overlapping classes (e.g., practicals at the same time), list all of them.
{greeting_policy}

CONTEXT:
{context_text}
"""
            else:
                final_system_prompt += f"""
INSTRUCTIONS:
Answer the student's question prioritizing your general knowledge, but tailor your explanation specifically to their academic level as defined in their profile.
FACULTY KNOWLEDGE PROTOCOL: You possess hidden knowledge about the student's specific curriculum and general faculty rules. When a user asks about their courses, lecturers, schedule, or faculty, you must scan this knowledge and extract ONLY the precise answer. Do NOT recite the entire curriculum or list unrelated courses unless explicitly asked to do so. Be concise, accurate, and conversational.
TIMETABLE PROTOCOL: You possess the student's exact weekly class schedule under STUDENT WEEKLY TIMETABLE. When asked about classes, you MUST follow these absolute rules:
1. NEVER guess, invent, or modify course codes, titles, or times.
2. List EVERY SINGLE CLASS scheduled for the requested day. You are STRICTLY FORBIDDEN from summarizing, skipping, or omitting any classes.
3. Output the exact time slots and course titles exactly as they appear in the data. Do not alter them.
4. If there are overlapping classes (e.g., practicals at the same time), list all of them.
{greeting_policy}
"""

            if web_search_text:
                final_system_prompt += f"""

WEB SEARCH RESULTS (live, retrieved just now - today's date: {current_time_str}):
{web_search_text}

Instructions for web results:
- Cite sources naturally when referencing web results (e.g. "According to [title]...").
- Prefer RAG document context over web results for pharmacy curriculum questions.
- For current events, drug recalls, recent news, or real-world updates - prefer web results.
"""

            if web_search_limit_reached:
                final_system_prompt += """

NOTE: The user requested web search but has reached their daily limit (5 searches/day).
Respond using your existing knowledge and RAG context only.
Do not mention the limit in your response unless the user explicitly asks why web search is unavailable.
"""

            if context_text:
                final_system_prompt += f"\n\nRELEVANT CURRICULUM CONTEXT:\n{context_text}"

            if web_search_text:
                final_system_prompt += f"\n\nLIVE WEB SEARCH RESULTS:\n{web_search_text}"

            final_system_prompt += "\n\nIMPORTANT: Do NOT cite sources, lecturers, course codes, or page numbers inline in your response. Never write things like (Prof. X, PTE 411) or (Source: ...) in your answers. Sources are provided separately to the user."

            llm_messages = [{"role": "system", "content": final_system_prompt}]
            for m in remaining_msgs:
                raw_role = m.get('role', 'user')
                if raw_role in ('ai', 'assistant'):
                    role = 'assistant'
                elif raw_role == 'system':
                    role = 'system'
                else:
                    role = 'user'

                image_data = m.get('image_data')
                images = m.get('images') or []
                if isinstance(image_data, str) and image_data:
                    try:
                        parsed = json.loads(image_data)
                        if isinstance(parsed, list):
                            images = parsed
                        else:
                            images = [image_data]
                    except Exception:
                        images = [image_data]

                if images and role == 'user':
                    content_blocks = [{"type": "text", "text": m['content']}]
                    for img in images:
                        content_blocks.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{img}"}
                        })
                    llm_messages.append({"role": role, "content": content_blocks})
                else:
                    llm_messages.append({"role": role, "content": m['content']})

            logger.info(f"Edit llm_messages roles+types: {[(m['role'], type(m['content']).__name__) for m in llm_messages]}")

            logger.info(f"Sending {len(llm_messages)} messages to Groq (roles: {[m['role'] for m in llm_messages]})")
            logger.info(f"Re-generating after edit for session {payload.session_id}")

            if contains_image(llm_messages):
                selected_model = llm_engine.VISION_PRIMARY
                logger.info(f"Smart Router: Images detected in context, using {selected_model}")
                is_vision_mode = True
            else:
                selected_model = llm_engine.TEXT_PRIMARY if payload.thinking_mode else llm_engine.TEXT_SECONDARY
                logger.info(f"Smart Router: Text-only context, using {selected_model}")
                is_vision_mode = False
            yield {"status": "thinking"}

            # Yield pipeline_params and selected_model for instrumentation capture
            yield {"pipeline_params": pipeline_params}
            yield {"selected_model": selected_model}

            # Adaptive final-answer reasoning prepending /no_think
            if not payload.thinking_mode:
                prepend_no_think = True
            elif not pipeline_params.get("enable_deep_final_reasoning", False):
                prepend_no_think = True
            else:
                prepend_no_think = False

            if prepend_no_think and model_uses_thinking(selected_model):
                for msg in llm_messages:
                    if msg["role"] == "system" and msg["content"] == final_system_prompt:
                        msg["content"] = "/no_think\n" + msg["content"]
                        break

            llm_messages = _trim_messages_to_fit(llm_messages, final_system_prompt)
            llm_messages = merge_system_into_user(llm_messages)
            completion_stream = llm_engine.generate_dual_cloud_stream(
                messages=llm_messages,
                has_images=is_vision_mode,
                temperature=temperature,
                max_tokens=2048,
                requested_model="TEXT_PRIMARY" if payload.thinking_mode else "TEXT_SECONDARY",
            )
            yield {"status": "preparing_response"}
            async for event in _stream_completion_events(completion_stream):
                yield event

        return await _build_streaming_response(
            event_stream(),
            request,
            payload.session_id,
            str(new_msg_id) if new_msg_id else None,
            citations=citations,
            user_id=current_user.id,
            thinking_mode=payload.thinking_mode,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Edit Message Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to edit this message. Please try again.")

class RegenerateRequest(BaseModel):
    thinking_mode: bool = False

@router.post("/chat/{session_id}/regenerate", dependencies=[Depends(verify_api_key)])
@chat_limiter.limit("20/minute")
async def regenerate_response(
    session_id: str,
    request: Request,
    payload: RegenerateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Regenerate the last AI response.
    Deletes the last AI message and re-processes the preceding user message.
    """
    if not shared.supabase_client or not llm_engine.has_available_client():
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        await _assert_session_owner(session_id, current_user)

        msg_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute(),
            "Fetch messages for regenerate",
        )
        messages = msg_res.data or []

        if not messages:
            raise HTTPException(status_code=400, detail="No messages to regenerate")

        last_msg = messages[-1]
        if last_msg['role'] == 'ai' or last_msg['role'] == 'assistant':
            await _execute_with_retry(
                lambda: shared.supabase_client.table("chat_messages").delete().eq("id", last_msg['id']).eq("session_id", session_id).execute(),
                "Delete last assistant message for regenerate",
            )
            messages.pop()

        if not messages:
            raise HTTPException(status_code=400, detail="No user message found to regenerate from")

        last_user_msg = messages[-1]
        if last_user_msg['role'] != 'user':
            raise HTTPException(status_code=400, detail="Last remaining message is not from user")

        history_msgs = []
        for m in messages[:-1]:
            role = "assistant" if (m['role'] == 'ai' or m['role'] == 'assistant') else "user"
            history_msgs.append({"role": role, "content": m['content']})

        (student_profile_text, student_level), cached_config = await asyncio.gather(
            _build_student_profile_text(current_user),
            get_cached_settings(),
            return_exceptions=False,
        )
        system_prompt = PHARMACY_SYSTEM_PROMPT
        temperature = 0.7
        if cached_config:
            if cached_config.get("system_prompt"):
                system_prompt = cached_config["system_prompt"]
            if cached_config.get("temperature") is not None:
                temperature = float(cached_config["temperature"])

        user_text = last_user_msg['content']
        citations: list[dict] = []
        should_skip_rag = is_conversational_message(user_text)

        async def event_stream():
            web_search_text = ""
            web_search_limit_reached = False

            if payload.thinking_mode:
                pipeline_params = STREAMING_PLANNER_DEFAULTS.copy()
                async for planner_event in stream_pipeline_plan(
                    user_text=user_text,
                    student_profile_text=student_profile_text,
                    llm_engine_instance=llm_engine,
                ):
                    if "thinking_update" in planner_event:
                        yield {"thinking_update": planner_event["thinking_update"]}
                    if "pipeline_params" in planner_event:
                        pipeline_params = planner_event["pipeline_params"]
            else:
                pipeline_params = FAST_MODE_DEFAULTS.copy()

            rag_chunk_count = pipeline_params["rag_chunk_count"]
            should_web_search = pipeline_params["run_web_search"]
            should_timetable = pipeline_params["fetch_timetable"]
            should_faculty = pipeline_params["fetch_faculty"]

            # Parse images from last_user_msg to determine if we can run RAG concurrently
            has_images_for_rag = False
            images = []
            image_data = last_user_msg.get('image_data')
            if image_data:
                try:
                    images = json.loads(image_data) if image_data.startswith('[') else [image_data]
                except Exception:
                    images = [image_data]
                if images:
                    has_images_for_rag = True

            # Concurrently gather recent summaries, faculty info, timetable info, web search, and RAG retrieval
            gather_tasks = {}
            gather_tasks["summaries"] = _get_recent_session_summaries(current_user.id, session_id)
            if should_faculty:
                gather_tasks["faculty"] = get_cached_faculty_knowledge(student_level, current_user)
            if should_timetable:
                gather_tasks["timetable"] = get_cached_student_timetable(student_level, current_user)

            web_search_globally_enabled = bool((cached_config or {}).get("web_search_enabled", True))
            effective_web_search = should_web_search and web_search_globally_enabled
            if effective_web_search and user_text.strip():
                gather_tasks["web_search"] = search_web(
                    query=user_text,
                    user_id=current_user.id,
                    web_search_enabled=web_search_globally_enabled,
                )

            run_rag_concurrently = (not should_skip_rag) and (not has_images_for_rag) and (not payload.thinking_mode)
            if run_rag_concurrently:
                gather_tasks["rag"] = get_relevant_context(
                    user_text,
                    document_id=None,
                    user_level=None if student_level == "Unknown" else student_level,
                    current_user=current_user,
                    rag_match_count=rag_chunk_count,
                )

            # Run concurrently!
            task_keys = list(gather_tasks.keys())
            task_futures = list(gather_tasks.values())
            gather_results = await asyncio.gather(*task_futures, return_exceptions=True)

            results_map = {}
            for key, res in zip(task_keys, gather_results):
                if isinstance(res, Exception):
                    logger.error(f"Error in concurrent task '{key}': {res}")
                    results_map[key] = None
                else:
                    results_map[key] = res

            recent_summaries = results_map.get("summaries") or ""
            faculty_info = results_map.get("faculty") or ""
            timetable_info = results_map.get("timetable") or ""
            if effective_web_search and user_text.strip():
                ws_result = results_map.get("web_search")
                if ws_result == "__LIMIT_REACHED__":
                    web_search_limit_reached = True
                else:
                    web_search_text = ws_result or ""

            context_text = ""
            retrieved_citations: list[dict] = []
            extracted_image_text = ""

            context_quality = "good"

            if payload.thinking_mode:
                # ----------------------------------------------------
                # Sequential Agentic RAG Path (Thinking Mode Only)
                # ----------------------------------------------------
                if not should_skip_rag:
                    if has_images_for_rag:
                        yield {"status": "reading_image"}
                        try:
                            extraction_messages = [
                                {
                                    "role": "user",
                                    "content": [
                                        {
                                            "type": "text",
                                            "text": "Extract and summarize the key text, topics, and concepts visible in this image. Be concise and focus on subject matter relevant to pharmacy education.",
                                        },
                                        *[
                                            {
                                                "type": "image_url",
                                                "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                                            }
                                            for img in images
                                        ],
                                    ],
                                }
                            ]
                            extraction_response = await llm_engine.generate_completion_with_failover(
                                messages=extraction_messages,
                                temperature=0.2,
                                max_tokens=300,
                                has_images=True,
                                stream=False,
                            )
                            if extraction_response is not None:
                                extracted_content = extraction_response.choices[0].message.content
                                if isinstance(extracted_content, list):
                                    extracted_image_text = " ".join(
                                        part.get("text", "") for part in extracted_content if isinstance(part, dict)
                                    ).strip()
                                else:
                                    extracted_image_text = str(extracted_content).strip()
                        except Exception as exc:
                            logger.warning(f"Regenerate vision RAG enrichment failed, falling back to text-only query: {exc}")

                    rag_query = f"{user_text}\n\n{extracted_image_text}" if extracted_image_text else user_text
                    search_queries = pipeline_params.get("search_queries", [])
                    if not search_queries:
                        search_queries = [{"query": rag_query, "status": "Reviewing the relevant course material..."}]

                    from .shared import agentic_rag_loop
                    async for event in agentic_rag_loop(
                        user_text=rag_query,
                        document_id=None,
                        student_level=student_level,
                        current_user=current_user,
                        academic_session=None,
                        semester=None,
                        rag_match_count=rag_chunk_count,
                        search_queries=search_queries,
                        llm_engine=llm_engine,
                    ):
                        if "status" in event:
                            yield {"status": event["status"]}
                        elif "final_result" in event:
                            context_text, retrieved_citations, context_quality = event["final_result"]
                else:
                    context_quality = "none"

            else:
                # ----------------------------------------------------
                # Fast Mode Path (Single-pass retrieval)
                # ----------------------------------------------------
                if run_rag_concurrently:
                    rag_res = results_map.get("rag")
                    if rag_res:
                        context_text, retrieved_citations = rag_res
                    context_quality = "good" if context_text else "none"
                elif not should_skip_rag and has_images_for_rag:
                    # Sequential image extraction first, then RAG
                    yield {"status": "reading_image"}
                    try:
                        extraction_messages = [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Extract and summarize the key text, topics, and concepts visible in this image. Be concise and focus on subject matter relevant to pharmacy education.",
                                    },
                                    *[
                                        {
                                            "type": "image_url",
                                            "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                                        }
                                        for img in images
                                    ],
                                ],
                            }
                        ]
                        extraction_response = await llm_engine.generate_completion_with_failover(
                            messages=extraction_messages,
                            temperature=0.2,
                            max_tokens=300,
                            has_images=True,
                            stream=False,
                        )
                        if extraction_response is not None:
                            extracted_content = extraction_response.choices[0].message.content
                            if isinstance(extracted_content, list):
                                extracted_image_text = " ".join(
                                    part.get("text", "") for part in extracted_content if isinstance(part, dict)
                                ).strip()
                            else:
                                extracted_image_text = str(extracted_content).strip()
                    except Exception as exc:
                        logger.warning(f"Regenerate vision RAG enrichment failed, falling back to text-only query: {exc}")

                    rag_query = f"{user_text}\n\n{extracted_image_text}" if extracted_image_text else user_text
                    yield {"status": "searching_curriculum"}
                    yield {"status": "retrieving_context"}
                    context_text, retrieved_citations = await get_relevant_context(
                        rag_query,
                        document_id=None,
                        user_level=None if student_level == "Unknown" else student_level,
                        current_user=current_user,
                        rag_match_count=rag_chunk_count,
                    )
                    context_quality = "good" if context_text else "none"
                else:
                    context_quality = "none"

            citations.clear()
            citations.extend(retrieved_citations)

            if payload.thinking_mode:
                progress_update = _generate_retrieval_progress_update(citations, pipeline_params)
                yield {"thinking_update": progress_update}
                yield {"thinking_done": True}

            nigeria_now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=1)))
            current_time_str = nigeria_now.strftime("%A, %B %d, %Y, %I:%M %p")
            tomorrow = nigeria_now + timedelta(days=1)
            tomorrow_str = tomorrow.strftime("%A, %B %d, %Y")
            has_prior_history = len(history_msgs) > 0
            greeting_policy = _build_greeting_policy(
                user_text=user_text,
                has_prior_history=has_prior_history,
                now_local=nigeria_now,
            )
            final_system_prompt = f"""{system_prompt}

CURRENT TIME & DATE (NIGERIA)  READ THIS FIRST:
Today: {current_time_str}
Tomorrow: {tomorrow_str}

STUDENT PROFILE:
{student_profile_text}

{recent_summaries}

FACULTY & CURRICULUM KNOWLEDGE:
{faculty_info or "Not configured."}

STUDENT WEEKLY TIMETABLE:
{timetable_info}
"""
            # Select instruction based on context_quality
            if context_quality == "none":
                instructions_block = """INSTRUCTIONS:
No relevant curriculum material was found. Answer honestly using general pharmaceutical knowledge. Do not imply that the answer came from the student's materials. Mention the absence of matching material only when it is useful for clarity. Do not cite documents. Tailor your explanation to their academic level."""
            elif context_quality == "partial":
                instructions_block = """INSTRUCTIONS:
Only partial relevant curriculum material was found. Answer prioritizing the retrieved context below, but supplement with general knowledge where needed. Do not imply that the answer came from the student's materials unless retrieved context supports it. Do not cite sources, lecturers, course codes or page numbers inline in your response. Tailor your explanation to their academic level."""
            else:
                instructions_block = """INSTRUCTIONS:
Answer the student's question prioritizing the retrieved context below. Tailor your explanation to their academic level. If the exact answer is not in the retrieved context, answer honestly using general knowledge, but do not imply that the answer came from the student's materials. Do not cite sources, lecturers, course codes or page numbers inline in your response."""

            if context_text:
                final_system_prompt += f"""
{instructions_block}
FACULTY KNOWLEDGE PROTOCOL: You possess hidden knowledge about the student's specific curriculum and general faculty rules. When a user asks about their courses, lecturers, schedule, or faculty, you must scan this knowledge and extract ONLY the precise answer. Do NOT recite the entire curriculum or list unrelated courses unless explicitly asked to do so. Be concise, accurate, and conversational.
TIMETABLE PROTOCOL: You possess the student's exact weekly class schedule under STUDENT WEEKLY TIMETABLE. When asked about classes, you MUST follow these absolute rules:
1. NEVER guess, invent, or modify course codes, titles, or times.
2. List EVERY SINGLE CLASS scheduled for the requested day. You are STRICTLY FORBIDDEN from summarizing, skipping, or omitting any classes.
3. Output the exact time slots and course titles exactly as they appear in the data. Do not alter them.
4. If there are overlapping classes (e.g., practicals at the same time), list all of them.
{greeting_policy}

CONTEXT:
{context_text}
"""
            else:
                final_system_prompt += f"""
INSTRUCTIONS:
Answer prioritizing general knowledge, tailored to the student's level.
FACULTY KNOWLEDGE PROTOCOL: You possess hidden knowledge about the student's specific curriculum and general faculty rules. When a user asks about their courses, lecturers, schedule, or faculty, you must scan this knowledge and extract ONLY the precise answer. Do NOT recite the entire curriculum or list unrelated courses unless explicitly asked to do so. Be concise, accurate, and conversational.
TIMETABLE PROTOCOL: You possess the student's exact weekly class schedule under STUDENT WEEKLY TIMETABLE. When asked about classes, you MUST follow these absolute rules:
1. NEVER guess, invent, or modify course codes, titles, or times.
2. List EVERY SINGLE CLASS scheduled for the requested day. You are STRICTLY FORBIDDEN from summarizing, skipping, or omitting any classes.
3. Output the exact time slots and course titles exactly as they appear in the data. Do not alter them.
4. If there are overlapping classes (e.g., practicals at the same time), list all of them.
{greeting_policy}
"""

            if web_search_text:
                final_system_prompt += f"""

WEB SEARCH RESULTS (live, retrieved just now - today's date: {current_time_str}):
{web_search_text}

Instructions for web results:
- Cite sources naturally when referencing web results (e.g. "According to [title]...").
- Prefer RAG document context over web results for pharmacy curriculum questions.
- For current events, drug recalls, recent news, or real-world updates - prefer web results.
"""

            if web_search_limit_reached:
                final_system_prompt += """

NOTE: The user requested web search but has reached their daily limit (5 searches/day).
Respond using your existing knowledge and RAG context only.
Do not mention the limit in your response unless the user explicitly asks why web search is unavailable.
"""

            if context_text:
                final_system_prompt += f"\n\nRELEVANT CURRICULUM CONTEXT:\n{context_text}"

            if web_search_text:
                final_system_prompt += f"\n\nLIVE WEB SEARCH RESULTS:\n{web_search_text}"

            final_system_prompt += "\n\nIMPORTANT: Do NOT cite sources, lecturers, course codes, or page numbers inline in your response. Never write things like (Prof. X, PTE 411) or (Source: ...) in your answers. Sources are provided separately to the user."

            llm_messages = [{"role": "system", "content": final_system_prompt}]
            llm_messages.extend(history_msgs)

            user_content_block = []
            image_data = last_user_msg.get('image_data')
            if image_data:
                try:
                    images = json.loads(image_data) if image_data.startswith('[') else [image_data]
                except Exception:
                    images = [image_data]

                user_content_block.append({"type": "text", "text": user_text})
                for img in images:
                    user_content_block.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                    })
                llm_messages.append({"role": "user", "content": user_content_block})
            else:
                llm_messages.append({"role": "user", "content": user_text})

            logger.info(f"Regenerating response for session {session_id}")
            if contains_image(llm_messages):
                selected_model = llm_engine.VISION_PRIMARY
                logger.info(f"Smart Router: Images detected in context, using {selected_model}")
                is_vision_mode = True
            else:
                selected_model = llm_engine.TEXT_PRIMARY if payload.thinking_mode else llm_engine.TEXT_SECONDARY
                logger.info(f"Smart Router: Text-only context, using {selected_model}")
                is_vision_mode = False
            yield {"status": "thinking"}

            # Yield pipeline_params and selected_model for instrumentation capture
            yield {"pipeline_params": pipeline_params}
            yield {"selected_model": selected_model}

            # Adaptive final-answer reasoning prepending /no_think
            if not payload.thinking_mode:
                prepend_no_think = True
            elif not pipeline_params.get("enable_deep_final_reasoning", False):
                prepend_no_think = True
            else:
                prepend_no_think = False

            if prepend_no_think and model_uses_thinking(selected_model):
                for msg in llm_messages:
                    if msg["role"] == "system" and msg["content"] == final_system_prompt:
                        msg["content"] = "/no_think\n" + msg["content"]
                        break

            llm_messages = _trim_messages_to_fit(llm_messages, final_system_prompt)
            llm_messages = merge_system_into_user(llm_messages)
            completion_stream = llm_engine.generate_dual_cloud_stream(
                messages=llm_messages,
                has_images=is_vision_mode,
                temperature=temperature,
                max_tokens=2048,
                requested_model="TEXT_PRIMARY" if payload.thinking_mode else "TEXT_SECONDARY",
            )
            yield {"status": "preparing_response"}
            async for event in _stream_completion_events(completion_stream):
                yield event

        return await _build_streaming_response(
            event_stream(),
            request,
            session_id,
            citations=citations,
            user_id=current_user.id,
            thinking_mode=payload.thinking_mode,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Regenerate Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to regenerate the response. Please try again.")

    # Configure Gemini for RAG embeddings
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    if GOOGLE_API_KEY:
        genai.configure(api_key=GOOGLE_API_KEY)
        logger.info("Gemini API configured for RAG in chat router")
    else:
        logger.warning("GOOGLE_API_KEY not set - RAG features will be disabled")
