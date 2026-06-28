import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from api import app  # noqa: E402
from dependencies import User  # noqa: E402
from routers import admin, library  # noqa: E402
import api as main_api  # noqa: E402


def _student_user() -> User:
    return User(id="student-1", email="student@example.com")


def _admin_user() -> User:
    return User(id="admin-1", email="admin@example.com")


class _DummyResponse:
    def __init__(self, data):
        self.data = data


class _DummyTable:
    def __init__(self, name: str, state: dict):
        self.name = name
        self.state = state
        self._operation = None
        self._payload = None

    def select(self, *args, **kwargs):
        self._operation = "select"
        return self

    def eq(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def upsert(self, payload, **kwargs):
        self._operation = "upsert"
        self._payload = payload
        self.state["last_upsert"] = payload
        return self

    def execute(self):
        if self.name == "pans_library":
            return _DummyResponse(self.state.get("library_rows", []))
        if self.name == "document_progress":
            if self._operation == "upsert":
                return _DummyResponse([self._payload])
            return _DummyResponse(self.state.get("progress_rows", []))
        if self.name == "academic_contexts":
            if self._operation == "upsert":
                return _DummyResponse([self._payload])
            return _DummyResponse(self.state.get("academic_context_rows", []))
        return _DummyResponse([])


class _DummySupabase:
    def __init__(self, state: dict):
        self.state = state

    def table(self, name: str):
        return _DummyTable(name, self.state)


@pytest.fixture()
def client():
    async def _allow_api_key(x_api_key: str = "test"):
        return True

    app.dependency_overrides[library.verify_api_key] = _allow_api_key
    app.dependency_overrides[admin.verify_api_key] = _allow_api_key

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_progress_route_rejects_inaccessible_document(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    async def _current_user():
        return _student_user()

    async def _deny_access(sb, current_user, db_record):
        return False

    state = {
        "library_rows": [{"id": "doc-1", "drive_file_id": "drive-1", "university_id": "u-1", "target_levels": ["400lvl"]}],
        "progress_rows": [],
    }

    app.dependency_overrides[library.get_current_user] = _current_user
    monkeypatch.setattr(library, "supabase_service_client", _DummySupabase(state))
    monkeypatch.setattr(main_api, "_can_user_access_library_document", _deny_access)

    response = client.get("/admin/documents/drive-1/progress", headers={"x-api-key": "test"})

    assert response.status_code == 403
    assert "do not have access" in response.text.lower()


def test_progress_route_upserts_when_document_is_accessible(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    async def _current_user():
        return _student_user()

    async def _allow_access(sb, current_user, db_record):
        return True

    state = {
        "library_rows": [{"id": "doc-1", "drive_file_id": "drive-1", "university_id": "u-1", "target_levels": ["400lvl"]}],
        "progress_rows": [],
    }

    app.dependency_overrides[library.get_current_user] = _current_user
    monkeypatch.setattr(library, "supabase_service_client", _DummySupabase(state))
    monkeypatch.setattr(main_api, "_can_user_access_library_document", _allow_access)

    response = client.post(
        "/admin/documents/drive-1/progress",
        headers={"x-api-key": "test"},
        json={"current_page": 7, "total_pages": 42},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert state["last_upsert"]["user_id"] == "student-1"
    assert state["last_upsert"]["document_id"] == "drive-1"
    assert state["last_upsert"]["current_page"] == 7
    assert state["last_upsert"]["total_pages"] == 42


def test_get_academic_context_returns_scoped_context(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    async def _current_admin():
        return _admin_user()

    async def _resolve_workspace_scope(current_user, requested_university_id=None):
        return "11111111-1111-1111-1111-111111111111"

    async def _validate_context_university(sb, university_id):
        return None

    async def _get_context(university_id):
        return {
            "university_id": university_id,
            "current_academic_session": "2025/2026",
            "current_semester": "second",
        }

    app.dependency_overrides[admin.get_current_admin] = _current_admin
    monkeypatch.setattr(admin, "_resolve_workspace_scope", _resolve_workspace_scope)
    monkeypatch.setattr(admin, "_validate_academic_context_university", _validate_context_university)
    monkeypatch.setattr(admin.shared, "supabase_client", object())
    monkeypatch.setattr(admin.shared, "supabase_service_client", object())
    monkeypatch.setattr(admin.shared, "get_current_academic_context", _get_context)

    response = client.get("/admin/academic-context", headers={"x-api-key": "test"})

    assert response.status_code == 200
    assert response.json()["context"]["current_academic_session"] == "2025/2026"
    assert response.json()["context"]["current_semester"] == "second"


def test_upsert_academic_context_rejects_blank_session(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    async def _current_admin():
        return _admin_user()

    async def _resolve_workspace_scope(current_user, requested_university_id=None):
        return "11111111-1111-1111-1111-111111111111"

    app.dependency_overrides[admin.get_current_admin] = _current_admin
    monkeypatch.setattr(admin, "_resolve_workspace_scope", _resolve_workspace_scope)
    monkeypatch.setattr(admin.shared, "supabase_client", object())

    response = client.put(
        "/admin/academic-context",
        headers={"x-api-key": "test"},
        json={
            "university_id": "11111111-1111-1111-1111-111111111111",
            "current_academic_session": "   ",
            "current_semester": "second",
        },
    )

    assert response.status_code == 400
    assert "current_academic_session is required" in response.text


def test_rollover_academic_context_dry_run_returns_rpc_payload(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    async def _current_admin():
        return _admin_user()

    async def _resolve_workspace_scope(current_user, requested_university_id=None):
        return "11111111-1111-1111-1111-111111111111"

    async def _validate_context_university(sb, university_id):
        return None

    async def _execute_with_retry(execute_fn, operation_name):
        return SimpleNamespace(
            data=[{
                "dry_run": True,
                "university_id": "11111111-1111-1111-1111-111111111111",
                "previous_academic_session": "2024/2025",
                "previous_semester": "first",
                "new_academic_session": "2025/2026",
                "new_semester": "second",
                "archived_count": 12,
            }]
        )

    app.dependency_overrides[admin.get_current_admin] = _current_admin
    monkeypatch.setattr(admin, "_resolve_workspace_scope", _resolve_workspace_scope)
    monkeypatch.setattr(admin, "_validate_academic_context_university", _validate_context_university)
    monkeypatch.setattr(admin, "_execute_with_retry", _execute_with_retry)
    monkeypatch.setattr(admin.shared, "supabase_client", object())
    monkeypatch.setattr(admin.shared, "supabase_service_client", _DummySupabase({}))

    response = client.post(
        "/admin/academic-context/rollover",
        headers={"x-api-key": "test"},
        json={
            "university_id": "11111111-1111-1111-1111-111111111111",
            "new_academic_session": "2025/2026",
            "new_semester": "second",
            "archive_previous_active_materials": True,
            "dry_run": True,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dry_run"] is True
    assert payload["archived_count"] == 12
    assert payload["previous_context"]["current_academic_session"] == "2024/2025"
    assert payload["new_context"]["current_semester"] == "second"
