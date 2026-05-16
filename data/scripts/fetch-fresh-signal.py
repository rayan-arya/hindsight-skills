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
HOG_KEY = os.environ.get("THEHOG_API_KEY", "")


# --- FreshSignalItem shape (matches @hindsight/types) ---------------------


class FreshSignalItem(BaseModel):
    source: str
    title: str
    url: str
    date: str  # YYYY-MM-DD
    summary: str


# --- The Hog adapter ------------------------------------------------------


def fetch_via_hog(topic: str, limit: int = 3) -> list[FreshSignalItem]:
    """Call The Hog API.

    PLACEHOLDER endpoint — once `probe-thehog.py` finds the working shape,
    update `url`, `headers`, and the response→FreshSignalItem mapping.
    """
    if not HOG_KEY:
        raise RuntimeError("THEHOG_API_KEY not set")

    url = "https://api.thehog.ai/v1/search"
    headers = {
        "Authorization": f"Bearer {HOG_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "HindsightHackathon/0.1",
    }
    payload = {"query": topic, "limit": limit}
    r = requests.post(url, headers=headers, json=payload, timeout=10)
    r.raise_for_status()
    data = r.json()

    # Defensive parsing — we don't know the exact field names yet. Try the
    # most plausible ones in order.
    raw_items: list[dict[str, Any]] = (
        data.get("items")
        or data.get("results")
        or data.get("hits")
        or (data if isinstance(data, list) else [])
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
    if HOG_KEY:
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
    return {"ok": True, "hog_key_present": bool(HOG_KEY)}


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
