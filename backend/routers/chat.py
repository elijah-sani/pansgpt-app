"""
Chat Router: AI Conversation Endpoint with RAG Support
Handles AI-powered chat interactions using Groq with vector search.
"""
from fastapi import APIRouter, HTTPException, Depends
import asyncio
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
import logging
import os
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
verify_api_key = None

class User(BaseModel):
    id: str
    email: Optional[str] = None

from fastapi import Header

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
        user_res = supabase_client.auth.get_user(token)
        if not user_res.user:
             raise HTTPException(status_code=401, detail="Invalid Token")
        return User(id=user_res.user.id, email=user_res.user.email)
    except Exception as e:
        logger.error(f"Auth Error: {e}")
        # Only for development/transition, maybe fallback? 
        # But user asked for STRICT ownership.
        raise HTTPException(status_code=401, detail=f"Authentication Failed: {str(e)}")

# Settings Cache (TTL = 5 minutes)
_settings_cache = TTLCache(maxsize=1, ttl=300)

def get_cached_settings():
    """
    Fetch system settings with 5-minute cache to reduce DB queries.
    """
    cache_key = "system_settings"
    if cache_key in _settings_cache:
        return _settings_cache[cache_key]
    
    if not supabase_client:
        return None
    
    try:
        res = supabase_client.table("system_settings").select("system_prompt, temperature").eq("id", 1).execute()
        if res.data and len(res.data) > 0:
            _settings_cache[cache_key] = res.data[0]
            logger.info("🔄 System settings refreshed from database")
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
        logger.warning("⚠️ Supabase not available for RAG")
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
            logger.info(f"📋 Using UUID directly: {document_id}")
            try:
                meta_response = supabase_client.table("pans_library").select("file_name, topic, lecturer_name, course_code").eq("id", document_id).execute()
                if meta_response.data and len(meta_response.data) > 0:
                    doc_metadata = meta_response.data[0]
            except Exception as meta_err:
                logger.warning(f"⚠️ Could not fetch metadata: {meta_err}")
        except (ValueError, AttributeError):
            # Not a UUID - must be a Drive file ID, lookup the Supabase UUID and metadata
            try:
                doc_response = supabase_client.table("pans_library").select("id, file_name, topic, lecturer_name, course_code").eq("drive_file_id", document_id).execute()
                if doc_response.data and len(doc_response.data) > 0:
                    supabase_doc_id = doc_response.data[0]['id']
                    doc_metadata = doc_response.data[0]
                    logger.info(f"🔄 Converted Drive ID to UUID: {supabase_doc_id}")
                else:
                    logger.warning(f"⚠️ No document found for Drive ID: {document_id}")
                    return ""
            except Exception as lookup_err:
                logger.error(f"❌ Document ID lookup failed: {lookup_err}")
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
        logger.info(f"🔍 Embedded query: {len(query_vector)} dimensions")
        
        # Step 2: Call Supabase RPC for vector similarity search
        response = supabase_client.rpc(
            'match_documents',
            {
                'query_embedding': query_vector,
                'match_threshold': 0.3,  # Lowered from 0.5 for broader retrieval
                'match_count': 10,       # Increased from 5 to get more context
                'filter_doc_id': supabase_doc_id  # Use converted UUID
            }
        ).execute()
        
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
                logger.info(f"📋 Using metadata only, no vector chunks found")
                return "\n".join(context_parts)
            logger.info("📭 No relevant chunks found in vector search")
            return ""
        
        context_parts.append("RELEVANT CONTENT FROM LECTURE:")
        context_chunks = [item['content'] for item in response.data]
        context_parts.append("\n\n---\n\n".join(context_chunks))
        
        context_text = "\n\n".join(context_parts)
        logger.info(f"📚 Retrieved {len(response.data)} chunks + metadata ({len(context_text)} chars)")
        
        return context_text
        
    except Exception as e:
        logger.error(f"❌ RAG context retrieval failed: {e}")
        return ""

