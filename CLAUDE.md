# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hindsight — a self-reflection layer for GBrain. This repo, `hindsight-skills`, holds the five
Hindsight GBrain skills and an Express HTTP server that exposes them as REST endpoints.

Built for the **YC GStack × GBrain hackathon (May 16, 2026). Submission is due 7pm.** Every
decision serves the demo — build backward from the 100-second demo, not toward generality.

Sibling repos: `hindsight-types` (shared contracts), `hindsight-extension` (GStack Browser
sidebar — Track B).

## Commands

- `npm run dev` — Express server on `:3001` via `tsx watch` (auto-reload)
- `npm run build` — compile TS to `dist/`
- `npm start` — run the built server
- `npm run qa` — typecheck + lint (run to close every work unit)
- `npm run typecheck` / `npm run lint` — individually

No test runner. Verify a skill by curling its endpoint:
`curl -s -X POST -H 'Content-Type: application/json' -d '{...}' localhost:3001/skills/<name>`

`npm run qa` currently emits non-failing `no-unused-vars` warnings for scaffold `runSkill`
params not yet wired up — each clears when its skill gets real logic.

## Contracts — import, never redefine

Every JSON shape (`Take`, `Outcome`, `Profile`, `AdviceResult`, `FreshSignalItem`, `BrainPage`,
`ContradictionPair`, and each skill's `*Input`/`*Output`) lives in **`@hindsight/types`** — the
sibling `hindsight-types` repo, consumed as `file:../hindsight-types`.

**Never redefine a shape locally.** Always `import type { ... } from "@hindsight/types"`. If a
contract genuinely must change: edit `../hindsight-types/contracts.ts`, `npm run build` there,
commit + push, and tell Track B/C to pull + rebuild. Contract drift is the exact failure mode
the shared package exists to prevent — keep changes synchronous with the team.

## Architecture

Each skill is a directory under `skills/<name>/`:
- `SKILL.md` — input/output/purpose doc
- `index.ts` — exports `async function runSkill(input): Promise<Output>`, typed against `@hindsight/types`

`server/index.ts` imports each skill's `runSkill` and wires one route per skill,
`POST /skills/<name>` → `runSkill(req.body)`, plus `GET /health`. To give a skill real logic,
replace its `runSkill` body — the server route never changes.

The five skills and the pipeline they form:
- `extract-takes` — a brain page → gradeable `Take[]`
- `resolve-outcomes` — one `Take` → graded `Outcome` (curated `data/outcomes.json`, else Claude)
- `hindsight-profile` — resolved `Take[]` → calibration `Profile`
- `find-contradictions` — `Take[]` → `ContradictionPair[]` (v2)
- `calibrated-advise` — `{question, profile, force_pattern?}` → `AdviceResult`. Fetches brain
  pages (ZeroEntropy) and fresh signal internally — those are **not** inputs.

Skills call Claude via `@anthropic-ai/sdk`. ESM throughout (`"type": "module"`, `NodeNext`);
local imports use `.js` extensions. Env vars (`ANTHROPIC_API_KEY`, `ZEROENTROPY_API_KEY`,
`THEHOG_API_KEY`) load natively via `--env-file-if-exists=.env` in the npm scripts — no dotenv.

The per-skill Claude prompts and the full work-unit plan (A.0–A.7) come from the team's
`prompts.md` / `planning.md`, kept outside this repo.

## Track ownership — what you may edit

This repo is shared by Track A (skills engineer) and Track C (data curator).

**Track A owns and edits:**
- `skills/` — all five skill implementations
- `server/` — the HTTP server
- `data/gold-standard.md` — hand-marked expected takes for `extract-takes` validation. This is
  the **only** file under `data/` that Track A writes.

**Track C owns — do NOT edit:**
- `data/corpus/` — scraped Paul Graham essays
- `data/scripts/` — scrape + fresh-signal scripts
- `data/outcomes.json` — curated outcome dataset
- `data/notes/` — curation notes

A `/freeze` may be active restricting edits to this repo root; the ownership split above still
applies within it.

## Current state & next step

Done: **A.0a** (types repo), **A.0b** (this repo scaffold), **A.1** (skill scaffolds — all five
`runSkill`s return hardcoded example output matching their contract).

**Next: A.2 — `extract-takes` real logic**, planned via `/autoplan` (demo-critical skill). It
reads a brain page, calls Claude with the extract-takes prompt, and returns `Take[]`. Validate
against `data/gold-standard.md` (3 hand-marked essays).

Then A.3 `resolve-outcomes`, A.4 `hindsight-profile`, A.5 `calibrated-advise` (+ZeroEntropy
+The Hog), A.6 `find-contradictions` (v2), A.7 merge + end-to-end integration test.

## Cross-track integration notes

- **Corpus:** Track C has pushed **228 PG essays** to `data/corpus/` and `outcomes-draft.md` to
  `data/notes/`. Full corpus is available — `git pull` to get it locally.
- **Outcomes:** Track C pushes `data/outcomes.json` incrementally, starting at ~15 entries.
  `resolve-outcomes` must handle the file being absent or partial.
- **Fresh signal:** Track C runs a fresh-signal endpoint at `POST localhost:8000/fetch-fresh-signal`
  — body `{topic: string}`, returns `{items: FreshSignalItem[], source_used: "TheHog" | "HN-fallback"}`.
  `calibrated-advise` (A.5) calls this internally.
- **The Hog API** is currently 404ing. Keshav verified the HN fallback works — no action needed;
  `source_used` will report `"HN-fallback"`.
- **Demo question** is still TBD — locked at hour 4–5 with Track C. `calibrated-advise` takes a
  `force_pattern` param so the demo's calibration moment is guaranteed regardless.
