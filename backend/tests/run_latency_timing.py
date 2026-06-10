import os
import sys
import time
import json
import asyncio
import shutil
import subprocess
import logging
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logger capture
class LogCaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records = []
    def emit(self, record):
        msg = record.getMessage()
        if "CHAT LATENCY" in msg:
            self.records.append(msg)

log_capture = LogCaptureHandler()
logging.getLogger("PansGPT").addHandler(log_capture)
logging.getLogger("PansGPT").setLevel(logging.INFO)

# Import dependencies after configuring logging
from fastapi.testclient import TestClient
from api import app
from dependencies import get_current_user, User
from routers.shared import verify_api_key

# Override authentication to bypass JWT checks and DB calls
app.dependency_overrides[get_current_user] = lambda: User(id="dummy-user-id", email="student@unibadan.edu.ng")
app.dependency_overrides[verify_api_key] = lambda: "dummy-api-key"

# Mocks for external dependencies
async def mock_get_chat_restriction_if_any(*args, **kwargs):
    return None

async def mock_build_student_profile_text(*args, **kwargs):
    return ("Level: 400\nUniversity: UNIBADAN\nProgram: Pharmacy", "400")

async def mock_get_cached_settings(*args, **kwargs):
    return {
        "system_prompt": "You are a helpful pharmacy assistant.",
        "temperature": 0.7,
        "web_search_enabled": True
    }

async def mock_get_recent_session_summaries(*args, **kwargs):
    return ""

async def mock_get_cached_faculty_knowledge(*args, **kwargs):
    # Simulate a small database read delay
    await asyncio.sleep(0.05)
    return "Faculty knowledge: PCH 412 is General Anaesthetics. PTE 411 is Pharmacokinetics."

async def mock_get_cached_student_timetable(*args, **kwargs):
    await asyncio.sleep(0.05)
    return "Timetable: Wednesday 9am PCH 412 Practical."

async def mock_search_web(*args, **kwargs):
    await asyncio.sleep(0.1)
    return "Web search result: Gemma is a family of lightweight, state-of-the-art open models."

async def mock_get_relevant_context(*args, **kwargs):
    await asyncio.sleep(0.1)
    return (
        "Context: Local anaesthetics block nerve conduction locally. Spinal anaesthesia is injected into the subarachnoid space.",
        [{"document_id": "doc_123", "title": "Anaesthetics Lecture.pdf", "course": "PCH 412", "topic": "Anaesthesia"}]
    )

# Apply mocks using patch decorators
patches = [
    patch("routers.chat_core._get_chat_restriction_if_any", mock_get_chat_restriction_if_any),
    patch("routers.chat_core._build_student_profile_text", mock_build_student_profile_text),
    patch("routers.chat_core.get_cached_settings", mock_get_cached_settings),
    patch("routers.chat_core._get_recent_session_summaries", mock_get_recent_session_summaries),
    patch("routers.chat_core.get_cached_faculty_knowledge", mock_get_cached_faculty_knowledge),
    patch("routers.chat_core.get_cached_student_timetable", mock_get_cached_student_timetable),
    patch("routers.chat_core.search_web", mock_search_web),
    patch("routers.chat_core.get_relevant_context", mock_get_relevant_context),
    patch("routers.chat_core.chat_history.save_user_message", AsyncMock(return_value="msg_user_123")),
    patch("routers.chat_core.chat_history.save_assistant_message", AsyncMock(return_value="msg_assistant_123")),
    patch("routers.chat_core.chat_history.get_session_title", AsyncMock(return_value="Dummy Title")),
    patch("routers.chat_core.chat_history.has_client", lambda: True),
]

def activate_patches():
    for p in patches:
        p.start()

def deactivate_patches():
    for p in patches:
        p.stop()

