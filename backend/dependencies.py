import logging
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from urllib.error import URLError

import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException
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


async def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    """
    Verify Supabase JWT locally using Supabase JWKS public keys.
    """
    token = _extract_bearer_token(authorization)
    _initialize_jwks_clients()

    if not jwks_clients:
        logger.error("SUPABASE_URL is missing; JWKS client is not configured")
        raise HTTPException(status_code=500, detail="JWT verification not configured")

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
