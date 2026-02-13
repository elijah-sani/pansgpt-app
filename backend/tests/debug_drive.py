import os
import sys
from api import DriveService, ROOT_FOLDER_ID

print(f"Root Folder ID: {ROOT_FOLDER_ID}")

try:
    print("Initializing DriveService...")
    drive = DriveService()
    print("DriveService initialized.")
    
    print("Listing PDFs...")
    files = drive.list_pdfs()
    print(f"Successfully found {len(files)} files.")
    for f in files:
        print(f" - {f.get('name')} ({f.get('id')})")
        
except Exception as e:
    print(f"\nERROR: {type(e).__name__}")
    print(str(e))
    # Print full traceback/details if possible
    import traceback
    traceback.print_exc()
