import asyncio
import logging
import os
import time
import httpx  # [GROQ TERTIARY FIX]
from typing import Any, AsyncIterator, Optional
from services import ai_usage_tracker

logger = logging.getLogger("PansGPT")

OPENROUTER_FALLBACK_MAX_TOKENS = 1024

# ---------------------------------------------------------------------------
# Purpose-Driven Model Constants
# ---------------------------------------------------------------------------

# Fast Chat Stack
FAST_CHAT_PRIMARY = "openai/gpt-oss-120b"                  # Groq (500+ tok/s MoE)
FAST_CHAT_SECONDARY = "nvidia/nemotron-3-super-120b-a12b:free" # OpenRouter (Ultra-fast 1M context)
FAST_CHAT_TERTIARY = "llama-3.3-70b-versatile"               # Groq (Stable fallback)
FAST_CHAT_QUATERNARY = "gemma-4-26b-a4b-it"                 # Google AI Studio (thinking: False)

# Think Chat Stack — REMOVED (app uses fast mode only)

# Quiz Stack
QUIZ_PRIMARY = "openai/gpt-oss-120b"                  # Groq (Knowledge accuracy & fast formatting)
QUIZ_SECONDARY = "llama-3.3-70b-versatile"               # Groq (Reliable schema adherence)
QUIZ_TERTIARY = "nvidia/nemotron-3-ultra-550b-a55b:free" # OpenRouter (550B scale, thoughts stripped)
QUIZ_QUATERNARY = "gemma-4-32b-it"                        # Google AI Studio (thinking: True)

# Learn Mode Stack
LEARN_PRIMARY = "nvidia/nemotron-3-ultra-550b-a55b:free" # OpenRouter (1M token native window)
LEARN_SECONDARY = "gemma-4-31b-it"                        # Google AI Studio (Dense text comprehension)
LEARN_TERTIARY = "openai/gpt-oss-120b"                  # Groq (Fast retrieval & synthesis)
LEARN_QUATERNARY = "gemma-4-26b-a4b-it"                   # Google AI Studio (thinking: True)

# Small Utility Tasks Stack
SMALL_TASK_PRIMARY = "llama-3.1-8b-instant"                  # Groq (Instant string transforms)
SMALL_TASK_SECONDARY = "nvidia/nemotron-3-nano-30b-a3b:free" # OpenRouter (MoE-Mamba processing)

# Fast Vision Stack
FAST_VISION_PRIMARY = "gemma-4-26b-a4b-it"                                  # Google AI Studio (stable, thinking: False)
FAST_VISION_SECONDARY = "nvidia/nemotron-nano-12b-v2-vl:free"               # OpenRouter (fallback, reasoning: effort=none)
FAST_VISION_TERTIARY = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" # OpenRouter (last resort, reasoning: effort=none)

# Think Vision Stack — REMOVED (app uses fast vision only)

# Audio Stack
AUDIO_PRIMARY = "whisper-large-v3-turbo"                      # Groq Audio Transcriptions
AUDIO_SECONDARY = "whisper-large-v3"                          # Groq Audio Transcriptions fallback

# ---------------------------------------------------------------------------
# Purpose-Driven Model Order Sequences
# ---------------------------------------------------------------------------
FAST_TEXT_MODEL_ORDER = [FAST_CHAT_PRIMARY, FAST_CHAT_SECONDARY, FAST_CHAT_TERTIARY, FAST_CHAT_QUATERNARY]
QUIZ_TEXT_MODEL_ORDER = [QUIZ_PRIMARY, QUIZ_SECONDARY, QUIZ_TERTIARY, QUIZ_QUATERNARY]
LEARN_MODEL_ORDER = [LEARN_PRIMARY, LEARN_SECONDARY, LEARN_TERTIARY, LEARN_QUATERNARY]
SMALL_MODEL_ORDER = [SMALL_TASK_PRIMARY, SMALL_TASK_SECONDARY]
FAST_VISION_MODEL_ORDER = [FAST_VISION_PRIMARY, FAST_VISION_SECONDARY, FAST_VISION_TERTIARY]

