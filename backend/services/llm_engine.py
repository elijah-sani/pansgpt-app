import asyncio
import logging
import os
import httpx  # [GROQ TERTIARY FIX]
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger("PansGPT")

OPENROUTER_FALLBACK_MAX_TOKENS = 1024

TEXT_PRIMARY = "gemma-4-31b-it"           # Google AI Studio
TEXT_SECONDARY = "gemma-4-26b-a4b-it"         # Google AI Studio fallback
TEXT_TERTIARY = "meta-llama/llama-4-scout-17b-16e-instruct"  # [GROQ TERTIARY FIX]
# Compatibility alias for callers still referencing TEXT_FALLBACK.
TEXT_FALLBACK = TEXT_SECONDARY

SMALL_PRIMARY = "meta-llama/llama-3.3-70b-instruct:free"   # OpenRouter (Llama 3.3 70B Free)
SMALL_SECONDARY = "llama-3.1-8b-instant"                  # Groq (Llama 3.1 8b)
SMALL_TERTIARY = "qwen/qwen-2.5-72b-instruct:free"         # OpenRouter (Qwen 2.5 72B Free)
TEXT_FAST = SMALL_PRIMARY                  # Smaller and faster model for quick tasks (e.g. titles)

VISION_PRIMARY = "gemma-4-31b-it"           # Google AI Studio vision primary
VISION_FALLBACK = "qwen/qwen3-vl-235b-a22b-thinking"  # OpenRouter vision fallback

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


async def generate_completion_with_failover(
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    has_images: bool = False,
    stream: bool = False,
    force_google: bool = False,
    requested_model: Optional[str] = None,
) -> Optional[Any]:
    if force_google:
        if google_client is None:
            raise RuntimeError("Google fallback client not initialized.")
        forced_model = VISION_FALLBACK if has_images else TEXT_PRIMARY
        logger.info(f"[INFO] Forcing generation with Google model: {forced_model}")
        logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "FORCE_GOOGLE", forced_model)
        return await google_client.chat.completions.create(
            model=forced_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )

    # --- Vision path (unchanged logic, just updated model names) ---
    if has_images:
        # Try Google vision primary first
        try:
            if google_client is None:
                raise RuntimeError("Google fallback client not initialized")
            logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "VISION_PRIMARY", VISION_PRIMARY)
            return await google_client.chat.completions.create(
                model=VISION_PRIMARY,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(f"Vision primary failed ({VISION_PRIMARY}), falling back to OpenRouter: {exc}")

        # Fallback to OpenRouter for vision
        if openrouter_client is None:
            raise RuntimeError("OpenRouter client not initialized.")
        logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "VISION_PRIMARY", VISION_FALLBACK)
        return await openrouter_client.chat.completions.create(
            model=VISION_FALLBACK,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )

    # [MODEL ROUTING FIX]
    full_order = [
        ("TEXT_PRIMARY", TEXT_PRIMARY),
        ("TEXT_SECONDARY", TEXT_SECONDARY),
        ("TEXT_TERTIARY", TEXT_TERTIARY)
    ]
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
                return await groq_text_client.chat.completions.create(  # [GROQ TERTIARY FIX]
                    model=model_name,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=fallback_max_tokens,
                    stream=stream,
                )
            except Exception as exc:
                logger.error(f"All models failed. Last resort ({TEXT_TERTIARY}) error: {exc}")
                raise exc
        else:
            if google_client is not None:
                try:
                    logger.info("CHAT LATENCY requested_model=%s actual_model_attempted=%s", requested_model or "TEXT_PRIMARY", model_name)
                    return await google_client.chat.completions.create(
                        model=model_name,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        stream=stream,
                    )
                except Exception as exc:
                    logger.warning(f"Model {model_alias} failed ({model_name}), trying next: {exc}")

    return None


async def generate_dual_cloud_stream(
    messages: list[dict],
    has_images: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    requested_model: Optional[str] = None,
) -> AsyncIterator[Any]:
    completion_stream = await generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        has_images=has_images,
        stream=True,
        requested_model=requested_model,
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
