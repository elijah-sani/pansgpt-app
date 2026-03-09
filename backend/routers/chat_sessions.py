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


def _is_transient_background_llm_error(exc: Exception) -> bool:
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


async def _summarize_previous_session(user_id: str, exclude_session_id: str):
    """
    Background task: fetch the most recent completed session for this user,
    generate a title (if still New Chat) and a summary using Gemma 3 12B,
    and save both back to the database.
    """
    try:
        sb = shared.supabase_service_client or shared.supabase_client
        if not sb or llm_engine.google_client is None:
            return

        # Step 1: Find the most recent previous session without a summary yet
        session_res = await _execute_with_retry(
            lambda: sb.table("chat_sessions")
            .select("id, title, summary")
            .eq("user_id", user_id)
            .neq("id", exclude_session_id)
            .is_("summary", "null")
            .order("updated_at", desc=True)
            .limit(1)
            .execute(),
            "Fetch previous session for summarization",
        )

        if not (session_res.data or []):
            logger.info(f"No unsummarized previous session found for user {user_id[:8]}")
            return

        prev_session = session_res.data[0]
        prev_session_id = prev_session["id"]
        prev_title = (prev_session.get("title") or "").strip()

        # Step 2: Fetch all messages from that session
        msg_res = await _execute_with_retry(
            lambda: sb.table("chat_messages")
            .select("role, content")
            .eq("session_id", prev_session_id)
            .order("created_at", desc=False)
            .execute(),
            "Fetch messages for summarization",
        )

        messages = msg_res.data or []
        if not messages:
            logger.info(f"No messages found in previous session {prev_session_id[:8]}, skipping summary")
            return

        # Step 3: Build conversation text capped at 8000 chars
        conversation_text = ""
        for msg in messages:
            role = (msg.get("role") or "").strip()
            content = (msg.get("content") or "").strip()
            if role and content:
                conversation_text += f"{role}: {content}\n\n"
        conversation_text = conversation_text[:8000]

        # Step 4: Build prompt for Gemma 3 12B
        needs_title = _is_generic_title(prev_title) or prev_title == "New Chat" or not prev_title

        prompt = (
            "You are summarizing a pharmacy tutoring conversation between a student and an AI tutor.\n\n"
            f"Conversation:\n{conversation_text}\n\n"
            "Based on this conversation, provide:\n"
        )
        if needs_title:
            prompt += (
                "1. TITLE: A concise 3-8 word title describing the main topic discussed.\n"
                "2. SUMMARY: A 2-3 sentence summary of what was studied, "
                "any concepts the student struggled with, and what was resolved.\n\n"
                "Respond in this exact format:\n"
                "TITLE: <title here>\n"
                "SUMMARY: <summary here>"
            )
        else:
            prompt += (
                "SUMMARY: A 2-3 sentence summary of what was studied, "
                "any concepts the student struggled with, and what was resolved.\n\n"
                "Respond in this exact format:\n"
                "SUMMARY: <summary here>"
            )

        # Step 5: Call Gemma 3 12B
        response = await _call_background_llm_with_retry(
            lambda: llm_engine.google_client.chat.completions.create(
                model=llm_engine.TEXT_SECONDARY,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=300,
                stream=False,
            ),
            "Background session summarization",
        )

        raw_output = (response.choices[0].message.content or "").strip()

        # Step 6: Parse the response
        new_title = None
        new_summary = None
        for line in raw_output.splitlines():
            if line.startswith("TITLE:") and needs_title:
                new_title = line.replace("TITLE:", "").strip()
            elif line.startswith("SUMMARY:"):
                new_summary = line.replace("SUMMARY:", "").strip()

        # Step 7: Save back to database
        update_data = {}
        if new_summary:
            update_data["summary"] = new_summary
        if new_title and needs_title:
            update_data["title"] = new_title

        if update_data:
            await _execute_with_retry(
                lambda: sb.table("chat_sessions")
                .update(update_data)
                .eq("id", prev_session_id)
                .execute(),
                "Save session summary and title",
            )
            logger.info(
                f"Summarized previous session {prev_session_id[:8]} "
                f"title: {'updated' if new_title else 'kept'}, summary: saved"
            )

    except Exception as e:
        err_meta = _format_background_llm_error(e)
        if _is_transient_background_llm_error(e):
            logger.warning(f"Background session summarization skipped: {err_meta}")
        else:
            logger.error(f"Background session summarization failed: {err_meta}")


router = APIRouter(tags=["sessions"])
# --- Session Management Endpoints ---

