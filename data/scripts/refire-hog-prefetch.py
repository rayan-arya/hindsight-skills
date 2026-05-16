#!/usr/bin/env python3
"""
Re-fire The Hog fresh-signal fetch against the locked demo question and
overwrite data/fresh-signal-fixture.json. Used by C.4 once the demo
question is locked.

Usage:
    python3 data/scripts/refire-hog-prefetch.py "<question or topic phrase>"

The question is condensed to a topic keyword by Claude inside the Hog
prompt — we pass the raw demo question through. The Hog returns
FreshSignalItem[] which we wrap with source_used metadata.

Exits non-zero if Hog fails (no fallback — we WANT this to fail loud
during prep so we can re-run before the demo).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Reuse fetch_via_hog from the main fetcher module.
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
# fetch-fresh-signal.py is hyphenated — import via importlib.
import importlib.util
spec = importlib.util.spec_from_file_location("ffs", SCRIPTS / "fetch-fresh-signal.py")
ffs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ffs)


def main() -> int:
    if len(sys.argv) < 2:
        print('usage: refire-hog-prefetch.py "<demo question>"', file=sys.stderr)
        return 2
    question = sys.argv[1]
    out_path = SCRIPTS.parent / "fresh-signal-fixture.json"

    print(f"[refire] firing Hog against question: {question!r}", flush=True)
    print(f"[refire] this will take 5-10 min — go get coffee", flush=True)

    try:
        items = ffs.fetch_via_hog(question, limit=3)
    except Exception as e:
        print(f"[refire] FAILED: {e}", file=sys.stderr)
        print("[refire] keeping existing fixture untouched", file=sys.stderr)
        return 1

    payload = {
        "source_used": "TheHog",
        "question_used": question,
        "items": [i.model_dump() for i in items],
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"[refire] wrote {len(items)} items to {out_path}", flush=True)
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
