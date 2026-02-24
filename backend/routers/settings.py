"""
Settings Router: System Configuration Management
Handles AI prompt settings, temperature, and maintenance mode.
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/admin/config", tags=["settings"])

# Injected from main api.py
supabase_client = None
verify_api_key_handler = None

# --- Models ---
class SystemConfigUpdate(BaseModel):
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    maintenance_mode: Optional[bool] = None

class User(BaseModel):
    id: str
    email: Optional[str] = None

# --- Helper ---
async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected settings endpoints.
    """
    if verify_api_key_handler is None:
        raise HTTPException(status_code=500, detail="API key verifier not configured")
    return await verify_api_key_handler(x_api_key)

async def get_current_user(authorization: Optional[str] = Header(None)):
    """
    Verify Supabase JWT and return authenticated user.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization Header")

    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    try:
        token = authorization.split(" ")[1]
        user_res = supabase_client.auth.get_user(token)
        if not user_res.user:
            raise HTTPException(status_code=401, detail="Invalid Token")
        return User(id=user_res.user.id, email=user_res.user.email)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth User Decode Error: {e}")
        raise HTTPException(status_code=401, detail="Authentication Failed")

async def verify_super_admin(current_user: User = Depends(get_current_user)):
    if not current_user.email:
        raise HTTPException(status_code=403, detail="Access Denied: user email missing.")

    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    try:
        res = supabase_client.table('user_roles').select('role').eq('email', current_user.email).execute()
        
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=403, detail="Access Denied: User not found or no role.")
             
        user_role = res.data[0].get('role')
        if user_role != 'super_admin':
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
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    try:
        res = supabase_client.table('system_settings').select('*').eq('id', 1).execute()
        
        if not res.data or len(res.data) == 0:
            return {
                "system_prompt": "You are a helpful AI assistant.",
                "temperature": 0.7,
                "maintenance_mode": False
            }
        
        return res.data[0]
        
    except Exception as e:
        logger.error(f"Config Fetch Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

    updates = {}
    if config.system_prompt is not None:
        updates['system_prompt'] = config.system_prompt
    if config.temperature is not None:
        updates['temperature'] = config.temperature
    if config.maintenance_mode is not None:
        updates['maintenance_mode'] = config.maintenance_mode

    updates['id'] = 1
    
    try:
        res = supabase_client.table('system_settings').upsert(updates).execute()
        logger.info(f"System config updated: {list(updates.keys())}")
        return {"message": "System configuration updated", "data": res.data}
    except Exception as e:
        logger.error(f"Config Update Error: {e}")
        raise HTTPException(status_code=500, detail=f"Update failed: {e}")

# Function to set dependencies (called from main api.py)
def set_dependencies(supabase, api_key_verifier):
    global supabase_client, verify_api_key_handler
    supabase_client = supabase
    verify_api_key_handler = api_key_verifier

