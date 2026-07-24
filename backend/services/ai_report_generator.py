"""
AI Report Generator Service
===========================
Generates structured Daily, Weekly, and Monthly reports summarizing:
- Total Token Usage (Prompt, Completion, Total, and Image tokens)
- Error Rate % and detailed Breakdown by error_type
- Usage Ranking by University & User
- Performance & Latency Breakdown by Provider
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger("PansGPT")

# Injected from api.py via set_dependencies() or shared client
_supabase_service_client = None


def set_dependencies(supabase_service_client: Any) -> None:
    global _supabase_service_client
    _supabase_service_client = supabase_service_client


def _fmt(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


async def generate_report(period: str = "daily", university_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Generate an analytical summary report for period: 'daily' (24h), 'weekly' (7d), or 'monthly' (30d).
    """
    sb = _supabase_service_client
    if sb is None:
        from routers import shared
        sb = shared.supabase_service_client or shared.supabase_client

    if sb is None:
        raise RuntimeError("Database client unavailable for report generation")

    days_map = {"daily": 1, "weekly": 7, "monthly": 30}
    days = days_map.get(period.lower(), 1)

    since_iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    try:
        q = sb.table("ai_usage_logs").select(
            "id,user_id,university_id,request_type,model_used,provider,"
            "prompt_tokens,completion_tokens,total_tokens,latency_ms,status,"
            "error_type,error_message,image_count,created_at"
        ).gte("created_at", since_iso)

        if university_id:
            q = q.eq("university_id", university_id)

        res = await asyncio.to_thread(lambda: q.execute())
        rows = res.data or []
    except Exception as exc:
        logger.error("[ai_report_generator] Failed to fetch usage logs: %s", exc)
        raise

    total_requests = len(rows)
    success_requests = sum(1 for r in rows if r.get("status") == "success")
    error_requests = sum(1 for r in rows if r.get("status") in ("error", "timeout"))
    
    total_prompt_tokens = sum(r.get("prompt_tokens") or 0 for r in rows)
    total_completion_tokens = sum(r.get("completion_tokens") or 0 for r in rows)
    total_tokens = sum(r.get("total_tokens") or 0 for r in rows)
    total_images = sum(r.get("image_count") or 0 for r in rows)

    latencies = [r["latency_ms"] for r in rows if r.get("latency_ms") is not None]
    avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0

    error_breakdown: Dict[str, int] = {}
    provider_breakdown: Dict[str, Dict[str, int]] = {}
    feature_breakdown: Dict[str, Dict[str, int]] = {}
    model_breakdown: Dict[str, Dict[str, int]] = {}
    user_usage: Dict[str, int] = {}
    university_usage: Dict[str, int] = {}

    for r in rows:
        # Errors
        err = r.get("error_type")
        if err:
            error_breakdown[err] = error_breakdown.get(err, 0) + 1

        # Provider
        p = r.get("provider", "unknown")
        if p not in provider_breakdown:
            provider_breakdown[p] = {"requests": 0, "total_tokens": 0, "errors": 0}
        provider_breakdown[p]["requests"] += 1
        provider_breakdown[p]["total_tokens"] += r.get("total_tokens") or 0
        if r.get("status") in ("error", "timeout"):
            provider_breakdown[p]["errors"] += 1

        # Feature / Request Type
        rt = r.get("request_type", "chat")
        if rt not in feature_breakdown:
            feature_breakdown[rt] = {"requests": 0, "total_tokens": 0}
        feature_breakdown[rt]["requests"] += 1
        feature_breakdown[rt]["total_tokens"] += r.get("total_tokens") or 0

        # Model
        m = r.get("model_used", "unknown")
        if m not in model_breakdown:
            model_breakdown[m] = {"requests": 0, "total_tokens": 0}
        model_breakdown[m]["requests"] += 1
        model_breakdown[m]["total_tokens"] += r.get("total_tokens") or 0

        # User ranking
        uid = r.get("user_id")
        if uid:
            user_usage[uid] = user_usage.get(uid, 0) + (r.get("total_tokens") or 0)

        # University ranking
        unid = r.get("university_id")
        if unid:
            university_usage[unid] = university_usage.get(unid, 0) + (r.get("total_tokens") or 0)

    error_rate = round((error_requests / total_requests) * 100, 2) if total_requests else 0.0

    return {
        "report_period": period,
        "days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_requests": total_requests,
            "success_requests": success_requests,
            "error_requests": error_requests,
            "error_rate_pct": error_rate,
            "prompt_tokens": total_prompt_tokens,
            "completion_tokens": total_completion_tokens,
            "total_tokens": total_tokens,
            "total_images_processed": total_images,
            "avg_latency_ms": avg_latency,
        },
        "error_breakdown": error_breakdown,
        "provider_breakdown": provider_breakdown,
        "feature_breakdown": feature_breakdown,
        "model_breakdown": model_breakdown,
        "top_consuming_users": dict(sorted(user_usage.items(), key=lambda x: x[1], reverse=True)[:10]),
        "top_consuming_universities": dict(sorted(university_usage.items(), key=lambda x: x[1], reverse=True)[:10]),
    }
