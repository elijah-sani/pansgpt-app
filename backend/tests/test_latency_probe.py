import time
import os
from dotenv import load_dotenv
from backend.google_drive import get_drive_service

# Load environment variables
load_dotenv()

def test_drive_latency():
    print("--- Starting Latency Probe ---")
    
    # 1. Initialize Service
    start_init = time.time()
    try:
        service = get_drive_service()
        end_init = time.time()
        print(f"[INFO] Service Init: {(end_init - start_init):.4f}s")
    except Exception as e:
        print(f"[ERROR] Service Init Failed: {e}")
        return

    folder_id = os.getenv("GOOGLE_DRIVE_FOLDER_ID")
    if not folder_id:
        print("[ERROR] GOOGLE_DRIVE_FOLDER_ID not set")
        return

    # 2. List Files
    print(f"Listing files in folder: {folder_id}")
    start_list = time.time()
    try:
        files = service.list_files(folder_id=folder_id, mime_type='application/pdf')
        end_list = time.time()
        duration = end_list - start_list
        print(f"[INFO] List Files Success: {len(files)} files found")
        print(f"[INFO] API Latency: {duration:.4f}s")
        
        if duration > 2.0:
            print("[WARNING] API response is SLOW (> 2.0s)")
        else:
            print("[INFO] Performance is GOOD (< 2.0s)")
            
    except Exception as e:
        print(f"[ERROR] List Files Failed: {e}")

if __name__ == "__main__":
    test_drive_latency()