# --- Endpoint ---
@router.post("/chat", dependencies=[Depends(lambda: verify_api_key)])
async def chat(request: ChatRequest):
    """
    AI Chat Endpoint (formerly /ask-ai).
    Analyze text using Groq AI with support for conversation history.
    Modes: explain, example, memory, chat
    """
    if not groq_client:
        raise HTTPException(status_code=500, detail="AI client not initialized")
    
    # --- Persistence: Save User Message & Auto-Rename ---
    if request.session_id and supabase_client:
        try:
            # 1. Save Message
            # Flatten image list to JSON string for storage
            image_payload = None
            if request.images:
                image_payload = json.dumps(request.images)
            elif request.image:
                image_payload = request.image

            supabase_client.table("chat_messages").insert({
                "session_id": request.session_id,
                "role": "user",
                "content": request.text,
                "image_data": image_payload
            }).execute()
            
            # 2. Auto-Rename if "New Chat"
            try:
                # Fetch current title
                sess_res = supabase_client.table("chat_sessions").select("title").eq("id", request.session_id).execute()
                if sess_res.data and len(sess_res.data) > 0:
                    current_title = sess_res.data[0].get('title')
                    if current_title == "New Chat":
                        logger.info(f"🤖 Triggering AI Auto-Rename for session {request.session_id}...")
                        # Generate title via AI
                        try:
                            title_prompt = f"Create a short, professional title (maximum 4 words) for a chat that starts with this message: '{request.text}'. Return ONLY the title text, with no quotes, no punctuation, and no extra words."
                            
                            title_completion = groq_client.chat.completions.create(
                                model="llama-3.1-8b-instant",
                                messages=[{"role": "user", "content": title_prompt}],
                                temperature=0.5,
                                max_tokens=10
                            )
                            
                            new_title = title_completion.choices[0].message.content.strip().strip('"')
                            
                            # Fallback if empty
                            if not new_title:
                                new_title = request.text[:30] + "..."
                                
                            supabase_client.table("chat_sessions").update({"title": new_title}).eq("id", request.session_id).execute()
                            logger.info(f"✨ AI Auto-renamed session {request.session_id} to '{new_title}'")
                            
                        except Exception as ai_title_err:
                            logger.error(f"AI Title Generation Failed: {ai_title_err}")
                            # Fallback to simple truncation
                            fallback_title = request.text[:30] + "..."
                            supabase_client.table("chat_sessions").update({"title": fallback_title}).eq("id", request.session_id).execute()

            except Exception as rename_err:
                 logger.warning(f"Auto-rename failed: {rename_err}")

        except Exception as e:
            logger.error(f"Failed to save user message: {e}")

    logger.info(f"💬 Chat Request: mode={request.mode}, text='{request.text[:30]}...', msgs={len(request.messages or [])}")

    # --- Fetch Dynamic System Settings (Cached) ---
    system_prompt = PHARMACY_SYSTEM_PROMPT
    temperature = 0.7
    
    cached_config = get_cached_settings()
    if cached_config:
        if cached_config.get("system_prompt"):
            system_prompt = cached_config["system_prompt"]
        if cached_config.get("temperature") is not None:
            temperature = float(cached_config["temperature"])
        logger.debug(f"⚙️ Using Cached Settings: Temp={temperature}")

    # --- RAG: Retrieve Relevant Context via Vector Search ---
    context_text = ""
    if request.document_id:
        logger.info(f"🔍 RAG enabled for document: {request.document_id}")
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
        logger.info(f"📚 Enhanced system prompt with {len(context_text)} chars of context")

    # Construct Messages List
    messages = []
    
    # --- VISION MODE: Images present ---
    # Collect images from both new list and legacy field
    all_images = request.images or []
    if request.image_base64 and request.image_base64 not in all_images:
        all_images.insert(0, request.image_base64)

    if all_images:
        logger.info(f"🖼️ Vision mode: {len(all_images)} images")
        messages.append({"role": "system", "content": final_system_prompt})
        
        # Inject Decoupled System Instruction if present
        if request.system_instruction:
             messages.append({"role": "system", "content": request.system_instruction})
             logger.info("👻 Injected hidden system instruction for Vision")
        
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
            completion = groq_client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct", # DO NOT CHANGE: User requested to lock this model
                messages=messages,
                temperature=temperature,
                max_tokens=2048,
            )
            
            assistant_message = completion.choices[0].message
            logger.info(f"✅ Vision Response Generated ({len(assistant_message.content)} chars)")
            
            # --- Persistence: Save Assistant Message ---
            saved_msg_id = None
            if request.session_id and supabase_client:
                try:
                    data = supabase_client.table("chat_messages").insert({
                        "session_id": request.session_id,
                        "role": "ai",
                        "content": assistant_message.content
                    }).execute()
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
            logger.error(f"❌ Groq Vision API Error: {e}")
            raise HTTPException(status_code=500, detail=f"Vision AI processing failed: {str(e)}")

    # --- TEXT MODE: Standard RAG flow ---
    # 1. System Prompt (potentially enhanced with RAG context)
    messages.append({"role": "system", "content": final_system_prompt})

    # Inject Decoupled System Instruction if present
    if request.system_instruction:
            messages.append({"role": "system", "content": request.system_instruction})
            logger.info("👻 Injected hidden system instruction for Text")
    
    # 2. History (if any)
    if request.messages:
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
    
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
        completion = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct", # DO NOT CHANGE: User requested to lock this model
            messages=messages,
            temperature=temperature,
            max_tokens=2048,
        )
        
        assistant_message = completion.choices[0].message
        logger.info(f"✅ AI Response Generated ({len(assistant_message.content)} chars)")
        
        # --- Persistence: Save Assistant Message ---
        saved_msg_id = None
        if request.session_id and supabase_client:
            try:
                data = supabase_client.table("chat_messages").insert({
                    "session_id": request.session_id,
                    "role": "ai",
                    "content": assistant_message.content
                }).execute()
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
        logger.error(f"❌ Groq API Error: {e}")
        raise HTTPException(status_code=500, detail=f"AI processing failed: {str(e)}")

