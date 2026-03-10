"""
Library Router: Document Management Endpoints
Handles upload, list, delete, and update operations for documents.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, BackgroundTasks, Header
from dependencies import get_current_user, User
from fastapi.responses import JSONResponse
from uuid import uuid4
from pydantic import BaseModel
from typing import Optional
import json
import os
import logging
import io
import base64
import asyncio
import time
from functools import partial

# RAG & Extraction Imports
from google import genai  # v1 SDK
from google.genai import types
import fitz  # PyMuPDF
from PIL import Image
# from groq import Groq  <-- Removed
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/admin", tags=["library"])

# These will be injected from main api.py
drive_service = None
supabase_client = None
supabase_service_client = None
verify_api_key_handler = None
GOOGLE_DRIVE_FOLDER_ID = None

async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected admin library endpoints.
    """
    if verify_api_key_handler is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return await verify_api_key_handler(x_api_key)

def _db_client():
    """
    Prefer service-role client for admin/background operations so RLS does not block writes.
    Falls back to regular client if service-role is unavailable.
    """
    return supabase_service_client or supabase_client

def _is_retryable_network_error(exc: Exception) -> bool:
    """
    Return True for transient SSL/timeout failures that should be retried.
    """
    msg = str(exc).lower()
    retry_markers = (
        "timed out",
        "timeout",
        "the handshake operation timed out",
        "the read operation timed out",
        "_ssl.c",
        "ssl",
    )
    return any(marker in msg for marker in retry_markers)

async def _execute_with_retry_async(execute_fn, operation_name: str, max_attempts: int = 3):
    """
    Retry transient Supabase calls from async code paths.
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await asyncio.to_thread(execute_fn)
        except Exception as e:
            last_error = e
            if attempt < max_attempts and _is_retryable_network_error(e):
                logger.warning(
                    f"[WARNING] {operation_name} failed (attempt {attempt}/{max_attempts}), retrying: {e}"
                )
                await asyncio.sleep(1)
                continue
            raise
    raise last_error

def _execute_with_retry_sync(execute_fn, operation_name: str, max_attempts: int = 3):
    """
    Retry transient Supabase calls from sync code paths.
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return execute_fn()
        except Exception as e:
            last_error = e
            if attempt < max_attempts and _is_retryable_network_error(e):
                logger.warning(
                    f"[WARNING] {operation_name} failed (attempt {attempt}/{max_attempts}), retrying: {e}"
                )
                time.sleep(1)
                continue
            raise
    raise last_error

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
gemini_client = None
if GOOGLE_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
        logger.info("[INFO] Gemini Client initialized for RAG")
    except Exception as e:
        logger.error(f"[ERROR] Failed to init Gemini Client: {e}")

else:
    logger.warning("[WARNING] GOOGLE_API_KEY not set, RAG ingestion will fail")

# --- Models ---
class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    course_code: Optional[str] = None
    lecturer_name: Optional[str] = None
    topic: Optional[str] = None
    target_levels: Optional[list[str]] = None


class ProgressUpsert(BaseModel):
    current_page: int
    total_pages: int

# --- Google Vision Client (OpenAI Compatible) ---
# Note: Using Synchronous Client for background threads
from openai import OpenAI

# Initialize Google Client
vision_client = None
if GOOGLE_API_KEY:
    try:
        vision_client = OpenAI(
            api_key=GOOGLE_API_KEY,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )
        logger.info("[INFO] Google Vision Client Initialized")
    except Exception as e:
        logger.error(f"[ERROR] Failed to init Vision Client: {e}")
else:
    logger.warning("[WARNING] GOOGLE_API_KEY not set, Vision features will fail")

# --- Global Model Constants ---
HEAVY_VISION_MODEL = "gemma-3-27b-it"  # For images/multimodal
FAST_TEXT_MODEL = "gemma-3-12b-it"     # For pure text
MAX_VISION_RETRIES = 5
VISION_RETRY_BASE_DELAY_SECONDS = 1.0
VISION_REQUEST_THROTTLE_SECONDS = 2.1


# --- Hybrid Extraction Helpers ---

