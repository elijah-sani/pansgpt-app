import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from urllib.error import URLError
import httpx

import jwt
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("PansGPT")

UNIVERSITY_SUSPENDED_MESSAGE = "Your university workspace is temporarily unavailable."

def _create_jwks_client(url: str, headers: Dict[str, str]) -> PyJWKClient:
    try:
        return PyJWKClient(url, headers=headers, cache_keys=True, timeout=5)
    except TypeError:
        try:
            return PyJWKClient(url, headers=headers, timeout=5)
        except TypeError:
            return PyJWKClient(url)


def _build_jwks_urls(raw_supabase_url: Optional[str]) -> List[str]:
    if not raw_supabase_url:
        return []

    base = raw_supabase_url.rstrip("/")
    if base.endswith("/auth/v1"):
        base = base[: -len("/auth/v1")]

    urls = [
        f"{base}/auth/v1/.well-known/jwks.json",
        f"{base}/auth/v1/jwks",
    ]
    # Keep order but remove duplicates.
    return list(dict.fromkeys(urls))


jwks_urls: List[str] = []
jwks_clients: List[PyJWKClient] = []
jwks_status: Dict[str, Any] = {
    "configured": False,
    "ready": False,
    "checked_at": None,
    "endpoint": None,
    "error": None,
}
role_supabase_client = None
role_supabase_service_client = None


def _initialize_jwks_clients() -> None:
    global jwks_urls, jwks_clients
    if jwks_clients:
        return

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )
    headers = {"apikey": supabase_key} if supabase_key else {}

    jwks_urls = _build_jwks_urls(supabase_url)
    jwks_clients = [_create_jwks_client(url, headers) for url in jwks_urls]


class User(BaseModel):
    id: str
    email: Optional[str] = None


class LecturerProfile(BaseModel):
    id: str
    user_id: str
    university_id: str
    university_name: Optional[str] = None
    university_status: Optional[str] = None
    status: str
    title: Optional[str] = None
    full_name: str
    email: str
    phone_number: Optional[str] = None


class UserRoleInfo(BaseModel):
    role: Optional[str] = None
    admin_level: Optional[str] = None
    is_admin: bool = False
    is_super_admin: bool = False
    is_global_admin: bool = False
    is_university_admin: bool = False
    is_senior_university_admin: bool = False
    university_id: Optional[str] = None


def _normalize_lecturer_profile(row: Optional[Dict[str, Any]]) -> Optional[LecturerProfile]:
    if not row:
        return None

    university = row.get("university")
    if isinstance(university, list):
        university = university[0] if university else None
    if not isinstance(university, dict):
        university = {}

    lecturer_id = row.get("id")
    user_id = row.get("user_id")
    university_id = row.get("university_id")
    status = (row.get("status") or "").strip().lower()
    full_name = (row.get("full_name") or "").strip()
    email = (row.get("email") or "").strip()

    if not lecturer_id or not user_id or not university_id or not status or not full_name or not email:
        return None

    return LecturerProfile(
        id=str(lecturer_id),
        user_id=str(user_id),
        university_id=str(university_id),
        university_name=(university.get("name") or None) if university else None,
        university_status=((university.get("status") or "").strip().lower() or None) if university else None,
        status=status,
        title=(row.get("title") or None),
        full_name=full_name,
        email=email,
        phone_number=(row.get("phone_number") or None),
    )


def is_global_admin_role(role: Optional[str], university_id: Optional[str] = None) -> bool:
    normalized_role = (role or "").strip().lower()
    normalized_university_id = (university_id or "").strip() or None
    if normalized_role in {"global_admin", "super_admin"}:
        return True
    if normalized_role == "admin" and normalized_university_id is None:
        return True
    return False


def is_university_admin_role(role: Optional[str], university_id: Optional[str] = None) -> bool:
    normalized_role = (role or "").strip().lower()
    normalized_university_id = (university_id or "").strip() or None
    if not normalized_university_id:
        return False
    return normalized_role in {"university_admin", "admin"}


def _build_role_info(row: Optional[Dict[str, Any]]) -> UserRoleInfo:
    if not row:
        return UserRoleInfo()

    role = (row.get("role") or "").strip().lower() or None
    admin_level = (row.get("admin_level") or "").strip().lower() or None
    university_id = (row.get("university_id") or "").strip() or None
    is_super_admin = role == "super_admin"
    is_global_admin = is_global_admin_role(role, university_id)
    is_university_admin = is_university_admin_role(role, university_id)
    is_senior_university_admin = is_university_admin and admin_level == "senior"
    is_admin = role in {"admin", "super_admin", "global_admin", "university_admin"}

    return UserRoleInfo(
        role=role,
        admin_level=admin_level,
        is_admin=is_admin,
        is_super_admin=is_super_admin,
        is_global_admin=is_global_admin,
        is_university_admin=is_university_admin,
        is_senior_university_admin=is_senior_university_admin,
        university_id=university_id,
    )


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization Header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization Header")

    return parts[1]


