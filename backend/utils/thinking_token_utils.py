import re
from typing import Optional

# ---------------------------------------------------------------------------
# Tag catalogue – order matters: check longer names first to avoid partial
# matches (e.g. "thinking" before "think", "thought" before "think").
# ---------------------------------------------------------------------------
_THINKING_TAGS = ("scratchpad", "thinking", "thought", "think")

# Pre-compiled regex for the batch (non-streaming) helper.
_BATCH_PATTERN = re.compile(
    r"<(think|thinking|thought|scratchpad)\b[^>]*>(.*?)</\1>",
    re.DOTALL | re.IGNORECASE,
)

# Opening-tag prefix detector: any string that *starts* a known tag.
# Used by the stream parser to decide whether to hold a partial buffer.
_OPEN_TAG_RE = re.compile(
    r"<(think|thinking|thought|scratchpad)\b[^>]*>",
    re.IGNORECASE,
)
_CLOSE_TAG_RE = re.compile(
    r"</(think|thinking|thought|scratchpad)>",
    re.IGNORECASE,
)

# Matches a prefix of any opening tag so we know not to flush yet
# e.g. "<thi", "<think", "<thinking"
_PARTIAL_OPEN_RE = re.compile(
    r"<(?:t(?:h(?:i(?:n(?:k(?:i(?:n(?:g?)?)?)?)?)?)?)?|s(?:c(?:r(?:a(?:t(?:c(?:h(?:p(?:a(?:d?)?)?)?)?)?)?)?)?)?)$",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Part A – strip_thinking_tokens (batch, non-streaming)
# ---------------------------------------------------------------------------

class ThinkingStripResult(str):
    """String result that can also be unpacked as (visible_text, thinking_text)."""

    thinking_text: str

    def __new__(cls, visible_text: str, thinking_text: str = "") -> "ThinkingStripResult":
        result = str.__new__(cls, visible_text)
        result.thinking_text = thinking_text
        return result

    def __iter__(self):
        yield str(self)
        yield self.thinking_text


def strip_thinking_tokens(text: Optional[str]) -> ThinkingStripResult:
    """
    Strip all thinking-token blocks from *text*.

    Returns
    -------
    (visible_text, thinking_text)
        visible_text  – response with all thinking blocks removed, stripped.
        thinking_text – concatenation of every thinking block's inner content
                        joined by "\\n\\n".  Empty string when none found.

    The return value behaves like a normal string for existing callers, and can
    also be unpacked as ``visible_text, thinking_text``.

    Tag variants handled (case-insensitive, spans multiple lines):
        <think>…</think>
        <thinking>…</thinking>
        <thought>…</thought>
        <scratchpad>…</scratchpad>
    """
    if not text:
        return ThinkingStripResult("", "")

    thinking_parts: list[str] = []

    def _replacer(m: re.Match) -> str:
        inner = m.group(2).strip()
        if inner:
            thinking_parts.append(inner)
        return ""

    visible = _BATCH_PATTERN.sub(_replacer, text).strip()
    thinking = "\n\n".join(thinking_parts)
    return ThinkingStripResult(visible, thinking)


# ---------------------------------------------------------------------------
# Part B – ThinkingStreamParser (stateful, per-request SSE parser)
# ---------------------------------------------------------------------------

class ThinkingStreamParser:
    """
    Stateful parser for SSE chunk-by-chunk processing.

    Create **one instance per /chat request** — no shared class-level state.

    Usage
    -----
    parser = ThinkingStreamParser()
    async for chunk in llm_stream:
        visible_chunk, thinking_chunk = parser.feed(chunk)
        if visible_chunk:
            yield sse_event(visible_chunk)
        # optionally relay thinking_chunk to frontend separately

    visible_rem, thinking_rem = parser.flush()
    full_visible  = parser.get_full_visible()
    full_thinking = parser.get_full_thinking()
    """

    def __init__(self) -> None:
        self._buffer: str = ""           # partial-tag holdback buffer
        self._in_thinking: bool = False  # currently inside a thinking block
        self._visible_acc: str = ""      # accumulated visible text
        self._thinking_acc: str = ""     # accumulated thinking text
        self._current_open_tag: str = "" # which tag opened the current block

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def feed(self, chunk: str) -> tuple[str, str]:
        """
        Feed one SSE chunk.

        Returns ``(visible_chunk, thinking_chunk)``.
        Either value may be an empty string.
        Handles partial tag boundaries across chunks transparently.
        """
        data = self._buffer + chunk
        self._buffer = ""

        visible_out = ""
        thinking_out = ""

        while data:
            if self._in_thinking:
                # Looking for the matching closing tag
                close_tag = f"</{self._current_open_tag}>"
                idx = data.lower().find(close_tag.lower())
                if idx == -1:
                    # Check for partial closing tag at the tail
                    partial = self._partial_close_at_tail(data, self._current_open_tag)
                    if partial:
                        # Buffer the potential partial tag
                        emit = data[: len(data) - len(partial)]
                        self._thinking_acc += emit
                        thinking_out += emit
                        self._buffer = partial
                    else:
                        self._thinking_acc += data
                        thinking_out += data
                    data = ""
                else:
                    # Found the closing tag
                    inner = data[:idx]
                    self._thinking_acc += inner
                    thinking_out += inner
                    data = data[idx + len(close_tag):]
                    self._in_thinking = False
                    self._current_open_tag = ""
            else:
                # Looking for an opening tag
                match = _OPEN_TAG_RE.search(data)
                if match is None:
                    # No opening tag found – check for partial tag at tail
                    partial = self._partial_open_at_tail(data)
                    if partial:
                        emit = data[: len(data) - len(partial)]
                        self._visible_acc += emit
                        visible_out += emit
                        self._buffer = partial
                    else:
                        self._visible_acc += data
                        visible_out += data
                    data = ""
                else:
                    # Emit everything before the tag as visible
                    before = data[: match.start()]
                    self._visible_acc += before
                    visible_out += before
                    tag_name = match.group(1).lower()
                    self._in_thinking = True
                    self._current_open_tag = tag_name
                    data = data[match.end():]

        return (visible_out, thinking_out)

    def flush(self) -> tuple[str, str]:
        """
        Drain any remaining buffer after the stream ends.

        Returns ``(visible_remainder, thinking_remainder)``.
        """
        remainder = self._buffer
        self._buffer = ""
        if not remainder:
            return ("", "")

        # Whatever is left in the buffer that couldn't be resolved is
        # most likely a malformed/incomplete tag – treat it as visible text.
        if self._in_thinking:
            self._thinking_acc += remainder
            return ("", remainder)
        else:
            self._visible_acc += remainder
            return (remainder, "")

    def get_full_thinking(self) -> str:
        """Return all accumulated thinking text (after stream ends)."""
        return self._thinking_acc.strip()

    def get_full_visible(self) -> str:
        """Return all accumulated visible text (after stream ends)."""
        return self._visible_acc.strip()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _partial_open_at_tail(text: str) -> str:
        """
        Return the longest suffix of *text* that is a prefix of any
        known opening tag (e.g. "<thi", "<think", "<scratchpa").
        Returns "" if the tail is not a partial tag.
        """
        # Walk backwards from end of string
        for length in range(min(len(text), 20), 0, -1):
            tail = text[-length:]
            if _PARTIAL_OPEN_RE.match(tail):
                return tail
        return ""

    @staticmethod
    def _partial_close_at_tail(text: str, tag_name: str) -> str:
        """
        Return the longest suffix of *text* that is a prefix of the
        closing tag ``</tag_name>`` (e.g. "</thi" for tag_name="think").
        Returns "" if no partial close tag is at the tail.
        """
        close_tag = f"</{tag_name}>"
        for length in range(min(len(text), len(close_tag) - 1), 0, -1):
            tail = text[-length:]
            if close_tag.lower().startswith(tail.lower()):
                return tail
        return ""


# ---------------------------------------------------------------------------
# Part C – model_uses_thinking
# ---------------------------------------------------------------------------

def model_uses_thinking(model_name: str) -> bool:
    """Return True when *model_name* is known to emit thinking tokens."""
    name = model_name.lower()
    return "gemma-4" in name or "thinking" in name


# ---------------------------------------------------------------------------
# Part D – Self-tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    passed = 0
    failed = 0

    def check(label: str, condition: bool, detail: str = "") -> None:
        global passed, failed
        if condition:
            print(f"Test {label}: PASS")
            passed += 1
        else:
            print(f"Test {label}: FAIL  {detail}")
            failed += 1

    # --- Test 1: strip_thinking_tokens with a think block ---
    v, t = strip_thinking_tokens("<think>some reasoning</think>the answer")
    check(
        "1 (strip with think block)",
        v == "the answer" and t == "some reasoning",
        f"got visible={repr(v)}, thinking={repr(t)}",
    )

    # --- Test 2: strip_thinking_tokens with NO thinking block ---
    v2, t2 = strip_thinking_tokens("plain response")
    check(
        "2 (strip no block)",
        v2 == "plain response" and t2 == "",
        f"got visible={repr(v2)}, thinking={repr(t2)}",
    )

    # --- Test 3: multiple thinking blocks joined by \n\n ---
    v3, t3 = strip_thinking_tokens(
        "<think>block one</think>middle<thinking>block two</thinking>end"
    )
    check(
        "3 (strip multiple blocks)",
        v3 == "middleend" and t3 == "block one\n\nblock two",
        f"got visible={repr(v3)}, thinking={repr(t3)}",
    )

    # --- Test 4: ThinkingStreamParser.feed() clean chunk ---
    p4 = ThinkingStreamParser()
    v4, t4 = p4.feed("hello world")
    check(
        "4 (parser clean chunk)",
        v4 == "hello world" and t4 == "",
        f"got visible={repr(v4)}, thinking={repr(t4)}",
    )

    # --- Test 5: feed() with a full think block in one chunk ---
    p5 = ThinkingStreamParser()
    v5, t5 = p5.feed("<think>reasoning</think>")
    check(
        "5 (parser full think block)",
        v5 == "" and t5 == "reasoning",
        f"got visible={repr(v5)}, thinking={repr(t5)}",
    )

    # --- Test 6: split across 3 chunks ---
    p6 = ThinkingStreamParser()
    p6.feed("<thi")
    p6.feed("nk>some reasoning")
    p6.feed("</think>the answer")
    fv6 = p6.get_full_visible()
    ft6 = p6.get_full_thinking()
    check(
        "6 (parser split across 3 chunks)",
        fv6 == "the answer" and ft6 == "some reasoning",
        f"got full_visible={repr(fv6)}, full_thinking={repr(ft6)}",
    )

    # --- Test 7: flush() drains remaining buffer ---
    p7 = ThinkingStreamParser()
    p7.feed("hello <thi")          # partial tag stuck in buffer
    vr7, tr7 = p7.flush()
    check(
        "7 (flush drains buffer)",
        "hello" in p7.get_full_visible() and vr7 == "<thi",
        f"got flush=({repr(vr7)}, {repr(tr7)}), "
        f"full_visible={repr(p7.get_full_visible())}",
    )

    total = passed + failed
    print()
    if failed == 0:
        print(f"All {total} tests passed!")
    else:
        print(f"{passed}/{total} tests passed, {failed} FAILED.")
