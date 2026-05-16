#!/usr/bin/env python3
"""
Scrape Paul Graham's essays from paulgraham.com into markdown files.

Track C — Hindsight hackathon.

Output: one markdown file per essay at <out_dir>/<slug>.md with YAML frontmatter:
    ---
    title: <essay title>
    date: <YYYY-MM-DD>   # always day=01; PG only publishes month/year
    source_url: https://www.paulgraham.com/<slug>.html
    slug: <slug>
    ---
    <markdown body>

State file: <state_path> tracks which slugs have completed. Restart picks up
where it left off — paulgraham.com is slow / occasionally flaky.

Usage:
    python3 scrape-pg.py                       # full scrape
    python3 scrape-pg.py --limit 5             # smoke test: first 5 essays
    python3 scrape-pg.py --out data/corpus     # custom out dir
    python3 scrape-pg.py --delay 1.5           # custom inter-request delay (seconds)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify

INDEX_URL = "https://www.paulgraham.com/articles.html"
BASE_URL = "https://www.paulgraham.com/"
USER_AGENT = "HindsightHackathon/0.1 (hackathon project; contact via github)"

# Pages linked from articles.html that are not essays.
NON_ESSAY_SLUGS = {
    "index", "articles", "rss", "bio", "faq", "raq", "quo",
    "books", "arc", "bel", "lisp", "antispam", "kedrosky",
    "wisdom", "rfs",
}

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


def fetch(url: str) -> str:
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=20)
    r.raise_for_status()
    # PG's pages declare no charset; the content is latin-1 with smart quotes mojibake otherwise.
    r.encoding = "latin-1"
    return r.text


def list_essays() -> list[tuple[str, str]]:
    """Return [(slug, title), ...] in order of appearance on the index page (newest first)."""
    html = fetch(INDEX_URL)
    # Plain anchor matches: <a href="foo.html">Title</a>
    links = re.findall(r'<a href="([a-z0-9_-]+\.html)">([^<]+)</a>', html, re.IGNORECASE)
    seen: set[str] = set()
    essays: list[tuple[str, str]] = []
    for href, title in links:
        slug = href[:-5]
        if slug in NON_ESSAY_SLUGS or slug in seen:
            continue
        seen.add(slug)
        essays.append((slug, title.strip()))
    return essays


def extract_date(text: str) -> str | None:
    """Find the first 'Month YYYY' in the essay body, return YYYY-MM-01.

    PG only ever publishes month + year, so day is always 01.
    """
    # No trailing \b: PG pages frequently smoosh the date directly into the
    # first word of the essay (e.g. "May 2025There are two senses"), and \b
    # only fires at alnum/non-alnum boundaries — between '5' and 'T' there is
    # none, so the match silently fails.
    m = re.search(
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(19|20)\d{2}",
        text,
    )
    if not m:
        return None
    month_name = m.group(1).lower()
    year = m.group(0).split()[-1]
    return f"{year}-{MONTHS[month_name]:02d}-01"


def extract_body_html(soup: BeautifulSoup) -> str | None:
    """Return the HTML of the <font> tag that contains the essay body.

    PG essays wrap their body in a single <font> tag. We pick the longest one
    by text length — robust against site quirks (some pages have a small
    <font> in the header).
    """
    fonts = soup.find_all("font")
    if not fonts:
        return None
    fonts.sort(key=lambda f: len(f.get_text()), reverse=True)
    return str(fonts[0])


def to_markdown(html: str) -> str:
    # PG's HTML is a 90s-era stew of <br>, <br/>, and <br />. markdownify
    # silently truncates the document when it hits some unclosed-tag combos
    # (observed on growth.html, superangels.html, yahoo.html: the YC banner
    # table renders but the essay body disappears). Normalizing breaks first
    # makes the conversion reliable.
    html = re.sub(r"<br\s*/?>", "<br/>", html, flags=re.IGNORECASE)
    md = markdownify(html, heading_style="ATX", strip=["font"])
    md = re.sub(r"\n{3,}", "\n\n", md).strip()
    return md


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def scrape_one(slug: str, title: str, out_dir: Path) -> tuple[bool, str]:
    """Scrape a single essay. Returns (ok, message)."""
    url = f"{BASE_URL}{slug}.html"
    try:
        html = fetch(url)
    except Exception as e:
        return False, f"fetch failed: {e}"

    soup = BeautifulSoup(html, "html.parser")

    # Title from <title>, fallback to index-page title.
    page_title = soup.title.string.strip() if soup.title and soup.title.string else title

    body_html = extract_body_html(soup)
    if not body_html:
        return False, "no <font> body tag found"

    body_text = BeautifulSoup(body_html, "html.parser").get_text()
    date = extract_date(body_text)
    # Some essays are undated (lists, FAQ-style). Use a sentinel so Track A can skip them.
    date_field = date or "unknown"

    md_body = to_markdown(body_html)

    # Strip the leading "Month YYYY" from the markdown body — it's now in frontmatter.
    if date:
        md_body = re.sub(
            r"^\*?\*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(19|20)\d{2}\*?\*?\s*\n+",
            "",
            md_body,
            count=1,
            flags=re.IGNORECASE,
        )

    frontmatter = (
        "---\n"
        f'title: "{page_title.replace(chr(34), chr(39))}"\n'
        f"date: {date_field}\n"
        f"source_url: {url}\n"
        f"slug: {slug}\n"
        "---\n\n"
    )

    out_file = out_dir / f"{slug}.md"
    out_file.write_text(frontmatter + md_body + "\n", encoding="utf-8")
    return True, f"{len(md_body)} chars, date={date_field}"


def load_state(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {"completed": [], "failed": {}}


def save_state(path: Path, state: dict) -> None:
    path.write_text(json.dumps(state, indent=2))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../corpus", help="output directory for essay .md files")
    ap.add_argument("--state", default=".scrape-state.json", help="state file path")
    ap.add_argument("--limit", type=int, default=None, help="only scrape the first N essays not yet completed")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    args = ap.parse_args()

    script_dir = Path(__file__).resolve().parent
    out_dir = (script_dir / args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    state_path = (script_dir / args.state).resolve()
    state = load_state(state_path)
    completed = set(state["completed"])

    print(f"[scrape] fetching index from {INDEX_URL}", flush=True)
    essays = list_essays()
    print(f"[scrape] {len(essays)} essays in index, {len(completed)} already completed", flush=True)

    todo = [(s, t) for s, t in essays if s not in completed]
    if args.limit is not None:
        todo = todo[: args.limit]
    print(f"[scrape] will attempt {len(todo)} essays this run", flush=True)

    ok_count = 0
    for i, (slug, title) in enumerate(todo, 1):
        print(f"[scrape] ({i}/{len(todo)}) {slug} — {title[:60]}", flush=True)
        ok, msg = scrape_one(slug, title, out_dir)
        if ok:
            ok_count += 1
            state["completed"].append(slug)
            state["failed"].pop(slug, None)
            print(f"           ok: {msg}", flush=True)
        else:
            state["failed"][slug] = msg
            print(f"           FAIL: {msg}", flush=True)
        # Persist state every essay so a crash mid-run loses at most one essay.
        save_state(state_path, state)
        if i < len(todo):
            time.sleep(args.delay)

    print(f"[scrape] done: {ok_count}/{len(todo)} succeeded this run; total completed = {len(state['completed'])}", flush=True)
    if state["failed"]:
        print(f"[scrape] {len(state['failed'])} failed slugs (will retry next run): {list(state['failed'])[:10]}", flush=True)
    return 0 if ok_count == len(todo) else 1


if __name__ == "__main__":
    sys.exit(main())
