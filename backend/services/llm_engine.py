import asyncio
import logging
import os
import time
import httpx  # [GROQ TERTIARY FIX]
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger("PansGPT")

OPENROUTER_FALLBACK_MAX_TOKENS = 1024

TEXT_PRIMARY = "gemma-4-31b-it"           # Google AI Studio
TEXT_SECONDARY = "gemma-4-26b-a4b-it"         # Google AI Studio fallback
TEXT_TERTIARY = "meta-llama/llama-4-scout-17b-16e-instruct"  # [GROQ TERTIARY FIX]
# Compatibility alias for callers still referencing TEXT_FALLBACK.
TEXT_FALLBACK = TEXT_SECONDARY
FAST_TEXT_MODEL_ORDER = [TEXT_TERTIARY, TEXT_SECONDARY, TEXT_PRIMARY]
QUIZ_TEXT_MODEL_ORDER = [TEXT_TERTIARY, TEXT_SECONDARY, TEXT_PRIMARY]
FAST_TEXT_PRIMARY = FAST_TEXT_MODEL_ORDER[0]
QUIZ_TEXT_PRIMARY = QUIZ_TEXT_MODEL_ORDER[0]

SMALL_PRIMARY = "meta-llama/llama-3.3-70b-instruct:free"   # OpenRouter (Llama 3.3 70B Free)
SMALL_SECONDARY = "llama-3.1-8b-instant"                  # Groq (Llama 3.1 8b)
SMALL_TERTIARY = "qwen/qwen-2.5-72b-instruct:free"         # OpenRouter (Qwen 2.5 72B Free)
TEXT_FAST = SMALL_PRIMARY                  # Smaller and faster model for quick tasks (e.g. titles)

VISION_PRIMARY = "meta-llama/llama-4-scout-17b-16e-instruct"
VISION_SECONDARY = "gemma-4-31b-it"
VISION_TERTIARY = "gemma-4-26b-a4b-it"
VISION_QUATERNARY = "qwen/qwen3-vl-235b-a22b-thinking"
VISION_MODEL_ORDER = [
    VISION_PRIMARY,
    VISION_SECONDARY,
    VISION_TERTIARY,
    VISION_QUATERNARY,
]
VISION_MODEL_MAX_TOKENS = {
    VISION_PRIMARY: 768,
    VISION_SECONDARY: 640,
    VISION_TERTIARY: 512,
    VISION_QUATERNARY: 384,
}

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


