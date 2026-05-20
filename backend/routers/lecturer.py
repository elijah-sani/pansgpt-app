import asyncio
from datetime import timedelta
from email.utils import parseaddr
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel
from typing import Optional
import logging

from dependencies import User, get_current_active_lecturer, get_current_user
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
LECTURER_TITLES = {"Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Pharm", "Pharm Dr"}


class LecturerRegistrationRequest(BaseModel):
    email: str
    password: str
    university_id: str
    title: str
    full_name: str
    phone_number: str

    class Config:
        extra = "forbid"


class RestrictionCreateRequest(BaseModel):
    title: Optional[str] = None
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    level: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    reason: Optional[str] = None

    class Config:
        extra = "forbid"


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
            .select("id,name,short_name,country,state")
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


def set_dependencies(supabase, api_key_verifier, supabase_service=None):
    global supabase_client, supabase_service_client, verify_api_key_handler
    supabase_client = supabase
    supabase_service_client = supabase_service
    verify_api_key_handler = api_key_verifier
