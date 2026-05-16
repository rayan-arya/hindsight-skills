# C.4 — Demo Question Candidates

**For Rayan to pick from at the C.4 lock (~2:50 PT).**

Backwards-design rule: the question must trigger a visible calibration
adjustment. So we pick the **pattern** first, then the **question** that
exercises it.

A.4 produced these 4 patterns (verbatim per Rayan, 2:43 PT):

| # | Pattern | Hit |
|---|---|---|
| P1 | Right on startup tactics (high conviction, 80% domain hit rate) | 67% overall |
| P2 | Wrong on market-structure (super-angels, VCs — overconfidence) | – |
| P3 | Founder-behavior calls slip when tooling assumptions change (solo-founder softened) | – |
| **P4** ⭐ | **High conviction correlates with correctness in product/founder but backfires in macro/structural** | – |

P1 is bad for Scene 3 — he's right too often, no visible correction.
P4 is the demo gold: it's a *meta-pattern* about WHEN confidence
fires vs misfires.

---

## Recommended pick: Q1 (fires P4 via geographic / macro lens)

> **"Should the next wave of YC startups still cluster in San Francisco, or has remote-first won?"**

- **Pattern fired:** P4 — high-conviction macro/structural call
- **Adjustment text (sketch):**
  > "Your past high-conviction calls on macro structure (super-angels would
  > displace VCs, language ecosystems would die, cities would stay durable
  > magnets) have a low hit rate. The more confident you've been on a
  > geographic/structural claim, the more likely you've been wrong. Adjust
  > toward weighting recent remote-first data more than your prior would
  > suggest."
- **Synthesized take (sketch):** can reference Airbnb / Stripe — companies
  he funded — as remote-success counter-evidence to his own 2007–2008
  hub thesis.
- **Why this lands:** P4 is the most surprising pattern statement; the
  question maps to it cleanly; YC-mentor relevance for Garry.

## Alternates (in case Q1 doesn't fit profile output)

### Q2 — fires P2 (market-structure overconfidence) directly
> **"Are solo GPs and rolling funds going to displace the traditional VC
> model, or has that prediction been wrong before?"**

- Quotes back the super-angels miss directly — one of the highlight takes.
- Adjustment: "You said VCs were seriously threatened by super-angels in 2010.
  Top VCs ended the 2010s stronger than ever. Underweight this kind of
  incumbent-displacement call in venture."

### Q3 — fires P3 (founder tooling assumptions)
> **"Has AI tooling made the two-cofounder rule obsolete?"**

- Adjustment: PG's 2010 'hard to start with one founder' has eroded as
  AI tooling unlocked solo-founder scope. Confidence backfired when the
  underlying constraint changed.

### Q4 — fires P4 via ecosystem-durability lens
> **"How should we bet on programming language adoption over the next decade —
> does picking JavaScript vs Rust vs newer AI-native languages even matter?"**

- Quotes the Java miss directly.
- Adjustment: high-conviction ecosystem calls have aged badly; bet on
  incumbents.

---

## Lock procedure (when Rayan picks)

1. Rayan writes the chosen `{question, force_pattern}` to
   `data/demo-config.json`.
2. Keshav runs
   `python3 data/scripts/refire-hog-prefetch.py "<chosen question>"`
   to overwrite `data/fresh-signal-fixture.json` with topic-specific items.
3. Rushil's extension reads the fixture in DEMO_MODE.
4. **Lock — no question changes after the prefetch fires.**