def _is_jwks_network_error(exc: Exception) -> bool:
    if isinstance(exc, (TimeoutError, URLError, ConnectionError)):
        return True

    msg = str(exc).lower()
    network_markers = (
        "timed out",
        "timeout",
        "temporary failure",
        "name resolution",
        "getaddrinfo",
        "urlopen error",
        "connection reset",
        "connection aborted",
        "connection refused",
        "network",
        "unreachable",
    )
    return any(marker in msg for marker in network_markers)


def _is_jwks_not_found_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "404" in msg or "not found" in msg


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def prime_jwks_cache() -> Dict[str, Any]:
    """
    Best-effort startup preflight that warms JWKS cache once.
    Does not run on request path.
    """
    _initialize_jwks_clients()
    jwks_status["checked_at"] = _utc_now_iso()
    jwks_status["configured"] = bool(jwks_clients)
    jwks_status["ready"] = False
    jwks_status["endpoint"] = None
    jwks_status["error"] = None

    if not jwks_clients:
        jwks_status["error"] = "JWKS client not configured (missing SUPABASE_URL)"
        return jwks_status

    last_error = None
    for idx, client in enumerate(jwks_clients):
        try:
            # Fetches JWKS and primes internal key cache.
            keys = client.get_signing_keys()
            if keys:
                jwks_status["ready"] = True
                jwks_status["endpoint"] = jwks_urls[idx]
                return jwks_status
            last_error = "No signing keys returned"
        except Exception as e:
            last_error = str(e)
            if _is_jwks_not_found_error(e):
                continue

    jwks_status["error"] = last_error or "Unknown JWKS preflight error"
    return jwks_status


def get_jwks_status() -> Dict[str, Any]:
    return dict(jwks_status)


def set_role_dependencies(supabase=None, supabase_service=None) -> None:
    global role_supabase_client, role_supabase_service_client
    role_supabase_client = supabase
    role_supabase_service_client = supabase_service


def _role_db():
    return role_supabase_service_client or role_supabase_client


def _is_retryable_role_db_error(exc: Exception) -> bool:
    if isinstance(exc, (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError)):
        return True

    message = str(exc).lower()
    retry_markers = (
        "server disconnected",
        "connection reset",
        "timeout",
        "timed out",
        "remoteprotocolerror",
        "temporarily unavailable",
    )
    return any(marker in message for marker in retry_markers)


async def _run_role_query(execute_fn, *, operation_name: str, user_id: Optional[str] = None):
    last_error = None
    for attempt in range(1, 4):
        try:
            return await asyncio.to_thread(execute_fn)
        except Exception as exc:
            last_error = exc
            if attempt < 3 and _is_retryable_role_db_error(exc):
                logger.warning(
                    "Role/Supabase request failed for %s (user_id=%s, attempt %s/3), retrying: %s",
                    operation_name,
                    user_id,
                    attempt,
                    exc,
                )
                await asyncio.sleep(0.75 * attempt)
                continue
            raise
    raise last_error


