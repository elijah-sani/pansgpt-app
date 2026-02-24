"""
User router – Profile, achievements, and timetable.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/api/user", tags=["user"])

_supabase = None
_verify_api_key = None


def set_dependencies(supabase_client, verify_api_key_fn):
    global _supabase, _verify_api_key
    _supabase = supabase_client
    _verify_api_key = verify_api_key_fn


def _get_supabase():
    if _supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return _supabase


# ---------- Models ----------
class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    other_names: Optional[str] = None
    university: Optional[str] = None
    level: Optional[str] = None
    bio: Optional[str] = None


# ---------- Routes ----------

@router.get("")
async def get_user(userId: str):
    """Get user profile from Supabase profiles table."""
    sb = _get_supabase()
    try:
        res = sb.table("profiles") \
            .select("*") \
            .eq("id", userId) \
            .single() \
            .execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = res.data

        # Compute quiz analytics
        quiz_res = sb.table("quiz_results") \
            .select("score, max_score, percentage") \
            .eq("user_id", userId) \
            .execute()

        results = quiz_res.data or []
        total_quizzes = len(results)
        average_score = sum(r["percentage"] for r in results) / total_quizzes if total_quizzes > 0 else 0
        total_points = sum(r["score"] for r in results)

        return {
            "user": {
                **user,
                "name": f"{user.get('first_name', '')} {user.get('other_names', '')}".strip(),
            },
            "quizAnalytics": {
                "averageScore": round(average_score, 1),
                "totalQuizzes": total_quizzes,
                "totalPoints": total_points,
            },
            "achievements": user.get("achievements", []),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("")
async def update_user(userId: str, body: ProfileUpdate):
    """Update user profile."""
    sb = _get_supabase()
    try:
        update_data = {k: v for k, v in body.dict().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        res = sb.table("profiles") \
            .update(update_data) \
            .eq("id", userId) \
            .execute()

        return {"success": True, "user": res.data[0] if res.data else None}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timetable/{level}")
async def get_timetable(level: str):
    """Get timetable entries for a given level."""
    sb = _get_supabase()
    try:
        res = sb.table("timetables") \
            .select("*") \
            .eq("level", level) \
            .order("day") \
            .execute()

        return {"timetable": res.data or []}

    except Exception as e:
        logger.error(f"Get timetable error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
