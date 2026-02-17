"""
Chat Router: AI Conversation Endpoint with RAG Support
Handles AI-powered chat interactions using Groq with vector search.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import logging
import os
import asyncio
import google.generativeai as genai
from cachetools import TTLCache
import time
import uuid
import json
from datetime import datetime

logger = logging.getLogger("PansGPT")

router = APIRouter(tags=["chat"])

# These will be injected from main api.py
groq_client = None
supabase_client = None
verify_api_key_handler = None

# --- Global Model Constants ---
HEAVY_VISION_MODEL = "gemma-3-27b-it"  # For images/multimodal
FAST_TEXT_MODEL = "gemma-3-12b-it"     # For pure text

class User(BaseModel):
    id: str
    email: Optional[str] = None

from fastapi import Header

async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected endpoints.
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

async def _execute_with_retry(execute_fn, operation_name: str, max_attempts: int = 3):
    """
    Retry transient Supabase calls that fail due to timeout/SSL/network jitter.
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
                await asyncio.sleep(1)
                continue
            raise
    raise last_error

async def get_current_user(authorization: Optional[str] = Header(None)):
    """
    Verify Supabase JWT and return User.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization Header")
    
    try:
        token = authorization.split(" ")[1]
        user_res = await _execute_with_retry(
            lambda: supabase_client.auth.get_user(token),
            "Supabase auth.get_user",
        )
        if not user_res.user:
             raise HTTPException(status_code=401, detail="Invalid Token")
        return User(id=user_res.user.id, email=user_res.user.email)
    except Exception as e:
        logger.error(f"Auth Error: {e}")
        # Only for development/transition, maybe fallback? 
        # But user asked for STRICT ownership.
        raise HTTPException(status_code=401, detail=f"Authentication Failed: {str(e)}")

async def _assert_session_owner(session_id: str, current_user: User):
    """
    Strict ownership check used before any chat-message mutation.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")

    session_res = await _execute_with_retry(
        lambda: supabase_client.table("chat_sessions").select("id").eq("id", session_id).eq("user_id", current_user.id).execute(),
        "Assert session ownership",
    )
    if not session_res.data:
        raise HTTPException(status_code=403, detail="Unauthorized")

# Settings Cache (TTL = 5 minutes)
_settings_cache = TTLCache(maxsize=1, ttl=300)

async def get_cached_settings():
    """
    Fetch system settings with 5-minute cache to reduce DB queries.
    """
    cache_key = "system_settings"
    if cache_key in _settings_cache:
        return _settings_cache[cache_key]
    
    if not supabase_client:
        return None
    
    try:
        res = await _execute_with_retry(
            lambda: supabase_client.table("system_settings").select("system_prompt, temperature").eq("id", 1).execute(),
            "Fetch cached system settings",
        )
        if res.data and len(res.data) > 0:
            _settings_cache[cache_key] = res.data[0]
            logger.info("[INFO] System settings refreshed from database")
            return res.data[0]
    except Exception as e:
        logger.warning(f"Could not fetch settings: {e}")
    
    return None