VISION_MODEL_MAX_TOKENS = {
    FAST_VISION_PRIMARY: 768,    # gemma-4-26b-a4b-it (Google AI Studio)
    FAST_VISION_SECONDARY: 768,  # nemotron-nano-12b-v2-vl (OpenRouter)
    FAST_VISION_TERTIARY: 640,   # nemotron-omni-30b (OpenRouter)
}

SYSTEM_ROLE_SAFE_TEXT_MODEL_ORDER = FAST_TEXT_MODEL_ORDER
SYSTEM_ROLE_SAFE_VISION_MODEL_ORDER = FAST_VISION_MODEL_ORDER

# ---------------------------------------------------------------------------
# Reasoning API Control (fast mode only — thinking mode removed)
# ---------------------------------------------------------------------------
# OpenRouter: suppress Chain-of-Thought in fast vision models
_OR_REASONING_NONE = {"reasoning": {"effort": "none", "exclude": True}}

# model_name -> extra_body for fast mode (None = no extra_body needed)
# Google AI Studio models use the google_client and don't need OpenRouter extra_body
_MODEL_VISION_FAST_PARAMS: dict[str, dict | None] = {
    "nvidia/nemotron-nano-12b-v2-vl:free": _OR_REASONING_NONE,
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": _OR_REASONING_NONE,
}

# Google Gemma models that require /nothink\n prepended to suppress internal reasoning tokens
GOOGLE_NOTHINK_MODELS = {
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
    "gemma-4-32b-it",
}

# ---------------------------------------------------------------------------
# Backward Compatibility Aliases for Legacy Code
# ---------------------------------------------------------------------------
# ALL LEGACY ALIASES (TEXT_PRIMARY, VISION_PRIMARY, etc.) HAVE BEEN REMOVED.
# Use FAST_CHAT_*, THINK_CHAT_*, QUIZ_*, LEARN_*, SMALL_TASK_*, FAST_VISION_*, THINK_VISION_* explicitly.

openrouter_client = None
google_client = None
groq_client = None
groq_text_client = None  # [GROQ TERTIARY FIX]


def initialize_clients() -> None:
    global openrouter_client, google_client, groq_client, groq_text_client  # [GROQ TERTIARY FIX]
    try:
        from openai import AsyncOpenAI

        openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        gemini_api_key = os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        groq_api_key = os.getenv("GROQ_API_KEY")

        openrouter_client = None
        google_client = None
        groq_client = None
        groq_text_client = None  # [GROQ TERTIARY FIX]

        if openrouter_api_key:
            openrouter_client = AsyncOpenAI(
                api_key=openrouter_api_key,
                base_url="https://openrouter.ai/api/v1",
                max_retries=0,
                timeout=30.0,
            )
            logger.info("[INFO] OpenRouter Client Initialized")
        else:
            logger.warning("[WARNING] OPENROUTER_API_KEY not set! OpenRouter primary main AI will fail.")

        if gemini_api_key:
            google_client = AsyncOpenAI(
                api_key=gemini_api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                max_retries=0,
                timeout=90.0,
            )
            logger.info("[INFO] Google AI Studio Client Initialized")
        else:
            logger.warning("[WARNING] GEMINI_API_KEY not set! Google fallback AI will fail.")

        if groq_api_key:
            groq_client = AsyncOpenAI(
                api_key=groq_api_key,
                base_url="https://api.groq.com/openai/v1",
                max_retries=0,
                timeout=30.0,
            )
            logger.info("[INFO] Groq Client Initialized")
            groq_text_client = AsyncOpenAI(
                api_key=groq_api_key,
                base_url="https://api.groq.com/openai/v1",
                timeout=httpx.Timeout(60.0, connect=10.0),
            )  # [GROQ TERTIARY FIX]
            logger.info("[INFO] Groq Text Client Initialized")  # [GROQ TERTIARY FIX]
        else:
            logger.warning("[WARNING] GROQ_API_KEY not set! Groq AI will fail.")
            logger.warning("[WARNING] GROQ_API_KEY not set! Groq text client failover will fail.")  # [GROQ TERTIARY FIX]
    except Exception as exc:
        logger.error(f"[ERROR] Failed to initialize AI clients: {exc}")
        openrouter_client = None
        google_client = None
        groq_client = None
        groq_text_client = None  # [GROQ TERTIARY FIX]


