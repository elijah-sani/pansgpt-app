"""
Notes Router  Save, fetch, and delete document highlights/notes.
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel, field_validator
from typing import Optional, List
import logging
import asyncio
import uuid
from datetime import datetime, timezone
from dependencies import get_current_user, User
from services import llm_engine
from . import shared
from .shared import (
    _execute_with_retry,
    verify_api_key,
    logger,
)
from .sanitize import sanitize_text, NOTE_MAX
from utils.thinking_token_utils import strip_thinking_tokens

router = APIRouter(prefix="/notes", tags=["notes"])

# Module-level cache: drive_file_id (or any non-UUID) → resolved UUID
# Avoids a redundant DB lookup on every notes request after the first.
_doc_uuid_cache: dict[str, str] = {}


# ---------- Models ----------
class NoteCreateRequest(BaseModel):
    document_id: Optional[str] = None
    image_base64: Optional[str] = ''
    ai_explanation: Optional[str] = None
    user_annotation: Optional[str] = None
    page_number: Optional[int] = None
    title: Optional[str] = None
    content: Optional[list] = None
    tags: List[str] = []

    @field_validator('user_annotation', mode='before')
    @classmethod
    def sanitize_annotation(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(v, NOTE_MAX) or None

class NoteUpdateRequest(BaseModel):
    user_annotation: Optional[str] = None
    title: Optional[str] = None
    content: Optional[list] = None
    tags: Optional[List[str]] = None
    append_blocks: Optional[bool] = False
    image_base64: Optional[str] = None
    page_number: Optional[int] = None

    @field_validator('user_annotation', mode='before')
    @classmethod
    def sanitize_annotation(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_text(v, NOTE_MAX) or None

class NoteResponse(BaseModel):
    id: str
    user_id: str
    document_id: Optional[str] = None
    image_base64: Optional[str] = None
    ai_explanation: Optional[str] = None
    category: Optional[str] = None
    page_number: Optional[int] = None
    user_annotation: Optional[str] = None
    created_at: str
    title: Optional[str] = None
    content: Optional[list] = None
    tags: Optional[List[str]] = None
    last_edited_at: Optional[str] = None


async def _resolve_document_uuid(sb, document_id: str) -> str:
    """Accept either a pans_library UUID or a Drive file ID and return UUID.
    Results are cached in _doc_uuid_cache so the extra DB lookup runs at most
    once per server start per unique document ID.
    """
    try:
        return str(uuid.UUID(document_id))
    except Exception:
        pass

    if document_id in _doc_uuid_cache:
        return _doc_uuid_cache[document_id]

    try:
        res = await _execute_with_retry(
            lambda: sb.table("pans_library")
                .select("id")
                .eq("drive_file_id", document_id)
                .limit(1)
                .execute(),
            "Resolve notes document id",
        )
    except Exception as e:
        logger.error(f"Resolve notes document id error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load notes. Please try again.")

    if not res.data or len(res.data) == 0:
        raise HTTPException(status_code=404, detail="Document not found.")

    resolved = res.data[0]["id"]
    _doc_uuid_cache[document_id] = resolved
    return resolved


async def _fix_typos(text: str) -> str:
    if not text or len(text.strip()) < 3:
        return text
    try:
        if llm_engine.google_client is None:
            return text

        response = await asyncio.wait_for(
            llm_engine.google_client.chat.completions.create(
                model="gemma-4-26b-it",
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Fix ONLY spelling mistakes, typos, and obvious grammatical errors in the text below. "
                            "Do NOT change wording, meaning, structure, or add new content. "
                            "Do NOT add explanations — respond with ONLY the corrected text. "
                            "If the text has no errors, return it exactly as-is.\n\n"
                            f"Text: {text}"
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=500,
                stream=False,
            ),
            timeout=5.0,
        )

        corrected = strip_thinking_tokens((response.choices[0].message.content or "").strip())
        if not corrected or len(corrected) > len(text) * 3:
            return text
        return corrected
    except asyncio.TimeoutError:
        logger.warning("Typo correction skipped: model took too long")
        return text
    except Exception as e:
        logger.warning(f"Typo correction failed (non-fatal): {e}")
        return text


async def _background_fix_and_update(note_id: str, text: str):
    try:
        corrected = await _fix_typos(text)
        if corrected == text:
            return
        sb = shared.supabase_service_client or shared.supabase_client
        if not sb:
            return
        await _execute_with_retry(
            lambda: sb.table("document_notes")
                .update({"user_annotation": corrected})
                .eq("id", str(note_id))
                .execute(),
            "Background typo fix",
        )
        logger.info(f"Background typo fix applied for note {note_id}")
    except Exception as e:
        logger.warning(f"Background typo fix failed (non-fatal): {e}")


# ---------- Routes ----------

@router.get("", dependencies=[Depends(verify_api_key)])
async def get_all_notes(
    search: Optional[str] = None,
    tag: Optional[str] = None,
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Fetch all notes for the current user globally (not filtered by document)."""
    sb = shared.supabase_service_client or shared.supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        query = sb.table("document_notes").select("*").eq("user_id", current_user.id)
        
        if search:
            query = query.or_(f"title.ilike.%{search}%,user_annotation.ilike.%{search}%")
        if tag:
            query = query.contains("tags", [tag])
        if category:
            query = query.eq("category", category)
            
        res = await _execute_with_retry(
            lambda: query.order("last_edited_at", desc=True).execute(),
            "Fetch all notes",
        )
        return {"notes": res.data or []}
    except Exception as e:
        logger.error(f"Fetch all notes error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load notes. Please try again.")


