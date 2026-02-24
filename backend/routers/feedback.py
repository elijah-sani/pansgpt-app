"""
Feedback router – Message-level feedback (thumbs up/down).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

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


class MessageFeedbackBody(BaseModel):
    messageId: Optional[str] = None
    rating: str  # "thumbs_up", "thumbs_down", "popup_feedback"
    feedback: Optional[str] = None
    messageContent: Optional[str] = None
    userPrompt: Optional[str] = None
    userId: str


@router.post("/message")
async def save_message_feedback(body: MessageFeedbackBody):
    """Save thumbs up/down or popup feedback for a message."""
    sb = _get_supabase()
    try:
        res = sb.table("message_feedback").insert({
            "message_id": body.messageId,
            "user_id": body.userId,
            "rating": body.rating,
            "feedback": body.feedback,
            "message_content": body.messageContent,
            "user_prompt": body.userPrompt,
        }).execute()

        return {"success": True, "id": res.data[0]["id"] if res.data else None}

    except Exception as e:
        logger.error(f"Save feedback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
