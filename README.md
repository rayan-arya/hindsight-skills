# Hindsight

**Hindsight is the calibration layer every AI advisor is going to need.**

Memory teaches AI your facts. Hindsight teaches it your patterns of being wrong.

Five new GBrain skills + a GStack Browser extension. Submitted to the YC GStack × GBrain hackathon, May 16 2026 by team Hindsight.

## What's in this org

- **[hindsight-skills](https://github.com/rayan-arya/hindsight-skills)** (this repo) — the five gbrain skills + Express HTTP server
- **[hindsight-types](https://github.com/rayan-arya/hindsight-types)** — shared TypeScript contracts
- **[hindsight-extension](https://github.com/rushjais/hindsight-extension)** — the GStack Browser sidebar extension

## Built by

- Rayan Arya
- Rushil [last]
- Keshav [last]

## Demo

[Video link]

## The skills

- `extract-takes` — finds gradeable claims in brain pages
- `resolve-outcomes` — grades takes against public evidence (curated outcomes + Claude fallback)
- `hindsight-profile` — aggregates resolved takes into a calibration profile (quantitative stats + qualitative patterns)
- `find-contradictions` — surfaces pairs where the brain owner contradicted themselves across time
- `calibrated-advise` — gives advice that applies the calibration profile to a current question, using ZeroEntropy retrieval + The Hog fresh-signal

## Demo data

- 228 Paul Graham essays scraped (2001–2026) — `data/corpus/`
- 30 hand-curated outcomes; 15 attached to the live extracted-take corpus for the calibration sample — `data/outcomes.json`
- 67% overall hit rate, 4 sharp pattern statements including the meta-pattern that high conviction backfires on macro/structural calls
- 1 hand-verified self-contradiction PG flagged himself — `data/contradiction-fallback.json`

## Install

```bash
git clone https://github.com/rayan-arya/hindsight-skills
cd hindsight-skills
npm install
ANTHROPIC_API_KEY=... npm run dev
```

Server runs on port 3001. POST to `/skills/[name]` to invoke each skill.

Track C scripts (corpus scrape + The Hog fresh-signal service) live in `data/scripts/` and have their own `requirements.txt`.

## The first commercial wedge

Partner memos at venture firms — concentrated, dated, falsifiable claims with public outcome data, and partners pay for anything that makes them less wrong. We think the calibration layer is what every AI memory product is going to need within 18 months.
