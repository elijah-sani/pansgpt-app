"""
sanitize.py — shared input sanitization helpers for all PansGPT routers.

Rules applied to every user-supplied text field:
  1. Unescape HTML entities (e.g. &amp; → &)
  2. Strip all HTML/script tags
  3. Remove null bytes (U+0000) which can break DB drivers
  4. Truncate to the configured max length
  5. Strip leading/trailing whitespace

Limits (keep in sync with frontend constants in sanitize.ts):
  CHAT_MAX    = 4000 chars — chat message body
  NOTE_MAX    = 2000 chars — note annotation / personal note
  SEARCH_MAX  =  500 chars — library search query
  TITLE_MAX   =  120 chars — session / document title
"""

import re
import html as _html_module

# ── Length limits ────────────────────────────────────────────────────────────
CHAT_MAX: int = 4000
NOTE_MAX: int = 2000
SEARCH_MAX: int = 500
TITLE_MAX: int = 120

# ── Core helpers ─────────────────────────────────────────────────────────────
_TAG_RE = re.compile(r'<[^>]+>', re.DOTALL)


def strip_html(text: str) -> str:
    """Remove HTML/script tags and unescape HTML entities."""
    text = _html_module.unescape(text)      # &amp; → & etc.
    text = _TAG_RE.sub('', text)            # <script>…</script> → ''
    text = text.replace('\x00', '')         # null bytes
    return text.strip()


def sanitize_text(text: str | None, max_len: int) -> str:
    """
    Full pipeline: unescape → strip tags → remove null bytes → truncate → strip.
    Returns '' for None/empty inputs.
    """
    if not text:
        return ''
    cleaned = strip_html(text)
    return cleaned[:max_len]