def merge_system_into_user_sync(messages: list[dict]) -> list[dict]:
    """
    Merges all 'system' role messages into the first 'user' role message.
    Required for Google AI Studio's OpenAI-compatible endpoint.
    """
    system_content = []
    cleaned_messages = []
    
    # 1. Extract system messages
    for msg in messages:
        if msg.get("role") == "system":
            content = msg.get("content")
            if content:
                system_content.append(content)
        else:
            cleaned_messages.append(msg)
            
    if not system_content:
        return cleaned_messages
        
    full_system_prompt = "\n\n".join(system_content)
    full_system_prompt = f"SYSTEM INSTRUCTIONS:\n{full_system_prompt}\n\nUSER REQUEST:\n"
    
    # 2. Prepend to first user message
    for msg in cleaned_messages:
        if msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, str):
                msg["content"] = full_system_prompt + content
            elif isinstance(content, list):
                # Multimodal content list -> insert text block at start
                content.insert(0, {"type": "text", "text": full_system_prompt})
            break
            
    return cleaned_messages

async def _mark_document_failed(document_id: str, reason: str) -> None:
    """
    Mark a document as failed in Supabase.
    """
    db = _db_client()
    if not db:
        return
    try:
        await _execute_with_retry_async(
            lambda: db.table("pans_library").update({
                "embedding_status": "failed",
                "embedding_error": reason
            }).eq("id", document_id).execute(),
            "Mark document as failed",
        )
    except Exception as update_err:
        logger.error(f"Failed to persist failed status for {document_id}: {update_err}")


