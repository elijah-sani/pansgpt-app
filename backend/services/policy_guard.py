from dataclasses import dataclass
from typing import Optional


PROMPT_EXTRACTION_PATTERNS = [
    "system prompt",
    "system instruction",
    "system instructions",
    "hidden instruction",
    "hidden prompt",
    "developer message",
    "repeat your instructions",
    "write it out word for word",
    "word for word",
    "ignore previous instructions",
    "print your prompt",
    "reveal your prompt",
]

LEAK_MARKERS = [
    "system instructions:",
    "student profile:",
    "current time & date",
    "previous study sessions",
    "faculty & curriculum knowledge:",
    "student weekly timetable:",
    "relevant curriculum context:",
    "live web search results:",
]

PROMPT_REFUSAL_TEXT = (
    "I can't provide hidden instructions or internal configuration. "
    "I can still help with the task itself or answer questions about the material."
)


@dataclass(frozen=True)
class PolicyDecision:
    allow: bool
    category: str
    severity: str
    matched_rule: Optional[str] = None
    user_response: Optional[str] = None


def _normalize_text(text: Optional[str]) -> str:
    if not text:
        return ""
    return " ".join(str(text).strip().lower().split())


def evaluate_request_policy(text: Optional[str]) -> PolicyDecision:
    normalized = _normalize_text(text)
    if not normalized:
        return PolicyDecision(
            allow=True,
            category="normal",
            severity="none",
        )

    for pattern in PROMPT_EXTRACTION_PATTERNS:
        if pattern in normalized:
            return PolicyDecision(
                allow=False,
                category="prompt_extraction",
                severity="high",
                matched_rule=pattern,
                user_response=PROMPT_REFUSAL_TEXT,
            )

    return PolicyDecision(
        allow=True,
        category="normal",
        severity="none",
    )


def contains_prompt_leak(text: Optional[str]) -> bool:
    normalized = _normalize_text(text)
    if not normalized:
        return False
    if any(marker in normalized for marker in LEAK_MARKERS):
        return True
    return "you are pansgpt" in normalized and "university of jos" in normalized


def build_refusal_event(decision: PolicyDecision) -> dict:
    return {"delta": decision.user_response or PROMPT_REFUSAL_TEXT}