def has_available_client() -> bool:
    return openrouter_client is not None or google_client is not None or groq_client is not None or groq_text_client is not None  # [GROQ TERTIARY FIX]


def _is_empty_or_thinking_only(content: Optional[str]) -> bool:
    if not content or not str(content).strip():
        return True
    try:
        from utils.thinking_token_utils import strip_thinking_tokens
        visible_text, _ = strip_thinking_tokens(content)
        return not visible_text.strip()
    except Exception:
        return False


def _should_reject_response_content(res: Optional[Any], *, stream: bool) -> bool:
    if stream or res is None:
        return False
    try:
        choices = getattr(res, "choices", None)
        if not choices:
            return False
        message = getattr(choices[0], "message", None)
        content = getattr(message, "content", None) if message is not None else None
        return _is_empty_or_thinking_only(content)
    except Exception:
        return False


def _response_format_mode(response_format: Optional[dict]) -> str:
    if not response_format:
        return "plain_text"
    return str(response_format.get("type") or "unknown")


def _fast_extra_body(model_name: str) -> dict | None:
    """Return extra_body for fast-mode API control, or None if not needed for this model.
    Note: Google Gemma thinking suppression is handled via _inject_nothink(), not extra_body."""
    return _MODEL_VISION_FAST_PARAMS.get(model_name)


def _inject_nothink(messages: list[dict], model_name: str) -> list[dict]:
    """For Google Gemma models, prepend /nothink\n to the first user message text
    to suppress internal chain-of-thought reasoning tokens in the response."""
    if model_name not in GOOGLE_NOTHINK_MODELS:
        return messages
    result = []
    injected = False
    for msg in messages:
        if not injected and msg.get("role") == "user":
            content = msg["content"]
            if isinstance(content, str):
                msg = {**msg, "content": "/nothink\n" + content}
                injected = True
            elif isinstance(content, list):
                new_parts = []
                for part in content:
                    if not injected and isinstance(part, dict) and part.get("type") == "text":
                        part = {**part, "text": "/nothink\n" + part["text"]}
                        injected = True
                    new_parts.append(part)
                msg = {**msg, "content": new_parts}
        result.append(msg)
    return result


def _client_for_text_model(model_name: str) -> Any:
    # GROQ
    if model_name in {
        "openai/gpt-oss-120b",
        "llama-3.3-70b-versatile",
        "qwen/qwen3.6-27b",
        "llama-3.1-8b-instant",
        "whisper-large-v3-turbo",
        "whisper-large-v3"
    }:
        return groq_text_client or groq_client

    # GOOGLE AI STUDIO
    if model_name in {
        "gemma-4-26b-a4b-it",
        "gemma-4-31b-it",
        "gemma-4-32b-it"
    }:
        return google_client

    # OPENROUTER
    if model_name in {
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "nvidia/nemotron-nano-12b-v2-vl:free",
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
    }:
        return openrouter_client

    # Default fallback if unmapped model string
    if openrouter_client is not None:
        return openrouter_client
    return None


def _all_text_order() -> list[tuple[str, str]]:
    return [
        ("FAST_CHAT_PRIMARY", FAST_CHAT_PRIMARY),
        ("FAST_CHAT_SECONDARY", FAST_CHAT_SECONDARY),
        ("FAST_CHAT_TERTIARY", FAST_CHAT_TERTIARY),
        ("FAST_CHAT_QUATERNARY", FAST_CHAT_QUATERNARY),
        ("SMALL_TASK_PRIMARY", SMALL_TASK_PRIMARY),
        ("SMALL_TASK_SECONDARY", SMALL_TASK_SECONDARY),
    ]


