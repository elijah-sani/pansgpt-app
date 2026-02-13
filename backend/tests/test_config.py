import os
from dotenv import load_dotenv
from groq import Groq
from supabase import create_client

def test_connections():
    print("Loading environment variables...")
    load_dotenv()
    
    groq_key = os.getenv("GROQ_API_KEY")
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    missing = []
    if not groq_key: missing.append("GROQ_API_KEY")
    if not supabase_url: missing.append("SUPABASE_URL")
    if not supabase_key: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    
    if missing:
        print(f"❌ Missing keys in .env: {', '.join(missing)}")
        return

    print("✅ Keys found.")

    # Test Groq
    try:
        client = Groq(api_key=groq_key)
        # Just a simple local check, not making a call to save tokens/avoid 401 if strict
        print("✅ Groq client initialized.")
    except Exception as e:
        print(f"❌ Groq init failed: {e}")

    # Test Supabase
    try:
        supabase = create_client(supabase_url, supabase_key)
        print("✅ Supabase client initialized.")
    except Exception as e:
        print(f"❌ Supabase init failed: {e}")

if __name__ == "__main__":
    test_connections()
