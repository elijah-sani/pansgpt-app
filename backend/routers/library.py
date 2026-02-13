"""
Library Router: Document Management Endpoints
Handles upload, list, delete, and update operations for documents.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import os
import logging
import io
import base64
import concurrent.futures
import time

# RAG & Extraction Imports
from google import genai  # v1 SDK
from google.genai import types
import fitz  # PyMuPDF
from PIL import Image
from groq import Groq
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/admin", tags=["library"])

# These will be injected from main api.py
drive_service = None
supabase_client = None
verify_api_key = None
GOOGLE_DRIVE_FOLDER_ID = None

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
gemini_client = None
if GOOGLE_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
        logger.info("✅ Gemini Client initialized for RAG")
    except Exception as e:
        logger.error(f"❌ Failed to init Gemini Client: {e}")

else:
    logger.warning("⚠️ GOOGLE_API_KEY not set, RAG ingestion will fail")

# --- Models ---
class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    course_code: Optional[str] = None
    lecturer_name: Optional[str] = None
    topic: Optional[str] = None

# --- Groq Vision Client ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


# --- Hybrid Extraction Helpers ---

def analyze_image_with_llama(image_bytes: bytes) -> str:
    """Sends image bytes to Llama Vision for a concise description."""
    if not groq_client:
        logger.warning("⚠️ Groq client not configured, skipping image analysis")
        return ""
    try:
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        response = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct", # DO NOT CHANGE: User requested to lock this model
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this diagram or chart in detail for study notes. Be concise."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            }],
            max_tokens=500
        )
        description = response.choices[0].message.content
        return f"\n\n[Visual Description: {description}]\n\n"
    except Exception as e:
        logger.error(f"❌ Vision analysis error: {e}")
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
        for attempt in range(3):
            try:
                supabase_client.table('pans_library').update({
                    'embedding_progress': new_progress
                }).eq('id', doc_id).execute()
                
                # Update cache ONLY after successful commit
                _progress_cache[doc_id] = new_progress
                break # Success
                
            except Exception as e:
                # Wait a bit before retry
                time.sleep(0.2)
                if attempt == 2:
                    logger.warning(f"⚠️ Progress update failed for {doc_id}: {e}")

    except Exception as e:
        logger.error(f"⚠️ Progress Calculation Error: {e}")
        pass


def extract_hybrid_content(file_content: bytes, document_id: str) -> str:
    """
    Main ingestion: Text via fitz + Vision via Llama for images.
    Updates progress in real-time as work completes.
    Extraction phase occupies 0% → 40% of total progress.
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
    
    logger.info(f"📊 Extraction plan: {total_pages} pages + {total_images} images = {total_steps} steps")

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_to_page = {}

        # --- PHASE 1: Text Extraction (fast) ---
        for page_num, page in enumerate(doc):
            text = page.get_text()
            full_content += f"\n--- Page {page_num + 1} ---\n{text}"

            # Update progress per page
            steps_done += 1
            extraction_pct = int((steps_done / max(total_steps, 1)) * 40)  # 0-40%
            _update_progress(document_id, extraction_pct)
            logger.info(f"📄 Page {page_num + 1}/{total_pages} text extracted ({extraction_pct}%)")

            # Queue valid images for vision analysis
            images = process_page_images(page)
            for img_bytes in images:
                future = executor.submit(analyze_image_with_llama, img_bytes)
                future_to_page[future] = page_num + 1
                logger.info(f"🖼️ Queued image from page {page_num + 1}")

        # --- PHASE 2: Image Analysis (slow, parallel) ---
        for future in concurrent.futures.as_completed(future_to_page):
            page_num = future_to_page[future]
            try:
                description = future.result()
                if description:
                    full_content += f"\n[From Page {page_num}] {description}"
            except Exception as e:
                logger.error(f"❌ Image analysis failed for page {page_num}: {e}")

            # Update progress per image
            steps_done += 1
            extraction_pct = int((steps_done / max(total_steps, 1)) * 40)  # 0-40%
            _update_progress(document_id, extraction_pct)
            logger.info(f"🖼️ Image done ({steps_done}/{total_steps}, {extraction_pct}%)")

    doc.close()
    return full_content


