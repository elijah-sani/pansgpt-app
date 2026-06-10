import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from routers.shared import sanitize_status_message, agentic_rag_loop, User, safe_topic_from_query

def test_safe_topic_from_query():
    assert safe_topic_from_query("aspirin COX inhibition") == "aspirin COX inhibition"
    assert safe_topic_from_query("  'renal clearance'  ") == "renal clearance"
    # Overly long query should be truncated
    long_query = "A" * 80
    expected = "A" * 62 + "..."
    assert safe_topic_from_query(long_query) == expected
    assert safe_topic_from_query("") == ""


def test_sanitize_status_message():
    # Valid status
    assert sanitize_status_message("Searching for ergot alkaloid classifications...") == "Searching for ergot alkaloid classifications..."
    
    # Over 100 characters -> fallback
    long_status = "A" * 105
    assert sanitize_status_message(long_status, "Fallback") == "Fallback"
    
    # Banned database/RAG/AI jargon -> fallback
    assert sanitize_status_message("Searching the vector database...", "Fallback") == "Fallback"
    assert sanitize_status_message("Retrieving RAG chunks...", "Fallback") == "Fallback"
    assert sanitize_status_message("Running SQL query...", "Fallback") == "Fallback"
    
    # HTML/private tags -> fallback
    assert sanitize_status_message("Searching for <something>...", "Fallback") == "Fallback"
    
    # File paths / extensions -> fallback
    assert sanitize_status_message("Reviewing file.pdf...", "Fallback") == "Fallback"

@pytest.mark.anyio
async def test_agentic_rag_loop_good():
    # Scenario: Vector matches above threshold, no retry needed
    search_queries = [{"query": "aspirin COX", "status": "Searching for relevant material on aspirin and COX inhibition..."}]
    
    # Mock user and settings
    mock_user = MagicMock(spec=User)
    mock_user.id = "user123"
    
    # Mock settings to return rag_threshold = 0.50
    async def mock_get_cached_settings():
        return {"rag_threshold": 0.50}
        
    # Mock get_relevant_context to append a row with similarity 0.90
    async def mock_get_relevant_context(
        user_question, document_id, user_level, current_user, academic_session, semester, rag_match_count, _out_rpc_rows=None
    ):
        if _out_rpc_rows is not None:
            _out_rpc_rows.append({"id": 101, "content": "Aspirin inhibits COX-1 and COX-2 enzymes.", "similarity": 0.90, "document_id": "doc1"})
        return "context text", [{"document_id": "doc1", "title": "Aspirin Lecture.pdf", "course": "PCH 311", "lecturer": "Dr. Smith", "topic": "Analgesics"}]

    mock_llm = AsyncMock()

    with patch('routers.shared.get_cached_settings', side_effect=mock_get_cached_settings), \
         patch('routers.shared.get_relevant_context', side_effect=mock_get_relevant_context):
        
        events = []
        async for event in agentic_rag_loop(
            user_text="What is aspirin?",
            document_id=None,
            student_level="400",
            current_user=mock_user,
            academic_session="2023/2024",
            semester="first",
            rag_match_count=6,
            search_queries=search_queries,
            llm_engine=mock_llm,
        ):
            events.append(event)
            
        # First event is the status
        assert events[0] == {"status": "Searching for relevant material on aspirin and COX inhibition..."}
        
        # Second event is the final result
        final_res = events[1]["final_result"]
        merged_context, citations, context_quality = final_res
        
        assert "Aspirin inhibits COX-1 and COX-2 enzymes." in merged_context
        assert len(citations) == 1
        assert citations[0]["document_id"] == "doc1"
        assert context_quality == "good"

@pytest.mark.anyio
async def test_agentic_rag_loop_partial_due_to_keyword():
    # Scenario: Keyword fallback without similarity score
    search_queries = [{"query": "aspirin COX", "status": "Searching for relevant material on aspirin and COX inhibition..."}]
    
    mock_user = MagicMock(spec=User)
    mock_user.id = "user123"
    
    async def mock_get_cached_settings():
        return {"rag_threshold": 0.50}
        
    async def mock_get_relevant_context(
        user_question, document_id, user_level, current_user, academic_session, semester, rag_match_count, _out_rpc_rows=None
    ):
        if _out_rpc_rows is not None:
            # Appending a row with no similarity key
            _out_rpc_rows.append({"id": 102, "content": "Aspirin keyword fallback content.", "document_id": "doc2"})
        return "context text", [{"document_id": "doc2", "title": "Pharmacology Intro.pdf", "course": "PCH 311", "lecturer": "Dr. Smith", "topic": "Analgesics"}]

    mock_llm = AsyncMock()

    with patch('routers.shared.get_cached_settings', side_effect=mock_get_cached_settings), \
         patch('routers.shared.get_relevant_context', side_effect=mock_get_relevant_context):
        
        events = []
        async for event in agentic_rag_loop(
            user_text="What is aspirin?",
            document_id=None,
            student_level="400",
            current_user=mock_user,
            academic_session="2023/2024",
            semester="first",
            rag_match_count=6,
            search_queries=search_queries,
            llm_engine=mock_llm,
        ):
            events.append(event)
            
        final_res = events[1]["final_result"]
        merged_context, citations, context_quality = final_res
        
        assert "Aspirin keyword fallback content." in merged_context
        assert context_quality == "partial"