async def analyze_image_with_llama(image_bytes: bytes, document_id: str, page_num: int) -> str:
    """Sends image bytes to Gemma Vision (via Google) for a concise description.
    Retries with capped exponential backoff on transient/rate-limit failures."""
    if not vision_client:
        logger.warning("Vision client not configured, skipping image analysis")
        return ""

    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    for attempt in range(MAX_VISION_RETRIES):
        try:
            messages = [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this diagram or chart in detail for study notes. Be concise."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            }]
            messages = merge_system_into_user_sync(messages)

            response = await asyncio.to_thread(
                partial(
                    vision_client.chat.completions.create,
                    model=HEAVY_VISION_MODEL,
                    messages=messages,
                    max_tokens=500
                )
            )
            description = response.choices[0].message.content
            return f"\n\n[Visual Description: {description}]\n\n"
        except Exception as e:
            error_str = str(e).lower()
            retryable = (
                "429" in str(e)
                or "rate" in error_str
                or "rate_limit" in error_str
                or "timeout" in error_str
                or "tempor" in error_str
            )
            if not retryable:
                logger.error(f"Vision analysis error on page {page_num} (non-retryable): {e}")
                return ""

            if attempt == MAX_VISION_RETRIES - 1:
                failure_reason = (
                    f"Vision analysis failed after {MAX_VISION_RETRIES} retries "
                    f"(document={document_id}, page={page_num}): {e}"
                )
                logger.critical(failure_reason)
                await _mark_document_failed(document_id, failure_reason)
                raise RuntimeError(failure_reason)

            delay = VISION_RETRY_BASE_DELAY_SECONDS * (2 ** attempt)
            logger.warning(
                f"Vision transient error on page {page_num}, "
                f"retry {attempt + 1}/{MAX_VISION_RETRIES} in {delay:.1f}s: {e}"
            )
            await asyncio.sleep(delay)

    return ""


def process_page_images(page) -> list[bytes]:
    """Extracts valid images from a single fitz page, filtering junk."""
    valid_images = []
    image_list = page.get_images(full=True)

    for img in image_list:
        xref = img[0]
        try:
            base_image = page.parent.extract_image(xref)
            image_bytes = base_image["image"]

            # --- Junk Filter ---
            pil_image = Image.open(io.BytesIO(image_bytes))

            # 1. Filter by Size (Ignore icons/lines < 100px)
            if pil_image.width < 100 or pil_image.height < 100:
                continue

            # 2. Filter by Aspect Ratio (Ignore tiny banners)
            if pil_image.width / pil_image.height > 5 or pil_image.height / pil_image.width > 5:
                continue

            valid_images.append(image_bytes)

        except Exception:
            continue

    return valid_images


# --- Progress Helper with Throttling & Retry ---
# Simple in-memory tracker to avoid hitting DB too often
_progress_cache = {}

def _update_progress(doc_id: str, current_step: int, total_steps: int = 100):
    """
    Updates Supabase progress with throttling (only saves every 5%) and retry logic.
    """
    try:
        db = _db_client()
        if not db:
            return
        # 1. Calculate Percentage
        if total_steps == 0: return
        # Support both (id, 42) where 42 is % and (id, 5, 10) where 5/10 is 50%
        raw_progress = (current_step / total_steps) * 100
        new_progress = max(0, min(100, int(raw_progress)))

        # 2. Throttle: Don't write if we haven't moved much
        last_saved = _progress_cache.get(doc_id, -1)
        
        # Only save if:
        # a) We jumped at least 5%
        # b) We are finished (100%)
        # c) It's the very first update
        if new_progress < 100 and (new_progress - last_saved) < 5:
            return

        # 3. Retry Logic for Supabase
        try:
            _execute_with_retry_sync(
                lambda: db.table('pans_library').update({
                    'embedding_progress': new_progress
                }).eq('id', doc_id).execute(),
                f"Update embedding progress for {doc_id}",
            )
            # Update cache ONLY after successful commit
            _progress_cache[doc_id] = new_progress
        except Exception as e:
            logger.warning(f"[WARNING] Progress update failed for {doc_id}: {e}")

    except Exception as e:
        logger.error(f"[ERROR] Progress Calculation Error: {e}")
        pass


def extract_hybrid_content(file_content: bytes, document_id: str):
    """
    Main ingestion: Text via fitz + Vision via Llama for images.
    Updates progress in real-time as work completes.
    Extraction phase occupies 0%  40% of total progress.
    """
    doc = fitz.open(stream=file_content, filetype="pdf")
    total_pages = len(doc)
    full_content = ""

    # --- Pre-scan: Count total images to know denominator ---
    total_images = 0
    for page in doc:
        total_images += len(page.get_images(full=True))
    
    total_steps = total_pages + total_images
    steps_done = 0
    pending_images = []  # Collect (page_num, image_bytes) for sequential processing
    
    logger.info(f"[INFO] Extraction plan: {total_pages} pages + {total_images} images = {total_steps} steps")

    # --- PHASE 1: Text Extraction (fast) ---
    for page_num, page in enumerate(doc):
        text = page.get_text()
        full_content += f"\n--- Page {page_num + 1} ---\n{text}"

        # Update progress per page
        steps_done += 1
        extraction_pct = int((steps_done / max(total_steps, 1)) * 40)  # 0-40%
        _update_progress(document_id, extraction_pct)
        logger.info(f"[INFO] Page {page_num + 1}/{total_pages} text extracted ({extraction_pct}%)")

        # Queue valid images for sequential vision analysis
        images = process_page_images(page)
        for img_bytes in images:
            pending_images.append((page_num + 1, img_bytes))
            logger.info(f"[INFO] Queued image from page {page_num + 1}")

    doc.close()
    return full_content, pending_images, steps_done, total_steps


# --- RAG Processing Function ---
async def process_and_embed(file_content: bytes, document_id: str, file_name: str = "document.pdf"):
    """
    Hybrid Extraction Strategy with Real-Time Progress:
    Phase 1 (0-40%):  Extract text + analyze images via Llama Vision.
    Phase 2 (40-100%): Chunk content, generate embeddings, save to Supabase.
    Progress is percentage-based (total_chunks = 100).
    Critical: Uses asyncio.to_thread to avoid blocking the main event loop.
    """
    try:
        db = _db_client()
        if not db:
            raise RuntimeError("Database client is not configured")
        logger.info(f"[INFO] WORKER STARTED: Processing document {document_id}")
        
        # 1. Setup: Status is already set to 'processing' by the upload endpoint.
        
        # 2. Hybrid Extraction (Text + Vision)  0%  40%
        # This is CPU heavy (PDF parse) and I/O blocking (Groq + Supabase sync calls)
        # We run the ENTIRE function in a separate thread.
        try:
            logger.info("[INFO] Starting extraction in separate thread...")
            full_text, pending_images, steps_done, total_steps = await asyncio.to_thread(extract_hybrid_content, file_content, document_id)
            # --- PHASE 2: Image Analysis (sequential + throttled, async-safe) ---
            for page_num, img_bytes in pending_images:
                description = await analyze_image_with_llama(img_bytes, document_id, page_num)
                if description:
                    full_text += f"\n[From Page {page_num}] {description}"

                steps_done += 1
                extraction_pct = int((steps_done / max(total_steps, 1)) * 40)  # 0-40%
                await asyncio.to_thread(_update_progress, document_id, extraction_pct)
                logger.info(f"Image done ({steps_done}/{total_steps}, {extraction_pct}%)")

                # Throttle to stay under provider rate limits without blocking the event loop.
                await asyncio.sleep(VISION_REQUEST_THROTTLE_SECONDS)

            
            if not full_text.strip():
                raise ValueError("No text or visual content could be extracted from PDF")
                
            logger.info(f"[INFO] Hybrid extraction complete: {len(full_text)} characters")
            
        except Exception as e:
            logger.error(f"Hybrid extraction failed: {e}")
            await _mark_document_failed(document_id, str(e))
            return
        
        # 3. Chunk text (CPU Heavy)
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        logger.info("[INFO] Chunking text in separate thread...")
        chunks = await asyncio.to_thread(splitter.split_text, full_text)
        
        logger.info(f"[INFO] Split into {len(chunks)} chunks")
        # Wrap progress update
        await asyncio.to_thread(_update_progress, document_id, 42)
        
        # 4. Embedding Loop  42%  100%
        failed_chunks_count = 0
        error_log = ""
        
        for idx, chunk_text in enumerate(chunks):
            # --- Rate-limit aware embedding with 429 retry ---
            MAX_EMBED_RETRIES = 5
            embed_success = False
            for embed_attempt in range(MAX_EMBED_RETRIES):
                try:
                    if not gemini_client:
                        raise ValueError("Gemini Client not initialized")

                    response = await asyncio.to_thread(
                        partial(
                            gemini_client.models.embed_content,
                            model="models/gemini-embedding-001",
                            contents=chunk_text,
                            config=types.EmbedContentConfig(output_dimensionality=768)
                        )
                    )

                    embedding = response.embeddings[0].values

                    await _execute_with_retry_async(
                        lambda: db.table('document_embeddings').insert({
                            'document_id': document_id,
                            'content': chunk_text,
                            'embedding': embedding
                        }).execute(),
                        f"Insert document embedding chunk {idx+1}",
                    )

                    logger.info(f"[INFO] Chunk {idx+1}/{len(chunks)} embedded")
                    embed_success = True

                    # Stay under 100 req/min free tier limit
                    await asyncio.sleep(0.65)
                    break

                except Exception as e:
                    is_rate_limit = "429" in str(e) or "quota" in str(e).lower() or "resource_exhausted" in str(e).lower()
                    if is_rate_limit and embed_attempt < MAX_EMBED_RETRIES - 1:
                        wait = 15 * (embed_attempt + 1)  # 15s, 30s, 45s...
                        logger.warning(f"[WARNING] Chunk {idx+1} rate limited, retrying in {wait}s (attempt {embed_attempt+1}/{MAX_EMBED_RETRIES})")
                        await asyncio.sleep(wait)
                        continue
                    # Non-retryable or exhausted retries
                    failed_chunks_count += 1
                    error_msg = f"Chunk {idx+1} failed: {str(e)}"
                    error_log += error_msg + "\n"
                    logger.error(f"[ERROR] {error_msg}")
                    break

            # Update progress: map chunk index to 42% → 99%
            embed_pct = 42 + int(((idx + 1) / len(chunks)) * 58)
            await asyncio.to_thread(_update_progress, document_id, embed_pct)

        # 5. Final Status
        final_status = 'completed'
        final_error = None
        
        if failed_chunks_count > 0:
            if failed_chunks_count == len(chunks):
                final_status = 'failed'
                final_error = f"All {len(chunks)} chunks failed to process.\n{error_log}"
            else:
                final_status = 'completed' 
                final_error = f"Completed with {failed_chunks_count} failed chunks.\n{error_log}"
        
        # Wrap final update
        await _execute_with_retry_async(
            lambda: db.table('pans_library').update({
                'embedding_status': final_status,
                'embedding_progress': 100,  # 100% done
                'total_chunks': len(chunks),
                'embedding_error': final_error
            }).eq('id', document_id).execute(),
            f"Finalize ingestion status for {document_id}",
        )
        
        logger.info(f"[INFO] RAG ingestion finished for {document_id}. Status: {final_status}")
        
    except Exception as e:
        logger.error(f"[ERROR] RAG ingestion CRITICAL FAILURE for {document_id}: {e}")
        try:
            error_msg = str(e)
            # Wrap error update
            await _execute_with_retry_async(
                lambda: db.table('pans_library').update({
                    'embedding_status': 'failed',
                    'embedding_error': f"Critical failures: {error_msg}"
                }).eq('id', document_id).execute(),
                f"Persist critical ingestion failure for {document_id}",
            )
        except Exception as update_err:
            logger.error(f"[ERROR] Failed to update error status: {update_err}")

async def process_document_background(
    file_content: bytes,
    document_id: str,
    file_name: str = "document.pdf",
    uploaded_by: Optional[str] = None,
) -> None:
    """
    Background task wrapper for heavy document parsing/chunking/embedding work.
    Guarantees a terminal status update on failure.
    """
    try:
        await process_and_embed(file_content, document_id, file_name)
    except Exception as e:
        logger.error(f"[ERROR] Background processing failed for {document_id}: {e}")
        await _mark_document_failed(document_id, str(e))

# --- Endpoints ---
@router.post("/upload", dependencies=[Depends(verify_api_key)])
async def admin_upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    course_code: str = Form(...),
    lecturer: str = Form(...),
    topic: str = Form(...),
    uploaded_by: Optional[str] = Form(None),
    target_levels: Optional[str] = Form(None),  # JSON-encoded list e.g. '["400lvl","500lvl"]'
):
    """
    Admin Endpoint: Upload PDF to Drive, save metadata to Supabase, and trigger RAG ingestion.
    """
    logger.debug(f"[DEBUG] DEBUG: Received Upload Request for '{title}' (Course: {course_code})")
    logger.info(f"[INFO] Upload Request: {title} by {uploaded_by}")

    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")
    
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    # 1. Prepare File for Streaming (Don't read into memory yet)
    try:
        # Get file size safely
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Unable to process the file. Please try again.")

    # 2. Upload to Google Drive (Streaming Mode)
    try:
        # Generate unique filename to prevent collisions
        file_ext = os.path.splitext(file.filename)[1]
        if not file_ext:
            file_ext = ".pdf"
        unique_filename = f"{uuid4()}{file_ext}"

        # Stream directly from the TempFile (disk-backed if large)
        drive_file_id = drive_service.upload_file(
            file_name=unique_filename, # Use UUID name for storage
            file_obj=file.file,        # Pass file object, NOT content bytes
            mime_type=file.content_type,
            folder_id=GOOGLE_DRIVE_FOLDER_ID,
            file_size=file_size
        )
    except Exception as e:
        if "scope" in str(e).lower():
            raise HTTPException(status_code=500, detail="Unable to upload file. Please contact support.")
        raise HTTPException(status_code=500, detail="File upload failed. Please try again.")

    # 3. Read Content for background processing.
    try:
        file.file.seek(0)
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Unable to read the file. Please try again.")

    # 4. Parse target_levels from JSON string
    levels_list = []
    if target_levels:
        try:
            levels_list = json.loads(target_levels)
            if not isinstance(levels_list, list):
                levels_list = []
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Invalid target_levels JSON: {target_levels}")
            levels_list = []

    # 5. Insert into Supabase
    try:
        data = {
            "title": title,
            "course_code": course_code,
            "lecturer_name": lecturer,
            "topic": topic,
            "drive_file_id": drive_file_id,
            "file_name": file.filename, # Store ORIGINAL name for display
            "file_size": file_size,
            "uploaded_by_email": uploaded_by,
            "target_levels": levels_list,
            # Initialize status immediately
            "embedding_status": "processing",
            "embedding_progress": 0,
            "total_chunks": 100,
            "embedding_error": None
        }

        response = await _execute_with_retry_async(
            lambda: db.table("pans_library").insert([data]).execute(),
            "Insert uploaded document metadata",
        )
        document_id = response.data[0]['id'] if response.data else None
        
        logger.debug(f"[DEBUG] DEBUG: Supabase insert successful. Document ID: {document_id}")

        if not document_id:
            raise HTTPException(status_code=500, detail="Failed to create document record")

        # 5. Offload heavy parsing/chunking/embedding to background task.
        background_tasks.add_task(
            process_document_background,
            content,
            document_id,
            file.filename,
            uploaded_by,
        )
        logger.info(f"[INFO] Background processing queued for document {document_id}")

        # Return immediately to avoid blocking request lifecycle.
        return JSONResponse(
            status_code=202,
            content={
                "message": "Upload started",
                "status": "processing",
                "document_id": document_id
            }
        )

    except Exception as e:
        logger.error(f"Supabase Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to save the document. Please try again.")