async def get_current_user_role_info(current_user: User) -> UserRoleInfo:
    sb = _role_db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    rows = []
    try:
        if current_user.email:
            normalized_email = current_user.email.strip().lower()
            res = await _run_role_query(
                lambda: sb.table("user_roles")
                .select("id,user_id,role,email,university_id,created_at,admin_level")
                .ilike("email", normalized_email)
                .execute(),
                operation_name="role lookup by email",
                user_id=current_user.id,
            )
            rows = res.data or []
            
            if rows:
                first_row = rows[0]
                db_user_id = first_row.get("user_id")
                if not db_user_id:
                    logger.info("Email match found in user_roles with NULL user_id. Calling claim_pending_admin_access RPC for %s...", normalized_email)
                    try:
                        rpc_res = await _run_role_query(
                            lambda: sb.rpc("claim_pending_admin_access", {
                                "p_email": normalized_email,
                                "p_user_id": current_user.id
                            }).execute(),
                            operation_name="claim pending admin access RPC",
                            user_id=current_user.id,
                        )
                        rpc_rows = rpc_res.data or []
                        if rpc_rows:
                            rows = rpc_rows
                            logger.info("Successfully bound/confirmed role for user %s (%s)", current_user.id, normalized_email)
                        else:
                            logger.warning("claim_pending_admin_access RPC returned empty for email %s", normalized_email)
                    except Exception as rpc_exc:
                        msg = str(rpc_exc).lower()
                        if "unsafe overwrite blocked" in msg or "already claimed" in msg:
                            logger.error("Unsafe overwrite conflict in RPC for %s: %s", normalized_email, rpc_exc)
                            raise HTTPException(
                                status_code=409,
                                detail="This admin email access is already claimed by another account."
                            )
                        logger.error("claim_pending_admin_access RPC failed: %s", rpc_exc)
                        raise
                elif db_user_id != current_user.id:
                    logger.warning("Unsafe access: email %s already claimed by different user_id %s, caller is %s", normalized_email, db_user_id, current_user.id)
                    raise HTTPException(
                        status_code=409,
                        detail="This admin email access is already claimed by another account."
                    )

        if not rows:
            res = await _run_role_query(
                lambda: sb.table("user_roles")
                .select("id,user_id,role,email,university_id,created_at,admin_level")
                .eq("user_id", current_user.id)
                .execute(),
                operation_name="role lookup by user_id",
                user_id=current_user.id,
            )
            rows = res.data or []
    except Exception as exc:
        logger.error("Role lookup failed for user %s: %s", current_user.id, exc)
        if _is_retryable_role_db_error(exc):
            raise HTTPException(status_code=503, detail="Authorization service temporarily unavailable")
        raise HTTPException(status_code=500, detail="Authorization check failed")

    best_info = UserRoleInfo()
    best_rank = -1
    for row in rows:
        info = _build_role_info(row)
        if not info.role:
            continue

        rank = 0
        if info.is_super_admin:
            rank = 5
        elif info.role == "global_admin":
            rank = 4
        elif info.is_global_admin:
            rank = 3
        elif info.is_university_admin:
            rank = 2
        elif info.is_admin:
            rank = 1

        if rank > best_rank:
            best_info = info
            best_rank = rank

    return best_info


async def get_current_user_role(current_user: User, *, include_details: bool = False):
    info = await get_current_user_role_info(current_user)
    if include_details:
        return info
    return info.role


async def get_lecturer_profile_for_user(current_user: User) -> Optional[LecturerProfile]:
    sb = _role_db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    try:
        res = await _run_role_query(
            lambda: sb.table("lecturer_profiles")
            .select(
                "id,user_id,university_id,status,title,full_name,email,phone_number,"
                "university:universities(id,name,status)"
            )
            .eq("user_id", current_user.id)
            .limit(1)
            .execute(),
            operation_name="lecturer profile lookup",
            user_id=current_user.id,
        )
    except Exception as exc:
        logger.error("Lecturer profile lookup failed for user %s: %s", current_user.id, exc)
        if _is_retryable_role_db_error(exc):
            raise HTTPException(status_code=503, detail="Authorization service temporarily unavailable")
        raise HTTPException(status_code=500, detail="Authorization check failed")

    rows = res.data or []
    row = rows[0] if rows else None
    return _normalize_lecturer_profile(row)


async def require_admin_role(current_user: User) -> str:
    role_info = await get_current_user_role_info(current_user)
    if not role_info.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return role_info.role or "admin"


async def require_super_admin_role(current_user: User) -> str:
    role_info = await get_current_user_role_info(current_user)
    if role_info.role not in {"super_admin", "global_admin"}:
        raise HTTPException(status_code=403, detail="Only super admins can access this resource")
    return role_info.role or "super_admin"


async def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    """
    Verify Supabase JWT locally using Supabase JWKS public keys.
    """
    token = _extract_bearer_token(authorization)
    _initialize_jwks_clients()

    if not jwks_clients:
        logger.error("SUPABASE_URL is missing; JWKS client is not configured")
        raise HTTPException(status_code=503, detail="The authentication service is temporarily unavailable. Please try again in a moment.")

    signing_key = None
    key_fetch_error = None
    for client in jwks_clients:
        try:
            # Dynamically fetches the correct public key based on token header 'kid'.
            signing_key = client.get_signing_key_from_jwt(token)
            break
        except Exception as e:
            key_fetch_error = e
            # Path fallback: try next JWKS endpoint if current one is 404.
            if _is_jwks_not_found_error(e):
                continue
            if _is_jwks_network_error(e):
                logger.critical(f"CRITICAL: JWKS Key Fetch Failed: {e}")
                raise HTTPException(status_code=503, detail="Authentication key service unavailable")
            logger.error(f"Auth User Decode Error: {e}")
            raise HTTPException(status_code=401, detail="Authentication Failed")

    if signing_key is None:
        logger.critical(f"CRITICAL: JWKS Key Fetch Failed: {key_fetch_error}")
        raise HTTPException(status_code=503, detail="Authentication key service unavailable")

    try:
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256", "HS256"],
            audience="authenticated",
            leeway=30,  # Tolerate up to 30s of clock skew (iat/exp)
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid token audience")
    except jwt.InvalidTokenError as e:
        logger.error(f"Auth User Decode Error: {e}")
        raise HTTPException(status_code=401, detail="Authentication Failed")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid Token")

    return User(id=user_id, email=payload.get("email"))


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    await require_admin_role(current_user)
    return current_user


