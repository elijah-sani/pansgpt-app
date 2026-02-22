"""
System Router: Public System Status Endpoints
Provides maintenance mode status for frontend checks.
"""
from fastapi import APIRouter
import logging
from dependencies import get_jwks_status

logger = logging.getLogger("PansGPT")

router = APIRouter(prefix="/sys", tags=["system"])

# Injected from main api.py
supabase_client = None

@router.get("/status")
async def get_system_status():
    """
    Public endpoint to check system status (e.g. maintenance mode).
    """
    if not supabase_client:
        return {"maintenance_mode": False}

    try:
        res = supabase_client.table('system_settings').select('maintenance_mode').eq('id', 1).execute()
        
        if res.data and len(res.data) > 0:
            return {"maintenance_mode": res.data[0].get('maintenance_mode', False)}
        
        return {"maintenance_mode": False}
    except Exception as e:
        logger.warning(f"Error fetching system status: {e}")
        return {"maintenance_mode": False}


@router.get("/auth-status")
async def get_auth_status():
    """
    Lightweight auth status endpoint backed by startup-cached JWKS preflight state.
    """
    return get_jwks_status()

# Function to set dependencies (called from main api.py)
def set_dependencies(supabase):
    global supabase_client
    supabase_client = supabase

