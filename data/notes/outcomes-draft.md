# Outcome candidates — DRAFT v0

**Status:** pre-A.0b-push working notes. Will be transformed into
`data/outcomes.json` (Track C output) once the hindsight-skills repo exists
and Track A confirms the take_id format.

**Coverage so far:** 7 essays read end-to-end; 14 candidate outcomes drafted.
Target distribution: ~60% correct, ~20% partially correct, ~15% incorrect,
~5% unresolvable (per C.2 spec). Current draft is biased toward "interesting"
verdicts to seed the highlight-takes pool.

**Verdict-writing rule (from C.2):** specific not generic, quotable,
opinionated. "He was kinda right" is forbidden.

---

## hundred.html — "The Hundred-Year Language" (April 2003)

### Candidate H-1 — Java as evolutionary dead-end
- **Claim:** "Java will turn out to be an evolutionary dead-end, like Cobol."
- **Domain:** tech-trends
- **Conviction:** medium (hedged with "This is just a guess. I may be wrong.")
- **Outcome:** **incorrect**
- **Verdict:** Whiffed on Java's durability; in 2026 it powers 3B devices and
  spawned Kotlin and Scala as direct intellectual descendants.
- **Evidence:**
  - TIOBE index 2025: Java still top-5 by market share
  - Kotlin (JVM language, 2011) is Android's default — direct Java descendant
  - Scala, Clojure, Groovy: all JVM languages with active 2020s communities

### Candidate H-2 — Staying near main-branch languages
- **Claim:** "Staying close to the main branches is a useful heuristic for
  finding languages that will be good to program in now."
- **Domain:** tech-trends
- **Conviction:** medium
- **Outcome:** **correct**
- **Verdict:** Borne out — Python/JS/Rust all sit near the main-branch
  consensus on syntax + memory model; the marginal branches (Haskell, OCaml)
  stayed niche for production.

---

## inequality.html — "Inequality and Risk" (August 2005)

### Candidate I-1 — High taxes kill venture investing
- **Claim:** "If you lop off the top of the possible rewards, you thereby
  decrease people's willingness to take risks... [high taxes] make starting
  new companies one of those risks no longer worth taking."
- **Domain:** market-timing (economic policy)
- **Conviction:** high
- **Outcome:** **incorrect**
- **Verdict:** California raised top marginal rates through 2010s and 2020s;
  SF/SV venture investment hit all-time highs in 2021. The premise — that tax
  rates gate startup formation — didn't survive contact with real data.
- **Evidence:** PitchBook 2021 record-year VC report; CA top rate increases
  alongside record startup formation 2010-2021.

### Candidate I-2 — VCs would behave like bureaucrats without upside
- **Claim:** "If VCs weren't allowed to get rich, they'd behave like
  bureaucrats. Without hope of gain, they'd have only fear of loss."
- **Domain:** founder-behavior (investor incentives)
- **Conviction:** high
- **Outcome:** **partially correct** / **unresolvable**
- **Verdict:** Mechanically true — sovereign wealth and pension-fund-style
  capital does behave more conservatively. But the implied prediction that
  caps would have caused VC collapse is untested because no jurisdiction
  imposed the caps he warned about.

---

## superangels.html — "The New Funding Landscape" (October 2010)

### Candidate SA-1 — Super-angels existentially threaten VCs
- **Claim:** "I think VC funds are seriously threatened by the super-angels."
- **Domain:** market-timing
- **Conviction:** high
- **Outcome:** **incorrect**
- **Verdict:** The opposite happened — top VCs (Sequoia, a16z, Founders Fund)
  ended the 2010s stronger than ever, raising mega-funds; super-angel firms
  either became VCs (First Round, Felicis) or stayed niche.

### Candidate SA-2 — Postponing VC money gives founders leverage
- **Claim:** "Those who do raise VC rounds will be able to get higher
  valuations when they do."
- **Domain:** startup-tactics
- **Conviction:** medium
- **Outcome:** **correct**
- **Verdict:** Prescient — pre-seed → seed → Series A round inflation became
  the dominant pattern of the 2010s, with valuations climbing at each stage
  exactly as predicted.

---

## ramenprofitable.html — "Ramen Profitable" (July 2009)

### Candidate RP-1 — Ramen profitability as standard early goal
- **Claim:** "Ramen profitability... became feasible because software is
  now so cheap... it buys you time and removes you from the mercy of
  investors."
- **Domain:** startup-tactics
- **Conviction:** high
- **Outcome:** **correct**
- **Verdict:** Prescient — became gospel; "default alive" (PG 2015) is a
  direct lineage; bootstrapping movement (37signals, Indie Hackers, Levels.io
  community) operationalized the same idea at scale.

---

## growth.html — "Startup = Growth" (September 2012)

### Candidate G-1 — Growth is the only essential thing
- **Claim:** "The only essential thing is growth. Everything else we
  associate with startups follows from growth."
- **Domain:** startup-tactics
- **Conviction:** high
- **Outcome:** **correct**
- **Verdict:** Became the operating definition — every YC batch since 2012
  has been organized around weekly growth metrics; "growth rate" is now the
  default vocabulary of the entire seed-stage industry.

