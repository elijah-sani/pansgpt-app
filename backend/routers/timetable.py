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

router = APIRouter(tags=["timetable"])
@router.get("/timetable/today", dependencies=[Depends(verify_api_key)])
async def get_today_timetable(
    level: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    sb = shared.supabase_service_client or shared.supabase_client

    try:
        profile_level = (level or "").strip()
        if not profile_level:
            profile_res = await _execute_with_retry(
                lambda: sb.table("profiles").select("level").eq("id", current_user.id).limit(1).execute(),
                "Fetch user level for timetable",
            )
            if profile_res.data and len(profile_res.data) > 0:
                profile_level = (profile_res.data[0].get("level") or "").strip()

        level_digits = "".join(filter(str.isdigit, profile_level))
        nigeria_now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=1)))
        current_day = nigeria_now.strftime("%A")

        if not level_digits:
            return {
                "day": current_day,
                "level": profile_level or None,
                "level_digits": None,
                "classes": [],
            }

        try:
            timetable_res = await _execute_with_retry(
                lambda: sb.table("timetables")
                .select("*")
                .eq("day", current_day)
                .ilike("level", f"%{level_digits}%")
                .order("start_time", desc=False)
                .execute(),
                "Fetch today's timetable ordered by start_time",
            )
        except Exception:
            timetable_res = await _execute_with_retry(
                lambda: sb.table("timetables")
                .select("*")
                .eq("day", current_day)
                .ilike("level", f"%{level_digits}%")
                .order("time_slot", desc=False)
                .execute(),
                "Fetch today's timetable ordered by time_slot",
            )

        return {
            "day": current_day,
            "level": profile_level or None,
            "level_digits": level_digits,
            "classes": timetable_res.data or [],
        }
    except Exception as e:
        logger.error(f"Failed to fetch today's timetable: {e}")
        raise HTTPException(status_code=500, detail="Unable to load today's timetable. Please try again.")


@router.get("/timetable/week", dependencies=[Depends(verify_api_key)])
async def get_week_timetable(
    level: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    sb = shared.supabase_service_client or shared.supabase_client

    try:
        profile_level = (level or "").strip()
        if not profile_level:
            profile_res = await _execute_with_retry(
                lambda: sb.table("profiles").select("level").eq("id", current_user.id).limit(1).execute(),
                "Fetch user level for weekly timetable",
            )
            if profile_res.data and len(profile_res.data) > 0:
                profile_level = (profile_res.data[0].get("level") or "").strip()

        level_digits = "".join(filter(str.isdigit, profile_level))
        grouped = {
            "Monday": [],
            "Tuesday": [],
            "Wednesday": [],
            "Thursday": [],
            "Friday": [],
            "Saturday": [],
            "Sunday": [],
        }

        if not level_digits:
            return grouped

        try:
            timetable_res = await _execute_with_retry(
                lambda: sb.table("timetables")
                .select("*")
                .ilike("level", f"%{level_digits}%")
                .order("start_time", desc=False)
                .execute(),
                "Fetch weekly timetable ordered by start_time",
            )
        except Exception:
            timetable_res = await _execute_with_retry(
                lambda: sb.table("timetables")
                .select("*")
                .ilike("level", f"%{level_digits}%")
                .order("time_slot", desc=False)
                .execute(),
                "Fetch weekly timetable ordered by time_slot",
            )

        for row in (timetable_res.data or []):
            day = (row.get("day") or "").strip().capitalize()
            if day in grouped:
                grouped[day].append(row)

        return grouped
    except Exception as e:
        logger.error(f"Failed to fetch weekly timetable: {e}")
        raise HTTPException(status_code=500, detail="Unable to load your weekly timetable. Please try again.")