@pytest.mark.anyio
async def test_agentic_rag_loop_retry_and_subject_extraction():
    # Scenario: Initial vector similarity below threshold (0.35 < 0.50) -> rephrases and succeeds in retry
    search_queries = [{"query": "aspirin COX", "status": "Searching for relevant material on aspirin and COX inhibition..."}]
    
    mock_user = MagicMock(spec=User)
    mock_user.id = "user123"
    
    async def mock_get_cached_settings():
        return {"rag_threshold": 0.50}
        
    # Capture calls to verify rephrased query is passed on second call
    call_queries = []
    async def mock_get_relevant_context(
        user_question, document_id, user_level, current_user, academic_session, semester, rag_match_count, _out_rpc_rows=None
    ):
        call_queries.append(user_question)
        if _out_rpc_rows is not None:
            if "rephrased" in user_question:
                # Retry returns a good match
                _out_rpc_rows.append({"id": 104, "content": "Rephrased match content.", "similarity": 0.85, "document_id": "doc1"})
            else:
                # Initial returns a bad match
                _out_rpc_rows.append({"id": 103, "content": "Weak match content.", "similarity": 0.35, "document_id": "doc1"})
        return "context text", [{"document_id": "doc1", "title": "Aspirin Lecture.pdf", "course": "PCH 311", "lecturer": "Dr. Smith", "topic": "Analgesics"}]

    # Mock LLM to return rephrased query
    mock_llm = AsyncMock()
    mock_llm_response = MagicMock()
    mock_llm_response.choices = [MagicMock()]
    mock_llm_response.choices[0].message.content = "rephrased aspirin COX"
    mock_llm.generate_completion_with_failover.return_value = mock_llm_response

    with patch('routers.shared.get_cached_settings', side_effect=mock_get_cached_settings), \
         patch('routers.shared.get_relevant_context', side_effect=mock_get_relevant_context):
        
        events = []
        async for event in agentic_rag_loop(
            user_text="What is aspirin?",
            document_id=None,
            student_level="400",
            current_user=mock_user,
            academic_session="2023/2024",
            semester="first",
            rag_match_count=6,
            search_queries=search_queries,
            llm_engine=mock_llm,
        ):
            events.append(event)
            
        # Verify events streamed: initial status, refined retry status, final result
        assert events[0] == {"status": "Searching for relevant material on aspirin and COX inhibition..."}
        # Refined status must extract topic safely from query "aspirin COX"
        assert events[1] == {"status": "Refining the search around aspirin COX..."}
        
        final_res = events[2]["final_result"]
        merged_context, citations, context_quality = final_res
        
        # Verify we got the rephrased context and not the weak context
        assert "Rephrased match content." in merged_context
        assert "Weak match content." not in merged_context
        assert context_quality == "partial" # Retry downgrades to partial
        assert call_queries == ["aspirin COX", "rephrased aspirin COX"]

@pytest.mark.anyio
async def test_retry_subject_extraction_various_prefixes():
    mock_user = MagicMock(spec=User)
    mock_user.id = "user123"
    
    async def mock_get_cached_settings():
        return {"rag_threshold": 0.50}
        
    async def mock_get_relevant_context(
        user_question, document_id, user_level, current_user, academic_session, semester, rag_match_count, _out_rpc_rows=None
    ):
        return "", []

    mock_llm = AsyncMock()
    mock_llm_response = MagicMock()
    mock_llm_response.choices = [MagicMock()]
    mock_llm_response.choices[0].message.content = "rephrased query"
    mock_llm.generate_completion_with_failover.return_value = mock_llm_response

    test_cases = [
        ("aspirin dosage guidelines", "Refining the search around aspirin dosage guidelines..."),
        ("COX-2 selectives", "Refining the search around COX-2 selectives..."),
        ("renal clearance", "Refining the search around renal clearance..."),
        ("ergot alkaloids", "Refining the search around ergot alkaloids..."),
        ("cardiovascular risk factors", "Refining the search around cardiovascular risk factors..."),
    ]

    for query_val, expected_retry in test_cases:
        search_queries = [{"query": query_val, "status": "Searching..."}]
        with patch('routers.shared.get_cached_settings', side_effect=mock_get_cached_settings), \
             patch('routers.shared.get_relevant_context', side_effect=mock_get_relevant_context):
            events = []
            async for event in agentic_rag_loop(
                user_text="dummy",
                document_id=None,
                student_level="400",
                current_user=mock_user,
                academic_session="2023/2024",
                semester="first",
                rag_match_count=6,
                search_queries=search_queries,
                llm_engine=mock_llm,
            ):
                events.append(event)
            assert events[1] == {"status": expected_retry}

