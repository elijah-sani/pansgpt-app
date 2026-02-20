import asyncio
import logging
import os
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger("PansGPT")

TEXT_PRIMARY = "qwen/qwen3-next-80b-a3b-instruct:free"
TEXT_FALLBACK = "gemma-3-27b-it"
VISION_PRIMARY = "qwen/qwen3-vl-235b-a22b-thinking"
VISION_FALLBACK = "gemma-3-27b-it"

openrouter_client = None
google_client = None


def initialize_clients() -> None:
    global openrouter_client, google_client
    try:
        from openai import AsyncOpenAI

        openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

        openrouter_client = None
        google_client = None

        if openrouter_api_key:
            openrouter_client = AsyncOpenAI(
                api_key=openrouter_api_key,
                base_url="https://openrouter.ai/api/v1",
                max_retries=0,
            )
            logger.info("[INFO] OpenRouter Client Initialized")
        else:
            logger.warning("[WARNING] OPENROUTER_API_KEY not set! OpenRouter primary main AI will fail.")

        if gemini_api_key:
            google_client = AsyncOpenAI(
                api_key=gemini_api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                max_retries=0,
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
) -> Optional[Any]:
    primary_model = VISION_PRIMARY if has_images else TEXT_PRIMARY
    fallback_model = VISION_FALLBACK if has_images else TEXT_FALLBACK

    for attempt in range(1, 4):
        try:
            if openrouter_client is None:
                raise RuntimeError("OpenRouter client not initialized")
            return await openrouter_client.chat.completions.create(
                model=primary_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
        except Exception as exc:
            logger.warning(
                f"[WARNING] Primary model failed ({primary_model}) attempt {attempt}/3: {exc}"
            )
            if attempt < 3:
                await asyncio.sleep(2)

    if google_client is None:
        logger.error("[ERROR] Google fallback client not initialized.")
        return None

    try:
        logger.warning(f"[WARNING] Failing over to Google model: {fallback_model}")
        return await google_client.chat.completions.create(
            model=fallback_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )
    except Exception as exc:
        logger.error(f"[ERROR] Google fallback model failed ({fallback_model}): {exc}")
        return None


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

