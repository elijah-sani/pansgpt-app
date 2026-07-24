"""
AI Usage Tracker Service
========================
Fire-and-forget logging of every LLM request into the `ai_usage_logs` Supabase table.

Usage (from llm_engine.py after a successful completion):
    import asyncio
    from services import ai_usage_tracker
    asyncio.create_task(ai_usage_tracker.log_usage({...}))
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

logger = logging.getLogger("PansGPT")

# Injected from api.py via set_dependencies()
_supabase_service_client = None

# --- Model → provider mapping (mirrors llm_engine.py constants) ---
_MODEL_PROVIDER_MAP: dict[str, str] = {
    # Google AI Studio
    "gemma-4-31b-it": "google",
    "gemma-4-26b-a4b-it": "google",
    # Groq
    "meta-llama/llama-4-scout-17b-16e-instruct": "groq",
    "llama-3.1-8b-instant": "groq",
    # OpenRouter
    "meta-llama/llama-3.3-70b-instruct:free": "openrouter",
    "qwen/qwen-2.5-72b-instruct:free": "openrouter",
    "qwen/qwen3-vl-235b-a22b-thinking": "openrouter",
}


def set_dependencies(supabase_service_client: Any) -> None:
    global _supabase_service_client
    _supabase_service_client = supabase_service_client


def _provider_for_model(model_name: str) -> str:
    """Resolve a provider label from the model name."""
    if not model_name:
        return "unknown"
    lower = model_name.lower()
    if lower in _MODEL_PROVIDER_MAP:
        return _MODEL_PROVIDER_MAP[lower]
    # Heuristic fallbacks
    if "gemma" in lower:
        return "google"
    if "groq" in lower or "llama" in lower and "openrouter" not in lower:
        return "groq"
    if "openrouter" in lower or ":" in lower:
        return "openrouter"
    return "unknown"


def estimate_tokens_from_chars(text: Optional[str]) -> int:
    """Estimate token count from raw text (~4 chars per token)."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def estimate_image_tokens(image_count: int = 1) -> int:
    """Estimate token weight for vision images (~512 tokens per image average)."""
    if image_count <= 0:
        return 0
    return image_count * 512


async def log_usage(
    *,
    model_used: str,
    request_type: str = "chat",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    latency_ms: Optional[float] = None,
    status: str = "success",
    failover_count: int = 0,
    has_images: bool = False,
    image_count: int = 0,
    prompt_character_count: int = 0,
    completion_character_count: int = 0,
    error_type: Optional[str] = None,
    error_message: Optional[str] = None,
    user_id: Optional[str] = None,
    university_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> None:
    """
    Insert one row into ai_usage_logs. Designed to be called as a
    fire-and-forget asyncio.create_task() so it never blocks the caller.
    """
    if _supabase_service_client is None:
        logger.debug("[ai_usage_tracker] Supabase service client not set — skipping log")
        return

    provider = _provider_for_model(model_used)

    # Token calculation & estimation fallback
    pt = max(0, prompt_tokens)
    ct = max(0, completion_tokens)

    if pt == 0 and prompt_character_count > 0:
        pt = estimate_tokens_from_chars(" " * prompt_character_count)
    if has_images or image_count > 0:
        imgs = max(1 if has_images else 0, image_count)
        pt += estimate_image_tokens(imgs)

    if ct == 0 and completion_character_count > 0:
        ct = estimate_tokens_from_chars(" " * completion_character_count)

    tt = max(0, total_tokens or (pt + ct))

    row = {
        "model_used": model_used or "unknown",
        "provider": provider,
        "request_type": request_type,
        "prompt_tokens": pt,
        "completion_tokens": ct,
        "total_tokens": tt,
        "latency_ms": latency_ms,
        "status": status,
        "failover_count": max(0, failover_count),
        "has_images": has_images or (image_count > 0),
        "image_count": max(0, image_count or (1 if has_images else 0)),
        "prompt_character_count": max(0, prompt_character_count),
        "completion_character_count": max(0, completion_character_count),
    }

    if error_type:
        row["error_type"] = str(error_type)[:64]
    if error_message:
        row["error_message"] = str(error_message)[:500]

    if user_id:
        row["user_id"] = str(user_id)
    if university_id:
        row["university_id"] = str(university_id)
    if session_id:
        row["session_id"] = str(session_id)

    try:
        await asyncio.to_thread(
            lambda: _supabase_service_client.table("ai_usage_logs").insert(row).execute()
        )
    except Exception as exc:
        # Never let analytics logging crash the caller
        logger.warning("[ai_usage_tracker] Failed to log AI usage: %s", exc)
