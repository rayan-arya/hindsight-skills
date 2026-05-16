# Highlight-Take Candidates (Profile view hero section)

**For:** `hindsight-profile` skill (A.4) to populate `profile.highlight_takes[]`,
which `ProfileView` renders in Scene 2 of the demo.

**Curator:** Track C (Keshav)
**Source:** `data/outcomes.json` — these are 5 verdicts strong enough to make
a judge react, ranked by demo punch.

The bar: every verdict should be quotable, specific, and emotionally
satisfying to read aloud. "He was kinda right" is forbidden. Each one
either lands as **prescient**, **missed**, or **viscerally specific**.

---

## Tier 1 — must include (these are the show)

### 1. Ramen Profitable (2009) — **prescient**
- `take_id`: `ramen-profitable-claim-1`
- **Verdict:** "Direct ancestor of Default Alive, the bootstrapping movement, Indie Hackers, and the entire 'profitable from day one' SaaS playbook."
- **Why it lands:** Every YC founder knows this term. Hearing the system label it "prescient" with a 17-year hindsight is the closest thing to a chef's-kiss moment in the corpus.

### 2. Java as Evolutionary Dead-End (2003) — **missed**
- `take_id`: `the-hundred-year-language-claim-1`
- **Verdict:** "Whiffed on Java's durability; in 2026 it powers 3B devices and spawned Kotlin and Scala as direct intellectual descendants."
- **Why it lands:** A famously confident PG prediction that aged badly. Hearing the system call out a miss this clearly demonstrates calibration — not just flattery.

### 3. Super-Angels Threaten VCs (2010) — **missed**
- `take_id`: `the-new-funding-landscape-claim-1`
- **Verdict:** "The opposite happened — top VCs ended the 2010s stronger than ever; super-angels either became VCs or stayed niche."
- **Why it lands:** Punchy, specific, and the audience (a VC) knows it's true.

## Tier 2 — strong alternates

### 4. Geographic Concentration (2008) — **partial / time-stamped**
- `take_id`: `cities-and-ambition-claim-1`
- **Verdict:** "Prescient on durability — SF/SV retained dominance through 2020 — but missed the post-COVID remote shift and hub diversification."
- **Why it lands:** Sets up the calibration "blind spot" that Scene 3's demo question should target (geographic shifts).
- **Critical for Scene 3 bridge.**

### 5. Startup = Growth (2012) — **prescient**
- `take_id`: `startup-growth-claim-1`
- **Verdict:** "Became the operating definition of the entire seed-stage industry — every YC partner conversation since 2012 has run on weekly growth."
- **Why it lands:** Demonstrates the system catches *foundational* correct calls, not just easy ones.

## Tier 3 — backup if any of T1/T2 needs swapping

### 6. Black Swan Power Law (2012) — **prescient**
- `take_id`: `black-swan-farming-claim-1`
- **Verdict:** "Canonical — the VC power law is now the foundation of every seed-fund pitch deck, exactly as PG framed it in 2012."

### 7. Best Ideas Look Bad (2012) — **prescient**
- `take_id`: `black-swan-farming-claim-2`
- **Verdict:** "Validated repeatedly — Airbnb, Stripe, Coinbase, Cloudflare all had 'this is crazy' reception, then became foundational."

### 8. Airbnb Skepticism (2010) — **prescient meta-claim**
- `take_id`: `what-we-look-for-in-founders-claim-3`
- **Verdict:** "The skepticism aged terribly and the underlying meta-claim (fund great founders even when the idea seems crazy) aged perfectly — Airbnb became YC's defining $100B case study."
- **Note:** Self-aware/recursive — PG admitting he was wrong about a YC investment that became the canonical YC case study.

---

## Recommended composition for `profile.highlight_takes`

Use 5 of these in this order (top to bottom in the ProfileView card grid):

1. **Ramen Profitable** (prescient) — opens with a win
2. **Super-Angels Threaten VCs** (missed) — first calibration moment
3. **Startup = Growth** (prescient) — biggest call he made
4. **Geographic Concentration** (partial) — sets up Scene 3 bridge
5. **Java as Dead-End** (missed) — closing miss that primes the audience for "what other blind spots does he have?"

This sequence is intentional: alternating prescient/missed/prescient/partial/missed
creates emotional momentum and *earns* the calibration narrative.

---

## Pattern statements likely to emerge from this set

If `hindsight-profile` generates patterns from these takes plus the
broader 30-outcome set, the natural language statements are:

1. "Consistently right about startup tactics — 87% across 8 takes — and especially strong on lean/bootstrap dynamics."
2. "Mixed on macro tech and investor-landscape timing (~50%) — often catches the directional signal but mis-times magnitude."
3. "Has under-weighted geographic shifts since 2020 — the post-COVID hub diversification kept catching him off-guard."
4. "Whiffs disproportionately on ecosystem-durability calls — Java, super-angels, founder-visa-as-SV-rival all aged poorly."

Pattern #3 is the one Scene 3's demo question should fire on.