def _max_tokens_for_text_model(model_name: str, requested_max_tokens: int) -> int:
    if model_name in {FAST_CHAT_TERTIARY, SMALL_TASK_PRIMARY, SMALL_TASK_SECONDARY}:
        return min(requested_max_tokens, OPENROUTER_FALLBACK_MAX_TOKENS)
    return requested_max_tokens


def _log_llm_provider_timing(event: str, duration_ms: float, model: str, response_format: Optional[dict], audit_meta: Optional[dict] = None, **extra: Any) -> None:
    meta = {
        "model": model,
        "response_format_mode": _response_format_mode(response_format),
        **(audit_meta or {}),
        **extra,
    }
    safe_meta = {key: value for key, value in meta.items() if value is not None and value != ""}
    meta_str = " ".join(f"{key}={safe_meta[key]}" for key in sorted(safe_meta))
    logger.info(
        "[llm_provider_timing] event=%s duration_ms=%.2f%s",
        event,
        duration_ms,
        f" {meta_str}" if meta_str else "",
    )


async def _create_completion_with_audit(
    client: Any,
    kwargs: dict,
    *,
    audit_meta: Optional[dict] = None,
    timeout_seconds: Optional[float] = None,
) -> Any:
    model = str(kwargs.get("model") or "")
    response_format = kwargs.get("response_format")
    messages = kwargs.get("messages") or []
    started = time.perf_counter()
    _log_llm_provider_timing("llm_provider_call_started", 0.0, model, response_format, audit_meta)

    # Prompt character estimation
    _meta = audit_meta or {}
    prompt_chars = 0
    for m in messages:
        c = m.get("content")
        if isinstance(c, str):
            prompt_chars += len(c)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and part.get("type") == "text":
                    prompt_chars += len(part.get("text", ""))

    try:
        request = client.chat.completions.create(**kwargs)
        res = await asyncio.wait_for(request, timeout=timeout_seconds) if timeout_seconds else await request
        
        if _should_reject_response_content(res, stream=kwargs.get("stream", False)):
            raise ValueError(f"{model} returned empty or thinking-only response content")

        _latency_ms = (time.perf_counter() - started) * 1000
        _log_llm_provider_timing(
            "llm_provider_call_completed",
            _latency_ms,
            model,
            response_format,
            audit_meta,
        )
        # Fire-and-forget AI usage tracking (non-streaming only)
        if not kwargs.get("stream", False):
            _usage = getattr(res, "usage", None)
            if _usage is not None:
                try:
                    _pt = int(getattr(_usage, "prompt_tokens", 0) or 0)
                    _ct = int(getattr(_usage, "completion_tokens", 0) or 0)
                    _tt = int(getattr(_usage, "total_tokens", 0) or (_pt + _ct))
                except (TypeError, ValueError):
                    _pt = _ct = _tt = 0
            else:
                _pt = _ct = _tt = 0

            _comp_content = ""
            try:
                if res and res.choices and res.choices[0].message:
                    _comp_content = res.choices[0].message.content or ""
            except Exception:
                pass

            asyncio.create_task(ai_usage_tracker.log_usage(
                model_used=model,
                request_type=_meta.get("request_type", "chat"),
                prompt_tokens=_pt,
                completion_tokens=_ct,
                total_tokens=_tt,
                prompt_character_count=prompt_chars,
                completion_character_count=len(_comp_content),
                latency_ms=_latency_ms,
                status="success",
                has_images=bool(_meta.get("has_images", False)),
                user_id=_meta.get("user_id"),
                university_id=_meta.get("university_id"),
                session_id=_meta.get("session_id"),
            ))
        return res
    except asyncio.TimeoutError as exc:
        _latency_ms = (time.perf_counter() - started) * 1000
        _log_llm_provider_timing(
            "llm_provider_call_timeout",
            _latency_ms,
            model,
            response_format,
            audit_meta,
            timeout_seconds=timeout_seconds,
        )
        asyncio.create_task(ai_usage_tracker.log_usage(
            model_used=model,
            request_type=_meta.get("request_type", "chat"),
            prompt_character_count=prompt_chars,
            latency_ms=_latency_ms,
            status="timeout",
            error_type="TimeoutError",
            error_message=f"Timeout after {timeout_seconds or 0}s",
            has_images=bool(_meta.get("has_images", False)),
            user_id=_meta.get("user_id"),
            university_id=_meta.get("university_id"),
            session_id=_meta.get("session_id"),
        ))
        raise
    except Exception as exc:
        _latency_ms = (time.perf_counter() - started) * 1000
        _log_llm_provider_timing(
            "llm_provider_call_failed",
            _latency_ms,
            model,
            response_format,
            audit_meta,
            error_type=type(exc).__name__,
        )
        asyncio.create_task(ai_usage_tracker.log_usage(
            model_used=model,
            request_type=_meta.get("request_type", "chat"),
            prompt_character_count=prompt_chars,
            latency_ms=_latency_ms,
            status="error",
            error_type=type(exc).__name__,
            error_message=str(exc)[:500],
            has_images=bool(_meta.get("has_images", False)),
            user_id=_meta.get("user_id"),
            university_id=_meta.get("university_id"),
            session_id=_meta.get("session_id"),
        ))
        raise


