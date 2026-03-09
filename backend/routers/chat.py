# Compatibility shim - logic has been split into modular routers.
# Import set_dependencies explicitly so api.py can still call chat.set_dependencies()
from .shared import set_dependencies
from .chat_core import router as chat_core_router
from .chat_sessions import router as chat_sessions_router
from .timetable import router as timetable_router
from .admin import router as admin_router
from .feedback import router as feedback_router
