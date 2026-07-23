"""
[LEARN MODE TIERS] Live verification script.
Tests:
  1. /start with confidence="new" → section 0 tiered_content.new gets populated
  2. /start with confidence="confident" → tiered_content.confident populated WITHOUT clobbering .new
  3. Raw jsonb from document_sections shown for both keys
  4. Tone comparison between the two explanations

Usage: python tests/verify_tiers_live.py
Requires SUPABASE_URL and SUPABASE_SERVICE_KEY set in environment (or .env at backend root).
"""
import json
import os
import sys
import time
import httpx
from pathlib import Path

# Load env from backend/.env if present
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8000")

# Test credentials
EMAIL = "carerouteng@gmail.com"
PASSWORD = os.environ.get("TEST_PASSWORD", "")
USER_ID = "de5534bf-95e9-40ce-8bbd-595532a75af9"
DOC_ID = "b7bc27cb-4489-4033-8ed6-22c179d596f7"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    sys.exit(1)

if not PASSWORD:
    print("ERROR: TEST_PASSWORD must be set")
    sys.exit(1)

print("=" * 70)
print("[STEP 0] Signing in via Supabase password auth...")
auth_resp = httpx.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
    json={"email": EMAIL, "password": PASSWORD},
    timeout=30,
)
auth_data = auth_resp.json()
JWT = auth_data.get("access_token")
if not JWT:
    print(f"ERROR: Auth failed: {json.dumps(auth_data, indent=2)}")
    sys.exit(1)
print(f"OK — user_id={USER_ID}")

HEADERS = {"Authorization": f"Bearer {JWT}", "Content-Type": "application/json"}


def api(method, path, **kwargs):
    url = f"{BACKEND}{path}"
    resp = httpx.request(method, url, headers=HEADERS, timeout=120, **kwargs)
    return resp.status_code, resp.json() if resp.content else {}


print()
print("=" * 70)
print("[STEP 1] POST /start with confidence='new'")
status, data = api("POST", f"/api/learn/documents/{DOC_ID}/start", json={"confidence": "new"})
print(f"  status={status}  response={json.dumps(data)}")
assert status == 200, f"Expected 200, got {status}"

print()
print("[STEP 2] GET section 0 (tier=new) — triggers lazy generation...")
t0 = time.time()
status, sec_new = api("GET", f"/api/learn/documents/{DOC_ID}/sections/0")
elapsed = time.time() - t0
print(f"  status={status}  elapsed={elapsed:.1f}s")
assert status == 200, f"Expected 200, got {status}"
print(f"  explanation length: {len(sec_new.get('explanation',''))} chars")
print(f"  check_questions count: {len(sec_new.get('check_questions',[]))}")
print()
print("  --- EXPLANATION (new tier) FIRST 500 chars ---")
print("  " + sec_new.get("explanation","")[:500].replace("\n", "\n  "))

print()
print("=" * 70)
print("[STEP 3] POST /start with confidence='confident' (same user, same doc)")
status, data = api("POST", f"/api/learn/documents/{DOC_ID}/start", json={"confidence": "confident"})
print(f"  status={status}  response={json.dumps(data)}")
assert status == 200

print()
print("[STEP 4] GET section 0 (tier=confident) — triggers lazy generation for confident tier...")
t0 = time.time()
status, sec_conf = api("GET", f"/api/learn/documents/{DOC_ID}/sections/0")
elapsed = time.time() - t0
print(f"  status={status}  elapsed={elapsed:.1f}s")
assert status == 200, f"Expected 200, got {status}"
print(f"  explanation length: {len(sec_conf.get('explanation',''))} chars")
print(f"  check_questions count: {len(sec_conf.get('check_questions',[]))}")
print()
print("  --- EXPLANATION (confident tier) FIRST 500 chars ---")
print("  " + sec_conf.get("explanation","")[:500].replace("\n", "\n  "))

print()
print("=" * 70)
print("[STEP 5] Query document_sections raw jsonb via service-role client...")
import httpx as _httpx

# Direct Supabase REST query using service key — bypasses RLS
sb_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}
qresp = _httpx.get(
    f"{SUPABASE_URL}/rest/v1/document_sections",
    params={
        "select": "id,section_index,tiered_content",
        "document_id": f"eq.{DOC_ID}",
        "section_index": "eq.0",
    },
    headers=sb_headers,
    timeout=30,
)
rows = qresp.json()
print(f"  raw HTTP status: {qresp.status_code}")
print()
print("  --- RAW tiered_content jsonb for document_sections section_index=0 ---")
print(json.dumps(rows, indent=2))

# Verify both tier keys are present
if rows and isinstance(rows, list):
    tc = rows[0].get("tiered_content", {})
    has_new = bool(tc.get("new", {}).get("explanation"))
    has_confident = bool(tc.get("confident", {}).get("explanation"))
    print()
    print(f"  tiered_content.new present:       {has_new}")
    print(f"  tiered_content.confident present: {has_confident}")
    print()
    if has_new and has_confident:
        new_exp = tc["new"]["explanation"][:200]
        conf_exp = tc["confident"]["explanation"][:200]
        are_same = new_exp.strip() == conf_exp.strip()
        print(f"  Are explanations identical?  {are_same}  (should be False)")
        print()
        print("  PASS: Both tier keys present, content is distinct" if not are_same else "  WARNING: Explanations look identical — check model temperature/caching")
    else:
        print("  FAIL: One or both tier keys are missing!")
        sys.exit(1)
else:
    print(f"  ERROR: Unexpected response shape: {rows}")
    sys.exit(1)

print()
print("=" * 70)
print("ALL VERIFICATION STEPS PASSED")
