"""
Lecturer Router: Invite management, registration, profiles, materials, and access control.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import asyncio
import logging
import os
import secrets
import io

from dependencies import get_current_user, User
from .shared import _execute_with_retry, logger

router = APIRouter(tags=["lecturer"])

# ---------------------------------------------------------------------------
# Module-level state injected from api.py via set_dependencies()
# ---------------------------------------------------------------------------
_client = None
_service_client = None
_verify_api_key_fn = None
_drive_service = None


def set_dependencies(client, verify_key_dep, service_client=None, drive_service=None):
    global _client, _service_client, _verify_api_key_fn, _drive_service
    _client = client
    _service_client = service_client
    _verify_api_key_fn = verify_key_dep
    _drive_service = drive_service


def _db():
    """Return service-role client (bypasses RLS) falling back to anon client."""
    return _service_client or _client


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class LecturerRegisterRequest(BaseModel):
    code: str
    full_name: str
    department: str
    email: str
    password: str


class EnableAccessControlRequest(BaseModel):
    level: str
    duration_minutes: int


class SubmitMaterialRequest(BaseModel):
    course_name: str
    course_code: str
    level: str
    notes_for_admin: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

async def _require_super_admin(current_user: User) -> None:
    """Raise 403 unless current_user has the super_admin role."""
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")
    if not current_user.email:
        raise HTTPException(status_code=403, detail="Access denied: email missing")

    normalized = current_user.email.strip().lower()
    try:
        res = await _execute_with_retry(
            lambda: sb.table("user_roles").select("role").ilike("email", normalized).execute(),
            "Fetch user role for super_admin check",
        )
        rows = res.data or []
        is_super = any((r.get("role") or "").strip().lower() == "super_admin" for r in rows)
        if not is_super:
            raise HTTPException(status_code=403, detail="Super admin access required")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Super-admin check failed: {exc}")
        raise HTTPException(status_code=500, detail="Authorization check failed")


async def _require_lecturer(current_user: User) -> dict:
    """Return the lecturers row for current_user, or raise 403."""
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        res = await _execute_with_retry(
            lambda: sb.table("lecturers").select("*").eq("user_id", current_user.id).limit(1).execute(),
            "Fetch lecturer by user_id",
        )
        row = (res.data or [None])[0]
        if not row:
            raise HTTPException(status_code=403, detail="Lecturer profile not found")
        return row
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Require lecturer failed: {exc}")
        raise HTTPException(status_code=500, detail="Failed to verify lecturer identity")


# ---------------------------------------------------------------------------
# INVITE MANAGEMENT  (super_admin only)
# ---------------------------------------------------------------------------

@router.get("/admin/lecturer-invite/status")
async def get_invite_status(current_user: User = Depends(get_current_user)):
    """Return the currently active invite code, if any."""
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    res = await _execute_with_retry(
        lambda: sb.table("lecturer_invites").select("*").eq("is_active", True).limit(1).execute(),
        "Fetch active lecturer invite",
    )
    row = (res.data or [None])[0]
    base_url = os.getenv("NEXT_PUBLIC_APP_URL", "https://pansgpt-app.vercel.app")

    if not row:
        return {"active": False, "code": None, "url": None}

    code = row.get("code")
    return {
        "active": True,
        "code": code,
        "url": f"{base_url}/lecturer/register?code={code}",
    }


@router.post("/admin/lecturer-invite/generate")
async def generate_invite(current_user: User = Depends(get_current_user)):
    """Deactivate all existing codes and generate a fresh one."""
    await _require_super_admin(current_user)

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Deactivate all existing active codes
    await _execute_with_retry(
        lambda: sb.table("lecturer_invites").update({"is_active": False}).eq("is_active", True).execute(),
        "Deactivate existing invite codes",
    )

    code = secrets.token_urlsafe(32)
    res = await _execute_with_retry(
        lambda: sb.table("lecturer_invites").insert({
            "code": code,
            "is_active": True,
            "created_by": current_user.id,
        }).execute(),
        "Insert new lecturer invite",
    )
    row = (res.data or [{}])[0]

    base_url = os.getenv("NEXT_PUBLIC_APP_URL", "https://pansgpt-app.vercel.app")
    return {
        "code": code,
        "url": f"{base_url}/lecturer/register?code={code}",
        "created_at": row.get("created_at"),
    }


@router.post("/admin/lecturer-invite/deactivate")
async def deactivate_invite(current_user: User = Depends(get_current_user)):
    """Deactivate all active invite codes."""
    await _require_super_admin(current_user)

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    await _execute_with_retry(
        lambda: sb.table("lecturer_invites").update({"is_active": False}).eq("is_active", True).execute(),
        "Deactivate all active invites",
    )
    return {"success": True}


# ---------------------------------------------------------------------------
# REGISTRATION  (public — no JWT)
# ---------------------------------------------------------------------------

@router.get("/lecturer/register/validate")
async def validate_invite_code(code: str):
    """Check whether an invite code is active. Uses service client — no JWT required."""
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        res = await _execute_with_retry(
            lambda: sb.table("lecturer_invites")
            .select("id")
            .eq("code", code)
            .eq("is_active", True)
            .limit(1)
            .execute(),
            "Validate lecturer invite code",
        )
        valid = bool(res.data)
        return {"valid": valid}
    except Exception as exc:
        logger.error(f"Invite code validation error: {exc}")
        return {"valid": False}


@router.post("/lecturer/register")
async def register_lecturer(body: LecturerRegisterRequest):
    """
    Register a new lecturer via an active invite code.
    Creates the auth user, lecturers profile row, and user_roles row
    in a single flow, then signs in immediately to return session tokens.
    """
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # 1. Validate invite code
    invite_res = await _execute_with_retry(
        lambda: sb.table("lecturer_invites")
        .select("id")
        .eq("code", body.code)
        .eq("is_active", True)
        .limit(1)
        .execute(),
        "Validate invite code during registration",
    )
    if not invite_res.data:
        raise HTTPException(status_code=400, detail="Invalid or expired invite code")

    # 2. Create Supabase auth user (admin call — no client JWT needed)
    try:
        auth_response = await asyncio.to_thread(
            lambda: sb.auth.admin.create_user({
                "email": body.email,
                "password": body.password,
                "email_confirm": True,
                "user_metadata": {"full_name": body.full_name},
            })
        )
        new_user = auth_response.user
        if not new_user:
            raise ValueError("Auth user creation returned empty response")
    except Exception as exc:
        err_str = str(exc).lower()
        if "already registered" in err_str or "email_exists" in err_str or "duplicate" in err_str:
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        logger.error(f"Lecturer auth user creation failed: {exc}")
        raise HTTPException(status_code=500, detail="Failed to create lecturer account")

    new_user_id = new_user.id

    # 3. Insert lecturer profile
    try:
        await _execute_with_retry(
            lambda: sb.table("lecturers").insert({
                "user_id": new_user_id,
                "full_name": body.full_name,
                "department": body.department,
                "email": body.email,
                "has_completed_onboarding": False,
            }).execute(),
            "Insert lecturer profile row",
        )
    except Exception as exc:
        logger.error(f"Lecturer profile insert failed for {new_user_id}: {exc}")
        # Best-effort cleanup
        try:
            await asyncio.to_thread(lambda: sb.auth.admin.delete_user(new_user_id))
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to create lecturer profile")

    # 4. Insert user_roles row
    try:
        await _execute_with_retry(
            lambda: sb.table("user_roles").insert({
                "email": body.email.strip().lower(),
                "role": "lecturer",
                "is_admin": False,
            }).execute(),
            "Insert user_roles for lecturer",
        )
    except Exception as exc:
        logger.warning(f"user_roles insert failed (non-fatal): {exc}")

    # 5. Sign in immediately to obtain session tokens
    try:
        sign_in_res = await asyncio.to_thread(
            lambda: sb.auth.sign_in_with_password({
                "email": body.email,
                "password": body.password,
            })
        )
        session = sign_in_res.session
        if not session:
            raise ValueError("Sign-in returned no session")
    except Exception as exc:
        logger.error(f"Post-registration sign-in failed: {exc}")
        # Registration succeeded — caller can sign in manually
        return {
            "access_token": None,
            "refresh_token": None,
            "user": {"id": new_user_id, "email": body.email, "full_name": body.full_name},
        }

    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "user": {
            "id": new_user_id,
            "email": body.email,
            "full_name": body.full_name,
        },
    }


# ---------------------------------------------------------------------------
# LECTURER PROFILE
# ---------------------------------------------------------------------------

@router.get("/lecturer/me")
async def get_lecturer_me(current_user: User = Depends(get_current_user)):
    """Return the lecturer profile for the calling user."""
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    res = await _execute_with_retry(
        lambda: sb.table("lecturers").select("*").eq("user_id", current_user.id).limit(1).execute(),
        "Fetch lecturer profile",
    )
    row = (res.data or [None])[0]
    if not row:
        return {"registered": False}
    return {"registered": True, "profile": row}


@router.patch("/lecturer/onboarding/complete")
async def complete_onboarding(current_user: User = Depends(get_current_user)):
    """Mark the lecturer's onboarding as complete."""
    lecturer = await _require_lecturer(current_user)
    sb = _db()

    await _execute_with_retry(
        lambda: sb.table("lecturers")
        .update({"has_completed_onboarding": True})
        .eq("id", lecturer["id"])
        .execute(),
        "Mark lecturer onboarding complete",
    )
    return {"success": True}


