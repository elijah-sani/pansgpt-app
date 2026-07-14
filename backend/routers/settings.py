"""
Settings Router: System Configuration Management
Handles AI prompt settings, temperature, and maintenance mode.
"""
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel, field_validator, model_validator
from typing import Any, Literal, Optional
import logging
from dependencies import get_current_global_admin, get_current_user, require_super_admin_role, User
from services.security_metrics import get_security_metrics_snapshot

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
    change_reason: Optional[str] = None
    allow_unsafe_prompt_change: bool = False

    @field_validator("change_reason", mode="before")
    @classmethod
    def sanitize_change_reason(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    @model_validator(mode="after")
    def require_reason_for_system_prompt_changes(self):
        if self.system_prompt is not None and not self.change_reason:
            raise ValueError("change_reason is required when updating the system prompt")
        return self


class SystemConfigRollbackRequest(BaseModel):
    change_reason: str

    @field_validator("change_reason", mode="before")
    @classmethod
    def sanitize_reason(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("change_reason is required")
        return cleaned


class SystemConfigChangeRequestCreate(BaseModel):
    system_prompt: str
    temperature: Optional[float] = None
    maintenance_mode: Optional[bool] = None
    web_search_enabled: Optional[bool] = None
    rag_threshold: Optional[float] = None
    change_reason: str

    @field_validator("system_prompt", mode="before")
    @classmethod
    def sanitize_system_prompt(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("system_prompt is required")
        return cleaned

    @field_validator("change_reason", mode="before")
    @classmethod
    def sanitize_change_reason(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("change_reason is required")
        return cleaned


class SystemConfigChangeRequestAction(BaseModel):
    action: Literal["submit_review", "approve", "publish", "reject"]
    note: Optional[str] = None
    allow_unsafe_prompt_change: bool = False

    @field_validator("note", mode="before")
    @classmethod
    def sanitize_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

# --- Helper ---
async def verify_api_key(x_api_key: str = Header(...)):
    """
    Direct API key dependency used by all protected settings endpoints.
    """
    if verify_api_key_handler is None:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return await verify_api_key_handler(x_api_key)

async def verify_super_admin(current_user: User = Depends(get_current_user)):
    await require_super_admin_role(current_user)
    return True


def _settings_db():
    return supabase_service_client or supabase_client


def _normalize_history_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "system_prompt": row.get("system_prompt"),
        "temperature": row.get("temperature"),
        "maintenance_mode": row.get("maintenance_mode"),
        "web_search_enabled": row.get("web_search_enabled"),
        "rag_threshold": row.get("rag_threshold"),
        "changed_by_user_id": row.get("changed_by_user_id"),
        "changed_by_email": row.get("changed_by_email"),
        "change_reason": row.get("change_reason"),
        "change_type": row.get("change_type"),
        "rolled_back_from_id": row.get("rolled_back_from_id"),
        "created_at": row.get("created_at"),
    }


def _normalize_change_request_row(row: dict[str, Any]) -> dict[str, Any]:
    lint_warnings = row.get("lint_warnings") or []
    if isinstance(lint_warnings, str):
        lint_warnings = [lint_warnings]
    return {
        "id": row.get("id"),
        "system_prompt": row.get("system_prompt"),
        "temperature": row.get("temperature"),
        "maintenance_mode": row.get("maintenance_mode"),
        "web_search_enabled": row.get("web_search_enabled"),
        "rag_threshold": row.get("rag_threshold"),
        "change_reason": row.get("change_reason"),
        "status": row.get("status"),
        "note": row.get("note"),
        "lint_warnings": lint_warnings,
        "requested_by_user_id": row.get("requested_by_user_id"),
        "requested_by_email": row.get("requested_by_email"),
        "reviewed_by_user_id": row.get("reviewed_by_user_id"),
        "reviewed_by_email": row.get("reviewed_by_email"),
        "approved_by_user_id": row.get("approved_by_user_id"),
        "approved_by_email": row.get("approved_by_email"),
        "published_by_user_id": row.get("published_by_user_id"),
        "published_by_email": row.get("published_by_email"),
        "history_entry_id": row.get("history_entry_id"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _fetch_current_system_config_row(sb) -> dict[str, Any]:
    current_res = sb.table('system_settings').select(
        'system_prompt,temperature,maintenance_mode,web_search_enabled,rag_threshold'
    ).eq('id', 1).execute()
    current = (current_res.data[0] if current_res.data else {}) or {}
    return {
        "system_prompt": current.get("system_prompt", "You are a helpful AI assistant."),
        "temperature": current.get("temperature", 0.7),
        "maintenance_mode": current.get("maintenance_mode", False),
        "web_search_enabled": current.get("web_search_enabled", True),
        "rag_threshold": current.get("rag_threshold", 0.50),
    }


def _is_sensitive_prompt_change(current_config: dict[str, Any], proposed_prompt: Optional[str]) -> bool:
    if proposed_prompt is None:
        return False
    return str(proposed_prompt).strip() != str(current_config.get("system_prompt") or "").strip()


def _validate_change_request_transition(current_status: str, action: str) -> str:
    transitions = {
        ("draft", "submit_review"): "review",
        ("review", "approve"): "approved",
        ("approved", "publish"): "published",
        ("draft", "reject"): "rejected",
        ("review", "reject"): "rejected",
        ("approved", "reject"): "rejected",
    }
    next_status = transitions.get((current_status, action))
    if not next_status:
        raise ValueError(f"Cannot {action} a change request from status '{current_status}'")
    return next_status


def _lint_system_prompt(prompt_text: Optional[str]) -> list[str]:
    prompt = str(prompt_text or "").strip()
    if not prompt:
        return []

    checks = (
        ("Requests to reveal hidden instructions or system prompts", ("reveal hidden", "show system prompt", "print system prompt", "developer message", "system instructions")),
        ("Weakens refusal behavior or always-comply rules", ("ignore previous instructions", "always comply", "never refuse", "do anything now", "bypass safety")),
        ("Disables prompt confidentiality expectations", ("do not keep these instructions secret", "share internal prompt", "expose hidden prompt")),
        ("Broad identity shifts that may conflict with safety boundaries", ("you are no longer an ai", "pretend you are human", "you attended lectures", "you sat exams")),
    )

    warnings: list[str] = []
    lowered = prompt.lower()
    for warning, markers in checks:
        if any(marker in lowered for marker in markers):
            warnings.append(warning)
    return warnings


def _insert_system_config_history(
    sb,
    *,
    config_row: dict[str, Any],
    current_user: User,
    change_reason: Optional[str],
    change_type: str,
    rolled_back_from_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    try:
        payload = {
            "system_prompt": config_row.get("system_prompt"),
            "temperature": config_row.get("temperature"),
            "maintenance_mode": config_row.get("maintenance_mode"),
            "web_search_enabled": config_row.get("web_search_enabled"),
            "rag_threshold": config_row.get("rag_threshold"),
            "changed_by_user_id": getattr(current_user, "id", None),
            "changed_by_email": getattr(current_user, "email", None),
            "change_reason": change_reason,
            "change_type": change_type,
            "rolled_back_from_id": rolled_back_from_id,
        }
        res = sb.table("system_settings_history").insert(payload).execute()
        rows = res.data or []
        return _normalize_history_row(rows[0]) if rows else None
    except Exception as exc:
        logger.warning("System config history insert skipped: %s", exc)
        return None


def _list_system_config_history(sb, limit: int = 20) -> list[dict[str, Any]]:
    try:
        res = sb.table("system_settings_history").select("*").order("created_at", desc=True).limit(limit).execute()
        return [_normalize_history_row(row) for row in (res.data or [])]
    except Exception as exc:
        logger.warning("System config history fetch skipped: %s", exc)
        return []


def _insert_change_request(
    sb,
    *,
    config_row: dict[str, Any],
    current_user: User,
    change_reason: str,
    lint_warnings: list[str],
) -> Optional[dict[str, Any]]:
    payload = {
        "system_prompt": config_row.get("system_prompt"),
        "temperature": config_row.get("temperature"),
        "maintenance_mode": config_row.get("maintenance_mode"),
        "web_search_enabled": config_row.get("web_search_enabled"),
        "rag_threshold": config_row.get("rag_threshold"),
        "change_reason": change_reason,
        "status": "draft",
        "lint_warnings": lint_warnings,
        "requested_by_user_id": getattr(current_user, "id", None),
        "requested_by_email": getattr(current_user, "email", None),
    }
    res = sb.table("system_settings_change_requests").insert(payload).execute()
    rows = res.data or []
    return _normalize_change_request_row(rows[0]) if rows else None


def _list_change_requests(sb, limit: int = 20) -> list[dict[str, Any]]:
    try:
        res = (
            sb.table("system_settings_change_requests")
            .select("*")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [_normalize_change_request_row(row) for row in (res.data or [])]
    except Exception as exc:
        logger.warning("System config change-request fetch skipped: %s", exc)
        return []

# --- Endpoints ---

@router.get("", dependencies=[Depends(verify_api_key)])
async def get_system_config(current_user: User = Depends(get_current_global_admin)):
    """
    Fetch the current system configuration.
    Assumes a single row in 'system_settings' table (id=1).
    """
    sb = _settings_db()
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

@router.get("/history", dependencies=[Depends(verify_api_key)])
async def get_system_config_history(current_user: User = Depends(get_current_global_admin)):
    sb = _settings_db()
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return {"items": _list_system_config_history(sb)}


@router.get("/change-requests", dependencies=[Depends(verify_api_key)])
async def get_system_config_change_requests(current_user: User = Depends(get_current_global_admin)):
    sb = _settings_db()
    if not sb:
        raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")
    return {"items": _list_change_requests(sb)}


@router.post("/change-requests", dependencies=[Depends(verify_api_key)])
async def create_system_config_change_request(
    payload: SystemConfigChangeRequestCreate,
    current_user: User = Depends(get_current_global_admin),
):
    try:
        sb = _settings_db()
        if not sb:
            raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

        current = _fetch_current_system_config_row(sb)
        proposed = {
            "system_prompt": payload.system_prompt,
            "temperature": payload.temperature if payload.temperature is not None else current["temperature"],
            "maintenance_mode": payload.maintenance_mode if payload.maintenance_mode is not None else current["maintenance_mode"],
            "web_search_enabled": payload.web_search_enabled if payload.web_search_enabled is not None else current["web_search_enabled"],
            "rag_threshold": payload.rag_threshold if payload.rag_threshold is not None else current["rag_threshold"],
        }
        lint_warnings = _lint_system_prompt(payload.system_prompt)
        request_row = _insert_change_request(
            sb,
            config_row=proposed,
            current_user=current_user,
            change_reason=payload.change_reason,
            lint_warnings=lint_warnings,
        )
        return {
            "message": "Prompt change draft created",
            "item": request_row,
            "lint_warnings": lint_warnings,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Config Change Request Create Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to create prompt change draft. Please try again.")


@router.post("/lint", dependencies=[Depends(verify_api_key)])
async def lint_system_config_prompt(
    config: SystemConfigUpdate,
    current_user: User = Depends(get_current_global_admin),
):
    return {"lint_warnings": _lint_system_prompt(config.system_prompt)}


@router.post("/update")
async def update_system_config(
    config: SystemConfigUpdate,
    _: str = Depends(verify_api_key),
    current_user: User = Depends(get_current_global_admin)
):
    """
    Update system configuration.
    SECURE: Only allows Super Admins.
    """
    try:
        sb = _settings_db()
        if not sb:
            raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

        current = _fetch_current_system_config_row(sb)
        if _is_sensitive_prompt_change(current, config.system_prompt):
            raise HTTPException(
                status_code=400,
                detail="System prompt changes must go through the prompt review workflow before publish.",
            )
        lint_warnings = _lint_system_prompt(config.system_prompt)
        if lint_warnings and not config.allow_unsafe_prompt_change:
            raise HTTPException(
                status_code=400,
                detail="Unsafe prompt edit blocked until you explicitly allow the override.",
                headers={"X-Prompt-Lint": "blocked"},
            )

        merged = {
            "id": 1,
            "system_prompt": config.system_prompt if config.system_prompt is not None else current["system_prompt"],
            "temperature": config.temperature if config.temperature is not None else current["temperature"],
            "maintenance_mode": config.maintenance_mode if config.maintenance_mode is not None else current["maintenance_mode"],
            "web_search_enabled": config.web_search_enabled if config.web_search_enabled is not None else current["web_search_enabled"],
            "rag_threshold": config.rag_threshold if config.rag_threshold is not None else current["rag_threshold"],
        }

        res = sb.table('system_settings').upsert(merged).execute()
        history_entry = _insert_system_config_history(
            sb,
            config_row=merged,
            current_user=current_user,
            change_reason=config.change_reason,
            change_type="update",
        )

        # Ensure /chat sees updates immediately instead of serving stale cached settings.
        try:
            from routers import chat as chat_router
            chat_router.invalidate_settings_cache()
        except Exception as cache_err:
            logger.warning(f"Config updated, but cache invalidation failed: {cache_err}")

        logger.info("System config updated and chat settings cache invalidated")
        return {
            "message": "System configuration updated",
            "data": res.data,
            "history_entry": history_entry,
            "lint_warnings": lint_warnings,
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.error(f"Config Update Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to save configuration. Please try again.")


@router.post("/change-requests/{request_id}/action", dependencies=[Depends(verify_api_key)])
async def apply_system_config_change_request_action(
    request_id: str,
    payload: SystemConfigChangeRequestAction,
    current_user: User = Depends(get_current_global_admin),
):
    try:
        sb = _settings_db()
        if not sb:
            raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

        res = sb.table("system_settings_change_requests").select("*").eq("id", request_id).limit(1).execute()
        row = (res.data or [None])[0]
        if not row:
            raise HTTPException(status_code=404, detail="Change request not found")

        current_status = str(row.get("status") or "draft")
        next_status = _validate_change_request_transition(current_status, payload.action)
        updates: dict[str, Any] = {"status": next_status}
        if payload.note is not None:
            updates["note"] = payload.note

        actor_id = getattr(current_user, "id", None)
        actor_email = getattr(current_user, "email", None)
        if next_status == "review":
            updates["reviewed_by_user_id"] = actor_id
            updates["reviewed_by_email"] = actor_email
        elif next_status == "approved":
            updates["approved_by_user_id"] = actor_id
            updates["approved_by_email"] = actor_email
        elif next_status == "published":
            lint_warnings = row.get("lint_warnings") or []
            if lint_warnings and not payload.allow_unsafe_prompt_change:
                raise HTTPException(
                    status_code=400,
                    detail="Unsafe prompt draft cannot be published without explicit override.",
                )
            merged = {
                "id": 1,
                "system_prompt": row.get("system_prompt", "You are a helpful AI assistant."),
                "temperature": row.get("temperature", 0.7),
                "maintenance_mode": row.get("maintenance_mode", False),
                "web_search_enabled": row.get("web_search_enabled", True),
                "rag_threshold": row.get("rag_threshold", 0.50),
            }
            sb.table("system_settings").upsert(merged).execute()
            history_entry = _insert_system_config_history(
                sb,
                config_row=merged,
                current_user=current_user,
                change_reason=row.get("change_reason"),
                change_type="update",
            )
            updates["published_by_user_id"] = actor_id
            updates["published_by_email"] = actor_email
            updates["history_entry_id"] = history_entry["id"] if history_entry else None
            try:
                from routers import chat as chat_router
                chat_router.invalidate_settings_cache()
            except Exception as cache_err:
                logger.warning(f"Change request publish applied, but cache invalidation failed: {cache_err}")

        updated_res = sb.table("system_settings_change_requests").update(updates).eq("id", request_id).execute()
        rows = updated_res.data or []
        updated_row = _normalize_change_request_row(rows[0]) if rows else None
        return {"message": f"Change request {next_status}", "item": updated_row}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Config Change Request Action Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to update change request. Please try again.")


@router.post("/rollback/{entry_id}", dependencies=[Depends(verify_api_key)])
async def rollback_system_config(
    entry_id: str,
    payload: SystemConfigRollbackRequest,
    current_user: User = Depends(get_current_global_admin),
):
    try:
        sb = _settings_db()
        if not sb:
            raise HTTPException(status_code=503, detail="The service is temporarily unavailable. Please try again in a moment.")

        history_res = sb.table("system_settings_history").select("*").eq("id", entry_id).limit(1).execute()
        row = (history_res.data or [None])[0]
        if not row:
            raise HTTPException(status_code=404, detail="History entry not found")

        merged = {
            "id": 1,
            "system_prompt": row.get("system_prompt", "You are a helpful AI assistant."),
            "temperature": row.get("temperature", 0.7),
            "maintenance_mode": row.get("maintenance_mode", False),
            "web_search_enabled": row.get("web_search_enabled", True),
            "rag_threshold": row.get("rag_threshold", 0.50),
        }
        res = sb.table("system_settings").upsert(merged).execute()
        history_entry = _insert_system_config_history(
            sb,
            config_row=merged,
            current_user=current_user,
            change_reason=payload.change_reason,
            change_type="rollback",
            rolled_back_from_id=entry_id,
        )

        try:
            from routers import chat as chat_router
            chat_router.invalidate_settings_cache()
        except Exception as cache_err:
            logger.warning(f"Rollback applied, but cache invalidation failed: {cache_err}")

        return {"message": "System configuration rolled back", "data": res.data, "history_entry": history_entry}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Config Rollback Error: {e}")
        raise HTTPException(status_code=500, detail="Unable to roll back configuration. Please try again.")


@router.get("/security-metrics", dependencies=[Depends(verify_api_key)])
async def get_security_metrics(current_user: User = Depends(get_current_global_admin)):
    """
    Return the current in-memory LLM security counters.
    """
    return get_security_metrics_snapshot()

# Function to set dependencies (called from main api.py)
def set_dependencies(supabase, api_key_verifier, supabase_service=None):
    global supabase_client, supabase_service_client, verify_api_key_handler
    supabase_client = supabase
    supabase_service_client = supabase_service
    verify_api_key_handler = api_key_verifier