# --- RAG Processing Function ---
async def process_and_embed(file_content: bytes, document_id: str, file_name: str = "document.pdf"):
    """
    Hybrid Extraction Strategy with Real-Time Progress:
    Phase 1 (0-40%):  Extract text + analyze images via Llama Vision.
    Phase 2 (40-100%): Chunk content, generate embeddings, save to Supabase.
    Progress is percentage-based (total_chunks = 100).
    """
    try:
        logger.info(f"🧠 WORKER STARTED: Processing document {document_id}")
        
        # 1. Setup: Set status to 'processing', use percentage mode (total = 100)
        supabase_client.table('pans_library').update({
            'embedding_status': 'processing',
            'embedding_progress': 0,
            'total_chunks': 100,  # Percentage mode
            'embedding_error': None
        }).eq('id', document_id).execute()
        
        # 2. Hybrid Extraction (Text + Vision) — 0% → 40%
        try:
            full_text = extract_hybrid_content(file_content, document_id)
            
            if not full_text.strip():
                raise ValueError("No text or visual content could be extracted from PDF")
                
            logger.info(f"✅ Hybrid extraction complete: {len(full_text)} characters")
            
        except Exception as e:
            logger.error(f"❌ Hybrid extraction failed: {e}")
            supabase_client.table('pans_library').update({
                'embedding_status': 'failed',
                'embedding_error': str(e)
            }).eq('id', document_id).execute()
            return
        
        # 3. Chunk text
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        chunks = splitter.split_text(full_text)
        logger.info(f"✂️ Split into {len(chunks)} chunks")
        _update_progress(document_id, 42)  # Small bump for chunking
        
        # 4. Embedding Loop — 42% → 100%
        failed_chunks_count = 0
        error_log = ""
        
        for idx, chunk_text in enumerate(chunks):
            try:
                # Generate embedding using Gemini (v1 SDK)
                # Client is global 'gemini_client'
                if not gemini_client:
                    raise ValueError("Gemini Client not initialized")

                response = gemini_client.models.embed_content(
                    model="models/gemini-embedding-001",
                    contents=chunk_text,
                    config=types.EmbedContentConfig(output_dimensionality=768)
                )
                # v1 SDK returns object with .embeddings list
                embedding = response.embeddings[0].values
                
                # Insert into Supabase
                supabase_client.table('document_embeddings').insert({
                    'document_id': document_id,
                    'content': chunk_text,
                    'embedding': embedding
                }).execute()
                
                logger.info(f"💾 Chunk {idx+1}/{len(chunks)} embedded")
                
            except Exception as e:
                failed_chunks_count += 1
                error_msg = f"Chunk {idx} failed: {str(e)}"
                error_log += error_msg + "\n"
                logger.error(f"❌ {error_msg}")
            
            # Update progress: map chunk index to 42% → 99%
            embed_pct = 42 + int(((idx + 1) / len(chunks)) * 58)
            _update_progress(document_id, embed_pct)

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
        
        supabase_client.table('pans_library').update({
            'embedding_status': final_status,
            'embedding_progress': 100,  # 100% done
            'total_chunks': 100,
            'embedding_error': final_error
        }).eq('id', document_id).execute()
        
        logger.info(f"✅ RAG ingestion finished for {document_id}. Status: {final_status}")
        
    except Exception as e:
        logger.error(f"❌ RAG ingestion CRITICAL FAILURE for {document_id}: {e}")
        try:
            supabase_client.table('pans_library').update({
                'embedding_status': 'failed',
                'embedding_error': f"Critical failures: {str(e)}"
            }).eq('id', document_id).execute()
        except Exception as update_err:
            logger.error(f"❌ Failed to update error status: {update_err}")

