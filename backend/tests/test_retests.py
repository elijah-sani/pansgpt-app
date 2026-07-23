import os
import sys
import json
import time
import httpx
from dotenv import load_dotenv
from supabase import create_client

# Load environment
dotenv_path = r"c:\Users\GODGIVE COMPUTER LTD\Desktop\PansGPT Migration\pansgpt-eli\backend\.env"
load_dotenv(dotenv_path=dotenv_path)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
ANON_KEY     = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
API_KEYS_RAW = os.environ.get("API_KEYS")

if not API_KEYS_RAW or not SUPABASE_URL or not SERVICE_KEY:
    if "pytest" in sys.modules or any("pytest" in arg for arg in sys.argv):
        import pytest
        pytest.skip("Skipping live database E2E tests: missing credentials", allow_module_level=True)
    else:
        print("[SKIP] Skipping live database E2E tests: missing credentials in environment.")
        sys.exit(0)

API_KEY      = API_KEYS_RAW.split(",")[0].strip()
BACKEND      = "http://localhost:8000"
DOC_ID       = "b7bc27cb-4489-4033-8ed6-22c179d596f7"

STUDENT_EMAIL    = "carerouteng@gmail.com"
STUDENT_PASSWORD = "Ojonugwa"

print("======================================================================")
print("[AUTH] Signing in via Supabase password auth...")
anon_sb = create_client(SUPABASE_URL, ANON_KEY)
sign_in = anon_sb.auth.sign_in_with_password({
    "email": STUDENT_EMAIL,
    "password": STUDENT_PASSWORD,
})
JWT = sign_in.session.access_token
USER_ID = sign_in.user.id
print(f"[AUTH] User ID: {USER_ID}")
print("======================================================================")

# Service client for direct DB checks
db = create_client(SUPABASE_URL, SERVICE_KEY)

headers = {
    "Authorization": f"Bearer {JWT}",
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
}

# ---------------------------------------------------------
# STEP 1: GET /sections/2
# ---------------------------------------------------------
print("\n--- STEP 1: GET /api/learn/documents/{doc_id}/sections/2 ---")
url = f"{BACKEND}/api/learn/documents/{DOC_ID}/sections/2"
r = httpx.get(url, headers=headers, timeout=60)
print(f"HTTP Status: {r.status_code}")
sec2_data = r.json()
print(json.dumps(sec2_data, indent=2))

questions = sec2_data.get("check_questions") or []
print(f"Regular question count: {len(questions)}")
retest_flags = [q.get("is_retest") for q in questions if "is_retest" in q]
print(f"Retest flags present in questions: {retest_flags}")

if not questions:
    print("[ERROR] No questions returned for Section 2. Stop.")
    sys.exit(1)

# ---------------------------------------------------------
# STEP 2: Answer one question WRONG in section 2
# ---------------------------------------------------------
print("\n--- STEP 2: POST /api/learn/documents/{doc_id}/sections/2/answer (WRONG) ---")
# Submit a deliberately wrong answer
q0 = questions[0]
correct = q0.get("correct_answer")
wrong = "B" if correct != "B" else "A"
print(f"Q0 Correct answer: {correct}, Submitting wrong answer: {wrong}")

url_ans = f"{BACKEND}/api/learn/documents/{DOC_ID}/sections/2/answer"
ans_body = {
    "question_index": 0,
    "selected_option": wrong
}
r = httpx.post(url_ans, headers=headers, json=ans_body, timeout=60)
print(f"HTTP Status: {r.status_code}")
ans_data = r.json()
print(json.dumps(ans_data, indent=2))

# ---------------------------------------------------------
# STEP 3: Wait 12 seconds for background generation
# ---------------------------------------------------------
print("\n--- STEP 3: Sleeping 12 seconds for background generation... ---")
time.sleep(12)

