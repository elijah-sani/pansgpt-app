"""
Library Router: Document Management Endpoints
Handles upload, list, delete, and update operations for documents.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, BackgroundTasks, Header
from fastapi.responses import JSONResponse
from uuid import uuid4
from pydantic import BaseModel
from typing import Optional
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
verify_api_key_handler = None
GOOGLE_DRIVE_FOLDER_ID = None

async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected admin library endpoints.
    """
    if verify_api_key_handler is None:
        raise HTTPException(status_code=500, detail="API key verifier not configured")
    return await verify_api_key_handler(x_api_key)

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
    if not supabase_client:
        return
    try:
        await _execute_with_retry_async(
            lambda: supabase_client.table("pans_library").update({
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
                lambda: supabase_client.table('pans_library').update({
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
    Images are processed SEQUENTIALLY with a 2.1s throttle to stay under Groq's 30 RPM limit.
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
        for idx, chunk_text in enumerate(chunks):
            try:
                # Generate embedding using Gemini (v1 SDK) - Likely Sync I/O
                if not gemini_client:
                    raise ValueError("Gemini Client not initialized")

                # Wrap Gemini call
                response = await asyncio.to_thread(
                    partial(
                        gemini_client.models.embed_content,
                        model="models/gemini-embedding-001",
                        contents=chunk_text,
                        config=types.EmbedContentConfig(output_dimensionality=768)
                    )
                )
                
                # v1 SDK returns object with .embeddings list
                embedding = response.embeddings[0].values
                
                insert_success = False
                last_insert_error = None
                
                # Retry loop specifically for database insertion as requested
                for attempt in range(3):
                    try:
                        # Insert into Supabase - Sync I/O
                        await asyncio.to_thread(
                            lambda: supabase_client.table('document_embeddings').insert({
                                'document_id': document_id,
                                'content': chunk_text,
                                'embedding': embedding
                            }).execute()
                        )
                        insert_success = True
                        break
                    except Exception as ins_err:
                        last_insert_error = ins_err
                        err_str = str(ins_err).lower()
                        
                        if any(marker in err_str for marker in ["streamreset", "remoteprotocolerror", "network", "timeout", "ssl"]):
                            logger.warning(f"Network drop while saving chunk {idx}, retrying in 2 seconds...")
                            # using await asyncio.sleep to avoid blocking the outer event loop as requested by framework
                            import time
                            await asyncio.sleep(2)
                        else:
                            break # Not a retryable error
                
                if not insert_success:
                    error_msg = f"Failed to save chunk {idx} after 3 attempts: {str(last_insert_error)}"
                    logger.error(f"[ERROR] {error_msg}")
                    raise RuntimeError(error_msg)
                
                logger.info(f"[INFO] Chunk {idx+1}/{len(chunks)} embedded")
                
            except Exception as e:
                # Job fails on first chunk failure
                error_msg = f"Chunk {idx} processing failed: {str(e)}"
                logger.error(f"[ERROR] {error_msg}")
                raise RuntimeError(error_msg)
            
            # Update progress: map chunk index to 42%  99%
            # _update_progress uses Supabase sync call. Wrap it!
            embed_pct = 42 + int(((idx + 1) / len(chunks)) * 58)
            await asyncio.to_thread(_update_progress, document_id, embed_pct)

        # 5. Final Status
        final_status = 'completed'
        final_error = None
        
        # Wrap final update
        await _execute_with_retry_async(
            lambda: supabase_client.table('pans_library').update({
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
                lambda: supabase_client.table('pans_library').update({
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
    uploaded_by: Optional[str] = Form(None)
):
    """
    Admin Endpoint: Upload PDF to Drive, save metadata to Supabase, and trigger RAG ingestion.
    """
    logger.debug(f"[DEBUG] DEBUG: Received Upload Request for '{title}' (Course: {course_code})")
    logger.info(f"[INFO] Upload Request: {title} by {uploaded_by}")

    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")
    
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")

    # 1. Prepare File for Streaming (Don't read into memory yet)
    try:
        # Get file size safely
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process file stream: {e}")

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
            raise HTTPException(status_code=500, detail="Backend Permission Error: Drive Upload Scope missing.")
        raise HTTPException(status_code=500, detail=f"Drive Upload failed via Stream: {e}")

    # 3. Read Content for background processing.
    try:
        file.file.seek(0)
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file content: {e}")

    # 4. Insert into Supabase
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
            # Initialize status immediately
            "embedding_status": "processing",
            "embedding_progress": 0,
            "total_chunks": 100,
            "embedding_error": None
        }

        response = await _execute_with_retry_async(
            lambda: supabase_client.table("pans_library").insert([data]).execute(),
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
        raise HTTPException(status_code=500, detail=f"Database insert failed: {e}")

@router.get("/documents", dependencies=[Depends(verify_api_key)])
async def admin_list_documents():
    """
    Admin Endpoint: List all documents from Supabase.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")
    
    try:
        response = await _execute_with_retry_async(
            lambda: supabase_client.table("pans_library").select("*").order("created_at", desc=True).execute(),
            "List documents",
        )
        return {"documents": response.data}
    except Exception as e:
        logger.error(f"List Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {e}")

@router.delete("/documents/{doc_id}", dependencies=[Depends(verify_api_key)])
async def admin_delete_document(doc_id: str):
    """
    Admin Endpoint: Delete document from Google Drive and Supabase.
    """
    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")
    
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")
        
    try:
        # 1. Fetch drive_file_id from Supabase
        response = await _execute_with_retry_async(
            lambda: supabase_client.table("pans_library").select("drive_file_id").eq("id", doc_id).execute(),
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
                lambda: supabase_client.table("document_embeddings").delete().eq("document_id", doc_id).execute(),
                f"Delete embeddings for document {doc_id}",
            )
        except Exception as e:
            logger.warning(f"Failed to delete embeddings: {e}")

        # 4. Delete from Supabase (Always proceed)
        try:
            await _execute_with_retry_async(
                lambda: supabase_client.table("pans_library").delete().eq("id", doc_id).execute(),
                f"Delete pans_library row for {doc_id}",
            )
        except Exception as e:
            logger.error(f"[ERROR] Database Delete Failed: {e}")
            raise HTTPException(status_code=500, detail=f"Database delete failed: {e}")

        if not drive_deletion_success:
             return {"message": "Document removed from database, but Drive file may require manual cleanup.", "warning": drive_error_msg}
             
        return {"message": "Document deleted successfully"}



    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete Operation Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Delete operation failed: {e}")

@router.patch("/documents/{doc_id}", dependencies=[Depends(verify_api_key)])
async def admin_update_document(doc_id: str, updates: DocumentUpdate):
    """
    Admin Endpoint: Update document metadata in Supabase.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")

    try:
        update_data = {k: v for k, v in updates.dict().items() if v is not None}
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No updates provided")

        logger.info(f"[INFO] Updating document {doc_id}: {update_data}")
        
        response = await _execute_with_retry_async(
            lambda: supabase_client.table("pans_library").update(update_data).eq("id", doc_id).execute(),
            f"Update document metadata for {doc_id}",
        )
        
        if not response.data:
            logger.warning(f"Update returned no data for {doc_id}")
            
        return {"message": "Document updated successfully", "data": response.data}

    except Exception as e:
        logger.error(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail=f"Update failed: {e}")

@router.get("/documents/{document_id}/status", dependencies=[Depends(verify_api_key)])
async def get_document_status(document_id: str):
    """
    Get the real-time embedding status of a document.
    Frontend polls this to update progress bars.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")
    
    try:
        # Lightweight query for status fields only
        response = await _execute_with_retry_async(
            lambda: supabase_client.table("pans_library")
            .select("embedding_status, embedding_progress, total_chunks, embedding_error")
            .eq("id", document_id)
            .execute(),
            f"Fetch document status for {document_id}",
        )
            
        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Document not found")
            
        data = response.data[0]
        return {
            "status": data.get("embedding_status", "pending"),
            "progress": data.get("embedding_progress", 0),
            "total": data.get("total_chunks", 0),
            "error": data.get("embedding_error")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status Check Error: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {e}")

# Function to set dependencies (called from main api.py)
def set_dependencies(drive_svc, supabase, api_key_verifier, folder_id):
    global drive_service, supabase_client, verify_api_key_handler, GOOGLE_DRIVE_FOLDER_ID
    drive_service = drive_svc
    supabase_client = supabase
    verify_api_key_handler = api_key_verifier
    GOOGLE_DRIVE_FOLDER_ID = folder_id









