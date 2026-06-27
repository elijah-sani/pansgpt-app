import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from services.security_metrics import record_security_metric


def build_security_event_payload(
    *,
    event_type: str,
    route: str,
    decision: str,
    category: str,
    severity: Optional[str] = None,
    matched_rule: Optional[str] = None,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    university_id: Optional[str] = None,
    selected_model: Optional[str] = None,
    blocked_output: bool = False,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    payload = {
        "event_type": event_type,
        "route": route,
        "decision": decision,
        "category": category,
        "severity": severity or "unknown",
        "matched_rule": matched_rule,
        "user_id": user_id,
        "session_id": session_id,
        "university_id": university_id,
        "selected_model": selected_model,
        "blocked_output": blocked_output,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if metadata:
        payload["metadata"] = metadata
    return payload


def log_security_event(
    logger: logging.Logger,
    *,
    event_type: str,
    route: str,
    decision: str,
    category: str,
    severity: Optional[str] = None,
    matched_rule: Optional[str] = None,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    university_id: Optional[str] = None,
    selected_model: Optional[str] = None,
    blocked_output: bool = False,
    metadata: Optional[dict[str, Any]] = None,
    level: str = "warning",
) -> dict[str, Any]:
    payload = build_security_event_payload(
        event_type=event_type,
        route=route,
        decision=decision,
        category=category,
        severity=severity,
        matched_rule=matched_rule,
        user_id=user_id,
        session_id=session_id,
        university_id=university_id,
        selected_model=selected_model,
        blocked_output=blocked_output,
        metadata=metadata,
    )
    record_security_metric(
        event_type=event_type,
        route=route,
        decision=decision,
        category=category,
        severity=payload["severity"],
        matched_rule=matched_rule,
        blocked_output=blocked_output,
    )
    log_fn = getattr(logger, level, logger.warning)
    log_fn("SECURITY_EVENT %s", json.dumps(payload, sort_keys=True))
    return payload
