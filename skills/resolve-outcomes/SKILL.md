# resolve-outcomes

## Description

Looks up the curated outcome for a single take in `data/outcomes.json` and
returns it. Joins on `essay_slug` + `claim_text` overlap, never on the
`-claim-N` index in `take.id`. Returns `outcome: null` when the take has no
curated row (distinct from the `unresolvable` verdict).

## Input

`ResolveOutcomesInput` from `@hindsight/types`:

```json
{ "take": "Take" }
```

## Output

`ResolveOutcomesOutput` from `@hindsight/types`:

```json
{ "outcome": "Outcome | null" }
```

## Invocation

POST /skills/resolve-outcomes
