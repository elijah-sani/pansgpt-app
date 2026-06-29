import asyncio
import os
from datetime import timedelta
from email.utils import parseaddr
from uuid import uuid4
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict
from typing import Optional
import logging

from dependencies import User, get_current_active_lecturer, get_current_user
from google_drive import DriveUploadTemporaryError
from restrictions import (
    build_restriction_select,
    compute_restriction_status,
    normalize_optional_text,
    parse_timestamp,
    restriction_row_to_response,
    utc_now,
)

logger = logging.getLogger("PansGPT")

router = APIRouter(tags=["lecturer"])

supabase_client = None
supabase_service_client = None
verify_api_key_handler = None
drive_service = None
GOOGLE_DRIVE_FOLDER_ID = None
LECTURER_TITLES = {"Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Pharm", "Pharm Dr"}


class LecturerRegistrationRequest(BaseModel):
    email: str
    password: str
    university_id: str
    title: str
    full_name: str
    phone_number: str

    model_config = ConfigDict(extra="forbid")


class RestrictionCreateRequest(BaseModel):
    title: Optional[str] = None
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    level: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    reason: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class MaterialSubmissionCancelRequest(BaseModel):
    reason: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


MATERIAL_SUBMISSION_SELECT = (
    "id,university_id,lecturer_id,course_code,course_title,level,material_type,title,"
    "description,file_name,file_url,storage_provider,file_type,mime_type,is_supported_file,"
    "status,reviewed_by,reviewed_at,review_note,pans_library_id,cancelled_at,cancelled_by,"
    "cancellation_reason,drive_file_id,original_drive_file_id,converted_drive_file_id,resubmitted_from_id,created_at,updated_at,"
    "lecturer:lecturer_profiles!lecturer_material_submissions_lecturer_id_fkey(title,full_name,email),"
    "university:universities(name)"
)

SUPPORTED_MATERIAL_FILE_TYPES = {"pdf"}


def _detect_material_file_type(file_name: Optional[str], mime_type: Optional[str]) -> tuple[Optional[str], Optional[str], bool]:
    normalized_file_name = _normalize_optional(file_name) or ""
    normalized_mime_type = _normalize_optional(mime_type)
    normalized_mime_type = normalized_mime_type.lower() if normalized_mime_type else None

    file_type = None
    _, ext = os.path.splitext(normalized_file_name)
    if ext:
        file_type = ext.lstrip(".").strip().lower() or None

    if not file_type and normalized_mime_type == "application/pdf":
        file_type = "pdf"

    is_supported_file = file_type in SUPPORTED_MATERIAL_FILE_TYPES
    return file_type, normalized_mime_type, is_supported_file


async def verify_api_key(x_api_key: str = Header(...)):
    if verify_api_key_handler is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return await verify_api_key_handler(x_api_key)


def _db():
    return supabase_service_client or supabase_client


def _normalize_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalize_email(value: Optional[str]) -> Optional[str]:
    normalized = _normalize_optional(value)
    if not normalized:
        return None

    display_name, parsed_email = parseaddr(normalized)
    candidate = (parsed_email or normalized).strip().lower()
    if display_name:
        candidate = parsed_email.strip().lower()

    if candidate.count("@") != 1:
        return None

    local_part, domain = candidate.split("@", 1)
    if not local_part or not domain or "." not in domain:
        return None

    return candidate


def _lecturer_profile_to_response(lecturer_profile) -> dict:
    return {
        "id": lecturer_profile["id"],
        "user_id": lecturer_profile["user_id"],
        "university_id": lecturer_profile["university_id"],
        "university_name": lecturer_profile["university_name"],
        "title": lecturer_profile["title"],
        "full_name": lecturer_profile["full_name"],
        "email": lecturer_profile["email"],
        "phone_number": lecturer_profile["phone_number"],
        "status": lecturer_profile["status"],
    }


async def _run_db(execute_fn):
    return await asyncio.to_thread(execute_fn)


async def _insert_restriction_audit_log(
    *,
    actor_user_id: str,
    actor_role: str,
    university_id: str,
    restriction_id: str,
    action: str,
    metadata: dict,
) -> None:
    sb = _db()
    if not sb:
        return

    try:
        await _run_db(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "university_id": university_id,
                "action": action,
                "target_type": "exam_restriction",
                "target_id": restriction_id,
                "metadata": metadata,
            })
            .execute()
        )
    except Exception as exc:
        logger.warning("Restriction audit log failed for %s: %s", restriction_id, exc)


async def _insert_material_audit_log(
    *,
    actor_user_id: str,
    actor_role: str,
    university_id: str,
    submission_id: str,
    action: str,
    metadata: dict,
) -> None:
    sb = _db()
    if not sb:
        return

    try:
        await _run_db(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "university_id": university_id,
                "action": action,
                "target_type": "lecturer_material_submission",
                "target_id": submission_id,
                "metadata": metadata,
            })
            .execute()
        )
    except Exception as exc:
        logger.warning("Material submission audit log failed for %s: %s", submission_id, exc)