# ---------------------------------------------------------------------------
# MATERIALS
# ---------------------------------------------------------------------------

@router.post("/lecturer/materials/submit")
async def submit_material(
    file: UploadFile = File(...),
    course_name: str = Form(...),
    course_code: str = Form(...),
    level: str = Form(...),
    notes_for_admin: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF material to Drive and record the submission."""
    lecturer = await _require_lecturer(current_user)

    # Validate PDF
    content_type = (file.content_type or "").lower()
    filename_lower = (file.filename or "").lower()
    if "pdf" not in content_type and not filename_lower.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    if not _drive_service:
        raise HTTPException(status_code=503, detail="File service temporarily unavailable")

    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    # Read file bytes (lecturer PDFs are typically small)
    try:
        file_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read uploaded file")

    # Upload to Google Drive
    try:
        drive_folder_id = os.getenv("GOOGLE_DRIVE_LECTURER_FOLDER_ID") or os.getenv("GOOGLE_DRIVE_FOLDER_ID")
        unique_name = f"lecturer_{uuid4()}_{file.filename}"
        file_obj = io.BytesIO(file_bytes)

        drive_file_id = await asyncio.to_thread(
            lambda: _drive_service.upload_file(
                file_name=unique_name,
                file_obj=file_obj,
                mime_type="application/pdf",
                folder_id=drive_folder_id,
                file_size=len(file_bytes),
            )
        )
    except Exception as exc:
        logger.error(f"Lecturer material Drive upload failed: {exc}")
        raise HTTPException(status_code=500, detail="File upload failed. Please try again.")

    # Insert DB record
    try:
        res = await _execute_with_retry(
            lambda: sb.table("lecturer_materials").insert({
                "lecturer_id": lecturer["id"],
                "file_name": file.filename,
                "drive_file_id": drive_file_id,
                "course_name": course_name,
                "course_code": course_code,
                "level": level,
                "notes_for_admin": notes_for_admin,
                "status": "pending",
            }).execute(),
            "Insert lecturer material record",
        )
        material_row = (res.data or [{}])[0]
    except Exception as exc:
        logger.error(f"Lecturer material DB insert failed: {exc}")
        # Non-fatal Drive cleanup
        try:
            await asyncio.to_thread(lambda: _drive_service.delete_file(drive_file_id))
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to save material record")

    return {"success": True, "material": material_row}


@router.get("/lecturer/materials")
async def get_my_materials(current_user: User = Depends(get_current_user)):
    """Return all materials submitted by the calling lecturer, without the status field."""
    lecturer = await _require_lecturer(current_user)
    sb = _db()

    res = await _execute_with_retry(
        lambda: sb.table("lecturer_materials")
        .select("id,lecturer_id,file_name,drive_file_id,course_name,course_code,level,notes_for_admin,submitted_at,reviewed_at")
        .eq("lecturer_id", lecturer["id"])
        .order("submitted_at", desc=True)
        .execute(),
        "Fetch lecturer materials",
    )
    return {"materials": res.data or []}


# ---------------------------------------------------------------------------
# ADMIN MATERIALS  (super_admin only)
# ---------------------------------------------------------------------------

@router.get("/admin/lecturer-materials/pending")
async def get_pending_materials(current_user: User = Depends(get_current_user)):
    """Return all pending submissions with lecturer name and department."""
    await _require_super_admin(current_user)
    sb = _db()

    res = await _execute_with_retry(
        lambda: sb.table("lecturer_materials")
        .select("*,lecturers(full_name,department)")
        .eq("status", "pending")
        .order("submitted_at", desc=True)
        .execute(),
        "Fetch pending lecturer materials",
    )
    return {"materials": res.data or []}


@router.post("/admin/lecturer-materials/{material_id}/approve")
async def approve_material(material_id: str, current_user: User = Depends(get_current_user)):
    """Set a submission status to approved."""
    await _require_super_admin(current_user)
    sb = _db()

    await _execute_with_retry(
        lambda: sb.table("lecturer_materials").update({
            "status": "approved",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_by": current_user.id,
        }).eq("id", material_id).execute(),
        "Approve lecturer material",
    )
    return {"success": True}


@router.post("/admin/lecturer-materials/{material_id}/reject")
async def reject_material(material_id: str, current_user: User = Depends(get_current_user)):
    """Reject a submission and delete its Drive file (non-fatal if Drive fails)."""
    await _require_super_admin(current_user)
    sb = _db()

    # Fetch drive_file_id before updating
    fetch_res = await _execute_with_retry(
        lambda: sb.table("lecturer_materials")
        .select("drive_file_id")
        .eq("id", material_id)
        .limit(1)
        .execute(),
        "Fetch material for rejection",
    )
    row = (fetch_res.data or [None])[0]
    drive_file_id = (row or {}).get("drive_file_id")

    # Update status
    await _execute_with_retry(
        lambda: sb.table("lecturer_materials").update({
            "status": "rejected",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_by": current_user.id,
        }).eq("id", material_id).execute(),
        "Reject lecturer material",
    )

    # Delete from Drive (non-fatal)
    if drive_file_id and _drive_service:
        try:
            await asyncio.to_thread(lambda: _drive_service.delete_file(drive_file_id))
        except Exception as exc:
            logger.warning(f"Drive delete failed for rejected material {material_id}: {exc}")

    return {"success": True}


# ---------------------------------------------------------------------------
# ACCESS CONTROL
# ---------------------------------------------------------------------------

@router.post("/lecturer/access-control/enable")
async def enable_access_control(
    body: EnableAccessControlRequest,
    current_user: User = Depends(get_current_user),
):
    """Enable exam-mode access control for a level."""
    lecturer = await _require_lecturer(current_user)

    if not (15 <= body.duration_minutes <= 240):
        raise HTTPException(status_code=400, detail="duration_minutes must be between 15 and 240")

    sb = _db()

    # Deactivate any existing active record for this lecturer
    await _execute_with_retry(
        lambda: sb.table("access_control")
        .update({"is_active": False, "ended_at": datetime.now(timezone.utc).isoformat()})
        .eq("lecturer_id", lecturer["id"])
        .eq("is_active", True)
        .execute(),
        "Deactivate existing access_control for lecturer",
    )

    now = datetime.now(timezone.utc)
    auto_ends_at = now + timedelta(minutes=body.duration_minutes)

    res = await _execute_with_retry(
        lambda: sb.table("access_control").insert({
            "lecturer_id": lecturer["id"],
            "lecturer_name": lecturer.get("full_name", ""),
            "level": body.level,
            "duration_minutes": body.duration_minutes,
            "is_active": True,
            "activated_at": now.isoformat(),
            "auto_ends_at": auto_ends_at.isoformat(),
        }).execute(),
        "Insert access_control record",
    )
    record = (res.data or [{}])[0]
    return {"success": True, "record": record}


@router.post("/lecturer/access-control/disable")
async def disable_access_control(current_user: User = Depends(get_current_user)):
    """Manually disable the active access control session."""
    lecturer = await _require_lecturer(current_user)
    sb = _db()

    await _execute_with_retry(
        lambda: sb.table("access_control")
        .update({
            "is_active": False,
            "ended_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("lecturer_id", lecturer["id"])
        .eq("is_active", True)
        .execute(),
        "Disable access_control",
    )
    return {"success": True}


@router.get("/lecturer/access-control/status")
async def get_lecturer_access_control_status(current_user: User = Depends(get_current_user)):
    """Return the current access control status for the calling lecturer."""
    lecturer = await _require_lecturer(current_user)
    sb = _db()

    res = await _execute_with_retry(
        lambda: sb.table("access_control")
        .select("*")
        .eq("lecturer_id", lecturer["id"])
        .eq("is_active", True)
        .limit(1)
        .execute(),
        "Fetch lecturer access_control status",
    )
    row = (res.data or [None])[0]
    if not row:
        return {"is_active": False}

    now = datetime.now(timezone.utc)
    auto_ends_at_str = row.get("auto_ends_at")
    if auto_ends_at_str:
        try:
            auto_ends_at = datetime.fromisoformat(auto_ends_at_str.replace("Z", "+00:00"))
            remaining = (auto_ends_at - now).total_seconds()
            if remaining <= 0:
                # Auto-expire
                await _execute_with_retry(
                    lambda: sb.table("access_control")
                    .update({"is_active": False, "ended_at": now.isoformat()})
                    .eq("id", row["id"])
                    .execute(),
                    "Auto-expire access_control record",
                )
                return {"is_active": False}
        except Exception:
            remaining = None
    else:
        remaining = None

    return {
        "is_active": True,
        "level": row.get("level"),
        "lecturer_name": row.get("lecturer_name"),
        "auto_ends_at": auto_ends_at_str,
        "time_remaining_seconds": max(0, int(remaining)) if remaining is not None else None,
    }


@router.get("/access-control/check")
async def check_access_control(level: str, current_user: User = Depends(get_current_user)):
    """
    Any authenticated user can call this to check if a level is currently locked.
    Auto-expires stale records before answering.
    """
    sb = _db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database unavailable")

    now = datetime.now(timezone.utc)

    # Auto-expire stale records
    try:
        await _execute_with_retry(
            lambda: sb.table("access_control")
            .update({"is_active": False, "ended_at": now.isoformat()})
            .eq("is_active", True)
            .lt("auto_ends_at", now.isoformat())
            .execute(),
            "Auto-expire stale access_control records",
        )
    except Exception as exc:
        logger.warning(f"Auto-expire step failed (non-fatal): {exc}")

    # Find active record for this level
    res = await _execute_with_retry(
        lambda: sb.table("access_control")
        .select("*")
        .eq("level", level)
        .eq("is_active", True)
        .gt("auto_ends_at", now.isoformat())
        .limit(1)
        .execute(),
        "Check access_control for level",
    )
    row = (res.data or [None])[0]
    if not row:
        return {"restricted": False}

    auto_ends_at_str = row.get("auto_ends_at")
    remaining = None
    if auto_ends_at_str:
        try:
            auto_ends_at = datetime.fromisoformat(auto_ends_at_str.replace("Z", "+00:00"))
            remaining = max(0, int((auto_ends_at - now).total_seconds()))
        except Exception:
            pass

    return {
        "restricted": True,
        "lecturer_name": row.get("lecturer_name"),
        "auto_ends_at": auto_ends_at_str,
        "time_remaining_seconds": remaining,
    }


# ---------------------------------------------------------------------------
# ADMIN LECTURER MANAGEMENT  (super_admin only)
# ---------------------------------------------------------------------------

@router.get("/admin/lecturers")
async def list_all_lecturers(current_user: User = Depends(get_current_user)):
    """List all lecturers with their active access control and submission counts."""
    await _require_super_admin(current_user)
    sb = _db()

    lecturers_res = await _execute_with_retry(
        lambda: sb.table("lecturers").select("*").order("created_at", desc=True).execute(),
        "List all lecturers (admin)",
    )
    lecturers = lecturers_res.data or []

    # Augment each row with active access_control and materials_count
    augmented = []
    for lec in lecturers:
        lec_id = lec.get("id")

        # Active access control record
        ac_res = await _execute_with_retry(
            lambda lid=lec_id: sb.table("access_control")
            .select("*")
            .eq("lecturer_id", lid)
            .eq("is_active", True)
            .limit(1)
            .execute(),
            "Fetch active access_control for lecturer",
        )
        active_ac = (ac_res.data or [None])[0]

        # Materials count
        mc_res = await _execute_with_retry(
            lambda lid=lec_id: sb.table("lecturer_materials")
            .select("id", count="exact")
            .eq("lecturer_id", lid)
            .execute(),
            "Count materials for lecturer",
        )
        materials_count = mc_res.count or 0

        augmented.append({
            **lec,
            "access_control": active_ac,
            "materials_count": materials_count,
        })

    return {"lecturers": augmented}


@router.get("/admin/lecturers/{lecturer_id}")
async def get_lecturer_detail(lecturer_id: str, current_user: User = Depends(get_current_user)):
    """Return full lecturer detail: profile, all materials (with status), and last 10 access_control records."""
    await _require_super_admin(current_user)
    sb = _db()

    # Lecturer row
    lec_res = await _execute_with_retry(
        lambda: sb.table("lecturers").select("*").eq("id", lecturer_id).limit(1).execute(),
        "Fetch single lecturer (admin)",
    )
    lecturer = (lec_res.data or [None])[0]
    if not lecturer:
        raise HTTPException(status_code=404, detail="Lecturer not found")

    # All materials (status visible)
    mat_res = await _execute_with_retry(
        lambda: sb.table("lecturer_materials")
        .select("*")
        .eq("lecturer_id", lecturer_id)
        .order("submitted_at", desc=True)
        .execute(),
        "Fetch all materials for lecturer (admin)",
    )

    # Access control history (last 10)
    ac_res = await _execute_with_retry(
        lambda: sb.table("access_control")
        .select("*")
        .eq("lecturer_id", lecturer_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute(),
        "Fetch access_control history for lecturer",
    )

    return {
        "lecturer": lecturer,
        "materials": mat_res.data or [],
        "access_control_history": ac_res.data or [],
    }


@router.delete("/admin/lecturers/{lecturer_id}")
async def delete_lecturer(lecturer_id: str, current_user: User = Depends(get_current_user)):
    """Delete a lecturer row (CASCADE removes materials + access_control) and the auth user."""
    await _require_super_admin(current_user)
    sb = _db()

    # Fetch user_id before deleting the row
    lec_res = await _execute_with_retry(
        lambda: sb.table("lecturers").select("user_id").eq("id", lecturer_id).limit(1).execute(),
        "Fetch lecturer user_id for deletion",
    )
    lecturer = (lec_res.data or [None])[0]
    if not lecturer:
        raise HTTPException(status_code=404, detail="Lecturer not found")

    user_id = lecturer.get("user_id")

    # Delete lecturer row (CASCADE handles children)
    await _execute_with_retry(
        lambda: sb.table("lecturers").delete().eq("id", lecturer_id).execute(),
        "Delete lecturer row",
    )

    # Delete auth user
    if user_id:
        try:
            await asyncio.to_thread(lambda: sb.auth.admin.delete_user(user_id))
        except Exception as exc:
            logger.error(f"Auth user deletion failed for {user_id}: {exc}")

    return {"success": True}
