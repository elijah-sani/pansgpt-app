from fastapi import BackgroundTasks
import shutil
import subprocess

from . import shared
from . import library as library_router
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
from dependencies import get_current_admin, get_current_user_role
from restrictions import build_restriction_select, restriction_row_to_response

router = APIRouter(tags=["admin"])


class LecturerDecisionRequest(BaseModel):
    reason: Optional[str] = None


class RestrictionCancelRequest(BaseModel):
    reason: Optional[str] = None


class MaterialSubmissionReviewRequest(BaseModel):
    reason: Optional[str] = None


SUPPORTED_CONVERSION_INPUT_TYPES = {"doc", "docx", "ppt", "pptx"}
PDF_CONVERSION_UNAVAILABLE_MESSAGE = "PDF conversion is not available on this server yet."


MATERIAL_SUBMISSION_SELECT = (
    "id,university_id,lecturer_id,course_code,course_title,level,material_type,title,"
    "description,file_name,file_url,storage_provider,file_type,mime_type,is_supported_file,"
    "status,reviewed_by,reviewed_at,review_note,pans_library_id,created_at,updated_at,"
    "lecturer:lecturer_profiles!lecturer_material_submissions_lecturer_id_fkey(id,user_id,university_id,title,full_name,email,status),"
    "university:universities(id,name,status)"
)


