#!/usr/bin/env python3
"""
Backfill Script: Backfill Page Tracking and Section Outlines
Finds documents with embedding_status='completed' but no document_sections rows,
and re-runs extraction+sectioning for them using their Drive files.

COST/TIME IMPLICATION DETAILS:
- Cost: Google Gemini Embedding API is currently free (up to 100 RPM limit) or extremely low-cost ($0.000025 per 1,000 tokens).
  Generating the section outline with Gemini 1.5 Pro via TEXT_PRIMARY model uses one prompt call per document, sending
  the full document text/chunks. This may cost between $0.05 to $0.20 per document depending on the page count.
- Time: The embedding loop throttles requests with a 0.65-second sleep to stay under rate limits.
  A standard document of ~50 pages has around 200 chunks, which takes about 2.5 minutes to embed.
  Therefore, re-ingesting a library of 100 documents will take approximately 4 to 5 hours.
"""

import os
import sys
import asyncio
import logging
from uuid import uuid4
from datetime import datetime, timezone

# Add backend directory to path so we can import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from google_drive import get_drive_service
from routers import library

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("backfill")

async def backfill_documents():
    # 1. Initialize Clients
    drive_service = get_drive_service(allow_upload=True)
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID")
    
    if not supabase_url or not supabase_service_key:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required.")
        return
        
    supabase_client = create_client(supabase_url, supabase_service_key)
    
    # 2. Inject dependencies into library router
    library.set_dependencies(
        drive_svc=drive_service,
        supabase=supabase_client,
        api_key_verifier=None,
        folder_id=folder_id,
        supabase_service=supabase_client
    )
    
    # 3. Find documents needing backfill
    logger.info("Scanning database for documents to backfill...")
    
    # Fetch all completed documents
    res = supabase_client.table("pans_library")\
        .select("id, drive_file_id, file_name")\
        .eq("embedding_status", "completed")\
        .execute()
    docs = res.data or []
    
    # Fetch existing sections to find out who is already backfilled
    sections_res = supabase_client.table("document_sections")\
        .select("document_id")\
        .execute()
    existing_ids = {row["document_id"] for row in sections_res.data or []}
    
    docs_to_backfill = [doc for doc in docs if doc["id"] not in existing_ids]
    
    logger.info(f"Found {len(docs)} completed documents. {len(docs_to_backfill)} need backfilling.")
    
    for idx, doc in enumerate(docs_to_backfill):
        doc_id = doc["id"]
        drive_file_id = doc["drive_file_id"]
        file_name = doc.get("file_name", "document.pdf")
        
        logger.info(f"[{idx+1}/{len(docs_to_backfill)}] Starting backfill for document {doc_id} ({file_name})")
        
        # Step A: Download file from Drive
        try:
            file_content = await asyncio.to_thread(
                drive_service.download_file_bytes,
                drive_file_id
            )
            if not file_content:
                raise ValueError("Downloaded file bytes are empty")
            logger.info("File downloaded successfully.")
        except Exception as e:
            logger.error(f"Failed to download file {doc_id} from Drive: {e}")
            continue
            
        # Step B: Generate run and worker claim IDs
        new_run_id = str(uuid4())
        new_worker_id = str(uuid4())
        
        # Step C: Prepare DB state for new worker processing
        try:
            supabase_client.table("pans_library").update({
                "embedding_status": "processing",
                "ingestion_run_id": new_run_id,
                "ingestion_worker_id": new_worker_id,
                "ingestion_worker_claimed_at": datetime.now(timezone.utc).isoformat(),
                "ingestion_worker_heartbeat_at": datetime.now(timezone.utc).isoformat(),
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", doc_id).execute()
        except Exception as e:
            logger.error(f"Failed to update status to processing for {doc_id}: {e}")
            continue
            
        # Step D: Process and embed (runs embedding loop and triggers sectioning in background)
        try:
            await library.process_and_embed(
                file_content=file_content,
                document_id=doc_id,
                ingestion_run_id=new_run_id,
                ingestion_worker_id=new_worker_id,
                file_name=file_name
            )
            
            # Step E: Verify new embeddings were created
            verify_res = supabase_client.table("document_embeddings")\
                .select("id", count="exact")\
                .eq("document_id", doc_id)\
                .eq("ingestion_run_id", new_run_id)\
                .execute()
            new_embeddings_count = verify_res.count or 0
            
            if new_embeddings_count > 0:
                # Step F: Delete old embeddings safely
                supabase_client.table("document_embeddings")\
                    .delete()\
                    .eq("document_id", doc_id)\
                    .neq("ingestion_run_id", new_run_id)\
                    .execute()
                logger.info(f"Verification successful: {new_embeddings_count} new chunks created. Deleted old embeddings.")
                
                # Step G: Wait for asynchronous section generation to complete
                logger.info("Waiting for asynchronous section outline generation to complete...")
                sectioning_success = False
                for poll_attempt in range(60):  # wait up to 5 minutes
                    await asyncio.sleep(5)
                    status_res = supabase_client.table("pans_library")\
                        .select("sections_status, sections_error")\
                        .eq("id", doc_id)\
                        .execute()
                        
                    if status_res.data:
                        sec_status = status_res.data[0].get("sections_status")
                        if sec_status in ("completed", "failed"):
                            if sec_status == "completed":
                                logger.info("Section outline generation successfully completed.")
                                sectioning_success = True
                            else:
                                logger.error(f"Section outline generation failed: {status_res.data[0].get('sections_error')}")
                            break
                
                if not sectioning_success:
                    logger.warning(f"Section generation timed out or failed for document {doc_id}.")
            else:
                raise RuntimeError("Verification failed: 0 chunks created.")
                
        except Exception as e:
            logger.error(f"Failed to backfill document {doc_id}: {e}")
            try:
                # Set statuses to failed
                supabase_client.table("pans_library").update({
                    "embedding_status": "failed",
                    "embedding_error": f"Backfill failed: {str(e)}",
                    "sections_status": "failed",
                    "sections_error": f"Backfill failed: {str(e)}",
                    "last_updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", doc_id).execute()
            except Exception as rollback_err:
                logger.error(f"Failed to update error status for {doc_id}: {rollback_err}")

if __name__ == "__main__":
    asyncio.run(backfill_documents())