async def get_current_global_admin(current_user: User = Depends(get_current_user)) -> User:
    role_info = await get_current_user_role_info(current_user)
    if not role_info.is_global_admin:
        raise HTTPException(status_code=403, detail="Global admin access required")
    return current_user


async def get_current_university_admin(current_user: User = Depends(get_current_user)) -> User:
    role_info = await get_current_user_role_info(current_user)
    if not role_info.is_university_admin or not role_info.university_id:
        raise HTTPException(status_code=403, detail="University admin access required")
    return current_user


async def get_admin_university_scope(current_user: User = Depends(get_current_user)) -> Optional[str]:
    role_info = await get_current_user_role_info(current_user)
    if not role_info.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    if role_info.is_global_admin:
        return None
    if role_info.is_university_admin and role_info.university_id:
        return role_info.university_id
    raise HTTPException(status_code=403, detail="University admin scope is not configured")


async def _validate_active_workspace_university(university_id: str) -> str:
    try:
        uuid.UUID(str(university_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="university_id must be a valid UUID")

    sb = _role_db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    res = await _run_role_query(
        lambda: sb.table("universities")
        .select("id,status")
        .eq("id", str(university_id))
        .limit(1)
        .execute(),
        operation_name="validate admin workspace university",
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(status_code=404, detail="University not found")
    status = (row.get("status") or "").strip().lower()
    if status == "suspended":
        raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)
    elif status != "active":
        raise HTTPException(status_code=400, detail="University workspace is not active")
    return str(row["id"])


async def resolve_admin_workspace_university(
    current_user: User,
    requested_university_id: Optional[str] = None,
) -> str:
    """
    Resolve the university for school-owned admin operations.

    Canonical roles:
    - super_admin: platform owner; must explicitly select a university workspace.
    - university_admin: school operator; always uses the university from user_roles.

    Legacy transition:
    - global_admin and admin without university_id are platform-only.
    - admin with university_id behaves like university_admin.
    """
    role_info = await get_current_user_role_info(current_user)
    if not role_info.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    requested = (requested_university_id or "").strip() or None

    if role_info.is_university_admin:
        own_university_id = (role_info.university_id or "").strip()
        if not own_university_id:
            raise HTTPException(status_code=403, detail="University admin scope is not configured")
        if requested and requested != own_university_id:
            raise HTTPException(status_code=403, detail="You cannot access another university")
        return await _validate_active_workspace_university(own_university_id)

    if role_info.is_super_admin:
        if not requested:
            raise HTTPException(status_code=400, detail="university_id is required for super-admin university workspace actions")
        return await _validate_active_workspace_university(requested)

    if role_info.role in {"global_admin", "admin"} or role_info.is_global_admin:
        raise HTTPException(
            status_code=403,
            detail="Use a university-admin account or a super-admin university workspace.",
        )

    raise HTTPException(status_code=403, detail="Admin access required")


async def get_current_super_admin(current_user: User = Depends(get_current_user)) -> User:
    await require_super_admin_role(current_user)
    return current_user


async def get_current_senior_university_admin(current_user: User = Depends(get_current_user)) -> User:
    role_info = await get_current_user_role_info(current_user)
    if role_info.role == "super_admin":
        return current_user
    if not role_info.is_university_admin or not role_info.is_senior_university_admin or not role_info.university_id:
        raise HTTPException(status_code=403, detail="Senior university admin access required")
    return current_user


async def get_current_lecturer_profile(current_user: User = Depends(get_current_user)) -> Optional[LecturerProfile]:
    return await get_lecturer_profile_for_user(current_user)


async def get_current_active_lecturer(current_user: User = Depends(get_current_user)) -> LecturerProfile:
    lecturer_profile = await get_lecturer_profile_for_user(current_user)
    if not lecturer_profile:
        raise HTTPException(status_code=403, detail="Lecturer access required")

    if lecturer_profile.status != "active":
        raise HTTPException(status_code=403, detail="Active lecturer access required")

    # Only block if the university status is explicitly known to be inactive.
    # If university_status is None (join returned no data), allow through — the
    # lecturer's own status is the authoritative gate.
    if lecturer_profile.university_status == "suspended":
        raise HTTPException(status_code=400, detail=UNIVERSITY_SUSPENDED_MESSAGE)

    if lecturer_profile.university_status is not None and lecturer_profile.university_status != "active":
        raise HTTPException(status_code=403, detail="Active university access required")

    return lecturer_profile
