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
)
from slowapi import Limiter
from slowapi.util import get_remote_address
from services.web_search import search_web
import random


def _trim_messages_to_fit(
    messages: list[dict],
    system_prompt: str,
    max_tokens: int = 6000,
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
) -> StreamingResponse:
    """
    Stream assistant deltas via SSE and persist full assistant response to DB after completion.
    Detects client disconnect via request.is_disconnected() and appends STOPPED_ASSISTANT_NOTE.
    """
    async def stream_generator():
        full_text = ""
        saved_assistant_message_id = None
        emitted_graceful = False
        disconnected = False
        cancelled = False

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

                    status = event.get("status")
                    if isinstance(status, str) and status:
                        yield f"data: {json.dumps({'status': status})}\n\n"

                    delta = event.get("delta")
                    if delta:
                        full_text += delta
                        yield f"data: {json.dumps({'delta': delta})}\n\n"
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

            text_to_save = full_text
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

            final_event = {
                "done": True,
                "message_id": saved_assistant_message_id,
                "session_id": session_id,
                "citations": citations or [],
                "stopped": bool(disconnected or cancelled),
            }
            if save_failed:
                final_event["save_failed"] = True
                final_event["full_text"] = text_to_save
            try:
                yield f"data: {json.dumps(final_event)}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as sse_final_err:
                # Expected when the client is already gone; message is still persisted above.
                logger.info(f"Could not emit terminal SSE event: {sse_final_err}")

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
            "You generate high-quality chat session titles.\n"
            "Write ONE concise title that reflects the actual conversation topic.\n"
            "Requirements:\n"
            "- 3 to 8 words.\n"
            "- Specific and concrete, not generic.\n"
            "- Include the main subject, concept, or entity discussed.\n"
            "- Do not use filler phrases like 'Chat', 'Discussion', 'Help', or 'Question'.\n"
            "- If the user's text is purely small talk or a generic greeting (e.g., 'hello', 'hi', 'how are you'), do NOT invent a topic. You must strictly return the exact phrase 'Small Talk'.\n"
            "- Return only the title text.\n\n"
            f"Conversation excerpt:\n{conversation_excerpt}\n\n"
            f"Latest user message:\n{(user_text or '').strip()}"
        )

        title_completion = await _call_background_llm_with_retry(
            lambda: llm_engine.google_client.chat.completions.create(
                model=llm_engine.TEXT_FALLBACK,
                messages=[{"role": "user", "content": title_prompt}],
                temperature=0.7,
                max_tokens=100,
                stream=False
            ),
            "Background title generation",
        )

        if title_completion is None:
            raise RuntimeError("Title generation failed on Google model")

        new_title = _clean_generated_title(title_completion.choices[0].message.content)
        if _is_generic_title(new_title):
            stricter_prompt = (
                f"{title_prompt}\n\n"
                "Your previous title was too generic. Regenerate a better one.\n"
                "Must include at least one concrete keyword from the conversation "
                "(for example: drug/class, disease, mechanism, course code, or named concept)."
            )
            retry_completion = await _call_background_llm_with_retry(
                lambda: llm_engine.google_client.chat.completions.create(
                    model=llm_engine.TEXT_FALLBACK,
                    messages=[{"role": "user", "content": stricter_prompt}],
                    temperature=0.1,
                    max_tokens=24,
                    stream=False
                ),
                "Background title regeneration",
                max_attempts=2,
            )
            if retry_completion is not None:
                regenerated = _clean_generated_title(retry_completion.choices[0].message.content)
                if regenerated:
                    new_title = regenerated

        if not new_title:
            new_title = (user_text or "").strip()[:30] + "..."

        await chat_history.update_session_title(session_id, new_title)
        logger.info(
            f"AI Auto-renamed session {session_id} to '{new_title}' (via Google AI) "
            f"for user {getattr(current_user, 'id', 'unknown')}"
        )
    except Exception as e:
        err_meta = _format_background_llm_error(e)
        if _is_transient_background_llm_error(e):
            logger.warning(f"Background title generation skipped for session {session_id}: {err_meta}")
        else:
            logger.error(f"Background title generation failed for session {session_id}: {err_meta}")


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
    http_request = request
    request = chat_request

    if not llm_engine.has_available_client():
        raise HTTPException(status_code=503, detail="The AI service is temporarily unavailable. Please try again in a moment.")
    saved_user_message_id: Optional[str] = None

    (student_profile_text, student_level), cached_config = await asyncio.gather(
        _build_student_profile_text(current_user),
        get_cached_settings(),
        return_exceptions=False,
    )
    faculty_info, timetable_info, recent_summaries = await asyncio.gather(
        get_cached_faculty_knowledge(student_level),
        get_cached_student_timetable(student_level),
        _get_recent_session_summaries(current_user.id, request.session_id),
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
            asyncio.create_task(_generate_and_save_title(request.session_id, request.text, current_user))

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
        web_search_text = ""
        web_search_limit_reached = False
        should_skip_rag = is_conversational_message(request.text)
        extracted_image_text = ""
        rag_query = request.text

        if request.web_search and request.text.strip():
            yield {"status": "searching_web"}
            ws_result = await search_web(
                query=request.text,
                user_id=current_user.id,
                web_search_enabled=web_search_globally_enabled,
            )
            if ws_result == "__LIMIT_REACHED__":
                web_search_limit_reached = True
            else:
                web_search_text = ws_result

        context_text = ""
        retrieved_citations: list[dict] = []
        if should_skip_rag:
            logger.info("Skipping RAG retrieval for conversational message.")
        else:
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
            logger.info(f"Vision RAG query enriched: {rag_query[:100]}...")
            yield {"status": "searching_curriculum"}
            yield {"status": "retrieving_context"}
            if request.document_id:
                logger.info(f"RAG enabled for document: {request.document_id}")
                context_text, retrieved_citations = await get_relevant_context(
                    rag_query,
                    request.document_id,
                    None if student_level == "Unknown" else student_level,
                )
            else:
                logger.info(f"Global RAG enabled for user level: {student_level}")
                context_text, retrieved_citations = await get_relevant_context(
                    rag_query,
                    document_id=None,
                    user_level=None if student_level == "Unknown" else student_level,
                )
        citations.clear()
        citations.extend(retrieved_citations)

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

        if context_text:
            final_system_prompt += f"""
INSTRUCTIONS:
Answer the student's question prioritizing the retrieved context below. Tailor your explanation to their academic level. If the exact answer is NOT in the retrieved context, you must explicitly state: "This information is not directly covered in the material, but based on general knowledge..." and then proceed. Do not cite sources, lecturers, course codes or page numbers inline in your response.
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
                selected_model = llm_engine.TEXT_PRIMARY
                logger.info(f"Smart Router: Pure text detected, processing efficiently with {selected_model}")
                is_vision_mode = False
            yield {"status": "thinking"}

            messages = _trim_messages_to_fit(messages, final_system_prompt)
            messages = merge_system_into_user(messages)

            completion_stream = llm_engine.generate_dual_cloud_stream(
                messages=messages,
                has_images=is_vision_mode,
                temperature=temperature,
                max_tokens=2048,
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
    )

# --- Save Partial (Stopped) Response ---
class SavePartialRequest(BaseModel):
    session_id: str
    content: str

@router.post("/chat/save-partial", dependencies=[Depends(verify_api_key)])
async def save_partial_response(
    request: SavePartialRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Save a partial assistant response when the user stops generation.
    Fallback for cases where the streaming disconnect detection is too slow.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="Database not active")

    await _assert_session_owner(request.session_id, current_user)

    content = request.content.strip()
    if not content:
        return {"status": "skipped", "reason": "empty content"}

    # Check if the backend's disconnect handler already saved a message
    try:
        recent_ai = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages")
                .select("id, content")
                .eq("session_id", request.session_id)
                .in_("role", ["ai", "assistant"])
                .order("created_at", desc=True)
                .limit(1)
                .execute(),
            "Check for existing AI message on stop",
        )
        if recent_ai.data:
            existing_content = (recent_ai.data[0].get("content") or "").strip()
            # If the backend already saved this (or a longer version), skip
            if existing_content and content in existing_content:
                return {"status": "already_saved", "message_id": recent_ai.data[0]["id"]}
    except Exception as e:
        logger.warning(f"Could not check existing AI message on stop: {e}")

    # Append the stopped note
    text_to_save = content
    if STOPPED_ASSISTANT_NOTE not in text_to_save:
        text_to_save = f"{text_to_save}\n\n{STOPPED_ASSISTANT_NOTE}"

    try:
        saved_id = await chat_history.save_assistant_message(
            session_id=request.session_id,
            content=text_to_save,
        )
        return {"status": "saved", "message_id": saved_id}
    except Exception as e:
        logger.error(f"Failed to save partial response: {e}")
        raise HTTPException(status_code=500, detail="Failed to save partial response")

# --- Rename Session Endpoint ---
class RenameSessionRequest(BaseModel):
    title: str

@router.patch("/session/{session_id}/rename", dependencies=[Depends(verify_api_key)])
async def rename_session(
    session_id: str,
    request: RenameSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Rename a chat session. Only the session owner can rename.
    """
    await _assert_session_owner(session_id, current_user)
    new_title = request.title.strip()
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    if len(new_title) > 100:
        new_title = new_title[:100]
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

@router.post("/chat/edit", dependencies=[Depends(verify_api_key)])
async def edit_message(
    request: EditMessageRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Edit a user message, delete everything after it, and regenerate the AI response.
    """
    if not shared.supabase_client or not llm_engine.has_available_client():
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        await _assert_session_owner(request.session_id, current_user)

        msg_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").select("*").eq("session_id", request.session_id).order("created_at", desc=False).execute(),
            "Fetch messages for edit",
        )
        messages = msg_res.data or []

        target_msg = next((m for m in messages if str(m.get('id')) == str(request.message_id)), None)
        if not target_msg:
            raise HTTPException(status_code=400, detail="Message not found")
        target_timestamp = target_msg['created_at']

        await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").delete().eq("session_id", request.session_id).gte("created_at", target_timestamp).execute(),
            "Delete messages from edit point",
        )

        image_payload = json.dumps(request.images) if request.images else None
        insert_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").insert({
                "session_id": request.session_id,
                "role": "user",
                "content": request.new_text,
                "image_data": image_payload,
            }).execute(),
            "Save edited user message",
        )
        new_msg_id = insert_res.data[0]['id'] if insert_res.data and len(insert_res.data) > 0 else None

        remaining_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_messages").select("*").eq("session_id", request.session_id).order("created_at", desc=False).execute(),
            "Fetch remaining messages after edit",
        )
        remaining_msgs = remaining_res.data or []
        logger.info(f"Edit remaining_msgs sample: {[{k: v for k, v in m.items() if k in ('id', 'role', 'image_data', 'images')} for m in remaining_msgs]}")

        system_prompt = PHARMACY_SYSTEM_PROMPT
        temperature = 0.7
        cached_config = await get_cached_settings()
        if cached_config:
            if cached_config.get("system_prompt"):
                system_prompt = cached_config["system_prompt"]
            if cached_config.get("temperature") is not None:
                temperature = float(cached_config["temperature"])

        student_profile_text, student_level = await _build_student_profile_text(current_user)
        recent_summaries = await _get_recent_session_summaries(current_user.id, request.session_id)
        citations: list[dict] = []
        should_skip_rag = is_conversational_message(request.new_text)

        async def event_stream():
            context_text = ""
            retrieved_citations: list[dict] = []
            extracted_image_text = ""
            rag_query = request.new_text
            if should_skip_rag:
                logger.info("Skipping RAG retrieval for conversational edited message.")
            else:
                latest_user_with_images = next(
                    (
                        msg for msg in reversed(remaining_msgs)
                        if msg.get("role") == "user" and (msg.get("image_data") or msg.get("images"))
                    ),
                    None,
                )
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

                rag_query = f"{request.new_text}\n\n{extracted_image_text}" if extracted_image_text else request.new_text
                yield {"status": "searching_curriculum"}
                yield {"status": "retrieving_context"}
                context_text, retrieved_citations = await get_relevant_context(
                    user_question=rag_query,
                    document_id=None,
                    user_level=None if student_level == "Unknown" else student_level,
                )
            citations.clear()
            citations.extend(retrieved_citations)

            final_system_prompt = f"""{system_prompt}

STUDENT PROFILE:
{student_profile_text}

{recent_summaries}
"""
            if context_text:
                final_system_prompt += f"""
INSTRUCTIONS:
Answer the student's question prioritizing the retrieved context below. Tailor your explanation to their academic level. If the exact answer is NOT in the retrieved context, you must explicitly state: "This information is not directly covered in the material, but based on general knowledge..." and then proceed. Do not cite sources, lecturers, course codes or page numbers inline in your response.

CONTEXT:
{context_text}
"""
            else:
                final_system_prompt += """
INSTRUCTIONS:
Answer the student's question prioritizing your general knowledge, but tailor your explanation specifically to their academic level as defined in their profile.
"""

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
            logger.info(f"Re-generating after edit for session {request.session_id}")

            if contains_image(llm_messages):
                selected_model = llm_engine.VISION_PRIMARY
                logger.info(f"Smart Router: Images detected in context, using {selected_model}")
                is_vision_mode = True
            else:
                selected_model = llm_engine.TEXT_PRIMARY
                logger.info(f"Smart Router: Text-only context, using {selected_model}")
                is_vision_mode = False
            yield {"status": "thinking"}

            llm_messages = merge_system_into_user(llm_messages)
            completion_stream = llm_engine.generate_dual_cloud_stream(
                messages=llm_messages,
                has_images=is_vision_mode,
                temperature=temperature,
                max_tokens=2048,
            )
            yield {"status": "preparing_response"}
            async for event in _stream_completion_events(completion_stream):
                yield event

        return await _build_streaming_response(
            event_stream(),
            http_request,
            request.session_id,
            str(new_msg_id) if new_msg_id else None,
            citations=citations,
            user_id=current_user.id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Edit Message Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to edit this message. Please try again.")

@router.post("/chat/{session_id}/regenerate", dependencies=[Depends(verify_api_key)])
async def regenerate_response(
    session_id: str,
    http_request: Request,
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

        system_prompt = PHARMACY_SYSTEM_PROMPT
        cached_config = await get_cached_settings()
        temperature = 0.7
        if cached_config:
            if cached_config.get("system_prompt"):
                system_prompt = cached_config["system_prompt"]
            if cached_config.get("temperature") is not None:
                temperature = float(cached_config["temperature"])

        student_profile_text, student_level = await _build_student_profile_text(current_user)
        faculty_info = await get_cached_faculty_knowledge(student_level)
        timetable_info = await get_cached_student_timetable(student_level)
        recent_summaries = await _get_recent_session_summaries(current_user.id, session_id)

        user_text = last_user_msg['content']
        citations: list[dict] = []
        should_skip_rag = is_conversational_message(user_text)

        async def event_stream():
            context_text = ""
            retrieved_citations: list[dict] = []
            if should_skip_rag:
                logger.info("Skipping RAG retrieval for conversational regenerate request.")
            else:
                yield {"status": "searching_curriculum"}
                yield {"status": "retrieving_context"}
                context_text, retrieved_citations = await get_relevant_context(
                    user_text,
                    document_id=None,
                    user_level=None if student_level == "Unknown" else student_level,
                )
            citations.clear()
            citations.extend(retrieved_citations)

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
            if context_text:
                final_system_prompt += f"""
INSTRUCTIONS:
Answer the student's question prioritizing the retrieved context below. Tailor your explanation to their academic level. If the exact answer is NOT in the retrieved context, you must explicitly state: "This information is not directly covered in the material, but based on general knowledge..." and then proceed. Do not cite sources, lecturers, course codes or page numbers inline in your response.
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
                selected_model = llm_engine.TEXT_PRIMARY
                logger.info(f"Smart Router: Text-only context, using {selected_model}")
                is_vision_mode = False
            yield {"status": "thinking"}

            llm_messages = _trim_messages_to_fit(llm_messages, final_system_prompt)
            llm_messages = merge_system_into_user(llm_messages)
            completion_stream = llm_engine.generate_dual_cloud_stream(
                messages=llm_messages,
                has_images=is_vision_mode,
                temperature=temperature,
                max_tokens=2048,
            )
            yield {"status": "preparing_response"}
            async for event in _stream_completion_events(completion_stream):
                yield event

        return await _build_streaming_response(
            event_stream(),
            http_request,
            session_id,
            citations=citations,
            user_id=current_user.id,
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