# ---------------------------------------------------------
# STEP 4: Query document_learn_pending_retests directly
# ---------------------------------------------------------
print("\n--- STEP 4: Directly query document_learn_pending_retests ---")
db_res = db.table("document_learn_pending_retests") \
           .select("*") \
           .eq("user_id", USER_ID) \
           .eq("document_id", DOC_ID) \
           .eq("target_section_index", 3) \
           .eq("resolved", False) \
           .execute()

retest_rows = db_res.data or []
print("RAW DB ROWS:")
print(json.dumps(retest_rows, indent=2))

if not retest_rows:
    print("[ERROR] No unresolved pending retests found for target_section_index=3. Stop.")
    sys.exit(1)

retest_row = retest_rows[0]
retest_id = retest_row["id"]
retest_q = retest_row["question"]

# ---------------------------------------------------------
# STEP 5: GET /sections/3
# ---------------------------------------------------------
print("\n--- STEP 5: GET /api/learn/documents/{doc_id}/sections/3 ---")
url_sec3 = f"{BACKEND}/api/learn/documents/{DOC_ID}/sections/3"
r = httpx.get(url_sec3, headers=headers, timeout=60)
print(f"HTTP Status: {r.status_code}")
sec3_data = r.json()
print(json.dumps(sec3_data, indent=2))

sec3_questions = sec3_data.get("check_questions") or []
print(f"Total questions (regular + retest): {len(sec3_questions)}")
retest_in_sec3 = [q for q in sec3_questions if q.get("is_retest") is True]
print(f"Retest questions found: {len(retest_in_sec3)}")
print("Retest question data:")
print(json.dumps(retest_in_sec3, indent=2))

# ---------------------------------------------------------
# STEP 6: Answer the retest question correctly
# ---------------------------------------------------------
print("\n--- STEP 6: POST /api/learn/documents/{doc_id}/sections/3/answer (Retest CORRECT) ---")
# The retest question index should be total_regular
# Let's find it in sec3_questions
retest_index = -1
for i, q in enumerate(sec3_questions):
    if q.get("is_retest") is True:
        retest_index = i
        break

if retest_index == -1:
    print("[ERROR] Could not locate retest question index in Section 3 response. Stop.")
    sys.exit(1)

retest_correct_answer = retest_q.get("correct_answer")
print(f"Retest question found at index {retest_index}. Correct answer is: {retest_correct_answer}")

url_ans3 = f"{BACKEND}/api/learn/documents/{DOC_ID}/sections/3/answer"
ans3_body = {
    "question_index": retest_index,
    "selected_option": retest_correct_answer
}
r = httpx.post(url_ans3, headers=headers, json=ans3_body, timeout=60)
print(f"HTTP Status: {r.status_code}")
ans3_data = r.json()
print(json.dumps(ans3_data, indent=2))

# ---------------------------------------------------------
# STEP 7: Query document_learn_pending_retests by row id
# ---------------------------------------------------------
print("\n--- STEP 7: Query retest row by ID to confirm resolution ---")
db_res2 = db.table("document_learn_pending_retests") \
            .select("*") \
            .eq("id", retest_id) \
            .execute()
print("UPDATED DB ROW:")
print(json.dumps(db_res2.data, indent=2))

# ---------------------------------------------------------
# STEP 8: GET /sections/3 again
# ---------------------------------------------------------
print("\n--- STEP 8: GET /api/learn/documents/{doc_id}/sections/3 again ---")
r = httpx.get(url_sec3, headers=headers, timeout=60)
print(f"HTTP Status: {r.status_code}")
sec3_data_final = r.json()
print(json.dumps(sec3_data_final, indent=2))
sec3_questions_final = sec3_data_final.get("check_questions") or []
print(f"Final total questions count (should have no retests): {len(sec3_questions_final)}")
retests_remaining = [q for q in sec3_questions_final if q.get("is_retest") is True]
print(f"Remaining retest count: {len(retests_remaining)}")

print("\n======================================================================")
print("ALL LIVE TEST STEPS COMPLETE")
print("======================================================================")
