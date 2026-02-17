
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not url or not key:
    print("[ERROR] Missing Supabase credentials")
    exit(1)

supabase: Client = create_client(url, key)

print(f"Connecting to Supabase at {url}...")

# 1. Try to select from user_roles
try:
    response = supabase.table("user_roles").select("*").limit(1).execute()
    print("[INFO] Table 'user_roles' exists.")
    print("Row count sample:", len(response.data))
except Exception as e:
    print(f"[ERROR] Error accessing 'user_roles': {e}")
    print("Attempting to create/seed isn't directly possible via client unless using stored procedures or SQL editor usually, but knowing it fails confirms the issue.")