# Helper to run a query using TestClient and collect streaming timings
def run_query_timing(question: str, thinking_mode: bool):
    log_capture.records.clear()
    client = TestClient(app)
    payload = {
        "text": question,
        "mode": "chat",
        "session_id": "test-session-id",
        "thinking_mode": thinking_mode
    }
    
    start_time = time.perf_counter()
    first_token_time = None
    
    # Send request and consume stream
    with client.stream("POST", "/chat", json=payload, headers={"x-api-key": "dummy-api-key"}) as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    event = json.loads(data_str)
                    if "delta" in event and event["delta"].strip() and first_token_time is None:
                        first_token_time = time.perf_counter()
                except Exception:
                    pass
                    
    end_time = time.perf_counter()
    total_duration = (end_time - start_time) * 1000
    
    # Parse captured CHAT LATENCY logs
    stages = {}
    for record in log_capture.records:
        # Expected format: CHAT LATENCY mode=fast model=unknown stage=selected_model elapsed_ms=X
        parts = record.split()
        meta = {}
        for part in parts:
            if "=" in part:
                k, v = part.split("=", 1)
                meta[k] = v
        if "stage" in meta and "elapsed_ms" in meta:
            stages[meta["stage"]] = float(meta["elapsed_ms"])
        if "requested_model" in meta and "actual_model_attempted" in meta:
            stages["requested_model"] = meta["requested_model"]
            stages["actual_model_attempted"] = meta["actual_model_attempted"]
            
    # Compute duration metrics
    planner_duration = 0.0
    if thinking_mode:
        if "planner_complete" in stages and "planner_start" in stages:
            planner_duration = stages["planner_complete"] - stages["planner_start"]
            
    preflight_duration = 0.0
    if "planner_start" in stages:
        preflight_duration = stages["planner_start"]
    elif "context_gathering_start" in stages:
        preflight_duration = stages["context_gathering_start"]
        
    context_gathering = 0.0
    if "context_gathering_complete" in stages and "context_gathering_start" in stages:
        context_gathering = stages["context_gathering_complete"] - stages["context_gathering_start"]
        
    first_visible_delta_ms = 0.0
    if first_token_time is not None and "main_model_stream_start" in stages:
        # Time from main model stream start to first visible delta
        first_visible_delta_ms = (first_token_time - start_time) * 1000 - stages["main_model_stream_start"]
        if first_visible_delta_ms < 0:
            first_visible_delta_ms = 0.0

    selected_model = stages.get("selected_model", "unknown")
    actual_model = stages.get("actual_model_attempted", selected_model)
    requested_model = stages.get("requested_model", "TEXT_PRIMARY" if thinking_mode else "TEXT_SECONDARY")
    
    # Parse parameter values from logged metadata
    rag_chunk_count = stages.get("rag_chunk_count", "unknown")
    run_web_search = stages.get("run_web_search") == "True"
    fetch_timetable = stages.get("fetch_timetable") == "True"
    fetch_faculty = stages.get("fetch_faculty") == "True"
    enable_deep_final_reasoning = stages.get("enable_deep_final_reasoning") == "True"
    
    pipeline_params = {
        "rag_chunk_count": int(rag_chunk_count) if rag_chunk_count.isdigit() else rag_chunk_count,
        "run_web_search": run_web_search,
        "fetch_timetable": fetch_timetable,
        "fetch_faculty": fetch_faculty,
        "enable_deep_final_reasoning": enable_deep_final_reasoning,
    }
    
    # /no_think is enabled if thinking_mode is False OR enable_deep_final_reasoning is False
    no_think_enabled = not thinking_mode or not enable_deep_final_reasoning
    
    return {
        "planner_duration": planner_duration,
        "preflight_duration": preflight_duration,
        "context_gathering": context_gathering,
        "requested_model": requested_model,
        "actual_model": actual_model,
        "no_think_enabled": no_think_enabled,
        "enable_deep_final_reasoning": enable_deep_final_reasoning,
        "first_visible_delta": first_visible_delta_ms,
        "total_duration": total_duration,
        "pipeline_params": pipeline_params,
    }

# File backups
FILES_TO_BACKUP = [
    ("backend/routers/chat_core.py", "backend/routers/chat_core.py.opt"),
    ("backend/routers/shared.py", "backend/routers/shared.py.opt"),
    ("backend/services/llm_engine.py", "backend/services/llm_engine.py.opt"),
]

def create_backups():
    print("Creating backups of optimized files...")
    for src, dst in FILES_TO_BACKUP:
        shutil.copy(src, dst)

def restore_backups():
    print("Restoring optimized files from backups...")
    for src, dst in FILES_TO_BACKUP:
        shutil.copy(dst, src)
        os.remove(dst)

def revert_to_before():
    print("Reverting files to 'Before' state via Git...")
    files = [src for src, _ in FILES_TO_BACKUP]
    subprocess.run(["git", "checkout", "--"] + files, check=True)

