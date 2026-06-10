import sys
import os
import time
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.shared import agentic_rag_loop, User

async def run_latency_test():
    print("==========================================================")
    # Mock user and settings
    mock_user = MagicMock(spec=User)
    mock_user.id = "user123"
    
    async def mock_get_cached_settings():
        return {"rag_threshold": 0.50}

    # Scenario A: 1 Search query, direct hit (No retries)
    async def mock_get_relevant_context_direct(
        user_question, document_id, user_level, current_user, academic_session, semester, rag_match_count, _out_rpc_rows=None
    ):
        # Simulate realistic 120ms vector search latency
        await asyncio.sleep(0.12)
        if _out_rpc_rows is not None:
            _out_rpc_rows.append({"id": 101, "content": "Good vector match content.", "similarity": 0.85, "document_id": "doc1"})
        return "context text", [{"document_id": "doc1", "title": "Lecture.pdf"}]

    mock_llm = AsyncMock()

    print("\n--- Running Latency Scenario A: 1 Search Query, Direct Hit ---")
    queries_a = [{"query": "query 1", "status": "Searching for topic 1..."}]
    
    start_a = time.perf_counter()
    events_a = []
    with patch('routers.shared.get_cached_settings', side_effect=mock_get_cached_settings), \
         patch('routers.shared.get_relevant_context', side_effect=mock_get_relevant_context_direct):
        async for event in agentic_rag_loop(
            user_text="What is topic 1?",
            document_id=None,
            student_level="400",
            current_user=mock_user,
            academic_session=None,
            semester=None,
            rag_match_count=6,
            search_queries=queries_a,
            llm_engine=mock_llm,
        ):
            events_a.append(event)
    end_a = time.perf_counter()
    duration_a = (end_a - start_a) * 1000
    print(f"Scenario A duration: {duration_a:.2f} ms")
    print(f"Events yielded: {events_a}")

    # Scenario B: 3 Search queries, direct hits (No retries)
    async def mock_get_relevant_context_direct_multi(
        user_question, document_id, user_level, current_user, academic_session, semester, rag_match_count, _out_rpc_rows=None
    ):
        await asyncio.sleep(0.12)
        if _out_rpc_rows is not None:
            _out_rpc_rows.append({"id": 102, "content": f"Match for {user_question}", "similarity": 0.85, "document_id": "doc2"})
        return "context text", [{"document_id": "doc2", "title": "Lecture.pdf"}]

    print("\n--- Running Latency Scenario B: 3 Search Queries, Direct Hits ---")
    queries_b = [
        {"query": "query 1", "status": "Searching for topic 1..."},
        {"query": "query 2", "status": "Searching for topic 2..."},
        {"query": "query 3", "status": "Searching for topic 3..."},
    ]
    
    start_b = time.perf_counter()
    events_b = []
    with patch('routers.shared.get_cached_settings', side_effect=mock_get_cached_settings), \
         patch('routers.shared.get_relevant_context', side_effect=mock_get_relevant_context_direct_multi):
        async for event in agentic_rag_loop(
            user_text="What are topics 1, 2, and 3?",
            document_id=None,
            student_level="400",
            current_user=mock_user,
            academic_session=None,
            semester=None,
            rag_match_count=6,
            search_queries=queries_b,
            llm_engine=mock_llm,
        ):
            events_b.append(event)
    end_b = time.perf_counter()
    duration_b = (end_b - start_b) * 1000
    print(f"Scenario B duration: {duration_b:.2f} ms")
    print(f"Events yielded: {events_b}")

    # Scenario C: 3 Search queries, 1 Query misses and retries (Rephrase LLM call)
    async def mock_get_relevant_context_with_retry(
        user_question, document_id, user_level, current_user, academic_session, semester, rag_match_count, _out_rpc_rows=None
    ):
        await asyncio.sleep(0.12)
        if _out_rpc_rows is not None:
            if "rephrased" in user_question:
                _out_rpc_rows.append({"id": 104, "content": "Rephrased match content.", "similarity": 0.85, "document_id": "doc1"})
            elif "query 2" in user_question:
                # Query 2 misses initially (low similarity score)
                _out_rpc_rows.append({"id": 103, "content": "Weak match content.", "similarity": 0.35, "document_id": "doc1"})
            else:
                _out_rpc_rows.append({"id": 105, "content": "Other match.", "similarity": 0.80, "document_id": "doc1"})
        return "context text", [{"document_id": "doc1", "title": "Lecture.pdf"}]

    # Mock LLM for rephrase (realistic 450ms LLM call)
    mock_llm_rephrase = AsyncMock()
    mock_llm_response = MagicMock()
    mock_llm_response.choices = [MagicMock()]
    mock_llm_response.choices[0].message.content = "rephrased query 2"
    
    async def mock_llm_call(*args, **kwargs):
        await asyncio.sleep(0.45)
        return mock_llm_response
    mock_llm_rephrase.generate_completion_with_failover.side_effect = mock_llm_call

    print("\n--- Running Latency Scenario C: 3 Search Queries, 1 Retry with Rephrase ---")
    queries_c = [
        {"query": "query 1", "status": "Searching for topic 1..."},
        {"query": "query 2", "status": "Searching for topic 2..."},
        {"query": "query 3", "status": "Searching for topic 3..."},
    ]
    
    start_c = time.perf_counter()
    events_c = []
    with patch('routers.shared.get_cached_settings', side_effect=mock_get_cached_settings), \
         patch('routers.shared.get_relevant_context', side_effect=mock_get_relevant_context_with_retry):
        async for event in agentic_rag_loop(
            user_text="What are topics 1, 2, and 3?",
            document_id=None,
            student_level="400",
            current_user=mock_user,
            academic_session=None,
            semester=None,
            rag_match_count=6,
            search_queries=queries_c,
            llm_engine=mock_llm_rephrase,
        ):
            events_c.append(event)
    end_c = time.perf_counter()
    duration_c = (end_c - start_c) * 1000
    print(f"Scenario C duration: {duration_c:.2f} ms")
    print(f"Events yielded: {events_c}")
    print("==========================================================")

if __name__ == "__main__":
    asyncio.run(run_latency_test())