async def _insert_material_cleanup_audit_log(
    *,
    actor_user_id: str,
    actor_role: str,
    university_id: str,
    action: str,
    metadata: dict,
    submission_id: Optional[str] = None,
) -> None:
    sb = _db()
    if not sb:
        return

    try:
        await _run_db(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": actor_user_id,
                "actor_role": actor_role,
                "university_id": university_id,
                "action": action,
                "target_type": "lecturer_material_submission",
                "target_id": submission_id,
                "metadata": metadata,
            })
            .execute()
        )
    except Exception as exc:
        logger.warning("Material cleanup audit log failed for %s: %s", submission_id or "upload", exc)


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
        "cancelled_at": row.get("cancelled_at"),
        "cancelled_by": row.get("cancelled_by"),
        "cancellation_reason": row.get("cancellation_reason"),
        "drive_file_id": row.get("drive_file_id"),
        "original_drive_file_id": row.get("original_drive_file_id"),
        "converted_drive_file_id": row.get("converted_drive_file_id"),
        "resubmitted_from_id": row.get("resubmitted_from_id"),
        "has_resubmission": bool(row.get("has_resubmission")),
        "latest_resubmission_id": row.get("latest_resubmission_id"),
        "library_embedding_status": row.get("library_embedding_status"),
        "library_embedding_progress": row.get("library_embedding_progress"),
        "library_embedding_error": row.get("library_embedding_error"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


async def _enrich_material_submissions_with_library_state(rows: list[dict]) -> list[dict]:
    library_ids = [row.get("pans_library_id") for row in rows if row.get("pans_library_id")]
    if not library_ids:
        return rows

    sb = _db()
    if not sb:
        return rows

    try:
        library_res = await _run_db(
            lambda: sb.table("pans_library")
            .select("id,embedding_status,embedding_progress,embedding_error")
            .in_("id", library_ids)
            .execute()
        )
    except Exception as exc:
        logger.warning("Lecturer material library state lookup failed: %s", exc)
        return rows

    by_id = {row.get("id"): row for row in (library_res.data or []) if row.get("id")}
    enriched: list[dict] = []
    for row in rows:
        payload = dict(row)
        linked = by_id.get(row.get("pans_library_id"))
        if linked:
            payload["library_embedding_status"] = linked.get("embedding_status")
            payload["library_embedding_progress"] = linked.get("embedding_progress")
            payload["library_embedding_error"] = linked.get("embedding_error")
        enriched.append(payload)
    return enriched


async def _enrich_material_submissions_with_resubmission_state(rows: list[dict]) -> list[dict]:
    submission_ids = [str(row.get("id")) for row in rows if row.get("id")]
    if not submission_ids:
        return rows

    sb = _db()
    if not sb:
        return rows

    try:
        child_res = await _run_db(
            lambda: sb.table("lecturer_material_submissions")
            .select("id,resubmitted_from_id")
            .in_("resubmitted_from_id", submission_ids)
            .execute()
        )
    except Exception as exc:
        logger.warning("Lecturer material resubmission state lookup failed: %s", exc)
        return rows

    latest_by_parent: dict[str, str] = {}
    for child_row in (child_res.data or []):
        parent_id = str(child_row.get("resubmitted_from_id") or "").strip()
        child_id = str(child_row.get("id") or "").strip()
        if parent_id and child_id:
            latest_by_parent[parent_id] = child_id

    enriched: list[dict] = []
    for row in rows:
        payload = dict(row)
        row_id = str(row.get("id") or "").strip()
        payload["latest_resubmission_id"] = latest_by_parent.get(row_id)
        payload["has_resubmission"] = bool(payload["latest_resubmission_id"])
        enriched.append(payload)
    return enriched


async def _serialize_material_submission_rows(rows: list[dict]) -> list[dict]:
    payload_rows = [_material_submission_to_response(row) for row in rows]
    payload_rows = await _enrich_material_submissions_with_library_state(payload_rows)
    payload_rows = await _enrich_material_submissions_with_resubmission_state(payload_rows)
    return payload_rows


async def _serialize_material_submission_row(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return None
    rows = await _serialize_material_submission_rows([row])
    return rows[0] if rows else None


async def _get_material_submission_by_id(submission_id: str) -> Optional[dict]:
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        res = await _run_db(
            lambda: sb.table("lecturer_material_submissions")
            .select(MATERIAL_SUBMISSION_SELECT)
            .eq("id", submission_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Material submission lookup failed for %s: %s", submission_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load material submission")

    rows = res.data or []
    return rows[0] if rows else None


async def _get_material_submission_child_resubmission(parent_submission_id: str) -> Optional[dict]:
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        res = await _run_db(
            lambda: sb.table("lecturer_material_submissions")
            .select("id,status,lecturer_id,university_id,resubmitted_from_id")
            .eq("resubmitted_from_id", parent_submission_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Material submission child lookup failed for %s: %s", parent_submission_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load material submission")

    rows = res.data or []
    return rows[0] if rows else None


def _resolve_material_metadata(
    *,
    level: Optional[str],
    course_code: Optional[str],
    topic: Optional[str],
    course_title: Optional[str],
    fallback_row: Optional[dict] = None,
) -> dict:
    resolved_level = normalize_optional_text(level)
    resolved_course_code = normalize_optional_text(course_code)
    resolved_topic = normalize_optional_text(topic)
    resolved_course_title = normalize_optional_text(course_title)

    if fallback_row:
        resolved_level = resolved_level or normalize_optional_text(fallback_row.get("level"))
        resolved_course_code = resolved_course_code or normalize_optional_text(fallback_row.get("course_code"))
        resolved_topic = resolved_topic or normalize_optional_text(fallback_row.get("title"))
        if resolved_course_title is None:
            resolved_course_title = normalize_optional_text(fallback_row.get("course_title"))

    if not resolved_level:
        raise HTTPException(status_code=400, detail="level is required")
    if not resolved_course_code:
        raise HTTPException(status_code=400, detail="course_code is required")
    if not resolved_topic:
        raise HTTPException(status_code=400, detail="topic is required")

    return {
        "level": resolved_level,
        "course_code": resolved_course_code,
        "topic": resolved_topic,
        "course_title": resolved_course_title,
    }


def _read_upload_file_size(file: UploadFile) -> int:
    try:
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        return file_size
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to process the file. Please try again.")


async def _upload_material_file_to_drive(*, file: UploadFile, lecturer_profile) -> tuple[str, str, Optional[str], Optional[str], bool, int]:
    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")
    if not (GOOGLE_DRIVE_FOLDER_ID or "").strip():
        raise HTTPException(status_code=503, detail="Google Drive upload folder is not configured.")

    original_file_name = normalize_optional_text(file.filename)
    if not original_file_name:
        raise HTTPException(status_code=400, detail="file is required")

    file_type, mime_type, is_supported_file = _detect_material_file_type(original_file_name, file.content_type)
    file_size = _read_upload_file_size(file)

    try:
        file_ext = os.path.splitext(original_file_name)[1] or ".pdf"
        unique_filename = f"lecturer-material-{uuid4()}{file_ext}"
        logger.info(
            "Lecturer material upload starting: lecturer_id=%s file_name=%s unique_name=%s mime_type=%s file_size=%s folder_id=%s",
            lecturer_profile.id,
            original_file_name,
            unique_filename,
            file.content_type or "application/octet-stream",
            file_size,
            GOOGLE_DRIVE_FOLDER_ID,
        )
        drive_file_id = await asyncio.to_thread(
            drive_service.upload_file,
            unique_filename,
            file.file,
            file.content_type or "application/octet-stream",
            GOOGLE_DRIVE_FOLDER_ID,
            file_size,
        )
    except Exception as exc:
        logger.exception(
            "Lecturer material file upload failed: lecturer_id=%s file_name=%s mime_type=%s file_size=%s folder_id=%s error_type=%s",
            lecturer_profile.id,
            original_file_name,
            file.content_type or "application/octet-stream",
            file_size,
            GOOGLE_DRIVE_FOLDER_ID,
            type(exc).__name__,
        )
        if "scope" in str(exc).lower():
            raise HTTPException(status_code=500, detail="Unable to upload file. Please contact support.")
        if isinstance(exc, DriveUploadTemporaryError):
            raise HTTPException(status_code=503, detail="File upload service is temporarily unavailable. Please try again.")
        raise HTTPException(status_code=500, detail="File upload failed. Please try again.")

    file_url = f"https://drive.google.com/file/d/{drive_file_id}/view"
    return drive_file_id, file_url, file_type, mime_type, is_supported_file, file_size


async def _cleanup_uploaded_drive_file_after_failure(
    *,
    drive_file_id: str,
    original_file_name: str,
    current_user: User,
    lecturer_profile,
    action: str,
) -> None:
    try:
        await asyncio.to_thread(drive_service.delete_file, drive_file_id)
    except Exception as cleanup_exc:
        logger.warning("Uploaded material cleanup failed after %s for %s: %s", action, drive_file_id, cleanup_exc)
        await _insert_material_cleanup_audit_log(
            actor_user_id=current_user.id,
            actor_role="lecturer",
            university_id=lecturer_profile.university_id,
            action="material_upload_drive_cleanup_failed",
            metadata={
                "drive_file_id": drive_file_id,
                "file_name": original_file_name,
                "failed_after": action,
                "error": str(cleanup_exc),
            },
        )


async def _is_drive_file_referenced_elsewhere(drive_file_id: str, submission_id: str) -> bool:
    sb = _db()
    if not sb:
        return True

    try:
        submission_res = await _run_db(
            lambda: sb.table("lecturer_material_submissions")
            .select("id")
            .neq("id", submission_id)
            .or_(f"drive_file_id.eq.{drive_file_id},original_drive_file_id.eq.{drive_file_id},converted_drive_file_id.eq.{drive_file_id}")
            .limit(1)
            .execute()
        )
        if submission_res.data:
            return True

        library_res = await _run_db(
            lambda: sb.table("pans_library")
            .select("id")
            .eq("drive_file_id", drive_file_id)
            .limit(1)
            .execute()
        )
        return bool(library_res.data)
    except Exception as exc:
        logger.warning("Drive file reference check failed for %s: %s", drive_file_id, exc)
        return True


async def _cleanup_cancelled_submission_drive_files(
    *,
    submission_id: str,
    actor_user_id: str,
    university_id: str,
    drive_file_ids: list[str],
) -> list[str]:
    warnings: list[str] = []
    unique_ids = list(dict.fromkeys(file_id.strip() for file_id in drive_file_ids if file_id and file_id.strip()))
    cleanup_results: list[dict] = []

    for drive_file_id in unique_ids:
        if await _is_drive_file_referenced_elsewhere(drive_file_id, submission_id):
            cleanup_results.append({"drive_file_id": drive_file_id, "status": "skipped_referenced"})
            continue

        try:
            await asyncio.to_thread(drive_service.delete_file, drive_file_id)
            cleanup_results.append({"drive_file_id": drive_file_id, "status": "deleted"})
        except Exception as exc:
            message = f"Drive cleanup failed for file {drive_file_id}: {exc}"
            warnings.append(message)
            cleanup_results.append({"drive_file_id": drive_file_id, "status": "failed", "error": str(exc)})
            logger.warning(message)

    await _insert_material_cleanup_audit_log(
        actor_user_id=actor_user_id,
        actor_role="lecturer",
        university_id=university_id,
        submission_id=submission_id,
        action="material_submission_drive_cleanup",
        metadata={"files": cleanup_results, "warnings": warnings},
    )
    return warnings


async def _get_restriction_by_id(restriction_id: str) -> Optional[dict]:
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        res = await _run_db(
            lambda: sb.table("exam_restrictions")
            .select(build_restriction_select())
            .eq("id", restriction_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Restriction lookup failed for %s: %s", restriction_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load restriction")

    rows = res.data or []
    return rows[0] if rows else None


async def _lookup_auth_user_by_email(email: str):
    if not supabase_service_client:
        return None

    try:
        auth_res = await asyncio.to_thread(lambda: supabase_service_client.auth.admin.list_users())
    except Exception as exc:
        logger.error("Auth user lookup failed for %s: %s", email, exc)
        raise HTTPException(status_code=500, detail="Unable to verify registration account")

    for user_obj in (getattr(auth_res, "users", None) or []):
        candidate_email = (getattr(user_obj, "email", None) or "").strip().lower()
        if candidate_email == email:
            return user_obj

    return None


async def _get_lecturer_profile_by_user_id(user_id: str):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        res = await _run_db(
            lambda: sb.table("lecturer_profiles")
            .select(
                "id,user_id,university_id,title,full_name,email,phone_number,status,"
                "university:universities(id,name,status)"
            )
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("Lecturer profile lookup failed for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Unable to verify lecturer registration")

    rows = res.data or []
    row = rows[0] if rows else None
    if not row:
        return None

    university = row.get("university")
    if isinstance(university, list):
        university = university[0] if university else None
    if not isinstance(university, dict):
        university = {}

    return {
        "id": str(row.get("id")),
        "user_id": str(row.get("user_id")),
        "university_id": str(row.get("university_id")),
        "university_name": university.get("name"),
        "title": row.get("title"),
        "full_name": row.get("full_name"),
        "email": row.get("email"),
        "phone_number": row.get("phone_number"),
        "status": (row.get("status") or "").strip().lower(),
    }


def _raise_for_existing_lecturer_profile(existing_profile: dict):
    existing_payload = _lecturer_profile_to_response(existing_profile)

    if existing_profile["status"] == "pending":
        return {
            "ok": True,
            "message": "Your lecturer registration is already pending review.",
            "lecturer_status": existing_profile["status"],
            "lecturer_profile": existing_payload,
        }
    if existing_profile["status"] == "active":
        return {
            "ok": True,
            "message": "Your lecturer access is already active.",
            "lecturer_status": existing_profile["status"],
            "lecturer_profile": existing_payload,
        }
    if existing_profile["status"] == "rejected":
        raise HTTPException(
            status_code=409,
            detail="Your lecturer registration was rejected. Please contact admin for review before trying again."
        )
    if existing_profile["status"] in {"suspended", "revoked"}:
        raise HTTPException(
            status_code=403,
            detail="Your lecturer access is not available. Please contact admin."
        )
    raise HTTPException(status_code=409, detail="Lecturer registration cannot be completed for this account.")


@router.get("/universities", dependencies=[Depends(verify_api_key)])
async def list_active_universities():
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        res = await _run_db(
            lambda: sb.table("universities")
            .select("id,name,short_name,country,state,status")
            .eq("status", "active")
            .order("name", desc=False)
            .execute()
        )
    except Exception as exc:
        logger.error("Active universities fetch failed: %s", exc)
        raise HTTPException(status_code=500, detail="Unable to load universities")

    return res.data or []


@router.post("/lecturer/register", dependencies=[Depends(verify_api_key)])
async def register_lecturer(
    payload: LecturerRegistrationRequest,
    response: Response,
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")
    if not supabase_service_client or not supabase_client:
        raise HTTPException(status_code=503, detail="Lecturer registration is temporarily unavailable")

    email = _normalize_email(payload.email)
    password = payload.password or ""
    university_id = _normalize_optional(payload.university_id)
    title = _normalize_optional(payload.title)
    full_name = _normalize_optional(payload.full_name)
    phone_number = _normalize_optional(payload.phone_number)

    if not email:
        raise HTTPException(status_code=400, detail="A valid email is required")
    if not password.strip():
        raise HTTPException(status_code=400, detail="password is required")
    if not university_id:
        raise HTTPException(status_code=400, detail="university_id is required")
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if title not in LECTURER_TITLES:
        raise HTTPException(status_code=400, detail="Invalid lecturer title")
    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")
    if not phone_number:
        raise HTTPException(status_code=400, detail="phone_number is required")

    try:
        university_res = await _run_db(
            lambda: sb.table("universities")
            .select("id,name,status")
            .eq("id", university_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("University lookup failed for %s: %s", email, exc)
        raise HTTPException(status_code=500, detail="Unable to validate university")

    university_rows = university_res.data or []
    university = university_rows[0] if university_rows else None
    if not university:
        raise HTTPException(status_code=404, detail="Selected university was not found")
    if (university.get("status") or "").strip().lower() != "active":
        raise HTTPException(status_code=400, detail="Lecturer registration is only available for active universities")

    existing_auth_user = await _lookup_auth_user_by_email(email)
    created_user = None

    if existing_auth_user:
        user_id = getattr(existing_auth_user, "id", None)
        if not user_id:
            raise HTTPException(status_code=500, detail="Existing registration account could not be verified")

        existing_profile = await _get_lecturer_profile_by_user_id(user_id)
        if existing_profile:
            return _raise_for_existing_lecturer_profile(existing_profile)
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this email. Please verify the email, log in through the main login page, and contact admin if you need lecturer access added."
        )
    else:
        try:
            signup_res = await asyncio.to_thread(
                lambda: supabase_client.auth.sign_up({
                    "email": email,
                    "password": password,
                    "options": {
                        "data": {
                            "title": title,
                            "full_name": full_name,
                            "phone_number": phone_number,
                        },
                    },
                })
            )
        except Exception as exc:
            logger.error("Auth user creation failed for %s: %s", email, exc)
            raise HTTPException(status_code=500, detail="Unable to create lecturer account")

        created_user = getattr(signup_res, "user", None) or getattr(getattr(signup_res, "data", None), "user", None)
        user_id = getattr(created_user, "id", None)
        if not user_id:
            raise HTTPException(status_code=500, detail="Lecturer account could not be created")

    insert_payload = {
        "user_id": user_id,
        "university_id": university_id,
        "title": title,
        "full_name": full_name,
        "email": email,
        "phone_number": phone_number,
        "status": "pending",
        "approved_by": None,
        "approved_at": None,
        "rejection_reason": None,
    }

    try:
        await _run_db(
            lambda: sb.table("lecturer_profiles")
            .insert(insert_payload)
            .execute()
        )
    except Exception as exc:
        logger.error("Lecturer registration insert failed for %s: %s", email, exc)
        raise HTTPException(status_code=500, detail="Unable to submit lecturer registration")

    lecturer_profile = await _get_lecturer_profile_by_user_id(user_id)
    if not lecturer_profile:
        raise HTTPException(status_code=500, detail="Lecturer registration was created but could not be loaded")

    try:
        await _run_db(
            lambda: sb.table("access_control_audit_logs")
            .insert({
                "actor_user_id": user_id,
                "actor_role": "lecturer_applicant",
                "university_id": university_id,
                "action": "lecturer_registration_submitted",
                "target_type": "lecturer_profile",
                "target_id": lecturer_profile["id"],
                "metadata": {
                    "title": title,
                    "email": email,
                    "full_name": full_name,
                    "phone_number": phone_number,
                },
            })
            .execute()
        )
    except Exception as exc:
        logger.warning("Lecturer registration audit log failed for %s: %s", email, exc)

    response.status_code = status.HTTP_201_CREATED
    return {
        "ok": True,
        "message": "Check your email to verify your account. After verification, your lecturer profile will still need admin approval before access is activated.",
        "lecturer_status": lecturer_profile["status"],
        "lecturer_profile": _lecturer_profile_to_response(lecturer_profile),
    }


@router.post("/lecturer/materials", dependencies=[Depends(verify_api_key)], status_code=status.HTTP_201_CREATED)
async def submit_lecturer_material(
    file: UploadFile = File(...),
    level: str = Form(...),
    course_code: str = Form(...),
    topic: str = Form(...),
    course_title: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    lecturer_profile=Depends(get_current_active_lecturer),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")
    resolved_metadata = _resolve_material_metadata(
        level=level,
        course_code=course_code,
        topic=topic,
        course_title=course_title,
    )
    original_file_name = normalize_optional_text(file.filename) or ""
    drive_file_id, file_url, file_type, mime_type, is_supported_file, _ = await _upload_material_file_to_drive(
        file=file,
        lecturer_profile=lecturer_profile,
    )

    submission_payload = {
        "university_id": lecturer_profile.university_id,
        "lecturer_id": lecturer_profile.id,
        "title": resolved_metadata["topic"],
        "course_code": resolved_metadata["course_code"],
        "course_title": resolved_metadata["course_title"],
        "level": resolved_metadata["level"],
        "material_type": None,
        "description": None,
        "file_name": original_file_name,
        "file_url": file_url,
        "storage_provider": "google_drive",
        "file_type": file_type,
        "mime_type": mime_type,
        "is_supported_file": is_supported_file,
        "drive_file_id": drive_file_id,
        "original_drive_file_id": drive_file_id,
        "converted_drive_file_id": None,
        "status": "pending_review",
        "reviewed_by": None,
        "reviewed_at": None,
        "review_note": None,
        "pans_library_id": None,
    }

    try:
        insert_res = await _run_db(
            lambda: sb.table("lecturer_material_submissions")
            .insert(submission_payload)
            .execute()
        )
    except Exception as exc:
        logger.error("Material submission failed for lecturer %s: %s", lecturer_profile.id, exc)
        await _cleanup_uploaded_drive_file_after_failure(
            drive_file_id=drive_file_id,
            original_file_name=original_file_name,
            current_user=current_user,
            lecturer_profile=lecturer_profile,
            action="db_insert_error",
        )
        raise HTTPException(status_code=500, detail="Unable to submit material")

    rows = insert_res.data or []
    submission_id = rows[0].get("id") if rows and rows[0].get("id") else None
    if not submission_id:
        await _cleanup_uploaded_drive_file_after_failure(
            drive_file_id=drive_file_id,
            original_file_name=original_file_name,
            current_user=current_user,
            lecturer_profile=lecturer_profile,
            action="missing_submission_id",
        )
        raise HTTPException(status_code=500, detail="Material was submitted but could not be loaded")

    created_row = await _get_material_submission_by_id(submission_id)
    if not created_row:
        raise HTTPException(status_code=500, detail="Material was submitted but could not be loaded")
    created_payload = await _serialize_material_submission_row(created_row)

    await _insert_material_audit_log(
        actor_user_id=current_user.id,
        actor_role="lecturer",
        university_id=lecturer_profile.university_id,
        submission_id=submission_id,
        action="material_submitted",
        metadata={
            "lecturer_id": lecturer_profile.id,
            "title": resolved_metadata["topic"],
            "course_code": submission_payload["course_code"],
            "course_title": submission_payload["course_title"],
            "level": submission_payload["level"],
            "file_name": original_file_name,
            "storage_provider": submission_payload["storage_provider"],
            "file_type": submission_payload["file_type"],
            "mime_type": submission_payload["mime_type"],
            "is_supported_file": submission_payload["is_supported_file"],
            "drive_file_id": drive_file_id,
        },
    )

    return {"data": created_payload}


@router.post("/lecturer/materials/{submission_id}/resubmit", dependencies=[Depends(verify_api_key)], status_code=status.HTTP_201_CREATED)
async def resubmit_lecturer_material(
    submission_id: str,
    file: UploadFile = File(...),
    level: Optional[str] = Form(None),
    course_code: Optional[str] = Form(None),
    topic: Optional[str] = Form(None),
    course_title: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    lecturer_profile=Depends(get_current_active_lecturer),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    original_row = await _get_material_submission_by_id(submission_id)
    if not original_row:
        raise HTTPException(status_code=404, detail="Material submission not found")
    if str(original_row.get("lecturer_id") or "") != str(lecturer_profile.id):
        raise HTTPException(status_code=403, detail="You can only resubmit your own rejected material submissions")
    if str(original_row.get("university_id") or "") != str(lecturer_profile.university_id):
        raise HTTPException(status_code=403, detail="You do not have access to this material submission")

    original_status = str(original_row.get("status") or "").strip().lower()
    if original_status == "pending_review":
        raise HTTPException(status_code=409, detail="Pending submissions cannot be resubmitted")
    if original_status == "approved":
        raise HTTPException(status_code=409, detail="Approved submissions cannot be resubmitted")
    if original_status == "cancelled":
        raise HTTPException(status_code=409, detail="Cancelled submissions cannot be resubmitted")
    if original_status != "rejected":
        raise HTTPException(status_code=409, detail="Only rejected submissions can be resubmitted")

    existing_child = await _get_material_submission_child_resubmission(submission_id)
    if existing_child:
        raise HTTPException(status_code=409, detail="This rejected submission has already been resubmitted")

    resolved_metadata = _resolve_material_metadata(
        level=level,
        course_code=course_code,
        topic=topic,
        course_title=course_title,
        fallback_row=original_row,
    )
    original_file_name = normalize_optional_text(file.filename) or ""
    drive_file_id, file_url, file_type, mime_type, is_supported_file, _ = await _upload_material_file_to_drive(
        file=file,
        lecturer_profile=lecturer_profile,
    )

    refreshed_row = await _get_material_submission_by_id(submission_id)
    if not refreshed_row:
        await _cleanup_uploaded_drive_file_after_failure(
            drive_file_id=drive_file_id,
            original_file_name=original_file_name,
            current_user=current_user,
            lecturer_profile=lecturer_profile,
            action="resubmission_source_missing",
        )
        raise HTTPException(status_code=404, detail="Material submission not found")
    if str(refreshed_row.get("lecturer_id") or "") != str(lecturer_profile.id):
        await _cleanup_uploaded_drive_file_after_failure(
            drive_file_id=drive_file_id,
            original_file_name=original_file_name,
            current_user=current_user,
            lecturer_profile=lecturer_profile,
            action="resubmission_ownership_changed",
        )
        raise HTTPException(status_code=403, detail="You can only resubmit your own rejected material submissions")
    if str(refreshed_row.get("status") or "").strip().lower() != "rejected":
        await _cleanup_uploaded_drive_file_after_failure(
            drive_file_id=drive_file_id,
            original_file_name=original_file_name,
            current_user=current_user,
            lecturer_profile=lecturer_profile,
            action="resubmission_source_status_changed",
        )
        raise HTTPException(status_code=409, detail="Submission status changed before resubmission finished. No new material was saved.")

    submission_payload = {
        "university_id": lecturer_profile.university_id,
        "lecturer_id": lecturer_profile.id,
        "title": resolved_metadata["topic"],
        "course_code": resolved_metadata["course_code"],
        "course_title": resolved_metadata["course_title"],
        "level": resolved_metadata["level"],
        "material_type": refreshed_row.get("material_type"),
        "description": refreshed_row.get("description"),
        "file_name": original_file_name,
        "file_url": file_url,
        "storage_provider": "google_drive",
        "file_type": file_type,
        "mime_type": mime_type,
        "is_supported_file": is_supported_file,
        "drive_file_id": drive_file_id,
        "original_drive_file_id": drive_file_id,
        "converted_drive_file_id": None,
        "status": "pending_review",
        "reviewed_by": None,
        "reviewed_at": None,
        "review_note": None,
        "pans_library_id": None,
        "cancelled_at": None,
        "cancelled_by": None,
        "cancellation_reason": None,
        "resubmitted_from_id": submission_id,
    }

    try:
        insert_res = await _run_db(
            lambda: sb.table("lecturer_material_submissions")
            .insert(submission_payload)
            .execute()
        )
    except Exception as exc:
        logger.error("Material resubmission failed for lecturer %s source %s: %s", lecturer_profile.id, submission_id, exc)
        await _cleanup_uploaded_drive_file_after_failure(
            drive_file_id=drive_file_id,
            original_file_name=original_file_name,
            current_user=current_user,
            lecturer_profile=lecturer_profile,
            action="resubmission_db_insert_error",
        )
        message = str(exc).lower()
        if "lecturer_material_submissions_one_resubmission_per_rejection_idx" in message or "duplicate key value violates unique constraint" in message:
            raise HTTPException(status_code=409, detail="This rejected submission has already been resubmitted")
        raise HTTPException(status_code=500, detail="Unable to resubmit material")

    rows = insert_res.data or []
    new_submission_id = rows[0].get("id") if rows and rows[0].get("id") else None
    if not new_submission_id:
        await _cleanup_uploaded_drive_file_after_failure(
            drive_file_id=drive_file_id,
            original_file_name=original_file_name,
            current_user=current_user,
            lecturer_profile=lecturer_profile,
            action="resubmission_missing_submission_id",
        )
        raise HTTPException(status_code=500, detail="Material was resubmitted but could not be loaded")

    created_row = await _get_material_submission_by_id(new_submission_id)
    if not created_row:
        raise HTTPException(status_code=500, detail="Material was resubmitted but could not be loaded")
    created_payload = await _serialize_material_submission_row(created_row)

    await _insert_material_audit_log(
        actor_user_id=current_user.id,
        actor_role="lecturer",
        university_id=lecturer_profile.university_id,
        submission_id=new_submission_id,
        action="lecturer_material_resubmitted",
        metadata={
            "previous_rejected_submission_id": submission_id,
            "new_submission_id": new_submission_id,
            "lecturer_id": lecturer_profile.id,
            "university_id": lecturer_profile.university_id,
            "course_code": submission_payload["course_code"],
            "course_title": submission_payload["course_title"],
            "level": submission_payload["level"],
            "title": submission_payload["title"],
            "file_name": original_file_name,
            "file_type": submission_payload["file_type"],
            "mime_type": submission_payload["mime_type"],
            "is_supported_file": submission_payload["is_supported_file"],
            "drive_file_id": drive_file_id,
        },
    )

    return {"data": created_payload}


@router.post("/lecturer/materials/{submission_id}/cancel", dependencies=[Depends(verify_api_key)])
async def cancel_lecturer_material_submission(
    submission_id: str,
    payload: MaterialSubmissionCancelRequest,
    current_user: User = Depends(get_current_user),
    lecturer_profile=Depends(get_current_active_lecturer),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")
    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")

    reason = normalize_optional_text(payload.reason)

    try:
        rpc_res = await _run_db(
            lambda: sb.rpc(
                "cancel_lecturer_material_submission",
                {
                    "p_submission_id": submission_id,
                    "p_lecturer_user_id": current_user.id,
                    "p_reason": reason,
                },
            ).execute()
        )
    except Exception as exc:
        message = str(exc) or "Unable to cancel material submission"
        if "Material submission not found" in message:
            raise HTTPException(status_code=404, detail="Material submission not found")
        if "only cancel your own" in message:
            raise HTTPException(status_code=403, detail="You can only cancel your own material submissions")
        if "Approved submissions cannot be cancelled" in message:
            raise HTTPException(status_code=409, detail="Approved submissions cannot be cancelled")
        if "Rejected submissions cannot be cancelled" in message:
            raise HTTPException(status_code=409, detail="Rejected submissions cannot be cancelled")
        if "Only pending submissions can be cancelled" in message or "Linked submissions cannot be cancelled" in message:
            raise HTTPException(status_code=409, detail=message)
        logger.error("Material submission cancellation failed for %s: %s", submission_id, exc)
        raise HTTPException(status_code=500, detail="Unable to cancel material submission")

    rpc_rows = rpc_res.data or []
    rpc_row = rpc_rows[0] if rpc_rows else None
    if not rpc_row:
        raise HTTPException(status_code=500, detail="Cancellation did not return a result")

    tracked_drive_ids = [
        rpc_row.get("drive_file_id"),
        rpc_row.get("original_drive_file_id"),
        rpc_row.get("converted_drive_file_id"),
    ]
    cleanup_warnings = await _cleanup_cancelled_submission_drive_files(
        submission_id=submission_id,
        actor_user_id=current_user.id,
        university_id=lecturer_profile.university_id,
        drive_file_ids=[str(file_id) for file_id in tracked_drive_ids if file_id],
    )

    row = await _get_material_submission_by_id(submission_id)
    if not row:
        raise HTTPException(status_code=500, detail="Material was cancelled but could not be loaded")
    row_payload = await _serialize_material_submission_row(row)

    await _insert_material_audit_log(
        actor_user_id=current_user.id,
        actor_role="lecturer",
        university_id=lecturer_profile.university_id,
        submission_id=submission_id,
        action="material_submission_cancelled",
        metadata={
            "reason": reason,
            "cleanup_warnings": cleanup_warnings,
        },
    )

    return {"data": row_payload, "cleanup_warnings": cleanup_warnings}


@router.get("/lecturer/materials", dependencies=[Depends(verify_api_key)])
async def list_lecturer_materials(lecturer_profile=Depends(get_current_active_lecturer)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    # Try the full query with lecturer + university joins first
    res = None
    try:
        res = await _run_db(
            lambda: sb.table("lecturer_material_submissions")
            .select(MATERIAL_SUBMISSION_SELECT)
            .eq("lecturer_id", lecturer_profile.id)
            .eq("university_id", lecturer_profile.university_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        logger.error(
            "Material submission list (with joins) failed for lecturer %s: %s",
            lecturer_profile.id, exc, exc_info=True,
        )

    # Fall back to a simple query without joins if the joined query failed
    if res is None:
        MATERIAL_SUBMISSION_SELECT_SIMPLE = (
            "id,university_id,lecturer_id,course_code,course_title,level,material_type,title,"
            "description,file_name,file_url,storage_provider,file_type,mime_type,is_supported_file,"
            "status,reviewed_by,reviewed_at,review_note,pans_library_id,cancelled_at,cancelled_by,"
            "cancellation_reason,drive_file_id,original_drive_file_id,converted_drive_file_id,resubmitted_from_id,created_at,updated_at"
        )
        try:
            res = await _run_db(
                lambda: sb.table("lecturer_material_submissions")
                .select(MATERIAL_SUBMISSION_SELECT_SIMPLE)
                .eq("lecturer_id", lecturer_profile.id)
                .eq("university_id", lecturer_profile.university_id)
                .order("created_at", desc=True)
                .execute()
            )
        except Exception as exc2:
            logger.error(
                "Material submission list (simple fallback) failed for lecturer %s: %s",
                lecturer_profile.id, exc2, exc_info=True,
            )
            raise HTTPException(status_code=500, detail="Unable to load material submissions")

    rows = await _serialize_material_submission_rows(res.data or [])
    return {"data": rows}


@router.post("/lecturer/restrictions", dependencies=[Depends(verify_api_key)], status_code=status.HTTP_201_CREATED)
async def create_lecturer_restriction(
    payload: RestrictionCreateRequest,
    current_user: User = Depends(get_current_user),
    lecturer_profile=Depends(get_current_active_lecturer),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    course_code = normalize_optional_text(payload.course_code)
    course_title = normalize_optional_text(payload.course_title)
    level = normalize_optional_text(payload.level)
    reason = normalize_optional_text(payload.reason)

    if not level:
        raise HTTPException(status_code=400, detail="level is required")

    duration_minutes = payload.duration_minutes
    if duration_minutes is not None:
        if duration_minutes <= 0:
            raise HTTPException(status_code=400, detail="duration_minutes must be greater than 0")
        start_dt = utc_now()
        end_dt = start_dt + timedelta(minutes=duration_minutes)
    else:
        try:
            start_dt = parse_timestamp(payload.start_time, "start_time")
            end_dt = parse_timestamp(payload.end_time, "end_time")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    title = normalize_optional_text(payload.title)
    if not title:
        if course_code:
            title = f"{course_code} Restriction"
        elif course_title:
            title = f"{course_title} Restriction"
        else:
            title = f"{level} Test Restriction"

    restriction_payload = {
        "university_id": lecturer_profile.university_id,
        "lecturer_id": lecturer_profile.id,
        "title": title,
        "course_code": course_code,
        "course_title": course_title,
        "level": level,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "reason": reason,
        "status": compute_restriction_status(start_dt, end_dt, None, now=utc_now()),
    }

    try:
        insert_res = await _run_db(
            lambda: sb.table("exam_restrictions")
            .insert(restriction_payload)
            .execute()
        )
    except Exception as exc:
        logger.error("Restriction creation failed for lecturer %s: %s", lecturer_profile.id, exc)
        raise HTTPException(status_code=500, detail="Unable to create restriction")

    rows = insert_res.data or []
    created_id = rows[0].get("id") if rows and rows[0].get("id") else None
    if not created_id:
        logger.error("Restriction create did not return id for lecturer %s", lecturer_profile.id)
        raise HTTPException(status_code=500, detail="Restriction was created but could not be loaded")

    created_row = await _get_restriction_by_id(created_id)
    if not created_row:
        raise HTTPException(status_code=500, detail="Restriction was created but could not be loaded")

    await _insert_restriction_audit_log(
        actor_user_id=current_user.id,
        actor_role="lecturer",
        university_id=lecturer_profile.university_id,
        restriction_id=created_id,
        action="restriction_created",
        metadata={
            "lecturer_id": lecturer_profile.id,
            "title": title,
            "course_code": course_code,
            "course_title": course_title,
            "level": level,
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "duration_minutes": duration_minutes,
            "reason": reason,
        },
    )

    return {"data": restriction_row_to_response(created_row)}


@router.get("/lecturer/restrictions", dependencies=[Depends(verify_api_key)])
async def list_lecturer_restrictions(lecturer_profile=Depends(get_current_active_lecturer)):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        res = await _run_db(
            lambda: sb.table("exam_restrictions")
            .select(build_restriction_select())
            .eq("lecturer_id", lecturer_profile.id)
            .eq("university_id", lecturer_profile.university_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        logger.error("Restriction list failed for lecturer %s: %s", lecturer_profile.id, exc)
        raise HTTPException(status_code=500, detail="Unable to load restrictions")

    return {"data": [restriction_row_to_response(row) for row in (res.data or [])]}


@router.patch("/lecturer/restrictions/{restriction_id}/cancel", dependencies=[Depends(verify_api_key)])
async def cancel_lecturer_restriction(
    restriction_id: str,
    current_user: User = Depends(get_current_user),
    lecturer_profile=Depends(get_current_active_lecturer),
):
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    restriction_row = await _get_restriction_by_id(restriction_id)
    if not restriction_row:
        raise HTTPException(status_code=404, detail="Restriction not found")

    if restriction_row.get("lecturer_id") != lecturer_profile.id:
        raise HTTPException(status_code=403, detail="You can only cancel your own restrictions")
    if restriction_row.get("university_id") != lecturer_profile.university_id:
        raise HTTPException(status_code=403, detail="You can only manage restrictions under your own university")

    current_status = compute_restriction_status(
        restriction_row.get("start_time"),
        restriction_row.get("end_time"),
        restriction_row.get("status"),
    )
    if current_status not in {"scheduled", "active"}:
        raise HTTPException(status_code=400, detail="Only scheduled or active restrictions can be cancelled")

    cancelled_at = utc_now().isoformat()
    try:
        update_res = await _run_db(
            lambda: sb.table("exam_restrictions")
            .update({
                "status": "cancelled",
                "cancelled_by": current_user.id,
                "cancelled_at": cancelled_at,
            })
            .eq("id", restriction_id)
            .eq("lecturer_id", lecturer_profile.id)
            .eq("university_id", lecturer_profile.university_id)
            .execute()
        )
    except Exception as exc:
        logger.error("Restriction cancellation failed for %s: %s", restriction_id, exc)
        raise HTTPException(status_code=500, detail="Unable to cancel restriction")

    if not (update_res.data or []):
        raise HTTPException(status_code=404, detail="Restriction not found")

    updated_row = await _get_restriction_by_id(restriction_id)
    if not updated_row:
        raise HTTPException(status_code=500, detail="Restriction was cancelled but could not be loaded")

    await _insert_restriction_audit_log(
        actor_user_id=current_user.id,
        actor_role="lecturer",
        university_id=lecturer_profile.university_id,
        restriction_id=restriction_id,
        action="restriction_cancelled",
        metadata={
            "lecturer_id": lecturer_profile.id,
            "previous_status": current_status,
            "cancelled_at": cancelled_at,
        },
    )

    return {"data": restriction_row_to_response(updated_row)}


def set_dependencies(supabase, api_key_verifier, supabase_service=None, drive_svc=None, folder_id=None):
    global supabase_client, supabase_service_client, verify_api_key_handler, drive_service, GOOGLE_DRIVE_FOLDER_ID
    supabase_client = supabase
    supabase_service_client = supabase_service
    verify_api_key_handler = api_key_verifier
    drive_service = drive_svc
    GOOGLE_DRIVE_FOLDER_ID = folder_id
