import os
from dotenv import load_dotenv
from supabase import create_client, Client
import logging

# Setup Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DebugChat")

load_dotenv()

# Simulate Env Loading Logic from api.py
print("--- Supabase Initialization Debug ---")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print(f"URL: {SUPABASE_URL}")
print(f"KEY: {SUPABASE_KEY[:10]}..." if SUPABASE_KEY else "None")

supabase_client = None
try:
    if SUPABASE_URL and SUPABASE_KEY:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[INFO] Supabase Client Initialized")
    else:
        print("[WARNING] Skipped Init")
except Exception as e:
    print(f"[ERROR] Failed to init: {e}")

PHARMACY_SYSTEM_PROMPT = "Default Prompt"

def simulate_chat_logic():
    print("\n--- Simulating ask_ai Logic ---")
    system_prompt = PHARMACY_SYSTEM_PROMPT
    temperature = 0.7
    
    if supabase_client:
        try:
            print("Attempting to fetch system_settings...")
            # Fetch config from DB
            settings_res = supabase_client.table("system_settings").select("system_prompt, temperature").eq("id", 1).execute()
            print(f"Raw Response: {settings_res}")
            
            if settings_res.data and len(settings_res.data) > 0:
                config = settings_res.data[0]
                print(f"Config Data: {config}")
                
                if config.get("system_prompt"):
                    system_prompt = config["system_prompt"]
                    print(f"Updated Prompt: {system_prompt[:20]}...")
                
                if config.get("temperature") is not None:
                    temperature = float(config["temperature"])
                    print(f"Updated Temp: {temperature} (Type: {type(temperature)})")
                    
                logger.info(f"[INFO] Using Dynamic Settings: Temp={temperature}, PromptLen={len(system_prompt)}")
        except Exception as e:
            logger.warning(f"[WARNING] Failed to fetch system settings, using defaults: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nFinal State -> Prompt: {system_prompt[:20]}..., Temp: {temperature}")

if __name__ == "__main__":
    simulate_chat_logic()