async def generate_completion_with_failover(
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    has_images: bool = False,
    stream: bool = False,
    force_google: bool = False,
    requested_model: Optional[str] = None,
    response_format: Optional[dict] = None,
    audit_meta: Optional[dict] = None,
    per_provider_timeout_seconds: Optional[float] = None,
    preferred_models: Optional[list[str]] = None,
    require_system_role_support: bool = False,
) -> Optional[Any]:
    if force_google:
        if google_client is None:
            raise RuntimeError("Google fallback client not initialized.")
        forced_model = FAST_VISION_PRIMARY if has_images else FAST_CHAT_PRIMARY
        logger.info(f"[INFO] Forcing generation with Google model: {forced_model}")
        logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "FORCE_GOOGLE", forced_model)
        
        kwargs = {
            "model": forced_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        if response_format:
            kwargs["response_format"] = response_format
        try:
            return await _create_completion_with_audit(
                google_client,
                kwargs,
                audit_meta=audit_meta,
                timeout_seconds=per_provider_timeout_seconds,
            )
        except Exception as exc:
            if response_format:
                logger.warning(f"Google forced model failed with response_format, retrying with standard json_object format: {exc}")
                try:
                    kwargs["response_format"] = {"type": "json_object"}
                    return await _create_completion_with_audit(
                        google_client,
                        kwargs,
                        audit_meta=audit_meta,
                        timeout_seconds=per_provider_timeout_seconds,
                    )
                except Exception as inner_exc:
                    logger.warning(f"Google forced model failed with standard json_object format, retrying without format: {inner_exc}")
                    kwargs.pop("response_format", None)
                    return await _create_completion_with_audit(
                        google_client,
                        kwargs,
                        audit_meta=audit_meta,
                        timeout_seconds=per_provider_timeout_seconds,
                    )
            raise exc

    # --- Vision path (always fast) ---
    if has_images:
        last_exc = None
        default_vision_order = FAST_VISION_MODEL_ORDER
        if preferred_models:
            preferred_set = set(preferred_models)
            vision_order = list(preferred_models) + [model_name for model_name in default_vision_order if model_name not in preferred_set]
        else:
            vision_order = default_vision_order
        for model_name in vision_order:
            client = _client_for_text_model(model_name)
            if client is None:
                continue

            try:
                vision_max_tokens = min(max_tokens, VISION_MODEL_MAX_TOKENS.get(model_name, max_tokens))
                if client is openrouter_client:
                    vision_max_tokens = min(vision_max_tokens, OPENROUTER_FALLBACK_MAX_TOKENS)

                logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "FAST_VISION_PRIMARY", model_name)
                # Inject /nothink for Gemma (Google AI Studio) or reasoning suppression for OpenRouter
                effective_messages = _inject_nothink(messages, model_name)
                kwargs = {
                    "model": model_name,
                    "messages": effective_messages,
                    "temperature": temperature,
                    "max_tokens": vision_max_tokens,
                    "stream": stream,
                }
                extra = _fast_extra_body(model_name)
                if extra:
                    kwargs["extra_body"] = extra
                return await _create_completion_with_audit(
                    client,
                    kwargs,
                    audit_meta=audit_meta,
                    timeout_seconds=per_provider_timeout_seconds,
                )
            except Exception as exc:
                last_exc = exc
                logger.warning(f"Vision model failed ({model_name}), trying next: {exc}")

        if last_exc:
            raise last_exc
        raise RuntimeError("No vision-capable client is available.")

    # [MODEL ROUTING FIX]
    default_text_order = _all_text_order()
    system_safe_order = _all_text_order()
    full_order = system_safe_order if require_system_role_support else default_text_order
    if preferred_models:
        preferred_set = set(preferred_models)
        model_order = [(name, name) for name in preferred_models]
        model_order += [item for item in full_order if item[1] not in preferred_set]
    else:
        matched_tuple = None
        if requested_model:
            for alias, name in full_order:
                if name == requested_model or alias == requested_model:
                    matched_tuple = (alias, name)
                    break
        if matched_tuple:
            model_order = [matched_tuple] + [item for item in full_order if item != matched_tuple]
        else:
            model_order = full_order

    last_exc = None
    for model_alias, model_name in model_order:
        client = _client_for_text_model(model_name)
        if client is None:
            continue
        try:
            logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "FAST_CHAT_PRIMARY", model_name)
            kwargs = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": _max_tokens_for_text_model(model_name, max_tokens),
                "stream": stream,
            }
            if response_format:
                kwargs["response_format"] = response_format
            try:
                return await _create_completion_with_audit(
                    client,
                    kwargs,
                    audit_meta=audit_meta,
                    timeout_seconds=per_provider_timeout_seconds,
                )
            except Exception as exc:
                if response_format:
                    logger.warning(f"Model {model_name} failed with response_format, retrying with standard json_object format: {exc}")
                    try:
                        kwargs["response_format"] = {"type": "json_object"}
                        return await _create_completion_with_audit(
                            client,
                            kwargs,
                            audit_meta=audit_meta,
                            timeout_seconds=per_provider_timeout_seconds,
                        )
                    except Exception as inner_exc:
                        logger.warning(f"Model {model_name} failed with standard json_object format, retrying without format: {inner_exc}")
                        kwargs.pop("response_format", None)
                        return await _create_completion_with_audit(
                            client,
                            kwargs,
                            audit_meta=audit_meta,
                            timeout_seconds=per_provider_timeout_seconds,
                        )
                raise exc
        except Exception as exc:
            last_exc = exc
            logger.warning(f"Model {model_alias} failed ({model_name}), trying next: {exc}")

    if last_exc is not None:
        raise last_exc

    return None