def _lecturer_row_to_response(row: dict, include_university_details: bool = False) -> dict:
    university = row.get("university")
    if isinstance(university, list):
        university = university[0] if university else None
    if not isinstance(university, dict):
        university = {}

    payload = {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "university_id": row.get("university_id"),
        "title": row.get("title"),
        "university_name": university.get("name"),
        "full_name": row.get("full_name"),
        "email": row.get("email"),
        "phone_number": row.get("phone_number"),
        "status": row.get("status"),
        "rejection_reason": row.get("rejection_reason"),
        "approved_by": row.get("approved_by"),
        "approved_at": row.get("approved_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }
    if include_university_details:
        payload["university"] = {
            "id": university.get("id"),
            "name": university.get("name"),
            "short_name": university.get("short_name"),
            "country": university.get("country"),
            "state": university.get("state"),
            "status": university.get("status"),
        }
    return payload


def _material_submission_to_response(row: dict) -> dict:
    lecturer = row.get("lecturer")
    if isinstance(lecturer, list):
        lecturer = lecturer[0] if lecturer else None
    if not isinstance(lecturer, dict):
        lecturer = {}

    university = row.get("university")
    if isinstance(university, list):
        university = university[0] if university else None
    if not isinstance(university, dict):
        university = {}

    lecturer_name = " ".join(
        part for part in [
            (lecturer.get("title") or "").strip(),
            (lecturer.get("full_name") or "").strip(),
        ]
        if part
    ).strip() or None

    return {
        "id": row.get("id"),
        "university_id": row.get("university_id"),
        "university_name": university.get("name"),
        "lecturer_id": row.get("lecturer_id"),
        "lecturer_name": lecturer_name,
        "lecturer_email": lecturer.get("email"),
        "course_code": row.get("course_code"),
        "course_title": row.get("course_title"),
        "level": row.get("level"),
        "material_type": row.get("material_type"),
        "title": row.get("title"),
        "description": row.get("description"),
        "file_name": row.get("file_name"),
        "file_url": row.get("file_url"),
        "storage_provider": row.get("storage_provider"),
        "file_type": row.get("file_type"),
        "mime_type": row.get("mime_type"),
        "is_supported_file": bool(row.get("is_supported_file")),
        "status": row.get("status"),
        "reviewed_by": row.get("reviewed_by"),
        "reviewed_at": row.get("reviewed_at"),
        "review_note": row.get("review_note"),
        "pans_library_id": row.get("pans_library_id"),
        "library_embedding_status": None,
        "library_embedding_progress": None,
        "library_embedding_error": None,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


async def _enrich_material_submissions_with_library_state(sb, rows: list[dict]) -> list[dict]:
    library_ids = [row.get("pans_library_id") for row in rows if row.get("pans_library_id")]
    if not library_ids:
        return rows

    try:
        library_res = await _execute_with_retry(
            lambda: sb.table("pans_library")
            .select("id,embedding_status,embedding_progress,embedding_error")
            .in_("id", library_ids)
            .execute(),
            "Fetch linked library states for material submissions",
        )
    except Exception as exc:
        logger.warning("Material submission library state lookup failed: %s", exc)
        return rows

    library_by_id = {
        row.get("id"): row
        for row in (library_res.data or [])
        if row.get("id")
    }

    enriched_rows = []
    for row in rows:
        payload = dict(row)
        linked = library_by_id.get(row.get("pans_library_id"))
        if linked:
            payload["library_embedding_status"] = linked.get("embedding_status")
            payload["library_embedding_progress"] = linked.get("embedding_progress")
            payload["library_embedding_error"] = linked.get("embedding_error")
        enriched_rows.append(payload)
    return enriched_rows


async def _get_material_submission_row(sb, submission_id: str) -> dict:
    res = await _execute_with_retry(
        lambda: sb.table("lecturer_material_submissions")
        .select(MATERIAL_SUBMISSION_SELECT)
        .eq("id", submission_id)
        .limit(1)
        .execute(),
        "Fetch material submission",
    )
    rows = res.data or []
    row = rows[0] if rows else None
    if not row:
        raise HTTPException(status_code=404, detail="Material submission not found")
    return row


def _normalize_reason(value: Optional[str], *, required: bool = False) -> Optional[str]:
    if value is None:
        if required:
            raise HTTPException(status_code=400, detail="reason is required")
        return None
    normalized = str(value).strip()
    if required and not normalized:
        raise HTTPException(status_code=400, detail="reason is required")
    return normalized or None


async def _get_lecturer_row_by_id(sb, lecturer_id: str, *, include_university_details: bool = False) -> dict:
    university_select = "id,name,status"
    if include_university_details:
        university_select = "id,name,short_name,country,state,status"

    res = await _execute_with_retry(
        lambda: sb.table("lecturer_profiles")
        .select(
            "id,user_id,university_id,title,full_name,email,phone_number,"
            "status,rejection_reason,approved_by,approved_at,created_at,updated_at,"
            f"university:universities({university_select})"
        )
        .eq("id", lecturer_id)
        .limit(1)
        .execute(),
        "Fetch lecturer profile",
    )
    rows = res.data or []
    row = rows[0] if rows else None
    if not row:
        raise HTTPException(status_code=404, detail="Lecturer profile not found")
    return row


async def _insert_lecturer_audit_log(
    sb,
    *,
    actor_user_id: str,
    actor_role: str,
    lecturer_row: dict,
    action: str,
    previous_status: str,
    new_status: str,
    reason: Optional[str] = None,
) -> None:
    try:
        await _execute_with_retry(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "university_id": lecturer_row.get("university_id"),
                "action": action,
                "target_type": "lecturer_profile",
                "target_id": lecturer_row.get("id"),
                "metadata": {
                    "previous_status": previous_status,
                    "new_status": new_status,
                    "reason": reason,
                    "lecturer_email": lecturer_row.get("email"),
                    "lecturer_full_name": lecturer_row.get("full_name"),
                },
            })
            .execute(),
            f"Insert lecturer audit log ({action})",
        )
    except Exception as exc:
        logger.warning("Lecturer audit log failed for lecturer %s: %s", lecturer_row.get("id"), exc)


async def _insert_admin_restriction_audit_log(
    sb,
    *,
    actor_user_id: str,
    actor_role: str,
    restriction_row: dict,
    previous_status: str,
    reason: Optional[str] = None,
) -> None:
    lecturer = restriction_row.get("lecturer")
    if isinstance(lecturer, list):
        lecturer = lecturer[0] if lecturer else None
    if not isinstance(lecturer, dict):
        lecturer = {}

    lecturer_name = " ".join(
        part for part in [
            (lecturer.get("title") or "").strip(),
            (lecturer.get("full_name") or "").strip(),
        ]
        if part
    ).strip() or None

    try:
        await _execute_with_retry(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "university_id": restriction_row.get("university_id"),
                "action": "restriction_cancelled_by_admin",
                "target_type": "exam_restriction",
                "target_id": restriction_row.get("id"),
                "metadata": {
                    "reason": reason,
                    "previous_status": previous_status,
                    "lecturer_name": lecturer_name,
                    "lecturer_id": restriction_row.get("lecturer_id"),
                    "course_code": restriction_row.get("course_code"),
                    "course_title": restriction_row.get("course_title"),
                    "level": restriction_row.get("level"),
                    "title": restriction_row.get("title"),
                },
            })
            .execute(),
            "Insert admin restriction audit log",
        )
    except Exception as exc:
        logger.warning("Admin restriction audit log failed for restriction %s: %s", restriction_row.get("id"), exc)