# --- Models ---
class Message(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class ChatRequest(BaseModel):
    text: str
    mode: str  # 'explain', 'example', 'memory', 'chat'
    context: Optional[str] = None
    messages: Optional[List[Message]] = []
    document_id: Optional[str] = None  # For RAG: restricts search to specific PDF
    image: Optional[str] = None      # Base64 image string for DB storage
    image_base64: Optional[str] = None  # Legacy: single image
    images: Optional[List[str]] = []    # New: multiple images
    system_instruction: Optional[str] = None # For decoupled prompt logic (hidden instructions)
    session_id: Optional[str] = None # For history persistence
    is_retry: bool = False  # If True, skip saving user message (already in DB from failed attempt)

class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"
    context_id: Optional[str] = None

class ChatSession(BaseModel):
    id: str
    title: str
    context_id: Optional[str] = None
    created_at: datetime

class CreateSessionResponse(BaseModel):
    id: str
    title: str
    context_id: Optional[str] = None
    created_at: datetime

# Function to set dependencies (called from main api.py)

PHARMACY_SYSTEM_PROMPT = """
You are PansGPT, an expert Pharmacy Tutor and Study Assistant.
Your Goal: Help pharmacy students understand complex concepts, drugs, and mechanisms clearly.

Guidelines:
Tone: Professional, encouraging, and academic but accessible.
Emoji Use: Strictly Minimal. Use max 1 emoji per response, and only if it acts as a helpful visual bullet point. Do not use emojis in every sentence.
Accuracy: Prioritize clinical accuracy. If a concept has exceptions (e.g., side effects), mention them briefly.
Formatting: Use Markdown (bolding, lists) to break up walls of text.
"""



# --- Helper Functions ---
def contains_image(messages: List[dict]) -> bool:
    """
    Checks if any message in the list contains an image (base64 or URL).
    """
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and (block.get("type") == "image_url" or "image" in block):
                    return True
    return False

def merge_system_into_user(messages: List[dict]) -> List[dict]:
    """
    Merges all 'system' role messages into the first 'user' role message.
    Required for Google AI Studio's OpenAI-compatible endpoint which rejects 'system' roles.
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

async def get_relevant_context(user_question: str, document_id: str) -> str:
    """
    RAG Helper: Embed user question and retrieve relevant chunks via vector search.
    
    Args:
        user_question: The user's question/text
        document_id: Drive file ID or Supabase UUID of the PDF
        
    Returns:
        String containing concatenated relevant chunks, or empty string if none found
    """
    if not supabase_client:
        logger.warning("[WARNING] Supabase not available for RAG")
        return ""
    
    try:
        # Step 0: Convert Drive file ID to Supabase UUID if needed
        # The frontend sends drive_file_id, but we need the pans_library.id (UUID)
        supabase_doc_id = document_id
        doc_metadata = None
        
        # Check if this is a valid UUID format (UUIDs are 36 chars with 4 hyphens)
        # Drive IDs are typically not valid UUIDs (longer, different format)
        try:
            import uuid
            uuid.UUID(document_id)
            # Valid UUID - use it directly and fetch metadata
            logger.info(f"[INFO] Using UUID directly: {document_id}")
            try:
                meta_response = await _execute_with_retry(
                    lambda: supabase_client.table("pans_library").select("file_name, topic, lecturer_name, course_code").eq("id", document_id).execute(),
                    "Fetch document metadata by UUID",
                )
                if meta_response.data and len(meta_response.data) > 0:
                    doc_metadata = meta_response.data[0]
            except Exception as meta_err:
                logger.warning(f"[WARNING] Could not fetch metadata: {meta_err}")
        except (ValueError, AttributeError):
            # Not a UUID - must be a Drive file ID, lookup the Supabase UUID and metadata
            try:
                doc_response = await _execute_with_retry(
                    lambda: supabase_client.table("pans_library").select("id, file_name, topic, lecturer_name, course_code").eq("drive_file_id", document_id).execute(),
                    "Fetch document metadata by Drive ID",
                )
                if doc_response.data and len(doc_response.data) > 0:
                    supabase_doc_id = doc_response.data[0]['id']
                    doc_metadata = doc_response.data[0]
                    logger.info(f"[INFO] Converted Drive ID to UUID: {supabase_doc_id}")
                else:
                    logger.warning(f"[WARNING] No document found for Drive ID: {document_id}")
                    return ""
            except Exception as lookup_err:
                logger.error(f"[ERROR] Document ID lookup failed: {lookup_err}")
                return ""
        
        # Step 1: Embed the user's question using Gemini
        # CRITICAL: Must match ingestion settings (model, dimensions)
        embedding_result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=user_question,
            task_type="retrieval_query",  # Different from ingestion's "retrieval_document"
            output_dimensionality=768  # Must match DB vector size
        )
        query_vector = embedding_result['embedding']
        logger.info(f"[INFO] Embedded query: {len(query_vector)} dimensions")
        
        # Step 2: Call Supabase RPC for vector similarity search
        response = await _execute_with_retry(
            lambda: supabase_client.rpc(
                'match_documents',
                {
                    'query_embedding': query_vector,
                    'match_threshold': 0.3,  # Lowered from 0.5 for broader retrieval
                    'match_count': 10,       # Increased from 5 to get more context
                    'filter_doc_id': supabase_doc_id  # Use converted UUID
                }
            ).execute(),
            "Match document embeddings",
        )
        
        # Step 3: Build enhanced context with metadata + chunks
        context_parts = []
        
        # Add document metadata at the top
        if doc_metadata:
            metadata_text = "DOCUMENT INFORMATION:\n"
            if doc_metadata.get('file_name'):
                metadata_text += f"Title: {doc_metadata['file_name']}\n"
            if doc_metadata.get('topic'):
                metadata_text += f"Topic: {doc_metadata['topic']}\n"
            if doc_metadata.get('lecturer_name'):
                metadata_text += f"Lecturer: {doc_metadata['lecturer_name']}\n"
            if doc_metadata.get('course_code'):
                metadata_text += f"Course Code: {doc_metadata['course_code']}\n"
            context_parts.append(metadata_text)
        
        # Add retrieved chunks
        if not response.data or len(response.data) == 0:
            if doc_metadata:
                # Return just metadata if no chunks found
                logger.info(f"[INFO] Using metadata only, no vector chunks found")
                return "\n".join(context_parts)
            logger.info("[INFO] No relevant chunks found in vector search")
            return ""
        
        context_parts.append("RELEVANT CONTENT FROM LECTURE:")
        context_chunks = [item['content'] for item in response.data]
        context_parts.append("\n\n---\n\n".join(context_chunks))
        
        context_text = "\n\n".join(context_parts)
        logger.info(f"[INFO] Retrieved {len(response.data)} chunks + metadata ({len(context_text)} chars)")
        
        return context_text
        
    except Exception as e:
        logger.error(f"[ERROR] RAG context retrieval failed: {e}")
        return ""

# --- Endpoint ---
@router.post("/chat", dependencies=[Depends(verify_api_key)])
async def chat(request: ChatRequest):
    """
    AI Chat Endpoint (formerly /ask-ai).
    Analyze text using Groq AI with support for conversation history.
    Modes: explain, example, memory, chat
    """
    if not groq_client:
        raise HTTPException(status_code=500, detail="AI client not initialized")
    
    # --- Persistence: Save User Message & Auto-Rename ---
    # Skip saving user message on retry  it already exists in DB from the failed attempt
    if request.session_id and supabase_client and not request.is_retry:
        try:
            # 1. Save Message
            # Flatten image list to JSON string for storage
            image_payload = None
            if request.images:
                image_payload = json.dumps(request.images)
            elif request.image:
                image_payload = request.image

            await _execute_with_retry(
                lambda: supabase_client.table("chat_messages").insert({
                    "session_id": request.session_id,
                    "role": "user",
                    "content": request.text,
                    "image_data": image_payload
                }).execute(),
                "Save user chat message",
            )
            
            # 2. Auto-Rename if "New Chat"
            try:
                # Fetch current title
                sess_res = await _execute_with_retry(
                    lambda: supabase_client.table("chat_sessions").select("title").eq("id", request.session_id).execute(),
                    "Fetch chat session title",
                )
                if sess_res.data and len(sess_res.data) > 0:
                    current_title = sess_res.data[0].get('title')
                    if current_title == "New Chat":
                        logger.info(f"[INFO] Triggering AI Auto-Rename for session {request.session_id}...")
                        # Generate title via AI
                        try:
                            title_prompt = f"Create a short, professional title (maximum 4 words) for a chat that starts with this message: '{request.text}'. Return ONLY the title text, with no quotes, no punctuation, and no extra words."
                            
                            title_completion = await groq_client.chat.completions.create(
                                model="gemma-3-12b-it", # Llama-3 not available on Gemini, use Gemma
                                messages=[{"role": "user", "content": title_prompt}],
                                temperature=0.5,
                                max_tokens=10
                            )
                            
                            new_title = title_completion.choices[0].message.content.strip().strip('"')
                            
                            # Fallback if empty
                            if not new_title:
                                new_title = request.text[:30] + "..."
                                
                            await _execute_with_retry(
                                lambda: supabase_client.table("chat_sessions").update({"title": new_title}).eq("id", request.session_id).execute(),
                                "Update chat session title",
                            )
                            logger.info(f"[INFO] AI Auto-renamed session {request.session_id} to '{new_title}'")
                            
                        except Exception as ai_title_err:
                            logger.error(f"AI Title Generation Failed: {ai_title_err}")
                            # Fallback to simple truncation
                            fallback_title = request.text[:30] + "..."
                            await _execute_with_retry(
                                lambda: supabase_client.table("chat_sessions").update({"title": fallback_title}).eq("id", request.session_id).execute(),
                                "Fallback update chat session title",
                            )

            except Exception as rename_err:
                 logger.warning(f"Auto-rename failed: {rename_err}")

        except Exception as e:
            logger.error(f"Failed to save user message: {e}")

    logger.info(f"[INFO] Chat Request: mode={request.mode}, text='{request.text[:30]}...', msgs={len(request.messages or [])}")

    # --- Fetch Dynamic System Settings (Cached) ---
    system_prompt = PHARMACY_SYSTEM_PROMPT
    temperature = 0.7
    
    cached_config = await get_cached_settings()
    if cached_config:
        if cached_config.get("system_prompt"):
            system_prompt = cached_config["system_prompt"]
        if cached_config.get("temperature") is not None:
            temperature = float(cached_config["temperature"])
        logger.debug(f"[DEBUG] Using Cached Settings: Temp={temperature}")

    # --- RAG: Retrieve Relevant Context via Vector Search ---
    context_text = ""
    if request.document_id:
        logger.info(f"[INFO] RAG enabled for document: {request.document_id}")
        context_text = await get_relevant_context(request.text, request.document_id)
    
    # --- Enhance System Prompt with Retrieved Context ---
    final_system_prompt = system_prompt
    if context_text:
        final_system_prompt = f"""
{system_prompt}

STRICT INSTRUCTION:
Answer the student's question based ONLY on the following context from their lecture notes.

CONTEXT:
{context_text}

If the answer is not in the context, say "I cannot find that information in this specific lecture note."
Do not hallucinate.
"""
        logger.info(f"[INFO] Enhanced system prompt with {len(context_text)} chars of context")

    # Construct Messages List
    messages = []
    
    # --- VISION MODE: Images present ---
    # Collect images from both new list and legacy field
    all_images = request.images or []
    if request.image_base64 and request.image_base64 not in all_images:
        all_images.insert(0, request.image_base64)

    if all_images:
        logger.info(f"[INFO] Vision mode: {len(all_images)} images")
        messages.append({"role": "system", "content": final_system_prompt})
        
        # Inject Decoupled System Instruction if present
        if request.system_instruction:
             messages.append({"role": "system", "content": request.system_instruction})
             logger.info("[INFO] Injected hidden system instruction for Vision")
        
        # Construct content blocks
        content_blocks = [{"type": "text", "text": request.text}]
        for img in all_images:
            content_blocks.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{img}"
                }
            })

        messages.append({
            "role": "user",
            "content": content_blocks
        })

        try:
            # Flatten system prompt into user message for Google AI compatibility
            messages = merge_system_into_user(messages)

            # Model Selection Logic
            # Since we are in the "VISION MODE" block, we know there are images.
            selected_model = HEAVY_VISION_MODEL 
            logger.info(f"[INFO] Smart Router: Detected images, switching to {selected_model}")

            completion = await groq_client.chat.completions.create(
                model=selected_model, 
                messages=messages,
                temperature=temperature,
                max_tokens=2048,
            )
            
            assistant_message = completion.choices[0].message
            logger.info(f"[INFO] Vision Response Generated ({len(assistant_message.content)} chars)")
            
            # --- Persistence: Save Assistant Message ---
            saved_msg_id = None
            if request.session_id and supabase_client:
                try:
                    data = await _execute_with_retry(
                        lambda: supabase_client.table("chat_messages").insert({
                            "session_id": request.session_id,
                            "role": "ai",
                            "content": assistant_message.content
                        }).execute(),
                        "Save assistant vision message",
                    )
                    if data.data and len(data.data) > 0:
                        saved_msg_id = data.data[0]['id']
                except Exception as e:
                    logger.error(f"Failed to save assistant vision message: {e}")
            
            return {
                "choices": [{
                    "message": {
                        "role": assistant_message.role,
                        "content": assistant_message.content,
                        "id": saved_msg_id,
                        "session_id": request.session_id
                    }
                }]
            }
            
        except Exception as e:
            logger.error(f"[ERROR] Vision API Error: {e}")
            raise HTTPException(status_code=500, detail=f"Vision AI processing failed: {str(e)}")

    # --- TEXT MODE: Standard RAG flow ---
    # 1. System Prompt (potentially enhanced with RAG context)
    messages.append({"role": "system", "content": final_system_prompt})

    # Inject Decoupled System Instruction if present
    if request.system_instruction:
            messages.append({"role": "system", "content": request.system_instruction})
            logger.info("[INFO] Injected hidden system instruction for Text")
    
    # 2. History (if any)  sanitize roles: DB stores 'ai' but Groq only accepts 'user'/'assistant'/'system'
    if request.messages:
        for msg in request.messages:
            sanitized_role = msg.role
            if sanitized_role in ('ai', 'assistant'):
                sanitized_role = 'assistant'
            elif sanitized_role == 'system':
                sanitized_role = 'system'
            else:
                sanitized_role = 'user'
            messages.append({"role": sanitized_role, "content": msg.content})
    
    # 3. Handle specific modes if this is a fresh request
    if not request.messages:
        mode_instruction = ""
        if request.mode == "explain":
            mode_instruction = "Explain this concept clearly for a student. Keep it medium length."
        elif request.mode == "example":
            mode_instruction = "Provide a clinical example or real-world pharmacy application."
        elif request.mode == "memory":
            mode_instruction = "Create a mnemonic or memory aid."
        
        user_content = f"Concept: {request.text}\n{mode_instruction}"
        if request.context:
            user_content += f"\n\nContext from Document: {request.context}"
            
        messages.append({"role": "user", "content": user_content})
        
    else:
        # For ongoing chat, just use the text as-is
        messages.append({"role": "user", "content": request.text})

    # --- Call Groq API (Text) ---
    try:
        # Check if any message in history has images (though this block is primarily text mode)
        # We use the helper to be sure
        if contains_image(messages):
             selected_model = HEAVY_VISION_MODEL
             logger.info(f"[INFO] Smart Router: Found images in history, using {selected_model}")
        else:
             selected_model = FAST_TEXT_MODEL
             logger.info(f"[INFO] Smart Router: Pure text detected, processing efficiently with {selected_model}")

        # Flatten system prompt into user message for Google AI compatibility
        messages = merge_system_into_user(messages)

        completion = await groq_client.chat.completions.create(
            model=selected_model, 
            messages=messages,
            temperature=temperature,
            max_tokens=2048,
        )
        
        assistant_message = completion.choices[0].message
        logger.info(f"[INFO] AI Response Generated ({len(assistant_message.content)} chars)")
        
        # --- Persistence: Save Assistant Message ---
        saved_msg_id = None
        if request.session_id and supabase_client:
            try:
                data = await _execute_with_retry(
                    lambda: supabase_client.table("chat_messages").insert({
                        "session_id": request.session_id,
                        "role": "ai",
                        "content": assistant_message.content
                    }).execute(),
                    "Save assistant text message",
                )
                if data.data and len(data.data) > 0:
                     saved_msg_id = data.data[0]['id']
            except Exception as e:
                logger.error(f"Failed to save assistant text message: {e}")
        
        return {
            "choices": [{
                "message": {
                    "role": assistant_message.role,
                    "content": assistant_message.content,
                    "id": saved_msg_id,
                    "session_id": request.session_id
                }
            }]
        }
        
    except Exception as e:
        logger.error(f"[ERROR] API Error: {e}")
        raise HTTPException(status_code=500, detail=f"AI processing failed: {str(e)}")

# Function to set dependencies (called from main api.py)
def set_dependencies(groq, supabase, api_key_verifier):
    global groq_client, supabase_client, verify_api_key_handler
    groq_client = groq
    supabase_client = supabase
    verify_api_key_handler = api_key_verifier

# --- Session Management Endpoints ---

@router.get("/history", response_model=List[ChatSession], dependencies=[Depends(verify_api_key)])
async def get_chat_history(context_id: str = None, current_user: User = Depends(get_current_user)):
    """
    Fetch all chat sessions for the user.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    try:
        # Assuming RLS policy handles user isolation
        query = supabase_client.table("chat_sessions").select("*").order("created_at", desc=True)
        
        # Filter by User Ownership
        query = query.eq("user_id", current_user.id)
        
        # Filter by context_id if provided
        if context_id:
            query = query.eq("context_id", context_id)
        
        res = await _execute_with_retry(
            lambda: query.execute(),
            "Fetch chat history sessions",
        )
        return res.data
    except Exception as e:
        logger.error(f"History Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{session_id}", dependencies=[Depends(verify_api_key)])
async def get_session_messages(session_id: str, current_user: User = Depends(get_current_user)):
    """
    Fetch all messages for a specific session.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    try:
        # Verify ownership first (optional if RLS is on, but strict requirement)
        session_res = await _execute_with_retry(
            lambda: supabase_client.table("chat_sessions").select("user_id").eq("id", session_id).execute(),
            "Fetch chat session ownership",
        )
        if session_res.data:
             if session_res.data[0]['user_id'] != current_user.id:
                  # If user_id is null (legacy), maybe allow? Or migrate?
                  # For now, strict check if user_id exists.
                  if session_res.data[0]['user_id'] is not None:
                       raise HTTPException(status_code=403, detail="Not authorized to view this chat")
        
        res = await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute(),
            "Fetch chat session messages",
        )
        return res.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Messages Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/session", response_model=CreateSessionResponse, dependencies=[Depends(verify_api_key)])
async def create_session(request: Optional[CreateSessionRequest] = None, current_user: User = Depends(get_current_user)):
    """
    Create a new chat session. Optional title.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    new_id = str(uuid.uuid4())
    new_title = request.title if request and request.title else "New Chat"
    
    try:
        await _execute_with_retry(
            lambda: supabase_client.table("chat_sessions").insert({
                "id": new_id,
                "title": new_title,
                "context_id": request.context_id if request else None,
                "user_id": current_user.id
            }).execute(),
            "Create chat session",
        )
        return {"id": new_id, "title": new_title, "created_at": datetime.now()}
    except Exception as e:
        logger.error(f"Create Session Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history", dependencies=[Depends(verify_api_key)])
async def clear_history(current_user: User = Depends(get_current_user)):
    """
    Clear all chat history.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    try:
        # Delete only the authenticated user's sessions.
        await _execute_with_retry(
            lambda: supabase_client.table("chat_sessions").delete().eq("user_id", current_user.id).execute(),
            "Clear chat history",
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Clear History Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/{session_id}", dependencies=[Depends(verify_api_key)])
async def delete_session(session_id: str, current_user: User = Depends(get_current_user)):
    """
    Delete a specific chat session.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    try:
        # Delete only if the session belongs to the authenticated user.
        await _execute_with_retry(
            lambda: supabase_client.table("chat_sessions").delete().eq("id", session_id).eq("user_id", current_user.id).execute(),
            "Delete chat session",
        )
        return {"status": "success", "id": session_id}
    except Exception as e:
        logger.error(f"Delete Session Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Edit Message Endpoint ---
class EditMessageRequest(BaseModel):
    session_id: str
    message_id: str
    new_text: str

@router.post("/chat/edit", dependencies=[Depends(verify_api_key)])
async def edit_message(request: EditMessageRequest, current_user: User = Depends(get_current_user)):
    """
    Edit a user message: delete it and all subsequent messages, then re-process with new text.
    Strict RLS: only the session owner can edit.
    """
    if not supabase_client or not groq_client:
        raise HTTPException(status_code=500, detail="Services not initialized")

    try:
        # 1. Verify Session Ownership (Strict RLS)
        await _assert_session_owner(request.session_id, current_user)

        # 2. Fetch the target message to get its created_at timestamp
        # Debug: log what ID we received from the frontend
        logger.info(
            f"Attempting to edit message ID: {request.message_id} "
            f"(type: {type(request.message_id).__name__})"
        )
        # Parse message_id as int  DB column is bigserial (integer)
        try:
            msg_id_int = int(request.message_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail=f"Invalid message_id: {request.message_id}")
        
        msg_res = await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").select("id, created_at, role").eq("id", msg_id_int).eq("session_id", request.session_id).execute(),
            "Fetch message for edit",
        )
        if not msg_res.data:
            raise HTTPException(status_code=404, detail="Message not found")
        
        target_msg = msg_res.data[0]
        if target_msg['role'] != 'user':
            raise HTTPException(status_code=400, detail="Can only edit user messages")
        
        target_timestamp = target_msg['created_at']
        logger.info(f"[INFO] Editing message {request.message_id} in session {request.session_id}, deleting from {target_timestamp}")

        # 3. STRICT DELETE: Remove all messages with created_at >= target timestamp
        await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").delete().eq("session_id", request.session_id).gte("created_at", target_timestamp).execute(),
            "Delete messages from edit point",
        )

        # 4. Save the new user message
        await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").insert({
                "session_id": request.session_id,
                "role": "user",
                "content": request.new_text
            }).execute(),
            "Save edited user message",
        )

        # 5. Build LLM context from remaining messages (those before the edit point)
        remaining_res = await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").select("*").eq("session_id", request.session_id).order("created_at", desc=False).execute(),
            "Fetch remaining messages after edit",
        )
        remaining_msgs = remaining_res.data or []

        # Build LLM messages
        system_prompt = PHARMACY_SYSTEM_PROMPT
        temperature = 0.7
        cached_config = await get_cached_settings()
        if cached_config:
            if cached_config.get("system_prompt"):
                system_prompt = cached_config["system_prompt"]
            if cached_config.get("temperature") is not None:
                temperature = float(cached_config["temperature"])

        llm_messages = [{"role": "system", "content": system_prompt}]
        for m in remaining_msgs:
            # Sanitize roles: DB stores 'ai' but Groq only accepts 'user'/'assistant'/'system'
            raw_role = m.get('role', 'user')
            if raw_role in ('ai', 'assistant'):
                role = 'assistant'
            elif raw_role == 'system':
                role = 'system'
            else:
                role = 'user'
            llm_messages.append({"role": role, "content": m['content']})
        
        logger.info(f"[INFO] Sending {len(llm_messages)} messages to Groq (roles: {[m['role'] for m in llm_messages]})")

        # 6. Call Groq API
        logger.info(f"[INFO] Re-generating after edit for session {request.session_id}")
        
        # Smart Router Check
        if contains_image(llm_messages):
             selected_model = HEAVY_VISION_MODEL
             logger.info(f"[INFO] Smart Router: Images detected in context, using {selected_model}")
        else:
             selected_model = FAST_TEXT_MODEL
             logger.info(f"[INFO] Smart Router: Text-only context, using {selected_model}")

        # Flatten system prompt into user message for Google AI compatibility
        llm_messages = merge_system_into_user(llm_messages)

        completion = await groq_client.chat.completions.create(
            model=selected_model,
            messages=llm_messages,  # All roles sanitized above
            temperature=temperature,
            max_tokens=2048,
        )

        assistant_content = completion.choices[0].message.content

        # 7. Save AI response
        await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").insert({
                "session_id": request.session_id,
                "role": "ai",
                "content": assistant_content
            }).execute(),
            "Save regenerated edit response",
        )

        logger.info(f"[INFO] Edit complete for session {request.session_id}")
        return {"status": "success"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Edit Message Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/{session_id}/regenerate", dependencies=[Depends(verify_api_key)])
async def regenerate_response(session_id: str, current_user: User = Depends(get_current_user)):
    """
    Regenerate the last AI response.
    Deletes the last AI message and re-processes the preceding user message.
    """
    if not supabase_client or not groq_client:
        raise HTTPException(status_code=500, detail="Services not initialized")

    try:
        # 1. Verify Ownership
        await _assert_session_owner(session_id, current_user)

        # 2. Fetch Messages
        msg_res = await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute(),
            "Fetch messages for regenerate",
        )
        messages = msg_res.data or []

        if not messages:
            raise HTTPException(status_code=400, detail="No messages to regenerate")

        # 3. Identify & Delete Last Assistant Message
        last_msg = messages[-1]
        
        # Logic: If last is AI, delete it. Then look at new last.
        if last_msg['role'] == 'ai' or last_msg['role'] == 'assistant':
             await _execute_with_retry(
                 lambda: supabase_client.table("chat_messages").delete().eq("id", last_msg['id']).eq("session_id", session_id).execute(),
                 "Delete last assistant message for regenerate",
             )
             messages.pop() # Remove from local list
        
        # Now get the last user message (the prompt)
        if not messages:
             raise HTTPException(status_code=400, detail="No user message found to regenerate from")
             
        last_user_msg = messages[-1]
        if last_user_msg['role'] != 'user':
             # If strictly no user message found last, maybe just return error
             # But let's allow "continue" if the user wants to regenerate on a weird state?
             # No, spec says "Identify the message right before it (which should be the last 'user' prompt)"
             raise HTTPException(status_code=400, detail="Last remaining message is not from user")

        # 4. Prepare for Re-Generation
        # History = All messages BEFORE the last_user_msg
        history_msgs = []
        for m in messages[:-1]:
            # Map DB roles to LLM roles
            role = "assistant" if (m['role'] == 'ai' or m['role'] == 'assistant') else "user"
            history_msgs.append({"role": role, "content": m['content']})

        # 5. Build LLM Request
        # System Prompt
        system_prompt = PHARMACY_SYSTEM_PROMPT
        cached_config = await get_cached_settings()
        temperature = 0.7
        if cached_config:
            if cached_config.get("system_prompt"):
                system_prompt = cached_config["system_prompt"]
            if cached_config.get("temperature") is not None:
                temperature = float(cached_config["temperature"])
        
        llm_messages = [{"role": "system", "content": system_prompt}]
        llm_messages.extend(history_msgs)
        
        # Add the User Prompt (last_user_msg)
        user_content_block = []
        user_text = last_user_msg['content']
        image_data = last_user_msg.get('image_data')
        
        if image_data:
             try:
                 images = json.loads(image_data) if image_data.startswith('[') else [image_data]
             except:
                 images = [image_data]
                 
             user_content_block.append({"type": "text", "text": user_text})
             for img in images:
                 user_content_block.append({
                     "type": "image_url",
                     "image_url": {"url": f"data:image/jpeg;base64,{img}"}
                 })
             llm_messages.append({"role": "user", "content": user_content_block})
        else:
             llm_messages.append({"role": "user", "content": user_text})

        # 6. Call Groq
        logger.info(f"[INFO] Regenerating response for session {session_id}")
        
        # Smart Router Check
        if contains_image(llm_messages):
             selected_model = HEAVY_VISION_MODEL
             logger.info(f"[INFO] Smart Router: Images detected in context, using {selected_model}")
        else:
             selected_model = FAST_TEXT_MODEL
             logger.info(f"[INFO] Smart Router: Text-only context, using {selected_model}")

        # Flatten system prompt into user message for Google AI compatibility
        llm_messages = merge_system_into_user(llm_messages)

        completion = await groq_client.chat.completions.create(
            model=selected_model,
            messages=llm_messages,
            temperature=temperature,
            max_tokens=2048,
        )
        
        assistant_content = completion.choices[0].message.content
        
        # 7. Save New Response
        await _execute_with_retry(
            lambda: supabase_client.table("chat_messages").insert({
                "session_id": session_id,
                "role": "ai",
                "content": assistant_content
            }).execute(),
            "Save regenerated assistant response",
        )
        
        return {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": assistant_content
                }
            }]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Regenerate Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # Configure Gemini for RAG embeddings
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    if GOOGLE_API_KEY:
        genai.configure(api_key=GOOGLE_API_KEY)
        logger.info("[INFO] Gemini API configured for RAG in chat router")
    else:
        logger.warning("[WARNING] GOOGLE_API_KEY not set - RAG features will be disabled")


