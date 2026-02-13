"""
Settings Router: System Configuration Management
Handles AI prompt settings, temperature, and maintenance mode.
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/admin/config", tags=["settings"])

# Injected from main api.py
supabase_client = None

# --- Models ---
class SystemConfigUpdate(BaseModel):
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    maintenance_mode: Optional[bool] = None

# --- Helper ---
async def verify_super_admin(x_user_email: str = Header(None)):
    if not x_user_email:
        raise HTTPException(status_code=400, detail="Missing x-user-email header")
    
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    try:
        res = supabase_client.table('user_roles').select('role').eq('email', x_user_email).execute()
        
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

@router.get("")
async def get_system_config():
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
    x_user_email: str = Header(None)
):
    """
    Update system configuration.
    SECURE: Only allows Super Admins.
    """
    await verify_super_admin(x_user_email)

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
def set_dependencies(supabase):
    global supabase_client
    supabase_client = supabase