@router.get("/documents", dependencies=[Depends(verify_api_key)])
async def admin_list_documents():
    """
    Admin Endpoint: List all documents from Supabase.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    
    try:
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library").select("*").order("created_at", desc=True).execute(),
            "List documents",
        )
        return {"documents": response.data}
    except Exception as e:
        logger.error(f"List Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load documents. Please try again.")

@router.post("/documents/repair-progress", dependencies=[Depends(verify_api_key)])
async def admin_repair_document_progress():
    """
    Admin utility: force embedding_progress=100 for rows already marked as completed.
    Useful for repairing stale progress values from earlier runs.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library")
                .select("id, embedding_status, embedding_progress")
                .eq("embedding_status", "completed")
                .execute(),
            "Fetch completed documents for progress repair",
        )
        rows = response.data or []

        stale_ids = []
        for row in rows:
            raw_progress = row.get("embedding_progress", 0)
            try:
                normalized_progress = int(float(raw_progress))
            except (TypeError, ValueError):
                normalized_progress = 0

            if normalized_progress < 100:
                stale_ids.append(row.get("id"))

        repaired = 0
        for doc_id in stale_ids:
            if not doc_id:
                continue
            await _execute_with_retry_async(
                lambda doc_id=doc_id: db.table("pans_library").update({
                    "embedding_progress": 100
                }).eq("id", doc_id).execute(),
                f"Repair embedding progress for {doc_id}",
            )
            repaired += 1

        return {
            "status": "ok",
            "scanned": len(rows),
            "repaired": repaired,
            "document_ids": [doc_id for doc_id in stale_ids if doc_id],
        }
    except Exception as e:
        logger.error(f"Repair Progress Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to repair document progress. Please try again.")

