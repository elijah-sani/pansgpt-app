"""
learn_mode_e2e.py  -  End-to-end test for all 5 Learn Mode endpoints.
Uses direct password sign-in via supabase-py.
"""
import os
import sys
import time
import json
import httpx
from pathlib import Path
from dotenv import load_dotenv

# -- env -----------------------------------------------------------------------
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
ANON_KEY     = os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API_KEY      = os.environ["API_KEYS"].split(",")[0].strip()
BACKEND      = "http://localhost:8000"
DOC_ID       = "b7bc27cb-4489-4033-8ed6-22c179d596f7"

# Test account provided by project owner
STUDENT_EMAIL    = "carerouteng@gmail.com"
STUDENT_PASSWORD = "Ojonugwa"
TARGET_USER_ID   = "de5534bf-95e9-40ce-8bbd-595532a75af9"   # confirmed from profiles query

# -- helpers -------------------------------------------------------------------
def pp(label, data):
    print("\n" + "="*70)
    print("  " + label)
    print("="*70)
    if isinstance(data, (dict, list)):
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(data)

def sb_get(path):
    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

def api(method, path, jwt, body=None, label=None):
    url = f"{BACKEND}{path}"
    headers = {
        "Authorization": f"Bearer {jwt}",
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
    }
    t0 = time.perf_counter()
    if method == "GET":
        r = httpx.get(url, headers=headers, timeout=180)
    else:
        r = httpx.post(url, headers=headers, json=body or {}, timeout=180)
    elapsed = time.perf_counter() - t0

    print(f"\n[{method}] {path}  ->  HTTP {r.status_code}  ({elapsed:.2f}s)")
    try:
        data = r.json()
    except Exception:
        data = r.text
    if label:
        pp(label, data)
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False) if isinstance(data, (dict, list)) else data)
    return data, elapsed

# -- auth: real password sign-in -----------------------------------------------
print(f"\n[AUTH] Signing in as {STUDENT_EMAIL} via Supabase password auth...")

from supabase import create_client, ClientOptions

anon_sb = create_client(SUPABASE_URL, ANON_KEY)
try:
    sign_in = anon_sb.auth.sign_in_with_password({
        "email": STUDENT_EMAIL,
        "password": STUDENT_PASSWORD,
    })
    JWT = sign_in.session.access_token if sign_in.session else None
except Exception as exc:
    print(f"[AUTH ERROR] {exc}")
    JWT = None

if not JWT:
    print("[FATAL] Could not sign in. Check credentials.")
    sys.exit(1)

print(f"[AUTH] Sign-in OK. JWT: {JWT[:50]}...")
print(f"[AUTH] User ID: {sign_in.user.id if sign_in.user else 'unknown'}")

# confirm user ID matches
actual_uid = sign_in.user.id if sign_in.user else TARGET_USER_ID
TARGET_USER_ID = actual_uid

# =============================================================================
# STEP 1 -- POST /start
# =============================================================================
print("\n" + "#"*70)
print("STEP 1 -- POST /api/learn/documents/{doc_id}/start")
print("#"*70)
start_data, _ = api("POST", f"/api/learn/documents/{DOC_ID}/start", JWT,
                     label="STEP 1 -- POST /start response")

# =============================================================================
# STEP 2 -- GET /sections list
# =============================================================================
print("\n" + "#"*70)
print("STEP 2 -- GET /api/learn/documents/{doc_id}/sections")
print("#"*70)
sections_data, _ = api("GET", f"/api/learn/documents/{DOC_ID}/sections", JWT,
                        label="STEP 2 -- GET /sections response")

sections = (sections_data.get("sections") or []) if isinstance(sections_data, dict) else []
statuses = [s.get("status") for s in sections]
print(f"\n[CHECK] Total sections returned: {len(sections)}")
print(f"[CHECK] Statuses:                {statuses}")
print(f"[CHECK] All 'not_started':       {all(s == 'not_started' for s in statuses)}")

# =============================================================================
# STEP 3 -- GET /sections/0  call-1  (lazy LLM generation)
# =============================================================================
print("\n" + "#"*70)
print("STEP 3 -- GET /sections/0  (call 1 -- triggers lazy LLM generation)")
print("#"*70)
sec0_c1, elapsed1 = api("GET", f"/api/learn/documents/{DOC_ID}/sections/0", JWT,
                          label="STEP 3 -- GET /sections/0 call-1")

expl = (sec0_c1.get("explanation") or "") if isinstance(sec0_c1, dict) else ""
qs   = (sec0_c1.get("check_questions") or []) if isinstance(sec0_c1, dict) else []

print(f"\n[CHECK] explanation non-empty:   {bool(expl.strip())}")
print(f"[CHECK] explanation char count:  {len(expl)}")
print(f"[CHECK] check_questions count:   {len(qs)}")
for i, q in enumerate(qs):
    if not isinstance(q, dict):
        continue
    opts = q.get("options") or {}
    ca   = (q.get("correct_answer") or "").strip().upper()
    valid = ca in (list(opts.keys()) if isinstance(opts, dict) else [])
    expl_q = (q.get("explanation") or "").strip()
    print(f"  Q{i}: correct_answer='{ca}', in_options={valid}, "
          f"option_keys={sorted(opts.keys()) if isinstance(opts, dict) else opts}, "
          f"expl_len={len(expl_q)}")

# =============================================================================
# STEP 4 -- GET /sections/0  call-2  (should be instant from DB)
# =============================================================================
print("\n" + "#"*70)
print("STEP 4 -- GET /sections/0  (call 2 -- expect DB cache, no LLM)")
print("#"*70)
sec0_c2, elapsed2 = api("GET", f"/api/learn/documents/{DOC_ID}/sections/0", JWT,
                          label="STEP 4 -- GET /sections/0 call-2")