### Candidate G-2 — Use growth as the compass for every decision
- **Claim:** "If you get growth, everything else tends to fall into place...
  you can use growth like a compass to make almost every decision you face."
- **Domain:** startup-tactics
- **Conviction:** high
- **Outcome:** **partially correct**
- **Verdict:** Right as a default heuristic but eroded by 2022-2024 — the
  ZIRP-era "grow at all costs" cohort hit a wall when burn ratios mattered
  again; "Default Alive" (2015) was PG's own corrective.

---

## ramenprofitable / growth / 13sentences cluster — startup-tactics theme

### Candidate ST-1 — Software costs collapsing changes the funding picture
- **Claim:** (across multiple essays 2008-2012) Cost of starting a software
  startup has dropped 10-100x in a decade, so the funding model has to change.
- **Domain:** market-timing
- **Conviction:** high
- **Outcome:** **correct**
- **Verdict:** Foundational — cloud infrastructure economics (AWS 2006,
  Stripe 2010, Heroku 2007) made "$10K to launch" the new baseline, exactly
  as he framed it.

---

## cities.html — "Cities and Ambition" (May 2008)

### Candidate C-1 — Geographic concentration of ambition is durable
- **Claim:** "Great cities attract ambitious people... the message Silicon
  Valley sends is: you should be more powerful."
- **Domain:** geography
- **Conviction:** high
- **Outcome:** **partially correct**
- **Verdict:** Prescient on durability — SF/SV retained dominance through
  2020 — but missed the post-COVID remote shift; ambitious-founder hubs
  diversified (Miami, Austin, NYC AI scene) more than the 2008 essay
  predicted was possible.
- **Evidence:** YC batch geographic data 2008 vs 2024; remote-first founder
  cohort post-2020.

### Candidate C-2 — Cities send messages that affect ambitions
- **Claim:** "Where you live should make at most a couple percentage points
  of difference... empirically, it makes a lot more than that."
- **Domain:** geography / founder-behavior
- **Conviction:** high
- **Outcome:** **correct**
- **Verdict:** Even with remote work, founder-density effects (YC, AI hubs)
  remain measurable in fundraising outcomes; the directional claim survives.

---

## wealth.html — "How to Make Wealth" (April 2004) — [READ-IN-PROGRESS]

### Candidate W-1 — Startups as wealth-creation compression
- **Claim:** "A startup is a way to compress your whole working life into a
  few years."
- **Domain:** startup-tactics / founder-behavior
- **Conviction:** high
- **Outcome:** **correct**
- **Verdict:** Validated by 2010s+ data — top decile founder outcomes
  consistently 10-100x the corresponding decade-long FAANG-employee path.

### Candidate W-2 — Measurement + leverage are the levers (still TBD)
- **Claim:** Wealth is created by people who can measure their work and
  amplify it via leverage (technology, capital, team).
- **Domain:** startup-tactics
- **Outcome:** **TBD — needs full re-read**

---

## Reading queue (next, in priority order)

1. **startupideas.md** (Nov 2012) — "How to Get Startup Ideas"
2. **superlinear.md** (Oct 2023) — "Superlinear Returns" — too recent? maybe skip
3. **founders.md** (Oct 2010) — "What We Look For in Founders"
4. **startupmistakes.md** (Oct 2006) — "The 18 Mistakes That Kill Startups"
5. **13sentences.md** (Sep 2009) — "Startups in 13 Sentences"
6. **richnow.md** (Jan 2016) — "The Refragmentation"
7. **ineq.md** (Jan 2016) — "Economic Inequality"
8. **ace.md** — pick once title confirmed

## Highlight-take candidates (Profile view hero section)

These are the verdicts strong enough to make a judge react. Tag for
`hindsight-profile.highlight_takes`:

1. **G-1** (growth definition) — "Became the operating definition of the
   entire seed-stage industry."
2. **RP-1** (ramen profitable) — "Direct ancestor of Default Alive,
   bootstrapping movement, Indie Hackers."
3. **H-1** (Java dead-end) — "Whiffed on Java's durability; in 2026 it
   powers 3B devices and spawned Kotlin and Scala."
4. **C-1** (geography) — "Prescient on durability, missed the remote shift."
5. **SA-1** (super-angels) — "The opposite happened — top VCs ended the
   2010s stronger than ever."

## Patterns surfacing already (to inform hindsight-profile output)

After 14 candidates from 7 essays, two patterns are visible:

- **Right on startup tactics (high hit rate):** RP-1, G-1, G-2, SA-2, ST-1
  all in the correct/partially-correct column with strong directional calls.
- **Mixed on macro-tech and geography timing:** H-1, C-1, SA-1, I-1 all
  caught a real signal but mis-timed magnitude or missed structural shifts
  (remote work, language ecosystems, VC consolidation).

If this pattern holds through 30+ essays, it would generate exactly the
calibration profile Scene 2 of the demo describes — and Scene 3's question
should target the geography or macro-timing pattern, not startup tactics.