def _log_quiz_provider_timing(event: str, duration_ms: float, model: str, response_format: Optional[dict], audit_meta: Optional[dict] = None, **extra: Any) -> None:
    meta = {
        "model": model,
        "response_format_mode": _response_format_mode(response_format),
        **(audit_meta or {}),
        **extra,
    }
    safe_meta = {key: value for key, value in meta.items() if value is not None and value != ""}
    meta_str = " ".join(f"{key}={safe_meta[key]}" for key in sorted(safe_meta))
    logger.info(
        "[quiz_generation_timing] event=%s duration_ms=%.2f%s",
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
    started = time.perf_counter()
    _log_quiz_provider_timing("llm_provider_call_started", 0.0, model, response_format, audit_meta)
    try:
        request = client.chat.completions.create(**kwargs)
        res = await asyncio.wait_for(request, timeout=timeout_seconds) if timeout_seconds else await request
        _log_quiz_provider_timing(
            "llm_provider_call_completed",
            (time.perf_counter() - started) * 1000,
            model,
            response_format,
            audit_meta,
        )
        return res
    except asyncio.TimeoutError:
        _log_quiz_provider_timing(
            "llm_provider_call_timeout",
            (time.perf_counter() - started) * 1000,
            model,
            response_format,
            audit_meta,
            timeout_seconds=timeout_seconds,
        )
        raise
    except Exception as exc:
        _log_quiz_provider_timing(
            "llm_provider_call_failed",
            (time.perf_counter() - started) * 1000,
            model,
            response_format,
            audit_meta,
            error_type=type(exc).__name__,
        )
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
) -> Optional[Any]:
    if force_google:
        if google_client is None:
            raise RuntimeError("Google fallback client not initialized.")
        forced_model = VISION_SECONDARY if has_images else TEXT_PRIMARY
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
            res = await _create_completion_with_audit(
                google_client,
                kwargs,
                audit_meta=audit_meta,
                timeout_seconds=per_provider_timeout_seconds,
            )
            if _should_reject_response_content(res, stream=stream):
                raise ValueError("Google client returned empty or thinking-only response content")
            return res
        except Exception as exc:
            if response_format:
                logger.warning(f"Google forced model failed with response_format, retrying with standard json_object format: {exc}")
                try:
                    kwargs["response_format"] = {"type": "json_object"}
                    res = await _create_completion_with_audit(
                        google_client,
                        kwargs,
                        audit_meta=audit_meta,
                        timeout_seconds=per_provider_timeout_seconds,
                    )
                    if _should_reject_response_content(res, stream=stream):
                        raise ValueError("Google client returned empty or thinking-only response content under json_object")
                    return res
                except Exception as inner_exc:
                    logger.warning(f"Google forced model failed with standard json_object format, retrying without format: {inner_exc}")
                    kwargs.pop("response_format", None)
                    res = await _create_completion_with_audit(
                        google_client,
                        kwargs,
                        audit_meta=audit_meta,
                        timeout_seconds=per_provider_timeout_seconds,
                    )
                    if _should_reject_response_content(res, stream=stream):
                        raise ValueError("Google client returned empty or thinking-only response content without format")
                    return res
            raise exc

    # --- Vision path ---
    if has_images:
        last_exc = None
        for model_name in VISION_MODEL_ORDER:
            if model_name == VISION_PRIMARY:
                client = groq_text_client
            elif model_name in {VISION_SECONDARY, VISION_TERTIARY}:
                client = google_client
            else:
                client = openrouter_client

            if client is None:
                continue

            try:
                vision_max_tokens = min(max_tokens, VISION_MODEL_MAX_TOKENS.get(model_name, max_tokens))
                if client is openrouter_client:
                    vision_max_tokens = min(vision_max_tokens, OPENROUTER_FALLBACK_MAX_TOKENS)

                logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "VISION_PRIMARY", model_name)
                kwargs = {
                    "model": model_name,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": vision_max_tokens,
                    "stream": stream,
                }
                res = await _create_completion_with_audit(
                    client,
                    kwargs,
                    audit_meta=audit_meta,
                    timeout_seconds=per_provider_timeout_seconds,
                )
                if _should_reject_response_content(res, stream=stream):
                    raise ValueError(f"{model_name} returned empty or thinking-only response content")
                return res
            except Exception as exc:
                last_exc = exc
                logger.warning(f"Vision model failed ({model_name}), trying next: {exc}")

        if last_exc:
            raise last_exc
        raise RuntimeError("No vision-capable client is available.")

    # [MODEL ROUTING FIX]
    full_order = [
        ("TEXT_PRIMARY", TEXT_PRIMARY),
        ("TEXT_SECONDARY", TEXT_SECONDARY),
        ("TEXT_TERTIARY", TEXT_TERTIARY)
    ]
    if preferred_models:
        preferred_set = {
            model_name
            for model_name in preferred_models
            if any(name == model_name for _, name in full_order)
        }
        model_order = [
            item
            for preferred_name in preferred_models
            for item in full_order
            if item[1] == preferred_name
        ] + [
            item for item in full_order if item[1] not in preferred_set
        ]
    else:
        matched_tuple = None
        if requested_model:
            for alias, name in full_order:
                if name == requested_model or alias == requested_model:
                    matched_tuple = (alias, name)
                    break
        if matched_tuple:
            model_order = [matched_tuple] + [
                item for item in full_order if item != matched_tuple
            ]
        else:
            model_order = full_order
    # [MODEL ROUTING FIX]

    for model_alias, model_name in model_order:
        if model_name == TEXT_TERTIARY:
            if groq_text_client is None:  # [GROQ TERTIARY FIX]
                logger.error("All models failed and Groq text client is not initialized.")  # [GROQ TERTIARY FIX]
                return None  # [GROQ TERTIARY FIX]
            try:
                fallback_max_tokens = min(max_tokens, OPENROUTER_FALLBACK_MAX_TOKENS)
                logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "TEXT_PRIMARY", model_name)
                kwargs = {
                    "model": model_name,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": fallback_max_tokens,
                    "stream": stream,
                }
                if response_format:
                    kwargs["response_format"] = response_format
                try:
                    res = await _create_completion_with_audit(
                        groq_text_client,
                        kwargs,
                        audit_meta=audit_meta,
                        timeout_seconds=per_provider_timeout_seconds,
                    )
                    if _should_reject_response_content(res, stream=stream):
                        raise ValueError("Groq client returned empty or thinking-only response content")
                    return res
                except Exception as exc:
                    if response_format:
                        logger.warning(f"Groq client failed with response_format, retrying with standard json_object format: {exc}")
                        try:
                            kwargs["response_format"] = {"type": "json_object"}
                            res = await _create_completion_with_audit(
                                groq_text_client,
                                kwargs,
                                audit_meta=audit_meta,
                                timeout_seconds=per_provider_timeout_seconds,
                            )
                            if _should_reject_response_content(res, stream=stream):
                                raise ValueError("Groq client returned empty or thinking-only response content under json_object")
                            return res
                        except Exception as inner_exc:
                            logger.warning(f"Groq client failed with standard json_object format, retrying without format: {inner_exc}")
                            kwargs.pop("response_format", None)
                            res = await _create_completion_with_audit(
                                groq_text_client,
                                kwargs,
                                audit_meta=audit_meta,
                                timeout_seconds=per_provider_timeout_seconds,
                            )
                            if _should_reject_response_content(res, stream=stream):
                                raise ValueError("Groq client returned empty or thinking-only response content without format")
                            return res
                    raise exc
            except Exception as exc:
                logger.error(f"All models failed. Last resort ({TEXT_TERTIARY}) error: {exc}")
                raise exc
        else:
            if google_client is not None:
                try:
                    logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "TEXT_PRIMARY", model_name)
                    kwargs = {
                        "model": model_name,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "stream": stream,
                    }
                    if response_format:
                        kwargs["response_format"] = response_format
                    try:
                        res = await _create_completion_with_audit(
                            google_client,
                            kwargs,
                            audit_meta=audit_meta,
                            timeout_seconds=per_provider_timeout_seconds,
                        )
                        if _should_reject_response_content(res, stream=stream):
                            raise ValueError("Google client returned empty or thinking-only response content")
                        return res
                    except Exception as exc:
                        if response_format:
                            logger.warning(f"Google client failed with response_format for model {model_name}, retrying with standard json_object format: {exc}")
                            try:
                                kwargs["response_format"] = {"type": "json_object"}
                                res = await _create_completion_with_audit(
                                    google_client,
                                    kwargs,
                                    audit_meta=audit_meta,
                                    timeout_seconds=per_provider_timeout_seconds,
                                )
                                if _should_reject_response_content(res, stream=stream):
                                    raise ValueError("Google client returned empty or thinking-only response content under json_object")
                                return res
                            except Exception as inner_exc:
                                logger.warning(f"Google client failed with standard json_object format for model {model_name}, retrying without format: {inner_exc}")
                                kwargs.pop("response_format", None)
                                res = await _create_completion_with_audit(
                                    google_client,
                                    kwargs,
                                    audit_meta=audit_meta,
                                    timeout_seconds=per_provider_timeout_seconds,
                                )
                                if _should_reject_response_content(res, stream=stream):
                                    raise ValueError("Google client returned empty or thinking-only response content without format")
                                return res
                        raise exc
                except Exception as exc:
                    logger.warning(f"Model {model_alias} failed ({model_name}), trying next: {exc}")

    return None