@router.post("", dependencies=[Depends(verify_api_key)])
async def save_note(
    body: NoteCreateRequest,
    current_user: User = Depends(get_current_user)
):
    """Save a highlighted snippet as a note."""
    sb = shared.supabase_service_client or shared.supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    resolved_document_id = None
    if body.document_id:
        resolved_document_id = await _resolve_document_uuid(sb, body.document_id)

    initial_category = None
    initial_explanation = None

    try:
        insert_payload = {
            "user_id": current_user.id,
            "document_id": resolved_document_id,
            "image_base64": body.image_base64 or '',
            "ai_explanation": initial_explanation,
            "category": initial_category,
            "page_number": body.page_number,
            "user_annotation": body.user_annotation,
            "last_edited_at": datetime.now(timezone.utc).isoformat()
        }
        if body.title is not None:
            insert_payload["title"] = body.title
        if body.content is not None:
            insert_payload["content"] = body.content
        if body.tags is not None:
            insert_payload["tags"] = body.tags

        res = await _execute_with_retry(
            lambda: sb.table("document_notes").insert(insert_payload).execute(),
            "Save document note",
        )
        saved = res.data[0]

        if body.user_annotation and body.user_annotation.strip():
            asyncio.create_task(_background_fix_and_update(saved["id"], body.user_annotation))
        return saved
    except Exception as e:
        logger.error(f"Save note error: {e}")
        raise HTTPException(status_code=500, detail="Unable to save note. Please try again.")


@router.get(
    "/{document_id}",
    response_model=Optional[NoteResponse],
    dependencies=[Depends(verify_api_key)],
)
async def get_notes(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch the most recent note for a document belonging to the current user."""
    sb = shared.supabase_service_client or shared.supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    resolved_document_id = await _resolve_document_uuid(sb, document_id)

    try:
        res = await _execute_with_retry(
            lambda: sb.table("document_notes")
                .select("*")
                .eq("user_id", current_user.id)
                .eq("document_id", resolved_document_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute(),
            "Fetch document notes",
        )
        if not res.data:
            return None
        return res.data[0]
    except Exception as e:
        logger.error(f"Fetch notes error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load notes. Please try again.")


@router.patch("/{note_id}", dependencies=[Depends(verify_api_key)])
async def update_note(
    note_id: str,
    body: NoteUpdateRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a specific note owned by the current user."""
    sb = shared.supabase_service_client or shared.supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        update_payload = {
            "last_edited_at": datetime.now(timezone.utc).isoformat()
        }
        
        if body.user_annotation is not None:
            update_payload["user_annotation"] = body.user_annotation
        if body.title is not None:
            update_payload["title"] = body.title
        if body.tags is not None:
            update_payload["tags"] = body.tags
        if body.image_base64 is not None:
            update_payload["image_base64"] = body.image_base64
        if body.page_number is not None:
            update_payload["page_number"] = body.page_number

        if body.content is not None:
            if getattr(body, 'append_blocks', False):
                res = await _execute_with_retry(
                    lambda: sb.table("document_notes")
                        .select("content")
                        .eq("id", note_id)
                        .eq("user_id", current_user.id)
                        .execute(),
                    "Fetch note content for append",
                )
                if not res.data:
                    raise HTTPException(status_code=404, detail="Note not found.")
                existing_content = res.data[0].get("content") or []
                update_payload["content"] = existing_content + body.content
            else:
                update_payload["content"] = body.content

        res = await _execute_with_retry(
            lambda: sb.table("document_notes")
                .update(update_payload)
                .eq("id", note_id)
                .eq("user_id", current_user.id)
                .execute(),
            "Update document note",
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Note not found.")
        saved = res.data[0]

        if body.user_annotation and body.user_annotation.strip():
            asyncio.create_task(_background_fix_and_update(note_id, body.user_annotation))
        return saved
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update note error: {e}")
        raise HTTPException(status_code=500, detail="Unable to update note. Please try again.")


@router.delete("/{note_id}", dependencies=[Depends(verify_api_key)])
async def delete_note(
    note_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a specific note owned by the current user."""
    sb = shared.supabase_service_client or shared.supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        await _execute_with_retry(
            lambda: sb.table("document_notes")
                .delete()
                .eq("id", note_id)
                .eq("user_id", current_user.id)
                .execute(),
            "Delete document note",
        )
        return {"status": "success", "id": note_id}
    except Exception as e:
        logger.error(f"Delete note error: {e}")
        raise HTTPException(status_code=500, detail="Unable to delete note. Please try again.")
