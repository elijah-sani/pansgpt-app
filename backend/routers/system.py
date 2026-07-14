"""
System Router: Public System Status Endpoints
Provides maintenance mode status for frontend checks.
"""
from fastapi import APIRouter, Depends
import logging
from pydantic import BaseModel
import sentry_sdk
from dependencies import get_jwks_status
from .shared import verify_api_key

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


class FrontendErrorReport(BaseModel):
    scope: str
    boundary: str
    pathname: str
    section: str
    message: str
    stack: str | None = None
    componentStack: str | None = None
    digest: str | None = None
    userAgent: str | None = None
    timestamp: str


@router.post("/frontend-error", dependencies=[Depends(verify_api_key)])
async def capture_frontend_error(report: FrontendErrorReport):
    """
    Accept frontend error-boundary crash reports so production runtime failures are
    visible in backend logs and Sentry instead of only showing a generic fallback UI.
    """
    payload = report.model_dump()
    logger.error("Frontend runtime error captured: %s", payload)

    with sentry_sdk.push_scope() as scope:
        scope.set_tag("source", "frontend")
        scope.set_tag("scope", report.scope)
        scope.set_tag("section", report.section)
        scope.set_tag("boundary", report.boundary)
        scope.set_context("frontend_error", payload)
        sentry_sdk.capture_message(
            f"Frontend runtime error in {report.boundary}: {report.message}",
            level="error",
        )

    return {"ok": True}

# Function to set dependencies (called from main api.py)
def set_dependencies(supabase):
    global supabase_client
    supabase_client = supabase