async def _insert_admin_material_audit_log(
    sb,
    *,
    actor_user_id: str,
    actor_role: str,
    submission_row: dict,
    action: str,
    previous_status: str,
    reason: Optional[str] = None,
    metadata_extra: Optional[dict] = None,
) -> None:
    try:
        metadata = {
            "reason": reason,
            "previous_status": previous_status,
            "lecturer_id": submission_row.get("lecturer_id"),
            "title": submission_row.get("title"),
            "course_code": submission_row.get("course_code"),
            "course_title": submission_row.get("course_title"),
            "level": submission_row.get("level"),
            "material_type": submission_row.get("material_type"),
            "file_name": submission_row.get("file_name"),
            "storage_provider": submission_row.get("storage_provider"),
            "file_type": submission_row.get("file_type"),
            "mime_type": submission_row.get("mime_type"),
            "is_supported_file": bool(submission_row.get("is_supported_file")),
        }
        if metadata_extra:
            metadata.update(metadata_extra)

        await _execute_with_retry(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "university_id": submission_row.get("university_id"),
                "action": action,
                "target_type": "lecturer_material_submission",
                "target_id": submission_row.get("id"),
                "metadata": metadata,
            })
            .execute(),
            f"Insert admin material audit log ({action})",
        )
    except Exception as exc:
        logger.warning("Admin material audit log failed for submission %s: %s", submission_row.get("id"), exc)


def _find_soffice_binary() -> Optional[str]:
    candidates = [
        shutil.which("soffice"),
        shutil.which("soffice.exe"),
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def _convert_submission_file_to_pdf(*, source_bytes: bytes, source_file_name: str) -> tuple[str, bytes]:
    soffice_binary = _find_soffice_binary()
    if not soffice_binary:
        raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)

    source_name = (source_file_name or "").strip()
    base_name, ext = os.path.splitext(source_name)
    normalized_ext = ext.lstrip(".").lower()
    if normalized_ext not in SUPPORTED_CONVERSION_INPUT_TYPES:
        raise HTTPException(status_code=400, detail="Only DOC, DOCX, PPT, and PPTX files can be converted to PDF.")

    safe_base_name = (base_name or "lecturer-material").strip() or "lecturer-material"
    output_name = f"{safe_base_name}.pdf"

    with tempfile.TemporaryDirectory(prefix="material-convert-") as temp_dir:
        input_path = os.path.join(temp_dir, source_name or f"source.{normalized_ext}")
        with open(input_path, "wb") as source_file:
            source_file.write(source_bytes)

        command = [
            soffice_binary,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            temp_dir,
            input_path,
        ]

        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)
        except subprocess.TimeoutExpired:
            logger.error("LibreOffice conversion timed out for %s", source_file_name)
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)
        except Exception as exc:
            logger.error("LibreOffice conversion failed to start for %s: %s", source_file_name, exc)
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)

        output_path = os.path.join(temp_dir, output_name)
        if completed.returncode != 0 or not os.path.exists(output_path):
            logger.error(
                "LibreOffice conversion failed for %s: returncode=%s stdout=%s stderr=%s",
                source_file_name,
                completed.returncode,
                (completed.stdout or "").strip(),
                (completed.stderr or "").strip(),
            )
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)

        with open(output_path, "rb") as output_file:
            return output_name, output_file.read()


