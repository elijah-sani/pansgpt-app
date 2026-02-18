from fastapi import FastAPI, HTTPException, Header, Depends, status, Request
from starlette.concurrency import iterate_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import time
from dotenv import load_dotenv
from google_drive import GoogleDriveService, get_drive_service
from services import llm_engine
import sentry_sdk

import logging
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("PansGPT")

# Load environment variables
load_dotenv()

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    traces_sample_rate=1.0,
    profiles_sample_rate=1.0,
)

from routers import settings, system, library, chat

# Initialize Rate Limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(settings.router)
app.include_router(system.router)

# Security Configuration
API_KEYS = os.getenv("API_KEYS", "").split(",")
GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID")
# Initialize dual-provider LLM clients through service layer
llm_engine.initialize_clients()

# CORS: Allow your frontend to talk to this backend
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
if not origins:
    origins = ["http://localhost:3000"] # Default fallback
    logger.info("Using default CORS origin: http://localhost:3000")
else:
    logger.info(f"Loaded CORS origins: {origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", # Keep this for when you code on your laptop
        "https://pansgpt-app.vercel.app" # Your new live Next.js frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models and constants moved to routers

# --- Dependency: The Bouncer ---
async def verify_api_key(x_api_key: str = Header(...)):
    """
    Validates the 'x-api-key' header. 
    Returns True if valid, raises 403 if invalid.
    """
    if x_api_key not in API_KEYS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing API Key"
        )
    return x_api_key

# --- Service Initialization ---
try:
    drive_service = get_drive_service(allow_upload=True)
    logger.info("[INFO] Google Drive Service Initialized")
except Exception as e:
    logger.error(f"[ERROR] Failed to initialize Drive Service: {e}")
    drive_service = None

# --- Supabase Initialization (Moved up to be available for routes) ---
# NOTE: Using supabase==2.0.3 for httpx compatibility
logger.info("--- Supabase Initialization Debug ---")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase_client = None
supabase_service_client = None
try:
    from supabase import create_client, Client, ClientOptions
    if SUPABASE_URL and SUPABASE_KEY:
        supabase_options = ClientOptions(postgrest_client_timeout=60)
        supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=supabase_options)
        logger.info("[INFO] Supabase Client Initialized Successfully")

        # Optional service-role client with same timeout policy when available.
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if service_role_key:
            supabase_service_client = create_client(SUPABASE_URL, service_role_key, options=supabase_options)
    else:
        logger.warning("[WARNING] Supabase Initialization Skipped due to missing variables.")
except ImportError:
    logger.error("[ERROR] 'supabase' package not installed.")
except Exception as e:
    logger.error(f"[ERROR] Failed to initialize Supabase: {e}")
logger.info("---------------------------------------")

# --- Initialize Routers with Dependencies ---
library.set_dependencies(drive_service, supabase_client, verify_api_key, GOOGLE_DRIVE_FOLDER_ID)
chat.set_dependencies(supabase_client, verify_api_key)
system.set_dependencies(supabase_client)
settings.set_dependencies(supabase_client, verify_api_key)

# Include routers
app.include_router(library.router)
app.include_router(chat.router)

# --- Routes ---
@app.get("/health")
@limiter.limit("60/minute")
def health_check(request: Request):
    return {"status": "ok", "service": "PansGPT Backend"}


if os.getenv("ENV", "").lower() != "production":
    @app.get("/debug-sentry")
    def trigger_error():
        division_by_zero = 1 / 0
        return {"result": division_by_zero}

# Chat endpoint moved to routers/chat.py

# ... existing routes ...

@app.get("/documents", dependencies=[Depends(verify_api_key)])
def list_documents():
    """Returns a list of documents from the Supabase database."""
    
    if not supabase_client:
        raise HTTPException(
            status_code=500, 
            detail="Server Error: Database connection not active."
        )

    try:
        # Fetch all records from 'pans_library'
        response = supabase_client.table("pans_library").select("*").execute()
        return response.data
    except Exception as e:
        logger.error(f"Database Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents/{file_id}", dependencies=[Depends(verify_api_key)])
def get_document_metadata(file_id: str):
    """Returns metadata for a single file, preferring DB record over Drive."""
    
    # 1. Try Fetching from Supabase (DB) First
    if supabase_client:
        try:
            # Query by drive_file_id
            response = supabase_client.table("pans_library").select("*").eq("drive_file_id", file_id).execute()
            
            if response.data and len(response.data) > 0:
                # Return the rich metadata from DB
                db_record = response.data[0]
                return {
                    "id": db_record['id'],
                    "name": db_record.get('file_name'), 
                    "file_name": db_record.get('file_name'),
                    "topic": db_record.get('topic'),
                    "lecturer_name": db_record.get('lecturer_name'),
                    "course_code": db_record.get('course_code'),
                    "size": db_record.get('file_size'),
                    "drive_file_id": db_record.get('drive_file_id')
                }
        except Exception as e:
            logger.warning(f"DB Metadata fetch failed, falling back to Drive: {e}")

    # 2. Fallback to Google Drive
    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")
        
    try:
        metadata = drive_service.get_file_metadata(file_id)
        return metadata
    except Exception as e:
        logger.error(f"Metadata Error: {e}")
        if "404" in str(e) or "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents/{file_id}/stream", dependencies=[Depends(verify_api_key)])
async def stream_document(file_id: str, size: Optional[str] = None):
    """
    Streams a PDF file.
    """
    if not drive_service:
        raise HTTPException(status_code=500, detail="Drive service not configured")

    file_size = size
    file_name = f"{file_id}.pdf"
    
    if not file_size:
        try:
            metadata = drive_service.get_file_metadata(file_id)
            if metadata:
                file_size = metadata.get('size')
                file_name = metadata.get('name', file_name)
        except Exception as e:
            logger.warning(f"[WARNING] Warning: Metadata fetch failed: {e}")

    try:
        sync_generator = drive_service.get_file_stream(file_id)
        async_stream = iterate_in_threadpool(sync_generator)
        
        headers = {
            "Content-Disposition": f'inline; filename="{file_name}"',
            "Accept-Ranges": "none"
        }
        
        if file_size:
            headers["Content-Length"] = str(file_size)
        
        return StreamingResponse(
            async_stream,
            media_type="application/pdf",
            headers=headers
        )
    except Exception as e:
        logger.error(f"Streaming Error: {e}")
        raise HTTPException(status_code=404, detail=f"File error: {str(e)}")

# Library endpoints (upload, delete, update) moved to routers/library.py
# Admin user management is handled via database user_roles table


