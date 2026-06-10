from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from inventory_drive_file_locations import (
    BACKEND_DIR,
    classify_file,
    is_application_like_file,
    list_drive_files,
    load_backend_env,
    load_known_drive_ids,
    require_env,
)


def move_file_to_folder(service, *, file_id: str, folder_id: str) -> dict[str, Any]:
    file_metadata = service.files().get(fileId=file_id, fields="parents").execute()
    previous_parents = ",".join(file_metadata.get("parents") or [])
    return service.files().update(
        fileId=file_id,
        addParents=folder_id,
        removeParents=previous_parents,
        fields="id,name,parents",
    ).execute()


def main() -> int:
    parser = argparse.ArgumentParser(description="Move known PANSGPT root Drive files into the configured folder.")
    parser.add_argument("--apply", action="store_true", help="Actually move known files. Defaults to dry-run.")
    args = parser.parse_args()

    load_backend_env()
    os.chdir(BACKEND_DIR)
    from google_drive import get_drive_service

    folder_id = require_env("GOOGLE_DRIVE_FOLDER_ID")
    service = get_drive_service().service
    folder = service.files().get(fileId=folder_id, fields="id,name,mimeType,trashed").execute()
    if folder.get("mimeType") != "application/vnd.google-apps.folder" or folder.get("trashed"):
        raise RuntimeError("GOOGLE_DRIVE_FOLDER_ID does not point to an active Drive folder")

    known = load_known_drive_ids()
    root_files = [row for row in list_drive_files(service, "'root' in parents and trashed=false") if is_application_like_file(row)]

    known_root_files = []
    unknown_root_files = []
    for row in root_files:
        classification = classify_file(row, known)
        report_row = {
            "id": row.get("id"),
            "name": row.get("name"),
            "mimeType": row.get("mimeType"),
            "createdTime": row.get("createdTime"),
            "classification": classification,
            "matches": known.get(row.get("id"), []),
        }
        if classification in {"known pans_library file", "known lecturer submission file"}:
            known_root_files.append(report_row)
        else:
            unknown_root_files.append(report_row)

    moved = []
    failed = []
    if args.apply:
        for row in known_root_files:
            try:
                moved.append(move_file_to_folder(service, file_id=row["id"], folder_id=folder_id))
            except Exception as exc:
                failed.append({"id": row["id"], "name": row["name"], "error": str(exc)})

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "configured_folder": {"id": folder.get("id"), "name": folder.get("name")},
        "known_root_files_count": len(known_root_files),
        "unknown_root_files_count": len(unknown_root_files),
        "would_move": known_root_files,
        "left_untouched": unknown_root_files,
        "moved": moved,
        "failed": failed,
    }, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
