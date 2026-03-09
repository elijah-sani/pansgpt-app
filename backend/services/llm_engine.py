import asyncio
import logging
import os
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger("PansGPT")

TEXT_PRIMARY = "gemma-3-27b-it"           # Google AI Studio
TEXT_SECONDARY = "gemma-3-12b-it"         # Google AI Studio fallback
TEXT_TERTIARY = "qwen/qwen3-vl-235b-a22b-thinking"  # OpenRouter last resort
# Compatibility alias for callers still referencing TEXT_FALLBACK.
TEXT_FALLBACK = TEXT_PRIMARY

VISION_PRIMARY = "qwen/qwen3-vl-235b-a22b-thinking"  # OpenRouter vision primary
VISION_FALLBACK = "gemma-3-27b-it"         # Google AI Studio vision fallback

openrouter_client = None
google_client = None


def initialize_clients() -> None:
    global openrouter_client, google_client
    try:
        from openai import AsyncOpenAI

        openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        gemini_api_key = os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

        openrouter_client = None
        google_client = None

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
                timeout=45.0,
            )
            logger.info("[INFO] Google AI Studio Client Initialized")
        else:
            logger.warning("[WARNING] GEMINI_API_KEY not set! Google fallback AI will fail.")
    except Exception as exc:
        logger.error(f"[ERROR] Failed to initialize AI clients: {exc}")
        openrouter_client = None
        google_client = None


def has_available_client() -> bool:
    return openrouter_client is not None or google_client is not None


async def generate_completion_with_failover(
    messages: list[dict],
    temperature: float,
    max_tokens: int,
    has_images: bool = False,
    stream: bool = False,
    force_google: bool = False,
) -> Optional[Any]:
    if force_google:
        if google_client is None:
            raise RuntimeError("Google fallback client not initialized.")
        forced_model = VISION_FALLBACK if has_images else TEXT_PRIMARY
        logger.info(f"[INFO] Forcing generation with Google model: {forced_model}")
        return await google_client.chat.completions.create(
            model=forced_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )

    # --- Vision path (unchanged logic, just updated model names) ---
    if has_images:
        # Try OpenRouter vision primary first
        try:
            if openrouter_client is None:
                raise RuntimeError("OpenRouter client not initialized")
            return await openrouter_client.chat.completions.create(
                model=VISION_PRIMARY,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(f"Vision primary failed ({VISION_PRIMARY}), falling back to Google: {exc}")

        # Fallback to Google for vision
        if google_client is None:
            raise RuntimeError("Google fallback client not initialized.")
        return await google_client.chat.completions.create(
            model=VISION_FALLBACK,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )

    # --- Text path: Google 27B -> Google 12B -> OpenRouter Qwen ---

    # Step 1: Try Google Gemma 3 27B
    if google_client is not None:
        try:
            logger.info(f"Attempting text generation with primary: {TEXT_PRIMARY}")
            return await google_client.chat.completions.create(
                model=TEXT_PRIMARY,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(f"Primary model failed ({TEXT_PRIMARY}), trying secondary: {exc}")

    # Step 2: Try Google Gemma 3 12B
    if google_client is not None:
        try:
            logger.info(f"Attempting text generation with secondary: {TEXT_SECONDARY}")
            return await google_client.chat.completions.create(
                model=TEXT_SECONDARY,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(f"Secondary model failed ({TEXT_SECONDARY}), trying tertiary: {exc}")

    # Step 3: Last resort -> OpenRouter Qwen
    if openrouter_client is None:
        logger.error("All models failed and OpenRouter client is not initialized.")
        return None

    try:
        logger.warning(f"Falling back to last resort: {TEXT_TERTIARY}")
        return await openrouter_client.chat.completions.create(
            model=TEXT_TERTIARY,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )
    except Exception as exc:
        logger.error(f"All models failed. Last resort ({TEXT_TERTIARY}) error: {exc}")
        raise exc


async def generate_dual_cloud_stream(
    messages: list[dict],
    has_images: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncIterator[Any]:
    completion_stream = await generate_completion_with_failover(
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        has_images=has_images,
        stream=True,
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
