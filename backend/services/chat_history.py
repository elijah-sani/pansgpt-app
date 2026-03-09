from typing import Any, Awaitable, Callable, Optional
import logging

supabase_client = None
execute_with_retry = None
logger = logging.getLogger("PansGPT")


def _is_missing_citations_column_error(err: Exception) -> bool:
    text = str(err).lower()
    return "citations" in text and "chat_messages" in text and (
        "schema cache" in text or "column" in text
    )


def set_dependencies(supabase, retry_executor: Optional[Callable[..., Awaitable[Any]]] = None) -> None:
    global supabase_client, execute_with_retry
    supabase_client = supabase
    execute_with_retry = retry_executor


def has_client() -> bool:
    return supabase_client is not None


async def _run(execute_fn, operation_name: str):
    if supabase_client is None:
        raise RuntimeError("Supabase client not initialized")
    if execute_with_retry is not None:
        return await execute_with_retry(execute_fn, operation_name)
    return execute_fn()


async def save_user_message(session_id: str, content: str, image_data: Optional[str] = None) -> Optional[int]:
    # Update the parent session timestamp
    await _run(
        lambda: supabase_client.table("chat_sessions").update(
            {"updated_at": "now()"}
        ).eq("id", session_id).execute(),
        "Update session timestamp",
    )

    response = await _run(
        lambda: supabase_client.table("chat_messages").insert(
            {
                "session_id": session_id,
                "role": "user",
                "content": content,
                "image_data": image_data,
            }
        ).execute(),
        "Save user chat message",
    )
    if response.data and len(response.data) > 0:
        return response.data[0].get("id")
    return None


async def save_assistant_message(
    session_id: str,
    content: str,
    citations: Optional[list[dict[str, Any]]] = None,
) -> Optional[int]:
    # Update the parent session timestamp
    await _run(
        lambda: supabase_client.table("chat_sessions").update(
            {"updated_at": "now()"}
        ).eq("id", session_id).execute(),
        "Update session timestamp",
    )

    payload = {
        "session_id": session_id,
        "role": "ai",
        "content": content,
    }
    if citations is not None:
        payload["citations"] = citations

    try:
        response = await _run(
            lambda: supabase_client.table("chat_messages").insert(payload).execute(),
            "Save streamed assistant message",
        )
    except Exception as e:
        if citations is not None and _is_missing_citations_column_error(e):
            logger.warning(
                "[WARNING] chat_messages.citations column missing; retrying assistant save without citations"
            )
            fallback_payload = {
                "session_id": session_id,
                "role": "ai",
                "content": content,
            }
            response = await _run(
                lambda: supabase_client.table("chat_messages").insert(fallback_payload).execute(),
                "Save streamed assistant message (fallback without citations)",
            )
        else:
            raise

    if response.data and len(response.data) > 0:
        return response.data[0].get("id")
    return None


async def get_session_title(session_id: str) -> Optional[str]:
    response = await _run(
        lambda: supabase_client.table("chat_sessions").select("title").eq("id", session_id).execute(),
        "Fetch chat session title",
    )
    if response.data and len(response.data) > 0:
        return response.data[0].get("title")
    return None


async def update_session_title(session_id: str, title: str) -> None:
    await _run(
        lambda: supabase_client.table("chat_sessions").update({"title": title}).eq("id", session_id).execute(),
        "Update chat session title",
    )

