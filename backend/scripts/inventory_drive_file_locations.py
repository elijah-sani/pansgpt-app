from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import requests


BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent

sys.path.insert(0, str(BACKEND_DIR))


def load_backend_env() -> None:
    env_path = BACKEND_DIR / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value


def extract_drive_file_id(value: str | None) -> str | None:
    if not value:
        return None
    for pattern in (r"/file/d/([^/?#]+)", r"[?&]id=([^&#]+)", r"/d/([^/?#]+)"):
        match = re.search(pattern, value)
        if match:
            return match.group(1)
    return None


def is_application_like_file(file_row: dict[str, Any]) -> bool:
    name = str(file_row.get("name") or "")
    mime_type = str(file_row.get("mimeType") or "")
    if name.startswith("lecturer-material-"):
        return True
    if re.match(r"^[0-9a-fA-F-]{36}\.[A-Za-z0-9]+$", name):
        return True
    if name.lower().endswith((".pdf", ".pptx", ".ppt", ".docx", ".doc")):
        return True
    return mime_type in {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    }


def supabase_get(table: str, select: str, *, fallback_select: str | None = None) -> list[dict[str, Any]]:
    url = ((os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").strip()).rstrip("/")
    if not url:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is not configured")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }

    def request(select_clause: str) -> requests.Response:
        return requests.get(
            f"{url}/rest/v1/{table}",
            headers=headers,
            params={"select": select_clause, "limit": "10000"},
            timeout=60,
        )

    response = request(select)
    if response.status_code >= 400 and fallback_select and "does not exist" in response.text:
        response = request(fallback_select)
    response.raise_for_status()
    return response.json()


def load_known_drive_ids() -> dict[str, list[dict[str, Any]]]:
    known: dict[str, list[dict[str, Any]]] = {}

    library_rows = supabase_get(
        "pans_library",
        "id,title,drive_file_id,source_type,embedding_status,material_status",
    )
    for row in library_rows:
        drive_id = row.get("drive_file_id")
        if drive_id:
            known.setdefault(drive_id, []).append({"type": "pans_library", **row})

    submission_rows = supabase_get(
        "lecturer_material_submissions",
        "id,title,status,drive_file_id,original_drive_file_id,converted_drive_file_id,file_url,pans_library_id",
        fallback_select="id,title,status,file_url,pans_library_id",
    )
    for row in submission_rows:
        drive_ids = {
            row.get("drive_file_id"),
            row.get("original_drive_file_id"),
            row.get("converted_drive_file_id"),
            extract_drive_file_id(row.get("file_url")),
        }
        for drive_id in drive_ids:
            if drive_id:
                known.setdefault(drive_id, []).append({"type": "lecturer_material_submission", **row})

    return known


def list_drive_files(service, query: str) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    page_token = None
    while True:
        response = service.files().list(
            q=query,
            pageSize=1000,
            pageToken=page_token,
            fields="nextPageToken,files(id,name,mimeType,size,createdTime,parents)",
        ).execute()
        files.extend(response.get("files", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            return files


def classify_file(file_row: dict[str, Any], known: dict[str, list[dict[str, Any]]]) -> str:
    matches = known.get(file_row.get("id"), [])
    if any(match.get("type") == "pans_library" for match in matches):
        return "known pans_library file"
    if any(match.get("type") == "lecturer_material_submission" for match in matches):
        return "known lecturer submission file"
    return "unknown/orphan candidate"


def main() -> int:
    load_backend_env()
    os.chdir(BACKEND_DIR)
    from google_drive import get_drive_service

    folder_id = require_env("GOOGLE_DRIVE_FOLDER_ID")
    service = get_drive_service()
    folder = service.service.files().get(fileId=folder_id, fields="id,name,mimeType,trashed").execute()
    if folder.get("mimeType") != "application/vnd.google-apps.folder" or folder.get("trashed"):
        raise RuntimeError("GOOGLE_DRIVE_FOLDER_ID does not point to an active Drive folder")

    known = load_known_drive_ids()
    root_files = [row for row in list_drive_files(service.service, "'root' in parents and trashed=false") if is_application_like_file(row)]
    folder_files = [row for row in list_drive_files(service.service, f"'{folder_id}' in parents and trashed=false") if is_application_like_file(row)]

    root_report = [
        {
            "id": row.get("id"),
            "name": row.get("name"),
            "mimeType": row.get("mimeType"),
            "createdTime": row.get("createdTime"),
            "classification": classify_file(row, known),
            "matches": known.get(row.get("id"), []),
        }
        for row in root_files
    ]
    folder_report = [
        {
            "id": row.get("id"),
            "name": row.get("name"),
            "mimeType": row.get("mimeType"),
            "createdTime": row.get("createdTime"),
            "classification": classify_file(row, known),
        }
        for row in folder_files
    ]

    summary = {
        "configured_folder": {"id": folder.get("id"), "name": folder.get("name")},
        "root_application_like_count": len(root_report),
        "folder_application_like_count": len(folder_report),
        "root_known_pans_library_count": sum(1 for row in root_report if row["classification"] == "known pans_library file"),
        "root_known_lecturer_submission_count": sum(1 for row in root_report if row["classification"] == "known lecturer submission file"),
        "root_unknown_orphan_candidate_count": sum(1 for row in root_report if row["classification"] == "unknown/orphan candidate"),
    }
    print(json.dumps({"summary": summary, "root_files": root_report, "folder_files": folder_report}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
