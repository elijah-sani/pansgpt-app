import sys
import os
from unittest.mock import AsyncMock, patch

# Add backend directory to sys.path so we can import services and routers
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
import services.llm_engine as llm_engine

@pytest.mark.anyio
async def test_llm_engine_routing():
    print("Running LLM engine routing tests...")
    
    # Verify model names are defined
    assert hasattr(llm_engine, "TEXT_PRIMARY")
    assert hasattr(llm_engine, "TEXT_SECONDARY")
    assert hasattr(llm_engine, "TEXT_TERTIARY")
    
    # Mock google_client and openrouter_client to prevent real API calls
    mock_google = AsyncMock()
    mock_openrouter = AsyncMock()
    
    with patch("services.llm_engine.google_client", mock_google), \
         patch("services.llm_engine.openrouter_client", mock_openrouter):
        
        # Test 1: Requested model TEXT_SECONDARY (Fast Mode)
        messages = [{"role": "user", "content": "hello"}]
        
        # We simulate google_client success
        mock_google.chat.completions.create.return_value = AsyncMock()
        
        await llm_engine.generate_completion_with_failover(
            messages=messages,
            temperature=0.7,
            max_tokens=100,
            requested_model="TEXT_SECONDARY",
        )
        
        # Check that it called the Google client with the secondary model first
        mock_google.chat.completions.create.assert_called_with(
            model=llm_engine.TEXT_SECONDARY,
            messages=messages,
            temperature=0.7,
            max_tokens=100,
            stream=False,
        )
        
        # Reset and test 2: Requested model TEXT_PRIMARY (Thinking Mode)
        mock_google.chat.completions.create.reset_mock()
        
        await llm_engine.generate_completion_with_failover(
            messages=messages,
            temperature=0.7,
            max_tokens=100,
            requested_model="TEXT_PRIMARY",
        )
        
        # Check that it called the Google client with the primary model first
        mock_google.chat.completions.create.assert_called_with(
            model=llm_engine.TEXT_PRIMARY,
            messages=messages,
            temperature=0.7,
            max_tokens=100,
            stream=False,
        )

        print("[SUCCESS] LLM routing verification passed.")

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_llm_engine_routing())
    print("All latency verification tests passed!")
