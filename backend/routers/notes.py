"""
Notes Router  Save, fetch, and delete document highlights/notes.
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List
import logging
import asyncio
import uuid
from dependencies import get_current_user, User
from services import llm_engine
from . import shared
from .shared import (
    _execute_with_retry,
    verify_api_key,
    logger,
)

router = APIRouter(prefix="/notes", tags=["notes"])


# ---------- Models ----------
class SaveNoteRequest(BaseModel):
    document_id: str
    image_base64: str = ''
    page_number: Optional[int] = None
    user_annotation: Optional[str] = None


class NoteResponse(BaseModel):
    id: str
    document_id: str
    image_base64: str
    ai_explanation: Optional[str]
    category: Optional[str]
    page_number: Optional[int]
    user_annotation: Optional[str]
    created_at: str


async def _resolve_document_uuid(sb, document_id: str) -> str:
    """Accept either a pans_library UUID or a Drive file ID and return UUID."""
    try:
        return str(uuid.UUID(document_id))
    except Exception:
        pass

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

    return res.data[0]["id"]


# ---------- AI Categorization ----------
async def _categorize_note(image_base64: str, annotation: Optional[str] = None) -> dict:
    """
    Use Gemma 3 12B to generate a brief explanation and category for a saved note.
    Returns dict with 'explanation' and 'category'.
    Falls back gracefully on any error.
    """
    if not image_base64:
        # Text-only note  classify based on annotation text
        return {"explanation": None, "category": "Key Point"}

    try:
        if llm_engine.google_client is None:
            return {"explanation": None, "category": "Key Point"}

        prompt = (
            "You are analyzing a snippet from a pharmacy textbook or lecture slide.\n"
            "Provide:\n"
            "1. CATEGORY: One of: Definition, Key Point, Formula, Important\n"
            "2. EXPLANATION: A single concise sentence (max 30 words) summarizing what this snippet contains.\n\n"
            "Respond in this exact format:\n"
            "CATEGORY: <category>\n"
            "EXPLANATION: <explanation>"
        )

        response = await llm_engine.google_client.chat.completions.create(
            model=llm_engine.TEXT_SECONDARY,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_base64}"}
                        },
                        {"type": "text", "text": prompt}
                    ]
                }
            ],
            temperature=0.2,
            max_tokens=100,
            stream=False,
        )

        raw = (response.choices[0].message.content or "").strip()
        category = "Key Point"
        explanation = None

        for line in raw.splitlines():
            if line.startswith("CATEGORY:"):
                val = line.replace("CATEGORY:", "").strip()
                if val in ("Definition", "Key Point", "Formula", "Important"):
                    category = val
            elif line.startswith("EXPLANATION:"):
                explanation = line.replace("EXPLANATION:", "").strip()

        return {"explanation": explanation, "category": category}

    except Exception as e:
        logger.warning(f"Note categorization failed: {e}")
        return {"explanation": None, "category": "Key Point"}


async def _fix_typos(text: str) -> str:
    """Use AI to fix typos and misspellings while preserving the original meaning."""
    if not text or len(text.strip()) < 3:
        return text
    try:
        if llm_engine.google_client is None:
            return text

        response = await llm_engine.google_client.chat.completions.create(
            model=llm_engine.TEXT_SECONDARY,
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
        )

        corrected = (response.choices[0].message.content or "").strip()
        # Safety check: if the AI returned something wildly different or empty, keep original
        if not corrected or len(corrected) > len(text) * 3:
            return text
        return corrected
    except Exception as e:
        logger.warning(f"Typo correction failed (non-fatal): {e}")
        return text


async def _background_fix_and_update(note_id: str, text: str):
    """Background task: fix typos then update the DB record silently."""
    try:
        corrected = await _fix_typos(text)
        if corrected == text:
            return  # Nothing to update
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
@router.post("", dependencies=[Depends(verify_api_key)])
async def save_note(
    body: SaveNoteRequest,
    current_user: User = Depends(get_current_user)
):
    """Save a highlighted snippet as a note with AI categorization."""
    sb = shared.supabase_service_client or shared.supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    # Run AI categorization (instant for text-only notes, async for images)
    ai_result = await _categorize_note(body.image_base64, body.user_annotation)
    resolved_document_id = await _resolve_document_uuid(sb, body.document_id)

    try:
        res = await _execute_with_retry(
            lambda: sb.table("document_notes").insert({
                "user_id": current_user.id,
                "document_id": resolved_document_id,
                "image_base64": body.image_base64,
                "ai_explanation": ai_result["explanation"],
                "category": ai_result["category"],
                "page_number": body.page_number,
                "user_annotation": body.user_annotation,
            }).execute(),
            "Save document note",
        )
        saved = res.data[0]
        # Fire-and-forget: correct typos in background, don't block the response
        if body.user_annotation and body.user_annotation.strip():
            asyncio.create_task(_background_fix_and_update(saved["id"], body.user_annotation))
        return saved
    except Exception as e:
        logger.error(f"Save note error: {e}")
        raise HTTPException(status_code=500, detail="Unable to save note. Please try again.")


@router.get("/{document_id}", dependencies=[Depends(verify_api_key)])
async def get_notes(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Fetch all notes for a document belonging to the current user."""
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
                .order("created_at", desc=False)
                .execute(),
            "Fetch document notes",
        )
        return {"notes": res.data or []}
    except Exception as e:
        logger.error(f"Fetch notes error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load notes. Please try again.")


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


class UpdateNoteRequest(BaseModel):
    user_annotation: str


@router.patch("/{note_id}", dependencies=[Depends(verify_api_key)])
async def update_note(
    note_id: str,
    body: UpdateNoteRequest,
    current_user: User = Depends(get_current_user)
):
    """Update the annotation text of a specific note owned by the current user."""
    sb = shared.supabase_service_client or shared.supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        res = await _execute_with_retry(
            lambda: sb.table("document_notes")
                .update({"user_annotation": body.user_annotation})
                .eq("id", note_id)
                .eq("user_id", current_user.id)
                .execute(),
            "Update document note",
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Note not found.")
        saved = res.data[0]
        # Fire-and-forget: correct typos in background
        if body.user_annotation and body.user_annotation.strip():
            asyncio.create_task(_background_fix_and_update(note_id, body.user_annotation))
        return saved
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update note error: {e}")
        raise HTTPException(status_code=500, detail="Unable to update note. Please try again.")

