import os
import shutil
import subprocess
import tempfile
from typing import Optional

from fastapi import HTTPException


SUPPORTED_CONVERSION_INPUT_TYPES = {"doc", "docx", "ppt", "pptx"}
SUPPORTED_PDF_UPLOAD_TYPES = {"pdf"}
SUPPORTED_ADMIN_UPLOAD_TYPES = SUPPORTED_PDF_UPLOAD_TYPES | SUPPORTED_CONVERSION_INPUT_TYPES
PDF_CONVERSION_UNAVAILABLE_MESSAGE = "PDF conversion is not available on this server yet."


def detect_admin_upload_file_type(
    file_name: Optional[str],
    mime_type: Optional[str],
) -> tuple[Optional[str], Optional[str], bool, bool]:
    normalized_file_name = str(file_name or "").strip()
    normalized_mime_type = str(mime_type or "").strip().lower() or None

    file_type = None
    _, ext = os.path.splitext(normalized_file_name)
    if ext:
        file_type = ext.lstrip(".").strip().lower() or None

    if not file_type and normalized_mime_type == "application/pdf":
        file_type = "pdf"

    is_supported = file_type in SUPPORTED_ADMIN_UPLOAD_TYPES
    requires_conversion = file_type in SUPPORTED_CONVERSION_INPUT_TYPES
    return file_type, normalized_mime_type, is_supported, requires_conversion


def _find_soffice_binary() -> Optional[str]:
    candidates = [
        shutil.which("soffice"),
        shutil.which("soffice.exe"),
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def convert_office_file_to_pdf(*, source_bytes: bytes, source_file_name: str) -> tuple[str, bytes]:
    soffice_binary = _find_soffice_binary()
    if not soffice_binary:
        raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)

    source_name = (source_file_name or "").strip()
    base_name, ext = os.path.splitext(source_name)
    normalized_ext = ext.lstrip(".").lower()
    if normalized_ext not in SUPPORTED_CONVERSION_INPUT_TYPES:
        raise HTTPException(status_code=400, detail="Only DOC, DOCX, PPT, and PPTX files can be converted to PDF.")

    safe_base_name = (base_name or "library-material").strip() or "library-material"
    output_name = f"{safe_base_name}.pdf"

    with tempfile.TemporaryDirectory(prefix="material-convert-") as temp_dir:
        input_path = os.path.join(temp_dir, source_name or f"source.{normalized_ext}")
        with open(input_path, "wb") as source_file:
            source_file.write(source_bytes)

        command = [
            soffice_binary,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            temp_dir,
            input_path,
        ]

        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)
        except Exception:
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)

        output_path = os.path.join(temp_dir, output_name)
        if completed.returncode != 0 or not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail=PDF_CONVERSION_UNAVAILABLE_MESSAGE)

        with open(output_path, "rb") as output_file:
            return output_name, output_file.read()
