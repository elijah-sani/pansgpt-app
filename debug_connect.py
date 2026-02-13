import requests
import sys

try:
    print("Attempting to connect to http://127.0.0.1:8000/sys/status...")
    response = requests.get("http://127.0.0.1:8000/sys/status", timeout=5)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    print("✅ Connection Successful")
except Exception as e:
    print(f"❌ Connection Failed: {e}")
    sys.exit(1)
