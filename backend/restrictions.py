import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def normalize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def parse_timestamp(value: Any, field_name: str) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        raw = str(value or "").strip()
        if not raw:
            raise ValueError(f"{field_name} is required")
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise ValueError(f"{field_name} must be a valid ISO datetime") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def build_level_candidates(level: Optional[str]) -> list[str]:
    normalized = normalize_optional_text(level)
    if not normalized:
        return []

    digits = "".join(ch for ch in normalized if ch.isdigit())
    candidates = [normalized, normalized.lower()]
    if digits:
        candidates.extend([digits, f"{digits}lvl", f"{digits}l", f"{digits} Level"])

    seen = set()
    ordered = []
    for candidate in candidates:
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(candidate)
    return ordered


def compute_restriction_status(
    start_time: Any,
    end_time: Any,
    stored_status: Optional[str] = None,
    *,
    now: Optional[datetime] = None,
) -> str:
    normalized_stored = (stored_status or "").strip().lower()
    if normalized_stored == "cancelled":
        return "cancelled"

    current_time = now or utc_now()
    start_dt = parse_timestamp(start_time, "start_time")
    end_dt = parse_timestamp(end_time, "end_time")

    if current_time < start_dt:
        return "scheduled"
    if current_time <= end_dt:
        return "active"
    return "completed"


def restriction_row_to_response(row: Dict[str, Any]) -> Dict[str, Any]:
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

    return {
        "id": row.get("id"),
        "title": row.get("title"),
        "course_code": row.get("course_code"),
        "course_title": row.get("course_title"),
        "level": row.get("level"),
        "start_time": row.get("start_time"),
        "end_time": row.get("end_time"),
        "reason": row.get("reason"),
        "status": compute_restriction_status(row.get("start_time"), row.get("end_time"), row.get("status")),
        "lecturer_title": lecturer.get("title"),
        "lecturer_name": lecturer.get("full_name"),
        "university_name": university.get("name"),
        "created_at": row.get("created_at"),
        "cancelled_by": row.get("cancelled_by"),
        "cancelled_at": row.get("cancelled_at"),
    }


def student_active_restriction_response(row: Dict[str, Any]) -> Dict[str, Any]:
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

    return {
        "course_code": row.get("course_code"),
        "course_title": row.get("course_title"),
        "title": row.get("title"),
        "reason": row.get("reason"),
        "start_time": row.get("start_time"),
        "end_time": row.get("end_time"),
        "lecturer_title": lecturer.get("title"),
        "lecturer_full_name": lecturer.get("full_name"),
        "university_name": university.get("name"),
        "level": row.get("level"),
    }


def build_restriction_select() -> str:
    return (
        "id,university_id,lecturer_id,title,course_code,course_title,level,start_time,end_time,"
        "reason,status,cancelled_by,cancelled_at,created_at,updated_at,"
        "lecturer:lecturer_profiles!exam_restrictions_lecturer_id_fkey("
        "id,user_id,university_id,title,full_name,email,status"
        "),"
        "university:universities!exam_restrictions_university_id_fkey(id,name,status)"
    )


async def get_active_student_restriction(
    sb,
    *,
    user_id: Optional[str] = None,
    profile: Optional[Dict[str, Any]] = None,
    execute_fn=None,
) -> Optional[Dict[str, Any]]:
    async def _execute(query_fn, operation_name: str):
        if execute_fn:
            return await execute_fn(query_fn, operation_name)
        return await asyncio.to_thread(query_fn)

    student_profile = profile
    if student_profile is None:
        normalized_user_id = normalize_optional_text(user_id)
        if not normalized_user_id:
            raise ValueError("user_id or profile is required")
        profile_res = await _execute(
            lambda: sb.table("profiles")
            .select("id,university,level")
            .eq("id", normalized_user_id)
            .limit(1)
            .execute(),
            "Fetch student profile for restriction check",
        )
        profile_rows = profile_res.data or []
        student_profile = profile_rows[0] if profile_rows else None

    if not student_profile:
        return None

    university_name = normalize_optional_text(student_profile.get("university"))
    level = normalize_optional_text(student_profile.get("level"))
    level_candidates = build_level_candidates(level)
    if not university_name or not level_candidates:
        return None

    university_res = await _execute(
        lambda: sb.table("universities")
        .select("id,name,status")
        .ilike("name", university_name)
        .eq("status", "active")
        .limit(1)
        .execute(),
        "Resolve student university for restriction check",
    )
    university_rows = university_res.data or []
    university_row = university_rows[0] if university_rows else None
    if not university_row:
        return None

    now_iso = utc_now().isoformat()
    restriction_res = await _execute(
        lambda: sb.table("exam_restrictions")
        .select(build_restriction_select())
        .eq("university_id", university_row.get("id"))
        .in_("level", level_candidates)
        .neq("status", "cancelled")
        .lte("start_time", now_iso)
        .gte("end_time", now_iso)
        .order("start_time", desc=False)
        .limit(1)
        .execute(),
        "Fetch active student restriction",
    )
    restriction_rows = restriction_res.data or []
    restriction_row = restriction_rows[0] if restriction_rows else None
    if not restriction_row:
        return None

    return student_active_restriction_response(restriction_row)