print(f"\n[TIMING] Call 1 (lazy LLM generate): {elapsed1:.2f}s")
print(f"[TIMING] Call 2 (from DB, no LLM):   {elapsed2:.2f}s")
print(f"[TIMING] Speedup factor:              {elapsed1 / max(elapsed2, 0.01):.1f}x")

# =============================================================================
# STEP 5 -- POST /answer WRONG
# =============================================================================
print("\n" + "#"*70)
print("STEP 5 -- POST /sections/0/answer -- deliberately WRONG answer")
print("#"*70)

q0         = qs[0] if qs else {}
correct_q0 = (q0.get("correct_answer") or "A").upper() if isinstance(q0, dict) else "A"
opts_q0    = (q0.get("options") or {}) if isinstance(q0, dict) else {}
wrong_opts = [k for k in ("A", "B", "C", "D") if k != correct_q0 and k in opts_q0]
wrong_ans  = wrong_opts[0] if wrong_opts else ("B" if correct_q0 != "B" else "A")

print(f"[SETUP] Q0 correct='{correct_q0}', submitting wrong='{wrong_ans}'")
wrong_resp, _ = api("POST", f"/api/learn/documents/{DOC_ID}/sections/0/answer", JWT,
                     body={"question_index": 0, "selected_option": wrong_ans},
                     label="STEP 5 -- POST /answer (wrong)")

if isinstance(wrong_resp, dict):
    followup = wrong_resp.get("followup_feedback") or ""
    print(f"\n[CHECK] correct:                 {wrong_resp.get('correct')}")
    print(f"[CHECK] correct_answer:          {wrong_resp.get('correct_answer')}")
    print(f"[CHECK] followup non-empty:      {bool(followup.strip())}")
    print(f"[CHECK] followup char count:     {len(followup)}")

# =============================================================================
# STEP 6 -- POST /answer CORRECT
# =============================================================================
print("\n" + "#"*70)
print("STEP 6 -- POST /sections/0/answer -- CORRECT answer for Q1")
print("#"*70)

q1_idx     = 1 if len(qs) > 1 else 0
q1         = qs[q1_idx] if len(qs) > q1_idx else qs[0]
correct_q1 = (q1.get("correct_answer") or "A").upper() if isinstance(q1, dict) else "A"

print(f"[SETUP] Q{q1_idx} correct='{correct_q1}', submitting correct='{correct_q1}'")
correct_resp, _ = api("POST", f"/api/learn/documents/{DOC_ID}/sections/0/answer", JWT,
                       body={"question_index": q1_idx, "selected_option": correct_q1},
                       label="STEP 6 -- POST /answer (correct)")

if isinstance(correct_resp, dict):
    print(f"\n[CHECK] correct:                 {correct_resp.get('correct')}")
    print(f"[CHECK] followup (expect None):  {correct_resp.get('followup_feedback')}")

# =============================================================================
# STEP 7 -- POST /complete  score=67 -> needs_review
# =============================================================================
print("\n" + "#"*70)
print("STEP 7 -- POST /sections/0/complete  score=67 -> expect 'needs_review'")
print("#"*70)
comp0, _ = api("POST", f"/api/learn/documents/{DOC_ID}/sections/0/complete", JWT,
                body={"score": 67},
                label="STEP 7 -- POST /complete score=67")

if isinstance(comp0, dict):
    print(f"\n[CHECK] status:     {comp0.get('status')}")
    print(f"[CHECK] last_score: {comp0.get('last_score')}")

print("\n[DB CHECK] Raw document_learn_progress row for section 0...")
raw0 = sb_get(
    f"document_learn_progress?user_id=eq.{TARGET_USER_ID}"
    f"&document_id=eq.{DOC_ID}&section_index=eq.0&select=*"
)
pp("STEP 7 -- Raw DB row (section 0)", raw0)

# =============================================================================
# STEP 8 -- Section 1: all correct -> mastered
# =============================================================================
print("\n" + "#"*70)
print("STEP 8 -- Section 1: visit -> answer ALL correct -> complete score=100 -> 'mastered'")
print("#"*70)

sec1_data, _ = api("GET", f"/api/learn/documents/{DOC_ID}/sections/1", JWT,
                    label="STEP 8a -- GET /sections/1 (lazy generate if needed)")

qs1 = (sec1_data.get("check_questions") or []) if isinstance(sec1_data, dict) else []
print(f"\n[CHECK] Section 1 check_questions count: {len(qs1)}")

for qi, q in enumerate(qs1):
    if not isinstance(q, dict):
        continue
    ca = (q.get("correct_answer") or "A").upper()
    print(f"\n  Answering Q{qi} correctly with '{ca}'...")
    ans_r, _ = api("POST", f"/api/learn/documents/{DOC_ID}/sections/1/answer", JWT,
                    body={"question_index": qi, "selected_option": ca},
                    label=f"  STEP 8b -- /sections/1/answer Q{qi}")
    if isinstance(ans_r, dict):
        print(f"  -> correct: {ans_r.get('correct')}")

comp1, _ = api("POST", f"/api/learn/documents/{DOC_ID}/sections/1/complete", JWT,
                body={"score": 100},
                label="STEP 8c -- POST /sections/1/complete score=100")

if isinstance(comp1, dict):
    print(f"\n[CHECK] status:     {comp1.get('status')}")
    print(f"[CHECK] last_score: {comp1.get('last_score')}")

raw1 = sb_get(
    f"document_learn_progress?user_id=eq.{TARGET_USER_ID}"
    f"&document_id=eq.{DOC_ID}&section_index=eq.1&select=*"
)
pp("STEP 8d -- Raw DB row (section 1)", raw1)

print("\n" + "="*70)
print("  ALL STEPS COMPLETE")
print("="*70)