# Function to set dependencies (called from main api.py)
def set_dependencies(groq, supabase, api_key_verifier):
    global groq_client, supabase_client, verify_api_key
    groq_client = groq
    supabase_client = supabase
    verify_api_key = api_key_verifier

# --- Session Management Endpoints ---

@router.get("/history", response_model=List[ChatSession], dependencies=[Depends(lambda: verify_api_key)])
def get_chat_history(context_id: str = None, current_user: User = Depends(get_current_user)):
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
        
        res = query.execute()
        return res.data
    except Exception as e:
        print(f"❌ Error fetching history for context {context_id}:")
        print(traceback.format_exc())
        # Return an empty array instead of crashing the frontend
        return []
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{session_id}", dependencies=[Depends(lambda: verify_api_key)])
def get_session_messages(session_id: str, current_user: User = Depends(get_current_user)):
    """
    Fetch all messages for a specific session.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    try:
        # Verify ownership first (optional if RLS is on, but strict requirement)
        session_res = supabase_client.table("chat_sessions").select("user_id").eq("id", session_id).execute()
        if session_res.data:
             if session_res.data[0]['user_id'] != current_user.id:
                  # If user_id is null (legacy), maybe allow? Or migrate?
                  # For now, strict check if user_id exists.
                  if session_res.data[0]['user_id'] is not None:
                       raise HTTPException(status_code=403, detail="Not authorized to view this chat")
        
        res = supabase_client.table("chat_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute()
        return res.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Messages Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/session", response_model=CreateSessionResponse, dependencies=[Depends(lambda: verify_api_key)])
def create_session(request: Optional[CreateSessionRequest] = None, current_user: User = Depends(get_current_user)):
    """
    Create a new chat session. Optional title.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    new_id = str(uuid.uuid4())
    new_title = request.title if request and request.title else "New Chat"
    
    try:
        supabase_client.table("chat_sessions").insert({
            "id": new_id,
            "title": new_title,
            "context_id": request.context_id if request else None,
            "user_id": current_user.id
        }).execute()
        return {"id": new_id, "title": new_title, "created_at": datetime.now()}
    except Exception as e:
        logger.error(f"Create Session Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history", dependencies=[Depends(lambda: verify_api_key)])
def clear_history():
    """
    Clear all chat history.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    try:
        # Delete user's sessions (Assuming RLS or add user_id check if needed)
        supabase_client.table("chat_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Clear History Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/history/{session_id}", dependencies=[Depends(lambda: verify_api_key)])
def delete_session(session_id: str):
    """
    Delete a specific chat session.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database not active")
    
    try:
        # Delete session (Cascade should handle messages if configured, otherwise delete messages first)
        supabase_client.table("chat_sessions").delete().eq("id", session_id).execute()
        return {"status": "success", "id": session_id}
    except Exception as e:
        logger.error(f"Delete Session Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/{session_id}/regenerate", dependencies=[Depends(lambda: verify_api_key)])
async def regenerate_response(session_id: str, current_user: User = Depends(get_current_user)):
    """
    Regenerate the last AI response.
    Deletes the last AI message and re-processes the preceding user message.
    """
    if not supabase_client or not groq_client:
        raise HTTPException(status_code=500, detail="Services not initialized")

    try:
        # 1. Verify Ownership
        sess_res = supabase_client.table("chat_sessions").select("user_id").eq("id", session_id).execute()
        if not sess_res.data:
            raise HTTPException(status_code=404, detail="Session not found")
        if sess_res.data[0]['user_id'] != current_user.id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        # 2. Fetch Messages
        msg_res = supabase_client.table("chat_messages").select("*").eq("session_id", session_id).order("created_at", desc=False).execute()
        messages = msg_res.data or []

        if not messages:
            raise HTTPException(status_code=400, detail="No messages to regenerate")

        # 3. Identify & Delete Last Assistant Message
        last_msg = messages[-1]
        
        # Logic: If last is AI, delete it. Then look at new last.
        if last_msg['role'] == 'ai' or last_msg['role'] == 'assistant':
             supabase_client.table("chat_messages").delete().eq("id", last_msg['id']).execute()
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
        cached_config = get_cached_settings()
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
        logger.info(f"🔄 Regenerating response for session {session_id}")
        completion = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=llm_messages,
            temperature=temperature,
            max_tokens=2048,
        )
        
        assistant_content = completion.choices[0].message.content
        
        # 7. Save New Response
        supabase_client.table("chat_messages").insert({
            "session_id": session_id,
            "role": "ai",
            "content": assistant_content
        }).execute()
        
        return {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": assistant_content
                }
            }]
        }

    except Exception as e:
        logger.error(f"Regenerate Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # Configure Gemini for RAG embeddings
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    if GOOGLE_API_KEY:
        genai.configure(api_key=GOOGLE_API_KEY)
        logger.info("✅ Gemini API configured for RAG in chat router")
    else:
        logger.warning("⚠️ GOOGLE_API_KEY not set - RAG features will be disabled")
