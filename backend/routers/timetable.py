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
        student_context = await shared.resolve_student_university_context(current_user)
        student_university_id = student_context.get("university_id")
        if not profile_level:
            profile_level = (student_context.get("level") or "").strip()

        level_digits = "".join(filter(str.isdigit, profile_level))
        nigeria_now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=1)))
        current_day = nigeria_now.strftime("%A")

        if not student_university_id:
            logger.info("Returning empty today timetable for user_id=%s because university_id is missing", current_user.id)
            return {
                "day": current_day,
                "level": profile_level or None,
                "level_digits": None,
                "classes": [],
                "detail": "Complete your profile with your university to see your timetable.",
            }

        if not level_digits:
            return {
                "day": current_day,
                "level": profile_level or None,
                "level_digits": None,
                "classes": [],
                "university_id": student_university_id,
            }

        try:
            timetable_res = await _execute_with_retry(
                lambda: sb.table("timetables")
                .select("*")
                .eq("university_id", student_university_id)
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
                .eq("university_id", student_university_id)
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
            "university_id": student_university_id,
            "classes": timetable_res.data or [],
        }
    except HTTPException:
        raise
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
        student_context = await shared.resolve_student_university_context(current_user)
        student_university_id = student_context.get("university_id")
        if not profile_level:
            profile_level = (student_context.get("level") or "").strip()

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

        if not student_university_id:
            logger.info("Returning empty weekly timetable for user_id=%s because university_id is missing", current_user.id)
            return grouped

        if not level_digits:
            return grouped

        try:
            timetable_res = await _execute_with_retry(
                lambda: sb.table("timetables")
                .select("*")
                .eq("university_id", student_university_id)
                .ilike("level", f"%{level_digits}%")
                .order("start_time", desc=False)
                .execute(),
                "Fetch weekly timetable ordered by start_time",
            )
        except Exception:
            timetable_res = await _execute_with_retry(
                lambda: sb.table("timetables")
                .select("*")
                .eq("university_id", student_university_id)
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch weekly timetable: {e}")
        raise HTTPException(status_code=500, detail="Unable to load your weekly timetable. Please try again.")