@router.get("/history", response_model=List[ChatSession], dependencies=[Depends(verify_api_key)])
async def get_chat_history(
    context_id: Optional[str] = None,
    is_main: Optional[bool] = False,
    current_user: User = Depends(get_current_user),
):
    """
    Fetch all chat sessions for the user.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    
    try:
        query = shared.supabase_client.table("chat_sessions").select("*").order("updated_at", desc=True)
        query = query.eq("user_id", current_user.id)

        if context_id:
            query = query.eq("context_id", context_id)
        elif is_main:
            query = query.is_("context_id", "null")
        
        res = await _execute_with_retry(
            lambda: query.execute(),
            "Fetch chat history sessions",
        )
        return res.data
    except Exception as e:
        logger.error(f"History Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load your chat history. Please try again.")

@router.get("/history/{session_id}", dependencies=[Depends(verify_api_key)])
async def get_session_messages(
    session_id: str,
    current_user: User = Depends(get_current_user),
    limit: Optional[int] = None,
    before: Optional[str] = None,
):
    """
    Fetch messages for a specific session. Supports pagination:
    - limit: max number of messages to return (newest first, then reversed)
    - before: ISO timestamp cursor — only return messages created before this time
    Returns messages in chronological order (oldest first).
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    
    try:
        # Verify ownership first (optional if RLS is on, but strict requirement)
        session_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_sessions").select("user_id").eq("id", session_id).execute(),
            "Fetch chat session ownership",
        )
        if session_res.data:
             if session_res.data[0]['user_id'] != current_user.id:
                  # If user_id is null (legacy), maybe allow? Or migrate?
                  # For now, strict check if user_id exists.
                  if session_res.data[0]['user_id'] is not None:
                       raise HTTPException(status_code=403, detail="Not authorized to view this chat")
        
        # Build query with optional pagination
        def build_messages_query():
            q = shared.supabase_client.table("chat_messages").select("*").eq("session_id", session_id)
            if before:
                q = q.lt("created_at", before)
            if limit:
                # Fetch newest N messages (desc), we'll reverse in Python
                q = q.order("created_at", desc=True).limit(limit)
            else:
                q = q.order("created_at", desc=False)
            return q.execute()

        res = await _execute_with_retry(
            build_messages_query,
            "Fetch chat session messages",
        )
        rows = res.data or []
        # If we fetched in desc order (paginated), reverse to chronological
        if limit:
            rows = list(reversed(rows))
        return rows
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Messages Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load messages for this session. Please try again.")

@router.post("/session", response_model=CreateSessionResponse, dependencies=[Depends(verify_api_key)])
async def create_session(request: Optional[CreateSessionRequest] = None, current_user: User = Depends(get_current_user)):
    """
    Create a new chat session. Optional title.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    
    new_id = str(uuid.uuid4())
    new_title = request.title if request and request.title else "New Chat"
    
    try:
        await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_sessions").insert({
                "id": new_id,
                "title": new_title,
                "context_id": request.context_id if request else None,
                "user_id": current_user.id
            }).execute(),
            "Create chat session",
        )
        # Background summarization is now triggered after AI reply, not at session creation
        return {"id": new_id, "title": new_title, "created_at": datetime.now()}
    except Exception as e:
        logger.error(f"Create Session Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to create a new chat session. Please try again.")

@router.delete("/history", dependencies=[Depends(verify_api_key)])
async def clear_history(current_user: User = Depends(get_current_user)):
    """
    Clear all chat history.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    
    try:
        # Delete only the authenticated user's sessions.
        await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_sessions").delete().eq("user_id", current_user.id).execute(),
            "Clear chat history",
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Clear History Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to clear your chat history. Please try again.")

@router.delete("/history/{session_id}", dependencies=[Depends(verify_api_key)])
async def delete_session(session_id: str, current_user: User = Depends(get_current_user)):
    """
    Delete a specific chat session.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    
    try:
        # Delete only if the session belongs to the authenticated user.
        await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_sessions").delete().eq("id", session_id).eq("user_id", current_user.id).execute(),
            "Delete chat session",
        )
        return {"status": "success", "id": session_id}
    except Exception as e:
        logger.error(f"Delete Session Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to delete this session. Please try again.")


class RenameSessionRequest(BaseModel):
    title: str


@router.patch("/history/{session_id}/rename", dependencies=[Depends(verify_api_key)])
async def rename_session(session_id: str, body: RenameSessionRequest, current_user: User = Depends(get_current_user)):
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty.")
    try:
        await _execute_with_retry(
            lambda: shared.supabase_client.table("chat_sessions")
            .update({"title": body.title.strip()})
            .eq("id", session_id)
            .eq("user_id", current_user.id)
            .execute(),
            "Rename chat session",
        )
        return {"status": "success", "id": session_id, "title": body.title.strip()}
    except Exception as e:
        logger.error(f"Rename Session Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to rename this session. Please try again.")

