#!/usr/bin/env python3
"""
Probe The Hog API to discover the actual endpoint shape.

The planning doc says credentials come via THEHOG_API_KEY env var and that we
should "check email from Paulo/Hudson at thehog.ai" for the exact endpoint.
Since the email isn't on this machine, this script probes the most likely
endpoint patterns and reports which one(s) respond. Run after pasting your
key into ../.env.

Usage:
    python3 probe-thehog.py            # tries reasonable defaults
    python3 probe-thehog.py --base https://api.thehog.ai
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

def _find_dotenv() -> Path | None:
    cur = Path(__file__).resolve().parent
    for _ in range(5):
        cand = cur / ".env"
        if cand.exists():
            return cand
        cur = cur.parent
    return None


def load_env() -> dict[str, str]:
    """Minimal .env parser. Only reads KEY=value lines."""
    env: dict[str, str] = {}
    dotenv = _find_dotenv()
    if dotenv is None:
        return env
    for raw in dotenv.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


# Candidate base URLs in priority order.
CANDIDATE_BASES = [
    "https://api.thehog.ai",
    "https://thehog.ai/api",
    "https://api.hog.ai",
    "https://www.thehog.ai/api",
]

# Candidate search endpoints (relative to a base).
CANDIDATE_PATHS = [
    "/v1/search",
    "/search",
    "/v1/news",
    "/web/search",
]


def probe(base: str, path: str, key: str) -> tuple[int, str]:
    url = base.rstrip("/") + path
    # Try Bearer auth first; many APIs accept either Bearer or x-api-key.
    headers = {
        "Authorization": f"Bearer {key}",
        "x-api-key": key,
        "Content-Type": "application/json",
        "User-Agent": "HindsightHackathon/0.1",
    }
    payload = {"query": "AI agents", "limit": 3}
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=10)
    except requests.RequestException as e:
        return -1, f"{type(e).__name__}: {e}"
    body = r.text[:400]
    return r.status_code, body


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", help="explicit base URL (skips candidates)")
    args = ap.parse_args()

    env = load_env()
    key = env.get("THEHOG_API_KEY") or os.environ.get("THEHOG_API_KEY") or ""
    if not key:
        print(
            "THEHOG_API_KEY is not set in ../.env or shell env.\n"
            "Paste your key into ../.env (see template) and re-run.",
            file=sys.stderr,
        )
        return 2

    bases = [args.base] if args.base else CANDIDATE_BASES

    print(f"probing The Hog with key prefix {key[:6]}...")
    found_any = False
    for base in bases:
        for path in CANDIDATE_PATHS:
            code, body = probe(base, path, key)
            tag = "OK" if 200 <= code < 300 else ("AUTH" if code in (401, 403) else "..")
            short = body.replace("\n", " ")[:120]
            print(f"  [{tag:4s}] {code:>4} {base}{path}    {short}")
            if 200 <= code < 300:
                found_any = True
                print("\nMATCH — sample full response:")
                print(body)
                # Stop probing once we find a working endpoint.
                return 0
    if not found_any:
        print(
            "\nNo endpoint accepted the key. Likely causes:\n"
            "  • Different base URL — check the Paulo/Hudson email.\n"
            "  • Different auth header — some APIs want 'X-Hog-Key' or similar.\n"
            "  • Different payload shape — try GET with ?q=, or different field names.\n"
            "Edit CANDIDATE_BASES / CANDIDATE_PATHS in this script and re-run."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
