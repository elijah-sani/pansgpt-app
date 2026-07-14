from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Optional

PROMPT_EXTRACTION_DAILY_THRESHOLD = 5
OUTPUT_LEAK_DAILY_THRESHOLD = 2
ROUTE_BLOCK_DAILY_THRESHOLD = 5


_metrics_lock = Lock()
_last_updated_at: Optional[str] = None
_totals: dict[str, Any] = {
    "events_total": 0,
    "blocked_total": 0,
    "blocked_output_total": 0,
    "by_event_type": Counter(),
    "by_category": Counter(),
    "by_route": Counter(),
    "by_decision": Counter(),
    "by_severity": Counter(),
    "by_matched_rule": Counter(),
}
_daily_buckets: dict[str, dict[str, Any]] = defaultdict(
    lambda: {
        "events_total": 0,
        "blocked_total": 0,
        "blocked_output_total": 0,
        "by_event_type": Counter(),
        "by_category": Counter(),
        "by_route": Counter(),
        "by_decision": Counter(),
        "by_severity": Counter(),
        "by_matched_rule": Counter(),
    }
)


def _serialize_counter(counter: Counter) -> dict[str, int]:
    return {key: int(value) for key, value in counter.items()}


def _serialize_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    return {
        "events_total": int(bucket["events_total"]),
        "blocked_total": int(bucket["blocked_total"]),
        "blocked_output_total": int(bucket["blocked_output_total"]),
        "by_event_type": _serialize_counter(bucket["by_event_type"]),
        "by_category": _serialize_counter(bucket["by_category"]),
        "by_route": _serialize_counter(bucket["by_route"]),
        "by_decision": _serialize_counter(bucket["by_decision"]),
        "by_severity": _serialize_counter(bucket["by_severity"]),
        "by_matched_rule": _serialize_counter(bucket["by_matched_rule"]),
    }


def _build_alert(
    *,
    alert_id: str,
    severity: str,
    title: str,
    detail: str,
    threshold: int,
    current_value: int,
    scope: str,
) -> dict[str, Any]:
    return {
        "id": alert_id,
        "severity": severity,
        "title": title,
        "detail": detail,
        "threshold": threshold,
        "current_value": current_value,
        "scope": scope,
    }


def _evaluate_alerts(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []
    daily = snapshot.get("daily", {})
    if not daily:
        return alerts

    latest_day = sorted(daily.keys())[-1]
    latest_bucket = daily[latest_day]
    prompt_extraction_count = int(latest_bucket["by_category"].get("prompt_extraction", 0))
    if prompt_extraction_count >= PROMPT_EXTRACTION_DAILY_THRESHOLD:
        alerts.append(
            _build_alert(
                alert_id="prompt-extraction-daily-spike",
                severity="high",
                title="Prompt extraction spike",
                detail=f"{prompt_extraction_count} prompt extraction attempts recorded on {latest_day}.",
                threshold=PROMPT_EXTRACTION_DAILY_THRESHOLD,
                current_value=prompt_extraction_count,
                scope="daily",
            )
        )

    output_leak_count = int(latest_bucket["blocked_output_total"])
    if output_leak_count >= OUTPUT_LEAK_DAILY_THRESHOLD:
        alerts.append(
            _build_alert(
                alert_id="output-leak-daily-spike",
                severity="high",
                title="Leak filter spike",
                detail=f"{output_leak_count} output leak blocks recorded on {latest_day}.",
                threshold=OUTPUT_LEAK_DAILY_THRESHOLD,
                current_value=output_leak_count,
                scope="daily",
            )
        )

    for route, blocked_count in latest_bucket["by_route"].items():
        route_count = int(blocked_count)
        if route_count >= ROUTE_BLOCK_DAILY_THRESHOLD:
            alerts.append(
                _build_alert(
                    alert_id=f"route-spike:{route}",
                    severity="medium",
                    title="Route under repeated pressure",
                    detail=f"{route} recorded {route_count} security events on {latest_day}.",
                    threshold=ROUTE_BLOCK_DAILY_THRESHOLD,
                    current_value=route_count,
                    scope=route,
                )
            )

    return alerts


def record_security_metric(
    *,
    event_type: str,
    route: str,
    decision: str,
    category: str,
    severity: Optional[str] = None,
    matched_rule: Optional[str] = None,
    blocked_output: bool = False,
    timestamp: Optional[datetime] = None,
) -> None:
    event_time = timestamp or datetime.now(timezone.utc)
    day_key = event_time.date().isoformat()
    severity_key = severity or "unknown"
    matched_rule_key = matched_rule or "none"

    with _metrics_lock:
        global _last_updated_at
        _last_updated_at = event_time.isoformat()

        _totals["events_total"] += 1
        _totals["by_event_type"][event_type] += 1
        _totals["by_category"][category] += 1
        _totals["by_route"][route] += 1
        _totals["by_decision"][decision] += 1
        _totals["by_severity"][severity_key] += 1
        _totals["by_matched_rule"][matched_rule_key] += 1

        bucket = _daily_buckets[day_key]
        bucket["events_total"] += 1
        bucket["by_event_type"][event_type] += 1
        bucket["by_category"][category] += 1
        bucket["by_route"][route] += 1
        bucket["by_decision"][decision] += 1
        bucket["by_severity"][severity_key] += 1
        bucket["by_matched_rule"][matched_rule_key] += 1

        if decision == "blocked":
            _totals["blocked_total"] += 1
            bucket["blocked_total"] += 1

        if blocked_output:
            _totals["blocked_output_total"] += 1
            bucket["blocked_output_total"] += 1


def get_security_metrics_snapshot() -> dict[str, Any]:
    with _metrics_lock:
        daily = {
            day: _serialize_bucket(bucket)
            for day, bucket in sorted(_daily_buckets.items())
        }
        snapshot = {
            "storage": "in_memory",
            "last_updated_at": _last_updated_at,
            "totals": _serialize_bucket(deepcopy(_totals)),
            "daily": daily,
        }
        snapshot["alerts"] = _evaluate_alerts(snapshot)
        return snapshot


def reset_security_metrics() -> None:
    with _metrics_lock:
        global _last_updated_at, _daily_buckets
        _last_updated_at = None
        _totals["events_total"] = 0
        _totals["blocked_total"] = 0
        _totals["blocked_output_total"] = 0
        _totals["by_event_type"].clear()
        _totals["by_category"].clear()
        _totals["by_route"].clear()
        _totals["by_decision"].clear()
        _totals["by_severity"].clear()
        _totals["by_matched_rule"].clear()
        _daily_buckets = defaultdict(
            lambda: {
                "events_total": 0,
                "blocked_total": 0,
                "blocked_output_total": 0,
                "by_event_type": Counter(),
                "by_category": Counter(),
                "by_route": Counter(),
                "by_decision": Counter(),
                "by_severity": Counter(),
                "by_matched_rule": Counter(),
            }
        )