# --- Endpoints ---
@router.post("/upload", dependencies=[Depends(lambda: verify_api_key)])
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
    logger.debug(f"🔍 DEBUG: Received Upload Request for '{title}' (Course: {course_code})")
    logger.info(f"📤 Upload Request: {title} by {uploaded_by}")

    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")
    
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")

    # 1. Read File Content
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    # 2. Upload to Google Drive
    try:
        drive_file_id = drive_service.upload_file(
            file_name=file.filename,
            content=content,
            mime_type=file.content_type,
            folder_id=GOOGLE_DRIVE_FOLDER_ID
        )
    except Exception as e:
        if "scope" in str(e).lower():
            raise HTTPException(status_code=500, detail="Backend Permission Error: Drive Upload Scope missing.")
        raise HTTPException(status_code=500, detail=f"Drive Upload failed: {e}")

    # 3. Insert into Supabase
    try:
        data = {
            "title": title,
            "course_code": course_code,
            "lecturer_name": lecturer,
            "topic": topic,
            "drive_file_id": drive_file_id,
            "file_name": file.filename,
            "file_size": len(content),
            "uploaded_by_email": uploaded_by
        }

        response = supabase_client.table("pans_library").insert([data]).execute()
        document_id = response.data[0]['id'] if response.data else None
        
        logger.debug(f"🔍 DEBUG: Supabase insert successful. Document ID: {document_id}")
        logger.debug(f"🔍 DEBUG: GOOGLE_API_KEY exists: {bool(GOOGLE_API_KEY)}")
        logger.debug(f"🔍 DEBUG: File content size: {len(content)} bytes")
        
        # 4. Trigger RAG Ingestion in Background
        if document_id and GOOGLE_API_KEY:
            logger.debug(f"🔍 DEBUG: Conditions met for RAG ingestion. Triggering background task...")
            background_tasks.add_task(process_and_embed, content, document_id, file.filename)
            logger.info(f"🚀 RAG ingestion queued for document {document_id}")
            logger.debug(f"🔍 DEBUG: Background task added to queue successfully!")
        else:
            logger.debug(f"🔍 DEBUG: RAG ingestion SKIPPED. Reason: document_id={document_id}, GOOGLE_API_KEY={'SET' if GOOGLE_API_KEY else 'NOT SET'}")
        
        return {
            "message": "Upload successful",
            "drive_id": drive_file_id,
            "supabase_record": response.data
        }

    except Exception as e:
        logger.error(f"Supabase Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database insert failed: {e}")

@router.get("/documents", dependencies=[Depends(lambda: verify_api_key)])
async def admin_list_documents():
    """
    Admin Endpoint: List all documents from Supabase.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")
    
    try:
        response = supabase_client.table("pans_library").select("*").order("created_at", desc=True).execute()
        return {"documents": response.data}
    except Exception as e:
        logger.error(f"List Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {e}")

@router.delete("/documents/{doc_id}", dependencies=[Depends(lambda: verify_api_key)])
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
        response = supabase_client.table("pans_library").select("drive_file_id").eq("id", doc_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found in database")
            
        drive_file_id = response.data[0]['drive_file_id']

        # 2. Delete from Drive
        try:
            drive_service.delete_file(drive_file_id)
        except Exception as e:
            if "404" in str(e):
                logger.warning("File already missing from Drive, proceeding to DB delete.")
            else:
                raise HTTPException(status_code=500, detail=f"Drive Delete failed: {e}")

        # 3. Delete embeddings from Supabase
        try:
            supabase_client.table("document_embeddings").delete().eq("document_id", doc_id).execute()
            logger.info(f"🗑️ Deleted embeddings for document {doc_id}")
        except Exception as e:
            logger.warning(f"Failed to delete embeddings: {e}")

        # 4. Delete from Supabase
        supabase_client.table("pans_library").delete().eq("id", doc_id).execute()

        return {"message": "Document deleted successfully from Drive and Database"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete Error: {e}")
        raise HTTPException(status_code=500, detail=f"Delete operation failed: {e}")

@router.patch("/documents/{doc_id}", dependencies=[Depends(lambda: verify_api_key)])
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

        logger.info(f"✏️ Updating document {doc_id}: {update_data}")
        
        response = supabase_client.table("pans_library").update(update_data).eq("id", doc_id).execute()
        
        if not response.data:
            logger.warning(f"Update returned no data for {doc_id}")
            
        return {"message": "Document updated successfully", "data": response.data}

    except Exception as e:
        logger.error(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail=f"Update failed: {e}")

@router.get("/documents/{document_id}/status", dependencies=[Depends(lambda: verify_api_key)])
async def get_document_status(document_id: str):
    """
    Get the real-time embedding status of a document.
    Frontend polls this to update progress bars.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection not active")
    
    try:
        # Lightweight query for status fields only
        response = supabase_client.table("pans_library") \
            .select("embedding_status, embedding_progress, total_chunks, embedding_error") \
            .eq("id", document_id) \
            .execute()
            
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
    global drive_service, supabase_client, verify_api_key, GOOGLE_DRIVE_FOLDER_ID
    drive_service = drive_svc
    supabase_client = supabase
    verify_api_key = api_key_verifier
    GOOGLE_DRIVE_FOLDER_ID = folder_id