def main():
    # Load env for real LLM credentials
    from dotenv import load_dotenv
    load_dotenv()
    
    # Initialize LLM engine clients
    from services.llm_engine import initialize_clients
    initialize_clients()
    
    # Create backups of optimized files
    create_backups()
    
    questions = [
        "what is a general anaesthetic",
        "what are the routes of application of local anaesthetics",
        "compare spinal and epidural anaesthesia, including their sites of administration, onset, advantages, and clinical uses"
    ]
    
    before_results = []
    after_results = []
    
    # --- PHASE 1: Measure BEFORE state ---
    try:
        revert_to_before()
        activate_patches()
        
        print("\n=== Running 'BEFORE' Latency Measurements ===")
        for i, q in enumerate(questions):
            print(f"\nQuestion {i+1}: {q}")
            print("Running Fast Mode...")
            fast_res = run_query_timing(q, thinking_mode=False)
            print("Running Thinking Mode...")
            think_res = run_query_timing(q, thinking_mode=True)
            before_results.append((fast_res, think_res))
            
    finally:
        deactivate_patches()
        
    # --- PHASE 2: Measure AFTER state ---
    try:
        restore_backups()
        activate_patches()
        
        print("\n=== Running 'AFTER' Latency Measurements ===")
        for i, q in enumerate(questions):
            print(f"\nQuestion {i+1}: {q}")
            print("Running Fast Mode...")
            fast_res = run_query_timing(q, thinking_mode=False)
            print("Running Thinking Mode...")
            think_res = run_query_timing(q, thinking_mode=True)
            after_results.append((fast_res, think_res))
            
    finally:
        deactivate_patches()

    # --- Print Comparison Report ---
    print("\n\n========================================================")
    print("                    LATENCY REPORT                      ")
    print("========================================================\n")
    
    for i, q in enumerate(questions):
        print(f"Test {i+1} - {q[:45]}...")
        fast_bef, think_bef = before_results[i]
        fast_aft, think_aft = after_results[i]
        
        headers = ["Metric", "Fast Before", "Fast After", "Thinking Before", "Thinking After"]
        metrics = [
            ("Planner duration", f"{fast_bef['planner_duration']:.1f} ms", f"{fast_aft['planner_duration']:.1f} ms", f"{think_bef['planner_duration']:.1f} ms", f"{think_aft['planner_duration']:.1f} ms"),
            ("Preflight duration", f"{fast_bef['preflight_duration']:.1f} ms", f"{fast_aft['preflight_duration']:.1f} ms", f"{think_bef['preflight_duration']:.1f} ms", f"{think_aft['preflight_duration']:.1f} ms"),
            ("Context + RAG gathering", f"{fast_bef['context_gathering']:.1f} ms", f"{fast_aft['context_gathering']:.1f} ms", f"{think_bef['context_gathering']:.1f} ms", f"{think_aft['context_gathering']:.1f} ms"),
            ("Requested model", fast_bef['requested_model'], fast_aft['requested_model'], think_bef['requested_model'], think_aft['requested_model']),
            ("First actual model attempted", fast_bef['actual_model'], fast_aft['actual_model'], think_bef['actual_model'], think_aft['actual_model']),
            ("`/no_think` enabled", str(fast_bef['no_think_enabled']), str(fast_aft['no_think_enabled']), str(think_bef['no_think_enabled']), str(think_aft['no_think_enabled'])),
            ("`enable_deep_final_reasoning`", str(fast_bef['enable_deep_final_reasoning']), str(fast_aft['enable_deep_final_reasoning']), str(think_bef['enable_deep_final_reasoning']), str(think_aft['enable_deep_final_reasoning'])),
            ("Main model start -> first delta", f"{fast_bef['first_visible_delta']:.1f} ms", f"{fast_aft['first_visible_delta']:.1f} ms", f"{think_bef['first_visible_delta']:.1f} ms", f"{think_aft['first_visible_delta']:.1f} ms"),
            ("Total duration", f"{fast_bef['total_duration']:.1f} ms", f"{fast_aft['total_duration']:.1f} ms", f"{think_bef['total_duration']:.1f} ms", f"{think_aft['total_duration']:.1f} ms"),
        ]
        
        row_format = "{:<32} | {:>15} | {:>15} | {:>15} | {:>15}"
        print(row_format.format(*headers))
        print("-" * 100)
        for m in metrics:
            print(row_format.format(*m))
        print("\n" + "="*80 + "\n")
        
        # Also print the specific planner routing parameters for the thinking test
        print(f"Thinking Mode Planner Decisions for Test {i+1}:")
        params = think_aft['pipeline_params']
        print(f"  rag_chunk_count:             {params.get('rag_chunk_count')}")
        print(f"  run_web_search:              {params.get('run_web_search')}")
        print(f"  fetch_timetable:             {params.get('fetch_timetable')}")
        print(f"  fetch_faculty:               {params.get('fetch_faculty')}")
        print(f"  enable_deep_final_reasoning: {params.get('enable_deep_final_reasoning')}")
        print("\n" + "="*80 + "\n")

if __name__ == "__main__":
    main()
