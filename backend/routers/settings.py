"""
Settings Router: System Configuration Management
Handles AI prompt settings, temperature, and maintenance mode.
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
import logging
from dependencies import get_current_user, User

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/admin/config", tags=["settings"])

# Injected from main api.py
supabase_client = None
supabase_service_client = None
verify_api_key_handler = None

# --- Models ---
class SystemConfigUpdate(BaseModel):
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    maintenance_mode: Optional[bool] = None
    web_search_enabled: Optional[bool] = None  # Admin kill switch for Tavily web search
    rag_threshold: Optional[float] = None

# --- Helper ---
async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected settings endpoints.
    """
    if verify_api_key_handler is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return await verify_api_key_handler(x_api_key)

async def verify_super_admin(current_user: User = Depends(get_current_user)):
    if not current_user.email:
        raise HTTPException(status_code=403, detail="Access Denied: user email missing.")

    sb = supabase_service_client or supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        normalized_email = current_user.email.strip().lower()
        res = sb.table('user_roles').select('role,email').ilike('email', normalized_email).execute()
        rows = res.data or []
        if not rows:
            raise HTTPException(status_code=403, detail="Access Denied: User not found or no role.")

        has_super_admin = any((row.get('role') or '').strip().lower() == 'super_admin' for row in rows)
        if not has_super_admin:
            raise HTTPException(status_code=403, detail="Only Super Admins can modify AI behavior")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth Check Error: {e}")
        raise HTTPException(status_code=500, detail="Authorization Check Failed")
    
    return True

# --- Endpoints ---

@router.get("", dependencies=[Depends(verify_api_key)])
async def get_system_config(current_user: User = Depends(get_current_user)):
    """
    Fetch the current system configuration.
    Assumes a single row in 'system_settings' table (id=1).
    """
    sb = supabase_service_client or supabase_client
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

    try:
        res = sb.table('system_settings').select('*').eq('id', 1).execute()
        
        if not res.data or len(res.data) == 0:
            return {
                "system_prompt": "You are a helpful AI assistant.",
                "temperature": 0.7,
                "maintenance_mode": False
            }
        
        return res.data[0]
        
    except Exception as e:
        logger.error(f"Config Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to load system configuration. Please try again.")

@router.post("/update")
async def update_system_config(
    config: SystemConfigUpdate,
    _: str = Depends(verify_api_key),
    current_user: User = Depends(get_current_user)
):
    """
    Update system configuration.
    SECURE: Only allows Super Admins.
    """
    await verify_super_admin(current_user)
    
    try:
        sb = supabase_service_client or supabase_client
        if not sb:
            raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

        current_res = sb.table('system_settings').select('system_prompt,temperature,maintenance_mode,web_search_enabled,rag_threshold').eq('id', 1).execute()
        current = (current_res.data[0] if current_res.data else {}) or {}

        merged = {
            "id": 1,
            "system_prompt": config.system_prompt if config.system_prompt is not None else current.get("system_prompt", "You are a helpful AI assistant."),
            "temperature": config.temperature if config.temperature is not None else current.get("temperature", 0.7),
            "maintenance_mode": config.maintenance_mode if config.maintenance_mode is not None else current.get("maintenance_mode", False),
            "web_search_enabled": config.web_search_enabled if config.web_search_enabled is not None else current.get("web_search_enabled", True),
            "rag_threshold": config.rag_threshold if config.rag_threshold is not None else current.get("rag_threshold", 0.50),
        }

        res = sb.table('system_settings').upsert(merged).execute()

        # Ensure /chat sees updates immediately instead of serving stale cached settings.
        try:
            from routers import chat as chat_router
            chat_router.invalidate_settings_cache()
        except Exception as cache_err:
            logger.warning(f"Config updated, but cache invalidation failed: {cache_err}")

        logger.info("System config updated and chat settings cache invalidated")
        return {"message": "System configuration updated", "data": res.data}
    except Exception as e:
        logger.error(f"Config Update Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to save configuration. Please try again.")

# Function to set dependencies (called from main api.py)
def set_dependencies(supabase, api_key_verifier, supabase_service=None):
    global supabase_client, supabase_service_client, verify_api_key_handler
    supabase_client = supabase
    supabase_service_client = supabase_service
    verify_api_key_handler = api_key_verifier