@router.delete("/documents/{doc_id}", dependencies=[Depends(verify_api_key)])
async def admin_delete_document(doc_id: str):
    """
    Admin Endpoint: Delete document from Google Drive and Supabase.
    """
    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")
    
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
        
    try:
        # 1. Fetch drive_file_id from Supabase
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library").select("drive_file_id").eq("id", doc_id).execute(),
            f"Fetch drive file id for document {doc_id}",
        )
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found in database")
            
        drive_file_id = response.data[0]['drive_file_id']

        # 2. Delete from Drive (with Retry & Graceful Degradation)
        drive_deletion_success = False
        drive_error_msg = None
        
        for attempt in range(3):
            try:
                drive_service.delete_file(drive_file_id)
                drive_deletion_success = True
                logger.info(f"[INFO] Drive file {drive_file_id} deleted successfully.")
                break
            except Exception as e:
                drive_error_msg = str(e)
                if "404" in drive_error_msg:
                    logger.info("Drive file already gone (404), proceeding.")
                    drive_deletion_success = True
                    break
                logger.warning(f"[WARNING] Drive delete failed (Attempt {attempt+1}/3): {e}")
                await asyncio.sleep(2)

        if not drive_deletion_success:
            logger.error(f"[ERROR] CRITICAL: Failed to delete Drive file {drive_file_id} after 3 attempts. Proceeding to clear DB.")
            # We explicitly do NOT raise an exception here. We want to clear the DB entry
            # so the user doesn't get stuck with a "ghost" document in their library.

        # 3. Delete embeddings from Supabase (Best Effort)
        try:
            await _execute_with_retry_async(
                lambda: db.table("document_embeddings").delete().eq("document_id", doc_id).execute(),
                f"Delete embeddings for document {doc_id}",
            )
        except Exception as e:
            logger.warning(f"Failed to delete embeddings: {e}")

        # 4. Delete from Supabase (Always proceed)
        try:
            await _execute_with_retry_async(
                lambda: db.table("pans_library").delete().eq("id", doc_id).execute(),
                f"Delete pans_library row for {doc_id}",
            )
        except Exception as e:
            logger.error(f"[ERROR] Database Delete Failed: {e}")
            raise HTTPException(status_code=500, detail="Unable to delete the document. Please try again.")

        if not drive_deletion_success:
             return {"message": "Document removed from database, but Drive file may require manual cleanup.", "warning": drive_error_msg}
             
        return {"message": "Document deleted successfully"}



    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete Operation Failed: {e}")
        raise HTTPException(status_code=500, detail="Unable to complete the delete operation. Please try again.")