async def generate_dual_cloud_stream(
    messages: list[dict],
    has_images: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    requested_model: Optional[str] = None,
    preferred_models: Optional[list[str]] = None,
    require_system_role_support: bool = False,
    audit_meta: Optional[dict] = None,
    per_provider_timeout_seconds: Optional[float] = None,
) -> AsyncIterator[Any]:
    started = time.perf_counter()
    completion_stream = await generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        has_images=has_images,
        stream=True,
        requested_model=requested_model,
        preferred_models=preferred_models,
        require_system_role_support=require_system_role_support,
        audit_meta=audit_meta,
        per_provider_timeout_seconds=per_provider_timeout_seconds,
    )
    if completion_stream is None:
        return

    _meta = audit_meta or {}
    accumulated_chars = 0
    actual_model = requested_model or (FAST_VISION_PRIMARY if has_images else FAST_CHAT_PRIMARY)

    try:
        async for chunk in completion_stream:
            try:
                if chunk and getattr(chunk, "choices", None) and chunk.choices[0].delta:
                    content = chunk.choices[0].delta.content or ""
                    accumulated_chars += len(content)
                if chunk and getattr(chunk, "model", None):
                    actual_model = chunk.model
            except Exception:
                pass
            yield chunk

        # Stream finished successfully — log tokens & latency
        _latency_ms = (time.perf_counter() - started) * 1000
        prompt_chars = sum(len(m.get("content", "")) for m in messages if isinstance(m.get("content"), str))

        asyncio.create_task(ai_usage_tracker.log_usage(
            model_used=actual_model,
            request_type=_meta.get("request_type", "chat"),
            prompt_character_count=prompt_chars,
            completion_character_count=accumulated_chars,
            latency_ms=_latency_ms,
            status="success",
            has_images=has_images,
            user_id=_meta.get("user_id"),
            university_id=_meta.get("university_id"),
            session_id=_meta.get("session_id"),
        ))
    except Exception as stream_err:
        _latency_ms = (time.perf_counter() - started) * 1000
        asyncio.create_task(ai_usage_tracker.log_usage(
            model_used=actual_model,
            request_type=_meta.get("request_type", "chat"),
            completion_character_count=accumulated_chars,
            latency_ms=_latency_ms,
            status="error",
            error_type=type(stream_err).__name__,
            error_message=str(stream_err)[:500],
            has_images=has_images,
            user_id=_meta.get("user_id"),
            university_id=_meta.get("university_id"),
            session_id=_meta.get("session_id"),
        ))
        raise stream_err


