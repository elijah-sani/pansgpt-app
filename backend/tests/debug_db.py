
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print(f"URL: {url}")
print(f"KEY: {key[:10]}...")

try:
    supabase = create_client(url, key)
    print("Client created.")
    
    # Try fetching
    print("Fetching system_settings...")
    res = supabase.table('system_settings').select('*').execute()
    print(f"Data: {res.data}")
    
    if not res.data:
        print("Table empty. Inserting default...")
        default_config = {
            "id": 1,
            "system_prompt": "You are a helpful AI assistant.",
            "temperature": 0.7,
            "maintenance_mode": False
        }
        ins = supabase.table('system_settings').insert(default_config).execute()
        print(f"Inserted: {ins.data}")

except Exception as e:
    print(f"Error: {e}")