@router.patch("/documents/{doc_id}", dependencies=[Depends(verify_api_key)])
async def admin_update_document(doc_id: str, updates: DocumentUpdate):
    """
    Admin Endpoint: Update document metadata in Supabase.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        update_data = {k: v for k, v in updates.dict().items() if v is not None}
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No updates provided")

        logger.info(f"[INFO] Updating document {doc_id}: {update_data}")
        
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library").update(update_data).eq("id", doc_id).execute(),
            f"Update document metadata for {doc_id}",
        )
        
        if not response.data:
            logger.warning(f"Update returned no data for {doc_id}")
            
        return {"message": "Document updated successfully", "data": response.data}

    except Exception as e:
        logger.error(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to update the document. Please try again.")

@router.get("/documents/{document_id}/status", dependencies=[Depends(verify_api_key)])
async def get_document_status(document_id: str):
    """
    Get the real-time embedding status of a document.
    Frontend polls this to update progress bars.
    """
    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    
    try:
        # Lightweight query for status fields only
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library")
            .select("embedding_status, embedding_progress, total_chunks, embedding_error")
            .eq("id", document_id)
            .execute(),
            f"Fetch document status for {document_id}",
        )
            
        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Document not found")
            
        data = response.data[0]
        status_value = data.get("embedding_status", "pending")
        progress_value = data.get("embedding_progress", 0)
        if status_value == "completed":
            progress_value = 100

        return {
            "status": status_value,
            "progress": progress_value,
            "total": data.get("total_chunks", 0),
            "error": data.get("embedding_error")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status Check Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to check upload status. Please try again.")

# --- Smart Resume: Reading Progress Endpoints ---

@router.get("/documents/{document_id}/progress", dependencies=[Depends(verify_api_key)])
async def get_reading_progress(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Fetch the authenticated user's reading progress for a specific document.
    Returns current_page=1 and total_pages=0 if no progress record exists yet.
    Dual-protected: requires both x-api-key (gateway) and JWT (user identity).
    """
    if not supabase_service_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        response = await _execute_with_retry_async(
            lambda: supabase_service_client.table("document_progress")
                .select("current_page, total_pages")
                .eq("user_id", current_user.id)
                .eq("document_id", document_id)
                .execute(),
            f"Fetch reading progress for user={current_user.id} doc={document_id}",
        )

        if not response.data:
            # No record yet — return sensible defaults so frontend stays functional
            return {"current_page": 1, "total_pages": 0}

        record = response.data[0]
        return {
            "current_page": record.get("current_page", 1),
            "total_pages": record.get("total_pages", 0),
        }

    except Exception as e:
        logger.error(f"[ERROR] Failed to fetch reading progress: {e}")
        raise HTTPException(status_code=500, detail="Unable to load your reading progress. Please try again.")


