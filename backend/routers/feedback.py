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

router = APIRouter(tags=["feedback"])
@router.post("/feedback", dependencies=[Depends(verify_api_key)])
async def submit_feedback(
    request: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    authorization: str = Header(None),
):
    """
    Save message feedback/report with authenticated user ownership.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    if request.rating in ("up", "down") and (request.message_id is None or request.session_id is None):
        raise HTTPException(status_code=400, detail="message_id and session_id are required for ratings")

    if request.session_id:
        await _assert_session_owner(request.session_id, current_user)

    payload = {
        "user_id": current_user.id,
        "rating": request.rating,
        "category": request.category,
        "comments": request.comments,
        "message_id": request.message_id,
        "session_id": request.session_id,
    }

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
        
    try:
        from supabase import create_client, ClientOptions
        options = ClientOptions(headers={"Authorization": authorization}) if authorization else None
        user_supabase = create_client(supabase_url, supabase_key, options=options)
        
        res = await _execute_with_retry(
            lambda: user_supabase.table("message_feedback").insert(payload).execute(),
            "Insert message feedback",
        )
        return {"status": "success", "data": res.data}
    except Exception as e:
        logger.error(f"Feedback Save Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to save your feedback. Please try again.")