async def generate_response_async(prompt: str, messages: list[dict] = None, force_google: bool = False, audit_meta: Optional[dict] = None) -> str:
    """Non-streaming wrapper for one-off LLM generation."""
    msgs = (messages or []) + [{"role": "user", "content": prompt}]
    
    response = await generate_completion_with_failover(
        messages=msgs,
        temperature=0.7,
        max_tokens=2048,
        has_images=False,
        stream=False,
        force_google=force_google,
        audit_meta=audit_meta,
    )
    
    if response is None:
        raise RuntimeError("LLM generation failed on all available clients")
        
    return response.choices[0].message.content


async def generate_small_completion_with_failover(
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    stream: bool = False,
    audit_meta: Optional[dict] = None,
) -> Optional[Any]:
    """
    Failover chain for small/fast tasks (Chat Titles, Summaries).
    Uses SMALL_MODEL_ORDER and dynamically resolves the client.
    """
    for model_name in SMALL_MODEL_ORDER:
        client = _client_for_text_model(model_name)
        if client is None:
            continue

        try:
            logger.info(f"[INFO] SMALL failover chain: attempting {model_name}")
            kwargs = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream,
            }
            extra = _fast_extra_body(model_name)
            if extra:
                kwargs["extra_body"] = extra
            return await _create_completion_with_audit(
                client,
                kwargs,
                audit_meta=audit_meta,
            )
        except Exception as exc:
            logger.warning(f"{model_name} failed, trying next: {exc}")

    # Final fallback: Use main chain
    logger.info("All small models failed or clients uninitialized, falling back to main failover chain.")
    return await generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=stream,
        audit_meta=audit_meta,
    )


async def generate_learn_completion_with_failover(
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    stream: bool = False,
    audit_meta: Optional[dict] = None,
) -> Optional[Any]:
    """
    Failover chain for Learn Mode tasks (Section Explanations, Check Questions, Diagnostic Retests).
    Uses LEARN_MODEL_ORDER and dynamically resolves the client.
    """
    for model_name in LEARN_MODEL_ORDER:
        client = _client_for_text_model(model_name)
        if client is None:
            continue

        try:
            logger.info(f"[INFO] LEARN failover chain: attempting {model_name}")
            kwargs = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream,
            }
            return await _create_completion_with_audit(
                client,
                kwargs,
                audit_meta=audit_meta,
            )
        except Exception as exc:
            logger.warning(f"{model_name} failed, trying next: {exc}")

    # Final fallback: Use main chain
    logger.info("All learn models failed or clients uninitialized, falling back to main failover chain.")
    return await generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=stream,
        audit_meta=audit_meta,
    )