async def _update_lecturer_status(
    *,
    lecturer_id: str,
    current_user: User,
    allowed_statuses: set[str],
    new_status: str,
    action: str,
    reason: Optional[str] = None,
    keep_approval: bool = True,
    set_approval_to_current_user: bool = False,
    clear_approval: bool = False,
) -> dict:
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client
    lecturer_row = await _get_lecturer_row_by_id(sb, lecturer_id)
    previous_status = (lecturer_row.get("status") or "").strip().lower()
    if previous_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Cannot change lecturer status from {previous_status} to {new_status}")

    update_data = {
        "status": new_status,
        "rejection_reason": reason,
    }
    if clear_approval:
        update_data["approved_by"] = None
        update_data["approved_at"] = None
    elif set_approval_to_current_user:
        update_data["approved_by"] = current_user.id
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif not keep_approval:
        update_data["approved_by"] = None
        update_data["approved_at"] = None

    res = await _execute_with_retry(
        lambda: sb.table("lecturer_profiles")
        .update(update_data)
        .eq("id", lecturer_id)
        .execute(),
        f"Update lecturer status to {new_status}",
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Lecturer profile not found")

    updated_row = await _get_lecturer_row_by_id(sb, lecturer_id)
    actor_role = await get_current_user_role(current_user) or "admin"
    await _insert_lecturer_audit_log(
        sb,
        actor_user_id=current_user.id,
        actor_role=actor_role,
        lecturer_row=updated_row,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        reason=reason,
    )
    return _lecturer_row_to_response(updated_row)


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


@router.get("/admin/lecturers", dependencies=[Depends(verify_api_key)])
async def list_admin_lecturers(
    status: Optional[str] = None,
    university_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client

    try:
        query = sb.table("lecturer_profiles").select(
            "id,user_id,university_id,title,full_name,email,phone_number,"
            "status,rejection_reason,approved_by,approved_at,created_at,updated_at,"
            "university:universities(id,name,status)"
        )

        normalized_status = (status or "").strip().lower()
        if normalized_status:
            if normalized_status not in {"pending", "active", "rejected", "suspended", "revoked"}:
                raise HTTPException(status_code=400, detail="Invalid lecturer status filter")
            query = query.eq("status", normalized_status)

        normalized_university_id = (university_id or "").strip()
        if normalized_university_id:
            query = query.eq("university_id", normalized_university_id)

        normalized_search = (search or "").strip()
        if normalized_search:
            escaped_search = normalized_search.replace(",", r"\,")
            query = query.or_(
                f"full_name.ilike.%{escaped_search}%,email.ilike.%{escaped_search}%"
            )

        res = await _execute_with_retry(
            lambda: query.order("created_at", desc=True).execute(),
            "List admin lecturers",
        )
        return {"data": [_lecturer_row_to_response(row) for row in (res.data or [])]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Lecturer list failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch lecturer profiles")


@router.get("/admin/material-submissions", dependencies=[Depends(verify_api_key)])
async def list_admin_material_submissions(
    status: Optional[str] = None,
    university_id: Optional[str] = None,
    lecturer_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client

    try:
        query = sb.table("lecturer_material_submissions").select(MATERIAL_SUBMISSION_SELECT)

        normalized_status = (status or "").strip().lower()
        if normalized_status:
            allowed_statuses = {"pending_review", "approved", "rejected", "ingesting", "ingested", "failed"}
            if normalized_status not in allowed_statuses:
                raise HTTPException(status_code=400, detail="Invalid material submission status filter")
            query = query.eq("status", normalized_status)

        normalized_university_id = (university_id or "").strip()
        if normalized_university_id:
            query = query.eq("university_id", normalized_university_id)

        normalized_lecturer_id = (lecturer_id or "").strip()
        if normalized_lecturer_id:
            query = query.eq("lecturer_id", normalized_lecturer_id)

        res = await _execute_with_retry(
            lambda: query.order("created_at", desc=True).execute(),
            "List material submissions",
        )
        rows = [_material_submission_to_response(row) for row in (res.data or [])]
        rows = await _enrich_material_submissions_with_library_state(sb, rows)

        normalized_search = (search or "").strip().lower()
        if normalized_search:
            rows = [
                row for row in rows
                if normalized_search in " ".join(
                    str(row.get(field) or "").lower()
                    for field in (
                        "title",
                        "course_code",
                        "course_title",
                        "level",
                        "material_type",
                        "description",
                        "file_name",
                        "file_type",
                        "mime_type",
                        "lecturer_name",
                        "lecturer_email",
                        "university_name",
                    )
                )
            ]

        return {"data": rows}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Material submission list failed")
        raise HTTPException(status_code=500, detail="Failed to fetch material submissions")


@router.patch("/admin/material-submissions/{submission_id}/approve", dependencies=[Depends(verify_api_key)])
async def approve_material_submission(
    submission_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_admin),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client

    try:
        submission_row = await _get_material_submission_row(sb, submission_id)
        previous_status = (submission_row.get("status") or "").strip().lower()
        if previous_status != "pending_review":
            raise HTTPException(status_code=400, detail="Only pending submissions can be approved")

        submission_payload = _material_submission_to_response(submission_row)
        if not submission_payload.get("is_supported_file"):
            raise HTTPException(
                status_code=400,
                detail="Only PDF materials can be approved for ingestion. Please convert this file to PDF first.",
            )

        drive_file_id = library_router.extract_drive_file_id(submission_payload.get("file_url"))
        if not drive_file_id:
            raise HTTPException(status_code=400, detail="Submitted material does not have a valid Drive file link")

        title = _normalize_reason(submission_payload.get("title"))
        course_code = _normalize_reason(submission_payload.get("course_code"))
        if not title:
            raise HTTPException(status_code=400, detail="Submitted material is missing a topic/title")
        if not course_code:
            raise HTTPException(status_code=400, detail="Submitted material is missing a course code")

        lecturer_name = _normalize_reason(submission_payload.get("lecturer_name")) or "Lecturer"
        file_name = _normalize_reason(submission_payload.get("file_name")) or "lecturer-material.pdf"
        target_levels = library_router.build_library_target_levels(submission_payload.get("level"))

        library_result = await library_router.create_library_document_from_existing_drive_file(
            background_tasks=background_tasks,
            drive_file_id=drive_file_id,
            title=title,
            course_code=course_code,
            lecturer_name=lecturer_name,
            topic=title,
            file_name=file_name,
            university_id=submission_payload.get("university_id"),
            uploaded_by_email=submission_payload.get("lecturer_email"),
            target_levels=target_levels,
        )
        library_document_id = library_result.get("document_id")
        if not library_document_id:
            raise HTTPException(status_code=500, detail="Material was approved but could not be linked to the library")

        reviewed_at = datetime.now(timezone.utc).isoformat()
        update_res = await _execute_with_retry(
            lambda: sb.table("lecturer_material_submissions")
            .update({
                "status": "approved",
                "reviewed_by": current_user.id,
                "reviewed_at": reviewed_at,
                "pans_library_id": library_document_id,
            })
            .eq("id", submission_id)
            .execute(),
            "Approve material submission",
        )
        if not (update_res.data or []):
            raise HTTPException(status_code=404, detail="Material submission not found")

        updated_row = await _get_material_submission_row(sb, submission_id)
        actor_role = await get_current_user_role(current_user) or "admin"
        await _insert_admin_material_audit_log(
            sb,
            actor_user_id=current_user.id,
            actor_role=actor_role,
            submission_row=submission_row,
            action="material_approved",
            previous_status=previous_status,
            reason=f"pans_library_id={library_document_id}; ingestion_status={library_result.get('status')}",
        )

        return {"data": _material_submission_to_response(updated_row)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Material submission approval failed for %s: %s", submission_id, exc)
        raise HTTPException(status_code=500, detail="Failed to approve material submission")


@router.post("/admin/material-submissions/{submission_id}/convert-to-pdf", dependencies=[Depends(verify_api_key)])
async def convert_material_submission_to_pdf(
    submission_id: str,
    current_user: User = Depends(get_current_admin),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client

    try:
        submission_row = await _get_material_submission_row(sb, submission_id)
        previous_status = (submission_row.get("status") or "").strip().lower()
        if previous_status != "pending_review":
            raise HTTPException(status_code=400, detail="Only pending submissions can be converted")

        submission_payload = _material_submission_to_response(submission_row)
        if submission_payload.get("is_supported_file"):
            raise HTTPException(status_code=400, detail="This submission is already a supported PDF file.")

        original_file_type = (submission_payload.get("file_type") or "").strip().lower()
        if original_file_type not in SUPPORTED_CONVERSION_INPUT_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Only DOC, DOCX, PPT, and PPTX files can be converted to PDF.",
            )

        drive_service = library_router.drive_service
        if not drive_service:
            raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")

        drive_file_id = library_router.extract_drive_file_id(submission_payload.get("file_url"))
        if not drive_file_id:
            raise HTTPException(status_code=400, detail="Submitted material does not have a valid Drive file link")

        try:
            source_bytes = await asyncio.to_thread(drive_service.download_file_bytes, drive_file_id)
            if not source_bytes:
                raise ValueError("Downloaded file is empty")
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Material conversion download failed for %s: %s", submission_id, exc)
            raise HTTPException(status_code=500, detail="Unable to download material from storage. Please try again.")

        converted_file_name, converted_pdf_bytes = await asyncio.to_thread(
            _convert_submission_file_to_pdf,
            source_bytes=source_bytes,
            source_file_name=submission_payload.get("file_name") or f"submission.{original_file_type}",
        )

        converted_stream = io.BytesIO(converted_pdf_bytes)
        try:
            converted_drive_file_id = await asyncio.to_thread(
                drive_service.upload_file,
                converted_file_name,
                converted_stream,
                "application/pdf",
                library_router.GOOGLE_DRIVE_FOLDER_ID,
                len(converted_pdf_bytes),
            )
        except Exception as exc:
            logger.error("Material conversion upload failed for %s: %s", submission_id, exc)
            raise HTTPException(status_code=500, detail="Unable to store converted PDF. Please try again.")

        converted_file_url = f"https://drive.google.com/file/d/{converted_drive_file_id}/view"
        update_res = await _execute_with_retry(
            lambda: sb.table("lecturer_material_submissions")
            .update({
                "file_name": converted_file_name,
                "file_url": converted_file_url,
                "file_type": "pdf",
                "mime_type": "application/pdf",
                "is_supported_file": True,
            })
            .eq("id", submission_id)
            .execute(),
            "Convert material submission to PDF",
        )
        if not (update_res.data or []):
            raise HTTPException(status_code=404, detail="Material submission not found")

        updated_row = await _get_material_submission_row(sb, submission_id)
        actor_role = await get_current_user_role(current_user) or "admin"
        await _insert_admin_material_audit_log(
            sb,
            actor_user_id=current_user.id,
            actor_role=actor_role,
            submission_row=submission_row,
            action="material_converted_to_pdf",
            previous_status=previous_status,
            metadata_extra={
                "original_file_name": submission_payload.get("file_name"),
                "original_file_type": submission_payload.get("file_type"),
                "converted_pdf_name": converted_file_name,
                "original_drive_file_id": drive_file_id,
                "converted_drive_file_id": converted_drive_file_id,
            },
        )

        return {"data": _material_submission_to_response(updated_row)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Material submission conversion failed for %s: %s", submission_id, exc)
        raise HTTPException(status_code=500, detail="Failed to convert material submission to PDF")


@router.patch("/admin/material-submissions/{submission_id}/reject", dependencies=[Depends(verify_api_key)])
async def reject_material_submission(
    submission_id: str,
    payload: MaterialSubmissionReviewRequest,
    current_user: User = Depends(get_current_admin),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client
    reason = _normalize_reason(payload.reason, required=True)

    try:
        submission_row = await _get_material_submission_row(sb, submission_id)
        previous_status = (submission_row.get("status") or "").strip().lower()
        if previous_status != "pending_review":
            raise HTTPException(status_code=400, detail="Only pending submissions can be rejected")

        reviewed_at = datetime.now(timezone.utc).isoformat()
        update_res = await _execute_with_retry(
            lambda: sb.table("lecturer_material_submissions")
            .update({
                "status": "rejected",
                "reviewed_by": current_user.id,
                "reviewed_at": reviewed_at,
                "review_note": reason,
            })
            .eq("id", submission_id)
            .execute(),
            "Reject material submission",
        )
        if not (update_res.data or []):
            raise HTTPException(status_code=404, detail="Material submission not found")

        updated_row = await _get_material_submission_row(sb, submission_id)
        actor_role = await get_current_user_role(current_user) or "admin"
        await _insert_admin_material_audit_log(
            sb,
            actor_user_id=current_user.id,
            actor_role=actor_role,
            submission_row=submission_row,
            action="material_rejected",
            previous_status=previous_status,
            reason=reason,
        )

        return {"data": _material_submission_to_response(updated_row)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Material submission rejection failed for %s: %s", submission_id, exc)
        raise HTTPException(status_code=500, detail="Failed to reject material submission")


@router.get("/admin/restrictions", dependencies=[Depends(verify_api_key)])
async def list_admin_restrictions(
    status: Optional[str] = None,
    university_id: Optional[str] = None,
    level: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client

    try:
        query = sb.table("exam_restrictions").select(build_restriction_select())

        normalized_status = (status or "").strip().lower()
        if normalized_status:
            if normalized_status not in {"scheduled", "active", "completed", "cancelled"}:
                raise HTTPException(status_code=400, detail="Invalid restriction status filter")

        normalized_university_id = (university_id or "").strip()
        if normalized_university_id:
            query = query.eq("university_id", normalized_university_id)

        normalized_level = (level or "").strip()
        if normalized_level:
            query = query.eq("level", normalized_level)

        res = await _execute_with_retry(
            lambda: query.order("created_at", desc=True).execute(),
            "List admin restrictions",
        )

        rows = [restriction_row_to_response(row) for row in (res.data or [])]
        if normalized_status:
            rows = [row for row in rows if row.get("status") == normalized_status]

        normalized_search = (search or "").strip().lower()
        if normalized_search:
            rows = [
                row for row in rows
                if normalized_search in " ".join(
                    str(row.get(field) or "").lower()
                    for field in (
                        "title",
                        "course_code",
                        "course_title",
                        "reason",
                        "lecturer_name",
                        "university_name",
                        "level",
                    )
                )
            ]

        return {"data": rows}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Restriction list failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch restrictions")


@router.patch("/admin/restrictions/{restriction_id}/cancel", dependencies=[Depends(verify_api_key)])
async def cancel_admin_restriction(
    restriction_id: str,
    payload: RestrictionCancelRequest,
    current_user: User = Depends(get_current_admin),
):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client
    reason = _normalize_reason(payload.reason)

    try:
        restriction_res = await _execute_with_retry(
            lambda: sb.table("exam_restrictions")
            .select(build_restriction_select())
            .eq("id", restriction_id)
            .limit(1)
            .execute(),
            "Fetch restriction for admin cancel",
        )
        restriction_rows = restriction_res.data or []
        restriction_row = restriction_rows[0] if restriction_rows else None
        if not restriction_row:
            raise HTTPException(status_code=404, detail="Restriction not found")

        previous_status = restriction_row_to_response(restriction_row).get("status")
        if previous_status not in {"scheduled", "active"}:
            raise HTTPException(status_code=400, detail="Only scheduled or active restrictions can be cancelled")

        cancelled_at = datetime.now(timezone.utc).isoformat()
        update_res = await _execute_with_retry(
            lambda: sb.table("exam_restrictions")
            .update({
                "status": "cancelled",
                "cancelled_by": current_user.id,
                "cancelled_at": cancelled_at,
            })
            .eq("id", restriction_id)
            .execute(),
            "Cancel restriction as admin",
        )
        if not (update_res.data or []):
            raise HTTPException(status_code=404, detail="Restriction not found")

        updated_res = await _execute_with_retry(
            lambda: sb.table("exam_restrictions")
            .select(build_restriction_select())
            .eq("id", restriction_id)
            .limit(1)
            .execute(),
            "Fetch cancelled restriction",
        )
        updated_rows = updated_res.data or []
        updated_row = updated_rows[0] if updated_rows else restriction_row

        actor_role = await get_current_user_role(current_user) or "admin"
        await _insert_admin_restriction_audit_log(
            sb,
            actor_user_id=current_user.id,
            actor_role=actor_role,
            restriction_row=restriction_row,
            previous_status=str(previous_status),
            reason=reason,
        )

        return {"data": restriction_row_to_response(updated_row)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Admin restriction cancel failed for %s: %s", restriction_id, exc)
        raise HTTPException(status_code=500, detail="Failed to cancel restriction")


@router.get("/admin/lecturers/{lecturer_id}", dependencies=[Depends(verify_api_key)])
async def get_admin_lecturer(lecturer_id: str, current_user: User = Depends(get_current_admin)):
    if not shared.supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    sb = shared.supabase_service_client or shared.supabase_client
    try:
        lecturer_row = await _get_lecturer_row_by_id(sb, lecturer_id, include_university_details=True)
        return _lecturer_row_to_response(lecturer_row, include_university_details=True)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Lecturer detail fetch failed for %s: %s", lecturer_id, exc)
        raise HTTPException(status_code=500, detail="Failed to fetch lecturer profile")


@router.patch("/admin/lecturers/{lecturer_id}/approve", dependencies=[Depends(verify_api_key)])
async def approve_lecturer(lecturer_id: str, current_user: User = Depends(get_current_admin)):
    return await _update_lecturer_status(
        lecturer_id=lecturer_id,
        current_user=current_user,
        allowed_statuses={"pending", "rejected", "suspended"},
        new_status="active",
        action="lecturer_approved",
        reason=None,
        set_approval_to_current_user=True,
    )


@router.patch("/admin/lecturers/{lecturer_id}/reject", dependencies=[Depends(verify_api_key)])
async def reject_lecturer(
    lecturer_id: str,
    payload: LecturerDecisionRequest,
    current_user: User = Depends(get_current_admin),
):
    reason = _normalize_reason(payload.reason, required=True)
    return await _update_lecturer_status(
        lecturer_id=lecturer_id,
        current_user=current_user,
        allowed_statuses={"pending"},
        new_status="rejected",
        action="lecturer_rejected",
        reason=reason,
        clear_approval=True,
    )


@router.patch("/admin/lecturers/{lecturer_id}/suspend", dependencies=[Depends(verify_api_key)])
async def suspend_lecturer(
    lecturer_id: str,
    payload: LecturerDecisionRequest,
    current_user: User = Depends(get_current_admin),
):
    reason = _normalize_reason(payload.reason)
    return await _update_lecturer_status(
        lecturer_id=lecturer_id,
        current_user=current_user,
        allowed_statuses={"active"},
        new_status="suspended",
        action="lecturer_suspended",
        reason=reason,
        keep_approval=True,
    )


@router.patch("/admin/lecturers/{lecturer_id}/revoke", dependencies=[Depends(verify_api_key)])
async def revoke_lecturer(
    lecturer_id: str,
    payload: LecturerDecisionRequest,
    current_user: User = Depends(get_current_admin),
):
    reason = _normalize_reason(payload.reason)
    return await _update_lecturer_status(
        lecturer_id=lecturer_id,
        current_user=current_user,
        allowed_statuses={"active", "suspended"},
        new_status="revoked",
        action="lecturer_revoked",
        reason=reason,
        keep_approval=True,
    )


@router.patch("/admin/lecturers/{lecturer_id}/reactivate", dependencies=[Depends(verify_api_key)])
async def reactivate_lecturer(lecturer_id: str, current_user: User = Depends(get_current_admin)):
    return await _update_lecturer_status(
        lecturer_id=lecturer_id,
        current_user=current_user,
        allowed_statuses={"suspended"},
        new_status="active",
        action="lecturer_reactivated",
        reason=None,
        set_approval_to_current_user=True,
    )