@router.post("/documents/{document_id}/progress", dependencies=[Depends(verify_api_key)])
async def upsert_reading_progress(
    document_id: str,
    body: ProgressUpsert,
    current_user: User = Depends(get_current_user),
):
    """
    Upsert the authenticated user's reading progress for a specific document.
    Uses Supabase upsert with on_conflict targeting the unique (user_id, document_id) index.
    Dual-protected: requires both x-api-key (gateway) and JWT (user identity).
    """
    if not supabase_service_client:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    if body.current_page < 1:
        raise HTTPException(status_code=422, detail="current_page must be >= 1")
    if body.total_pages < 1:
        raise HTTPException(status_code=422, detail="total_pages must be >= 1")

    try:
        await _execute_with_retry_async(
            lambda: supabase_service_client.table("document_progress")
                .upsert(
                    {
                        "user_id": current_user.id,
                        "document_id": document_id,
                        "current_page": body.current_page,
                        "total_pages": body.total_pages,
                    },
                    on_conflict="user_id,document_id",
                )
                .execute(),
            f"Upsert reading progress for user={current_user.id} doc={document_id}",
        )
        return {"ok": True}

    except Exception as e:
        logger.error(f"[ERROR] Failed to upsert reading progress: {e}")
        raise HTTPException(status_code=500, detail="Unable to save your reading progress. Please try again.")


