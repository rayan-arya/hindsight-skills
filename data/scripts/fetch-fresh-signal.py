#!/usr/bin/env python3
"""
Fresh-signal HTTP service for Track A's calibrated-advise skill.

Endpoint:
    POST /fetch-fresh-signal
    body: {"topic": "AI agents"}
    response: {"items": FreshSignalItem[]}

FreshSignalItem matches @hindsight/types §4:
    {source, title, url, date (YYYY-MM-DD), summary}

Source selection:
    1. If THEHOG_API_KEY is set AND --prefer-hog (default), call The Hog. Side
       quest qualifier.
    2. On Hog failure or missing key, fall back to HN Algolia. Demo intact.

Wire-up for The Hog is intentionally one function (`fetch_via_hog`) — replace
its body once `probe-thehog.py` discovers the real endpoint shape. Everything
else stays the same.

Usage:
    python3 fetch-fresh-signal.py                  # serve on :8000
    python3 fetch-fresh-signal.py --once "AI agents"   # one-shot CLI, prints JSON
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

def _find_dotenv() -> Path | None:
    # Walk up from this script looking for a .env. Works both in the scratch
    # dir layout (../.env) and the in-repo layout (../../.env relative to
    # data/scripts/).
    cur = Path(__file__).resolve().parent
    for _ in range(5):
        cand = cur / ".env"
        if cand.exists():
            return cand
        cur = cur.parent
    return None


def load_env_file() -> None:
    dotenv = _find_dotenv()
    if dotenv is None:
        return
    for raw in dotenv.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if v and not os.environ.get(k):
            os.environ[k] = v


load_env_file()
# Accept either env-var name. Planning doc canonicalized THEHOG_*; the
# bash_profile we set up uses HOG_*. Either works.
HOG_KEY = os.environ.get("THEHOG_API_KEY") or os.environ.get("HOG_API_KEY", "")
HOG_SECRET = os.environ.get("THEHOG_API_SECRET") or os.environ.get("HOG_API_SECRET", "")


# --- FreshSignalItem shape (matches @hindsight/types) ---------------------


class FreshSignalItem(BaseModel):
    source: str
    title: str
    url: str
    date: str  # YYYY-MM-DD
    summary: str


# --- The Hog adapter ------------------------------------------------------


HOG_BASE = "https://developer.thehog.ai"
# Deep-research is genuinely slow — verified 2026-05-16: completed-in-5-min
# rate is low, real LLM web crawls take 5-10 min. DEMO_MODE prefetch in the
# extension fires this at app startup, well before the live demo, so latency
# is off the critical path. For non-demo callers we cap at 10 min and fall
# back to HN Algolia (verified, fast, always works).
HOG_POLL_TIMEOUT_S = 600
HOG_POLL_INTERVAL_S = 5


def fetch_via_hog(topic: str, limit: int = 3) -> list[FreshSignalItem]:
    """Call The Hog deep-research API.

    Verified working 2026-05-16:
      - Host: developer.thehog.ai (NOT api.thehog.ai — that's a Supabase
        Kong gateway that 404s every /api/* path)
      - Endpoint: POST /api/deep-research
      - Auth: X-Access-Key (ak_*) + X-Secret-Key (sk_*) headers
      - Pattern: 202 + {operationId, pollUrl} → GET pollUrl until
        status == "complete"
    """
    if not HOG_KEY or not HOG_SECRET:
        raise RuntimeError("HOG_API_KEY and HOG_API_SECRET must both be set")

    url = HOG_BASE + "/api/deep-research"
    headers = {
        "X-Access-Key": HOG_KEY,
        "X-Secret-Key": HOG_SECRET,
        "Content-Type": "application/json",
        "User-Agent": "HindsightHackathon/0.1",
    }
    prompt = (
        f"Find {limit} recent (last 7 days) news items or web posts about "
        f"\"{topic}\". For each item, return source name, title, the URL, "
        f"publish date in YYYY-MM-DD, and a one-sentence summary. Prefer "
        f"primary sources (HN, company blogs, news outlets) over aggregators."
    )
    schema = {
        "type": "object",
        "required": ["items"],
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["source", "title", "url", "date", "summary"],
                    "properties": {
                        "source": {"type": "string"},
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "date": {"type": "string"},
                        "summary": {"type": "string"},
                    },
                },
            }
        },
    }
    payload = {"prompt": prompt, "schema": schema}

    r = requests.post(url, headers=headers, json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()

    # 202 → async. Poll the returned pollUrl (or fall back to /api/operations/:id)
    # until status == complete. Verified live: status moves processing → complete.
    if r.status_code == 202 or "operationId" in data or data.get("status") in ("queued", "processing", "pending"):
        op_id = data.get("operationId") or data.get("id")
        poll_path = data.get("pollUrl") or f"/api/operations/{op_id}"
        poll_url = poll_path if poll_path.startswith("http") else HOG_BASE + poll_path
        deadline = time.time() + HOG_POLL_TIMEOUT_S
        while time.time() < deadline:
            time.sleep(HOG_POLL_INTERVAL_S)
            p = requests.get(poll_url, headers=headers, timeout=10)
            p.raise_for_status()
            pd = p.json()
            status = pd.get("status")
            if status in ("complete", "completed", "succeeded", "done"):
                data = pd.get("result", pd)
                break
            if status in ("failed", "error", "cancelled"):
                raise RuntimeError(f"deep-research {status}: {pd.get('error') or pd.get('message')}")
        else:
            raise TimeoutError(f"deep-research did not complete within {HOG_POLL_TIMEOUT_S}s")

    # Schema says items[] is at the top level; defensive: also accept
    # nesting under `result` or `data`.
    raw_items: list[dict[str, Any]] = (
        data.get("items")
        or data.get("result", {}).get("items")
        or data.get("data", {}).get("items")
        or []
    )

    out: list[FreshSignalItem] = []
    for it in raw_items[:limit]:
        out.append(
            FreshSignalItem(
                source=it.get("source") or "TheHog",
                title=it.get("title") or it.get("headline") or "",
                url=it.get("url") or it.get("link") or "",
                date=_normalize_date(it.get("date") or it.get("published_at") or it.get("created_at")),
                summary=it.get("summary") or it.get("snippet") or it.get("description") or "",
            )
        )
    return out


# --- HN Algolia fallback --------------------------------------------------


def fetch_via_hn(topic: str, limit: int = 3) -> list[FreshSignalItem]:
    """Top stories from the last week matching the topic. Always available."""
    one_week_ago = int(time.time()) - 7 * 24 * 3600
    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "query": topic,
        "tags": "story",
        "numericFilters": f"created_at_i>{one_week_ago}",
        "hitsPerPage": limit,
    }
    r = requests.get(url, params=params, timeout=10)
    r.raise_for_status()
    hits = r.json().get("hits", [])
    out: list[FreshSignalItem] = []
    for h in hits[:limit]:
        title = h.get("title") or h.get("story_title") or ""
        link = h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}"
        created = h.get("created_at", "")
        date = created[:10] if created else ""
        out.append(
            FreshSignalItem(
                source="HN",
                title=title,
                url=link,
                date=date,
                summary=f"HN story · {h.get('points', 0)} points · {h.get('num_comments', 0)} comments",
            )
        )
    return out


def _normalize_date(raw: Any) -> str:
    if not raw:
        return datetime.now(timezone.utc).date().isoformat()
    s = str(raw)
    # Accept ISO timestamps; trim to date.
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    # Accept unix seconds.
    try:
        return datetime.fromtimestamp(int(s), tz=timezone.utc).date().isoformat()
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).date().isoformat()


# --- Public entry point ---------------------------------------------------


def fetch_fresh_signal(topic: str, limit: int = 3) -> tuple[list[FreshSignalItem], str]:
    """Return (items, source_used). source_used is 'TheHog' or 'HN-fallback'."""
    if HOG_KEY and HOG_SECRET:
        try:
            items = fetch_via_hog(topic, limit)
            if items:
                return items, "TheHog"
            # Empty result — fall through to HN rather than return nothing.
        except Exception as e:
            print(f"[fresh-signal] Hog failed ({e}), falling back to HN", file=sys.stderr)
    items = fetch_via_hn(topic, limit)
    return items, "HN-fallback"


# --- FastAPI server -------------------------------------------------------


class TopicRequest(BaseModel):
    topic: str
    limit: int = 3


app = FastAPI(title="Hindsight Fresh Signal")


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "hog_key_present": bool(HOG_KEY),
        "hog_secret_present": bool(HOG_SECRET),
    }


@app.post("/fetch-fresh-signal")
def endpoint(req: TopicRequest) -> dict:
    if not req.topic.strip():
        raise HTTPException(400, "topic must be non-empty")
    items, source_used = fetch_fresh_signal(req.topic, req.limit)
    return {"items": [i.model_dump() for i in items], "source_used": source_used}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--once", help="run once with this topic and print JSON instead of starting the server")
    args = ap.parse_args()

    if args.once:
        items, source_used = fetch_fresh_signal(args.once)
        print(json.dumps({"source_used": source_used, "items": [i.model_dump() for i in items]}, indent=2))
        return 0

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
