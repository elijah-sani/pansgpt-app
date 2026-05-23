import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from urllib.error import URLError
import httpx

import jwt
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("PansGPT")

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


async def get_current_user_role(current_user: User) -> Optional[str]:
    sb = _role_db()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not active")

    rows = []
    try:
        if current_user.email:
            normalized_email = current_user.email.strip().lower()
            res = await _run_role_query(
                lambda: sb.table("user_roles").select("role,email").ilike("email", normalized_email).execute(),
                operation_name="role lookup by email",
                user_id=current_user.id,
            )
            rows = res.data or []

        if not rows:
            res = await _run_role_query(
                lambda: sb.table("user_roles").select("role,user_id").eq("user_id", current_user.id).execute(),
                operation_name="role lookup by user_id",
                user_id=current_user.id,
            )
            rows = res.data or []
    except Exception as exc:
        logger.error("Role lookup failed for user %s: %s", current_user.id, exc)
        if _is_retryable_role_db_error(exc):
            raise HTTPException(status_code=503, detail="Authorization service temporarily unavailable")
        raise HTTPException(status_code=500, detail="Authorization check failed")

    for row in rows:
        role = (row.get("role") or "").strip().lower()
        if role in {"admin", "super_admin"}:
            return role
    return None


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
    role = await get_current_user_role(current_user)
    if role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return role


async def require_super_admin_role(current_user: User) -> str:
    role = await get_current_user_role(current_user)
    if role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can access this resource")
    return role


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


async def get_current_super_admin(current_user: User = Depends(get_current_user)) -> User:
    await require_super_admin_role(current_user)
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
    if lecturer_profile.university_status is not None and lecturer_profile.university_status != "active":
        raise HTTPException(status_code=403, detail="Active university access required")

    return lecturer_profile
