# extract-takes — gold-standard test set

Hand-marked expected takes for 3 essays. This is the oracle for validating
`extract-takes` precision and recall before it runs on the full corpus
(work unit A.2).

## How to use this

After implementing `extract-takes`, run it against `data/corpus/cities.md`,
`relres.md`, and `founders.md`, and compare its output to the takes below:

- **Recall** — every expected take should have a clear counterpart in the
  output. Missing an obvious one is a recall problem → add few-shot examples
  to the prompt.
- **Precision** — output must not contain junk: pure opinion, tautologies,
  definitions, or advice with no falsifiable premise. Extra junk is a
  precision problem → tighten the prompt. See the excluded claims at the end.
- Comparison is **qualitative** — `claim_text` will be paraphrased
  differently by the model. A take "matches" if it captures the same
  falsifiable assertion. `conviction` within ±1 level is fine.

`take_id` / `essay_slug` / `claim_index` are mechanically derived (not model
output) and listed only for reference. `claim_index` is document-order
position within the essay.

> **Note on `-claim-N`:** `founders` Take 4 below (the cofounder claim) is what
> Keshav's `outcomes.json` curated as `what-we-look-for-in-founders-claim-2`.
> Document order ≠ curation order — which is exactly why `resolve-outcomes`
> (A.3) joins on `essay_slug` + `claim_text`, never on the `-claim-N` index.

---

## cities.md — "Cities and Ambition" (2008-05-01)

`essay_slug: cities` · title-slug: `cities-and-ambition`

### Take 1 — `cities-and-ambition-claim-1`
- **claim_text:** Great cities attract ambitious people, and each concentrates one kind of ambition; the message Silicon Valley sends is that you should be more powerful.
- **conviction:** high
- **domain:** geography
- **falsifiable_form:** A small set of cities durably concentrate distinct types of ambition; Silicon Valley concentrates the pursuit of power and world-changing impact.

### Take 2 — `cities-and-ambition-claim-2`
- **claim_text:** Where you live should in principle make only a couple percent difference to what you achieve, but empirically it matters far more — people who do great things cluster in a few places.
- **conviction:** high
- **domain:** geography
- **falsifiable_form:** Physical location has a large, measurable effect on a person's odds of doing great work.

### Take 3 — `cities-and-ambition-claim-3`
- **claim_text:** Cambridge, Massachusetts is currently the intellectual capital of the world.
- **conviction:** medium
- **domain:** geography
- **falsifiable_form:** Cambridge MA leads all other cities in concentration of intellectual activity as of 2008.

### Take 4 — `cities-and-ambition-claim-4`
- **claim_text:** New York is unlikely to grow into a startup hub rivaling Silicon Valley, because a founder there would feel like a second-class citizen.
- **conviction:** medium
- **domain:** geography
- **falsifiable_form:** New York does not become a startup hub comparable to Silicon Valley.

### Take 5 — `cities-and-ambition-claim-5`
- **claim_text:** San Francisco will shift from a "live better" city to a genuine startup center if enough good startups choose it over the Valley.
- **conviction:** medium
- **domain:** geography
- **falsifiable_form:** If good startups concentrate in San Francisco, SF becomes the center of gravity of Silicon Valley.

---

## relres.md — "Relentlessly Resourceful" (2009-03-01)

`essay_slug: relres` · title-slug: `relentlessly-resourceful`

### Take 1 — `relentlessly-resourceful-claim-1`
- **claim_text:** The essential quality of a good startup founder is being relentlessly resourceful.
- **conviction:** high
- **domain:** founder-behavior
- **falsifiable_form:** Startup-founder success correlates with relentless resourcefulness more than with any other single trait.

### Take 2 — `relentlessly-resourceful-claim-2`
- **claim_text:** Being relentlessly resourceful can be taught — surprisingly often, to many people, though not to everyone.
- **conviction:** medium
- **domain:** founder-behavior
- **falsifiable_form:** The relentlessly-resourceful trait can be deliberately developed in a meaningful fraction of people.

### Take 3 — `relentlessly-resourceful-claim-3`
- **claim_text:** The limiting factor on how many startups can exist is the supply of potential founders, not any economic ceiling on demand.
- **conviction:** high
- **domain:** market-timing
- **falsifiable_form:** Startup formation is constrained by the pool of capable founders rather than by market demand.

---

## founders.md — "What We Look for in Founders" (2010-10-01)

`essay_slug: founders` · title-slug: `what-we-look-for-in-founders`

### Take 1 — `what-we-look-for-in-founders-claim-1`
- **claim_text:** Determination is the most important quality in startup founders — more important than intelligence, above a threshold.
- **conviction:** high
- **domain:** founder-behavior
- **falsifiable_form:** Determination predicts startup-founder success better than intelligence does, above a baseline intelligence threshold.

### Take 2 — `what-we-look-for-in-founders-claim-2`
- **claim_text:** The kind of intelligence that matters most in founders is imagination — generating surprising new ideas — not speed at solving predefined problems.
- **conviction:** medium
- **domain:** founder-behavior
- **falsifiable_form:** Idea-generating imagination predicts founder success better than problem-solving speed does.

### Take 3 — `what-we-look-for-in-founders-claim-3`
- **claim_text:** The most successful founders tend to be "naughty" — they delight in breaking rules that do not matter.
- **conviction:** medium
- **domain:** founder-behavior
- **falsifiable_form:** Highly successful founders disproportionately show a willingness to break unimportant rules.

### Take 4 — `what-we-look-for-in-founders-claim-4`
- **claim_text:** It is empirically hard to start a startup with a single founder; most of the big successes have two or three.
- **conviction:** high
- **domain:** founder-behavior
- **falsifiable_form:** Startups with two or three founders succeed at a higher rate than single-founder startups.
- **note:** Keshav's `outcomes.json` curates this as `what-we-look-for-in-founders-claim-2`. Expected — see the `-claim-N` note at the top.

---

## Excluded borderline claims (precision guidance)

`extract-takes` should **not** emit these — they are not gradeable:

- **cities.md** — "ambition seems to precede anything specific to be ambitious about" → observation about psychology, not a falsifiable claim.
- **relres.md** — "'Make something people want' is the destination, 'be relentlessly resourceful' is how you get there" → slogan / advice, no falsifiable premise.
- **founders.md** — §2 "you need to be able to modify your dreams on the fly" → advice, not a sharp falsifiable claim.

If `extract-takes` emits takes resembling these, the prompt is too permissive.
