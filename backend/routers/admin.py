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

router = APIRouter(tags=["admin"])
@router.get("/admin/faculty-knowledge", dependencies=[Depends(verify_api_key)])
async def list_faculty_knowledge(current_user: User = Depends(get_current_user)):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    try:
        res = await _execute_with_retry(
            lambda: sb.table("faculty_knowledge").select("*").order("level", desc=False).execute(),
            "List faculty knowledge",
        )
        return {"data": res.data or []}
    except Exception as e:
        logger.error(f"Faculty knowledge list failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch faculty knowledge")

@router.get("/admin/timetable", dependencies=[Depends(verify_api_key)])
async def list_admin_timetable(
    level: Optional[str] = None,
    day: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    try:
        query = sb.table("timetables").select("*")

        if level:
            normalized_level = level.strip()
            level_digits = "".join(filter(str.isdigit, normalized_level))
            if level_digits:
                query = query.ilike("level", f"%{level_digits}%")
            else:
                query = query.ilike("level", f"%{normalized_level}%")

        if day:
            query = query.eq("day", day.strip().capitalize())

        try:
            res = await _execute_with_retry(
                lambda: query.order("start_time", desc=False).execute(),
                "List admin timetable ordered by start_time",
            )
        except Exception:
            res = await _execute_with_retry(
                lambda: query.order("time_slot", desc=False).execute(),
                "List admin timetable ordered by time_slot",
            )

        return {"data": res.data or []}
    except Exception as e:
        logger.error(f"Timetable list failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch timetable")


@router.post("/admin/timetable/upload", dependencies=[Depends(verify_api_key)])
async def upload_timetable_csv(
    file: UploadFile = File(...),
    level: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded CSV is empty")

    try:
        decoded = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            decoded = raw_bytes.decode("utf-8")
        except UnicodeDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Unable to decode CSV file: {e}")

    normalized_level = level.strip()
    if not normalized_level:
        raise HTTPException(status_code=400, detail="level is required")

    reader = csv.DictReader(io.StringIO(decoded))
    required_headers = {"day", "time_slot", "course_code", "course_title"}
    optional_headers = {"start_time"}
    found_headers = {h.strip() for h in (reader.fieldnames or []) if h}

    missing_headers = sorted(required_headers - found_headers)
    if missing_headers:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required CSV headers: {', '.join(missing_headers)}",
        )

    rows_to_insert = []
    for raw_row in reader:
        row = {k.strip(): (v or "").strip() for k, v in raw_row.items() if k}

        day = (row.get("day") or "").strip()
        time_slot = (row.get("time_slot") or "").strip()
        start_time = (row.get("start_time") or "").strip() if "start_time" in found_headers else ""
        course_code = (row.get("course_code") or "").strip()
        course_title = (row.get("course_title") or "").strip()

        if not day or not time_slot or not course_code:
            continue

        rows_to_insert.append({
            "level": normalized_level,
            "day": day,
            "time_slot": time_slot,
            "start_time": start_time if start_time else None,
            "course_code": course_code,
            "course_title": course_title,
        })

    if not rows_to_insert:
        raise HTTPException(status_code=400, detail="No valid data found in CSV.")

    try:
        upsert_res = await _execute_with_retry(
            lambda: sb.table("timetables").upsert(
                rows_to_insert,
                on_conflict="level,day,time_slot,course_code"
            ).execute(),
            "Upsert timetable CSV",
        )
        _timetable_cache.clear()
        return {
            "status": "success",
            "processed_rows": len(rows_to_insert),
            "upserted_rows": len(upsert_res.data or []),
        }
    except Exception as e:
        logger.error(f"Timetable CSV upload failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload timetable CSV")

@router.put("/admin/timetable/{id}", dependencies=[Depends(verify_api_key)])
async def update_timetable_entry(
    id: str,
    payload: TimetableUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    update_data = {}
    if payload.day is not None:
        day = payload.day.strip()
        if not day:
            raise HTTPException(status_code=400, detail="day cannot be empty")
        update_data["day"] = day.capitalize()
    if payload.time_slot is not None:
        time_slot = payload.time_slot.strip()
        if not time_slot:
            raise HTTPException(status_code=400, detail="time_slot cannot be empty")
        update_data["time_slot"] = time_slot
    if payload.start_time is not None:
        start_time = payload.start_time.strip()
        if not start_time:
            raise HTTPException(status_code=400, detail="start_time cannot be empty")
        update_data["start_time"] = start_time
    if payload.course_code is not None:
        course_code = payload.course_code.strip()
        if not course_code:
            raise HTTPException(status_code=400, detail="course_code cannot be empty")
        update_data["course_code"] = course_code
    if payload.course_title is not None:
        course_title = payload.course_title.strip()
        if not course_title:
            raise HTTPException(status_code=400, detail="course_title cannot be empty")
        update_data["course_title"] = course_title

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    try:
        res = await _execute_with_retry(
            lambda: sb.table("timetables").update(update_data).eq("id", id).execute(),
            "Update timetable entry",
        )
        if not (res.data or []):
            raise HTTPException(status_code=404, detail="Timetable entry not found")
        _timetable_cache.clear()
        return {"status": "success", "data": res.data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Timetable update failed for id={id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update timetable entry")


@router.delete("/admin/timetable/level/{level}", dependencies=[Depends(verify_api_key)])
async def clear_timetable_level(level: str, current_user: User = Depends(get_current_user)):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client
    normalized_level = level.strip()
    if not normalized_level:
        raise HTTPException(status_code=400, detail="level is required")

    try:
        existing = await _execute_with_retry(
            lambda: sb.table("timetables").select("id").eq("level", normalized_level).execute(),
            "Fetch timetable rows for level clear",
        )
        delete_count = len(existing.data or [])

        await _execute_with_retry(
            lambda: sb.table("timetables").delete().eq("level", normalized_level).execute(),
            "Clear timetable for level",
        )
        _timetable_cache.clear()
        return {"status": "success", "level": normalized_level, "deleted_count": delete_count}
    except Exception as e:
        logger.error(f"Timetable clear failed for level={normalized_level}: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear timetable for level")


@router.delete("/admin/timetable/{id}", dependencies=[Depends(verify_api_key)])
async def delete_timetable_entry(id: str, current_user: User = Depends(get_current_user)):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    try:
        existing = await _execute_with_retry(
            lambda: sb.table("timetables").select("id").eq("id", id).execute(),
            "Fetch timetable for delete",
        )
        if not (existing.data or []):
            raise HTTPException(status_code=404, detail="Timetable entry not found")

        await _execute_with_retry(
            lambda: sb.table("timetables").delete().eq("id", id).execute(),
            "Delete timetable entry",
        )
        _timetable_cache.clear()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Timetable delete failed for id={id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete timetable entry")


@router.post("/admin/faculty-knowledge", dependencies=[Depends(verify_api_key)])
async def create_faculty_knowledge(
    payload: FacultyKnowledgeCreateRequest,
    current_user: User = Depends(get_current_user),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    level = (payload.level or "").strip()
    knowledge_text = (payload.knowledge_text or "").strip()
    if not level:
        raise HTTPException(status_code=400, detail="level is required")
    if not knowledge_text:
        raise HTTPException(status_code=400, detail="knowledge_text is required")

    try:
        res = await _execute_with_retry(
            lambda: sb.table("faculty_knowledge")
            .insert({"level": level, "knowledge_text": knowledge_text})
            .execute(),
            "Create faculty knowledge",
        )
        _faculty_cache.clear()
        return {"status": "success", "data": res.data or []}
    except Exception as e:
        logger.error(f"Faculty knowledge create failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create faculty knowledge")


@router.put("/admin/faculty-knowledge/{id}", dependencies=[Depends(verify_api_key)])
async def update_faculty_knowledge(
    id: str,
    payload: FacultyKnowledgeUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    update_data = {}
    if payload.level is not None:
        level = payload.level.strip()
        if not level:
            raise HTTPException(status_code=400, detail="level cannot be empty")
        update_data["level"] = level
    if payload.knowledge_text is not None:
        knowledge_text = payload.knowledge_text.strip()
        if not knowledge_text:
            raise HTTPException(status_code=400, detail="knowledge_text cannot be empty")
        update_data["knowledge_text"] = knowledge_text

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    try:
        res = await _execute_with_retry(
            lambda: sb.table("faculty_knowledge").update(update_data).eq("id", id).execute(),
            "Update faculty knowledge",
        )
        if not (res.data or []):
            raise HTTPException(status_code=404, detail="Faculty knowledge entry not found")
        _faculty_cache.clear()
        return {"status": "success", "data": res.data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Faculty knowledge update failed for id={id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update faculty knowledge")


@router.delete("/admin/faculty-knowledge/{id}", dependencies=[Depends(verify_api_key)])
async def delete_faculty_knowledge(id: str, current_user: User = Depends(get_current_user)):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)
    sb = shared.supabase_service_client or shared.supabase_client

    try:
        existing = await _execute_with_retry(
            lambda: sb.table("faculty_knowledge").select("id").eq("id", id).execute(),
            "Fetch faculty knowledge for delete",
        )
        if not (existing.data or []):
            raise HTTPException(status_code=404, detail="Faculty knowledge entry not found")

        await _execute_with_retry(
            lambda: sb.table("faculty_knowledge").delete().eq("id", id).execute(),
            "Delete faculty knowledge",
        )
        _faculty_cache.clear()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Faculty knowledge delete failed for id={id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete faculty knowledge")


@router.get("/admin/feedback", dependencies=[Depends(verify_api_key)])
async def get_admin_feedback(current_user: User = Depends(get_current_user)):
    """
    Admin feedback list enriched with robust display-name fallback.
    """
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    await _assert_super_admin(current_user)

    try:
        feedback_res = await _execute_with_retry(
            lambda: shared.supabase_client.table("message_feedback")
            .select("id,rating,category,comments,created_at,session_id,message_id,user_id")
            .order("created_at", desc=True)
            .limit(500)
            .execute(),
            "Fetch admin feedback",
        )
    except Exception as e:
        logger.error(f"Feedback Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch feedback")

    rows = feedback_res.data or []
    user_ids = sorted({row.get("user_id") for row in rows if row.get("user_id")})

    profiles_by_id = {}
    if user_ids:
        try:
            profiles_res = await _execute_with_retry(
                lambda: shared.supabase_client.table("profiles")
                .select("id,first_name,other_names,university,level")
                .in_("id", user_ids)
                .execute(),
                "Fetch feedback profiles",
            )
            for profile in (profiles_res.data or []):
                profiles_by_id[profile.get("id")] = profile
        except Exception as e:
            logger.warning(f"Feedback profile join failed: {e}")

    auth_users_by_id = {}
    if shared.supabase_service_client and user_ids:
        # Find only the user IDs that are missing profile names
        missing_ids = [
            uid for uid in user_ids
            if not (profiles_by_id.get(uid, {}).get("first_name") or profiles_by_id.get(uid, {}).get("other_names"))
        ]
        if missing_ids:
            try:
                # Single batch call instead of looping
                auth_res = await asyncio.to_thread(
                    lambda: shared.supabase_service_client.auth.admin.list_users()
                )
                for user_obj in (getattr(auth_res, "users", None) or []):
                    uid = getattr(user_obj, "id", None)
                    if uid and uid in missing_ids:
                        auth_users_by_id[uid] = {
                            "email": getattr(user_obj, "email", None),
                            "user_metadata": getattr(user_obj, "user_metadata", {}) or {},
                        }
            except Exception as e:
                logger.warning(f"Batch auth metadata fetch failed: {e}")

    enriched = []
    for row in rows:
        uid = row.get("user_id")
        profile = profiles_by_id.get(uid) if uid else None
        auth_user = auth_users_by_id.get(uid) if uid else None

        first_name = (profile or {}).get("first_name") or ""
        other_names = (profile or {}).get("other_names") or ""
        profile_name = " ".join([part for part in [first_name.strip(), other_names.strip()] if part]).strip()

        metadata = (auth_user or {}).get("user_metadata", {}) if auth_user else {}
        metadata_name = (metadata.get("full_name") or metadata.get("name") or "").strip()
        auth_email = ((auth_user or {}).get("email") or "").strip()

        display_name = profile_name or metadata_name or auth_email or (f"User {uid[:8]}" if uid else "Anonymous")

        enriched.append(
            {
                **row,
                "display_name": display_name,
                "profiles": {
                    "first_name": profile.get("first_name") if profile else None,
                    "other_names": profile.get("other_names") if profile else None,
                    "university": profile.get("university") if profile else None,
                    "level": profile.get("level") if profile else None,
                    "email": auth_email or None,
                },
            }
        )

    return {"data": enriched}