async def generate_dual_cloud_stream(
    messages: list[dict],
    has_images: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    requested_model: Optional[str] = None,
    preferred_models: Optional[list[str]] = None,
) -> AsyncIterator[Any]:
    completion_stream = await generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        has_images=has_images,
        stream=True,
        requested_model=requested_model,
        preferred_models=preferred_models,
    )
    if completion_stream is None:
        return
    async for chunk in completion_stream:
        yield chunk


async def generate_response_async(prompt: str, messages: list[dict] = None, force_google: bool = False) -> str:
    """Non-streaming wrapper for one-off LLM generation."""
    msgs = (messages or []) + [{"role": "user", "content": prompt}]
    
    response = await generate_completion_with_failover(
        messages=msgs,
        temperature=0.7,
        max_tokens=2048,
        has_images=False,
        stream=False,
        force_google=force_google,
    )
    
    if response is None:
        raise RuntimeError("LLM generation failed on all available clients")
        
    return response.choices[0].message.content


async def generate_small_completion_with_failover(
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    stream: bool = False,
) -> Optional[Any]:
    """
    Failover chain for small/fast tasks:
    1. SMALL_PRIMARY (meta-llama/llama-3.3-70b-instruct:free) using openrouter_client
    2. SMALL_SECONDARY (llama-3.1-8b-instant) using groq_client
    3. SMALL_TERTIARY (qwen/qwen-2.5-72b-instruct:free) using openrouter_client
    4. Fall back to the main generate_completion_with_failover chain if all small clients fail.
    """
    # 1. Try OpenRouter (SMALL_PRIMARY)
    if openrouter_client is not None:
        try:
            logger.info(f"[INFO] SMALL failover chain: attempting SMALL_PRIMARY ({SMALL_PRIMARY})")
            return await openrouter_client.chat.completions.create(
                model=SMALL_PRIMARY,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(f"SMALL_PRIMARY failed ({SMALL_PRIMARY}), trying next: {exc}")

    # 2. Try Groq (SMALL_SECONDARY)
    if groq_client is not None:
        try:
            logger.info(f"[INFO] SMALL failover chain: attempting SMALL_SECONDARY ({SMALL_SECONDARY})")
            return await groq_client.chat.completions.create(
                model=SMALL_SECONDARY,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(f"SMALL_SECONDARY failed ({SMALL_SECONDARY}), trying next: {exc}")

    # 3. Try OpenRouter (SMALL_TERTIARY)
    if openrouter_client is not None:
        try:
            logger.info(f"[INFO] SMALL failover chain: attempting SMALL_TERTIARY ({SMALL_TERTIARY})")
            return await openrouter_client.chat.completions.create(
                model=SMALL_TERTIARY,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(f"SMALL_TERTIARY failed ({SMALL_TERTIARY}), falling back to main chain: {exc}")

    # 4. Final fallback: Use main chain
    logger.info("All small models failed or clients uninitialized, falling back to main failover chain.")
    return await generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=stream,
    )