@router.post("/documents/{doc_id}/reembed", dependencies=[Depends(verify_api_key)])
async def admin_reembed_document(doc_id: str, background_tasks: BackgroundTasks):
    """
    Admin Endpoint: Re-trigger embedding for a document that has failed or partial chunks.
    Downloads the PDF from Google Drive and re-runs the full ingestion pipeline.
    Existing embeddings for this document are cleared first to avoid duplicates.
    """
    if not drive_service:
        raise HTTPException(status_code=503, detail="The file service is temporarily unavailable. Please try again in a moment.")

    db = _db_client()
    if not db:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    # 1. Fetch document metadata
    try:
        response = await _execute_with_retry_async(
            lambda: db.table("pans_library")
                .select("id, drive_file_id, file_name, embedding_status")
                .eq("id", doc_id)
                .execute(),
            f"Fetch document for reembed {doc_id}",
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        doc = response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Unable to fetch document. Please try again.")

    # 2. Download PDF from Google Drive
    try:
        file_content = await asyncio.to_thread(
            drive_service.download_file_bytes,
            doc["drive_file_id"]
        )
        if not file_content:
            raise ValueError("Downloaded file is empty")
    except Exception as e:
        logger.error(f"[ERROR] Failed to download {doc_id} from Drive: {e}")
        raise HTTPException(status_code=500, detail="Unable to download file from storage. Please try again.")

    # 3. Clear existing embeddings to avoid duplicates
    try:
        await _execute_with_retry_async(
            lambda: db.table("document_embeddings").delete().eq("document_id", doc_id).execute(),
            f"Clear embeddings for reembed {doc_id}",
        )
        logger.info(f"[INFO] Cleared existing embeddings for {doc_id}")
    except Exception as e:
        logger.warning(f"[WARNING] Could not clear existing embeddings for {doc_id}: {e}")

    # 4. Reset status to processing
    await _execute_with_retry_async(
        lambda: db.table("pans_library").update({
            "embedding_status": "processing",
            "embedding_progress": 0,
            "embedding_error": None,
        }).eq("id", doc_id).execute(),
        f"Reset status for reembed {doc_id}",
    )

    # 5. Queue background reprocessing
    background_tasks.add_task(
        process_document_background,
        file_content,
        doc_id,
        doc.get("file_name", "document.pdf"),
    )

    logger.info(f"[INFO] Reembed queued for document {doc_id}")
    return {"message": "Re-embedding started", "document_id": doc_id, "status": "processing"}


# Function to set dependencies (called from main api.py)
def set_dependencies(drive_svc, supabase, api_key_verifier, folder_id, supabase_service=None):
    global drive_service, supabase_client, verify_api_key_handler, GOOGLE_DRIVE_FOLDER_ID, supabase_service_client
    drive_service = drive_svc
    supabase_client = supabase
    verify_api_key_handler = api_key_verifier
    GOOGLE_DRIVE_FOLDER_ID = folder_id
    supabase_service_client = supabase_service
    if supabase_service_client:
        logger.info("[INFO] Library router using service-role Supabase client for admin/background operations.")
    else:
        logger.warning("[WARNING] Library router running without service-role Supabase client; RLS may block some writes.")