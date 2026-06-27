import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services import pdf_conversion  # noqa: E402


def test_detect_admin_upload_file_type_supports_pdf_and_office_inputs():
    pdf_type = pdf_conversion.detect_admin_upload_file_type("lecture.pdf", "application/pdf")
    assert pdf_type == ("pdf", "application/pdf", True, False)

    docx_type = pdf_conversion.detect_admin_upload_file_type(
        "slides.DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    assert docx_type == (
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        True,
        True,
    )

    ppt_type = pdf_conversion.detect_admin_upload_file_type("deck.ppt", "application/vnd.ms-powerpoint")
    assert ppt_type == ("ppt", "application/vnd.ms-powerpoint", True, True)


def test_detect_admin_upload_file_type_rejects_unsupported_files():
    file_type = pdf_conversion.detect_admin_upload_file_type("notes.txt", "text/plain")
    assert file_type == ("txt", "text/plain", False, False)


def test_convert_office_file_to_pdf_requires_server_converter(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(pdf_conversion, "_find_soffice_binary", lambda: None)

    with pytest.raises(HTTPException, match=pdf_conversion.PDF_CONVERSION_UNAVAILABLE_MESSAGE):
        pdf_conversion.convert_office_file_to_pdf(
            source_bytes=b"fake",
            source_file_name="lecture.docx",
        )
