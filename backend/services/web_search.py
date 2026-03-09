"""
Web Search Service - Tavily with usage controls:
1. Per-user daily rate limit (5 searches/day, persisted in Supabase)
2. Smart skip for pharmacy curriculum queries (RAG handles those better)
3. TTL result cache (max 200 queries, 1-hour TTL)
4. Admin kill switch (reads web_search_enabled from system_settings via cached_config)
"""
import asyncio
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from cachetools import TTLCache

logger = logging.getLogger("PansGPT")

_search_cache: TTLCache = TTLCache(maxsize=200, ttl=3600)
MAX_SEARCHES_PER_USER_PER_DAY = 5

_supabase_service_client = None
_execute_with_retry: Optional[Callable[..., Awaitable[Any]]] = None

_CURRICULUM_KEYWORDS = {
    "pharmacokinetics", "pharmacodynamics", "mechanism", "drug interaction",
    "side effect", "adverse", "contraindication", "dose", "dosage",
    "receptor", "agonist", "antagonist", "bioavailability", "half life",
    "metabolism", "excretion", "absorption", "distribution", "synthesis",
    "antibiotic", "antimicrobial", "antifungal", "antiviral", "analgesic",
    "nsaid", "opioid", "beta blocker", "ace inhibitor", "diuretic",
    "explain", "define", "what is", "how does", "describe", "summarize",
    "lecture", "notes", "timetable", "course", "study", "exam",
}

LIMIT_REACHED_SENTINEL = "__LIMIT_REACHED__"


def set_dependencies(
    supabase_service_client,
    retry_executor: Optional[Callable[..., Awaitable[Any]]] = None,
) -> None:
    global _supabase_service_client, _execute_with_retry
    _supabase_service_client = supabase_service_client
    _execute_with_retry = retry_executor


def _is_curriculum_query(query: str) -> bool:
    lower = query.lower()
    return any(kw in lower for kw in _CURRICULUM_KEYWORDS)


def _get_cache_key(query: str) -> str:
    return hashlib.md5(query.strip().lower().encode()).hexdigest()


def _utc_today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def _run(execute_fn, operation_name: str):
    if _supabase_service_client is None:
        raise RuntimeError("Supabase service client not initialized")
    if _execute_with_retry is not None:
        return await _execute_with_retry(execute_fn, operation_name)
    return await asyncio.to_thread(execute_fn)


async def get_daily_usage_count(user_id: str, usage_date: Optional[str] = None) -> int:
    today = usage_date or _utc_today_iso()
    response = await _run(
        lambda: _supabase_service_client.table("web_search_usage")
        .select("count")
        .eq("user_id", user_id)
        .eq("date", today)
        .limit(1)
        .execute(),
        "Fetch web search daily usage",
    )
    rows = response.data or []
    row = rows[0] if isinstance(rows, list) and rows else (rows if isinstance(rows, dict) else {})
    count = row.get("count", 0)
    return int(count or 0)


async def increment_daily_usage(user_id: str, usage_date: Optional[str] = None) -> int:
    today = usage_date or _utc_today_iso()
    response = await _run(
        lambda: _supabase_service_client.rpc(
            "increment_web_search_usage",
            {"p_user_id": user_id, "p_date": today},
        ).execute(),
        "Increment web search daily usage",
    )
    data = response.data
    if isinstance(data, list):
        value = data[0] if data else 0
    else:
        value = data
    return int(value or 0)


async def search_web(
    query: str,
    user_id: str,
    web_search_enabled: bool,
    max_results: int = 5,
) -> str:
    """
    Perform a Tavily web search with all four usage controls applied.

    Returns:
        - Formatted results string on success
        - LIMIT_REACHED_SENTINEL if user hit daily cap
        - "" (empty string) if skipped for any other reason
    """
    if not web_search_enabled:
        logger.info("Web search disabled by admin kill switch - skipping.")
        return ""

    if _is_curriculum_query(query):
        logger.info("Web search skipped - curriculum query: '%s'", query[:60])
        return ""

    try:
        current_count = await get_daily_usage_count(user_id)
    except Exception as exc:
        logger.error("Failed to read web search usage for user %s: %s", user_id, exc)
        return ""

    if current_count >= MAX_SEARCHES_PER_USER_PER_DAY:
        logger.info("Web search daily limit reached for user %s", user_id)
        return LIMIT_REACHED_SENTINEL

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        logger.warning("TAVILY_API_KEY not configured - web search skipped.")
        return ""

    cache_key = _get_cache_key(query)
    if cache_key in _search_cache:
        logger.info("Web search cache hit: '%s'", query[:60])
        try:
            await increment_daily_usage(user_id)
        except Exception as exc:
            logger.error("Failed to persist cached web search usage for user %s: %s", user_id, exc)
            return ""
        return _search_cache[cache_key]

    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=api_key)
        response = await asyncio.to_thread(
            client.search,
            query=query,
            search_depth="basic",
            max_results=max_results,
            include_answer=True,
        )

        parts = []
        if response.get("answer"):
            parts.append(f"SUMMARY: {response['answer']}")

        results = response.get("results", [])
        if results:
            parts.append("SOURCES:")
            for index, result in enumerate(results, 1):
                title = result.get("title", "")
                url = result.get("url", "")
                content = (result.get("content") or "").strip()[:400]
                parts.append(f"{index}. {title}\n   {url}\n   {content}")

        result_text = "\n\n".join(parts)

        if result_text:
            _search_cache[cache_key] = result_text

        await increment_daily_usage(user_id)
        logger.info("Web search OK: '%s' - %s sources", query[:60], len(results))
        return result_text
    except ImportError:
        logger.error("tavily-python not installed. Run: pip install tavily-python")
        return ""
    except Exception as exc:
        logger.error("Web search failed for '%s': %s", query[:60], exc)
        return ""
