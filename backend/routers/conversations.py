"""
Conversations router – CRUD operations for chat conversations and messages.
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from typing import List, Optional
import logging

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

# Dependencies (injected from api.py)
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
class MessageIn(BaseModel):
    role: str
    content: str
    citations: Optional[list] = None
    createdAt: Optional[str] = None


class ConversationSave(BaseModel):
    id: Optional[str] = None
    title: str = "New Conversation"
    messages: List[MessageIn] = []
    userId: str


class RenameBody(BaseModel):
    title: str


# ---------- Routes ----------

@router.get("")
async def list_conversations(
    userId: str = Query(...),
    limit: int = Query(50),
    messageLimit: int = Query(50),
):
    """List a user's conversations with their messages."""
    sb = _get_supabase()
    try:
        # Fetch conversations ordered by updated_at desc
        res = sb.table("conversations") \
            .select("*") \
            .eq("user_id", userId) \
            .order("updated_at", desc=True) \
            .limit(limit) \
            .execute()

        conversations = []
        for conv in (res.data or []):
            # Fetch messages for each conversation
            msg_res = sb.table("messages") \
                .select("*") \
                .eq("conversation_id", conv["id"]) \
                .order("created_at", desc=False) \
                .limit(messageLimit) \
                .execute()

            conversations.append({
                "id": conv["id"],
                "title": conv.get("title", "New Conversation"),
                "createdAt": conv.get("created_at"),
                "updatedAt": conv.get("updated_at"),
                "messages": [
                    {
                        "id": m["id"],
                        "role": m["role"],
                        "content": m["content"],
                        "citations": m.get("citations"),
                        "createdAt": m.get("created_at"),
                    }
                    for m in (msg_res.data or [])
                ],
            })

        return {"conversations": conversations}

    except Exception as e:
        logger.error(f"Error listing conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get a single conversation with all its messages."""
    sb = _get_supabase()
    try:
        conv_res = sb.table("conversations") \
            .select("*") \
            .eq("id", conversation_id) \
            .single() \
            .execute()

        if not conv_res.data:
            raise HTTPException(status_code=404, detail="Conversation not found")

        conv = conv_res.data
        msg_res = sb.table("messages") \
            .select("*") \
            .eq("conversation_id", conversation_id) \
            .order("created_at", desc=False) \
            .execute()

        return {
            "conversation": {
                "id": conv["id"],
                "title": conv.get("title", "New Conversation"),
                "createdAt": conv.get("created_at"),
                "updatedAt": conv.get("updated_at"),
                "messages": [
                    {
                        "id": m["id"],
                        "role": m["role"],
                        "content": m["content"],
                        "citations": m.get("citations"),
                        "createdAt": m.get("created_at"),
                    }
                    for m in (msg_res.data or [])
                ],
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def save_conversation(body: ConversationSave):
    """Create or update a conversation with messages."""
    sb = _get_supabase()
    try:
        is_temp = body.id and body.id.startswith("temp_")

        if body.id and not is_temp:
            # Update existing conversation
            sb.table("conversations") \
                .update({"title": body.title, "updated_at": "now()"}) \
                .eq("id", body.id) \
                .execute()

            # Delete old messages and re-insert
            sb.table("messages") \
                .delete() \
                .eq("conversation_id", body.id) \
                .execute()

            conversation_id = body.id
        else:
            # Create new conversation
            conv_res = sb.table("conversations").insert({
                "user_id": body.userId,
                "title": body.title,
            }).execute()
            conversation_id = conv_res.data[0]["id"]

        # Insert messages
        if body.messages:
            messages_to_insert = []
            for msg in body.messages:
                messages_to_insert.append({
                    "conversation_id": conversation_id,
                    "user_id": body.userId,
                    "role": msg.role,
                    "content": msg.content,
                    "citations": msg.citations,
                })
            sb.table("messages").insert(messages_to_insert).execute()

        # Re-fetch the saved conversation
        return await get_conversation(conversation_id)
        
    except Exception as e:
        logger.error(f"Error saving conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation and all its messages."""
    sb = _get_supabase()
    try:
        sb.table("conversations") \
            .delete() \
            .eq("id", conversation_id) \
            .execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{conversation_id}/rename")
async def rename_conversation(conversation_id: str, body: RenameBody):
    """Rename a conversation."""
    sb = _get_supabase()
    try:
        sb.table("conversations") \
            .update({"title": body.title, "updated_at": "now()"}) \
            .eq("id", conversation_id) \
            .execute()
        return {"success": True, "title": body.title}
    except Exception as e:
        logger.error(f"Error renaming conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
