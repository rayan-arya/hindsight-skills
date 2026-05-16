# find-contradictions

## Description

Finds pairs of takes by the same author that contradict each other across time — the "wait, he said that?" moment.

## Input

`FindContradictionsInput` from `@hindsight/types`:

```json
{ "takes": "Take[]" }
```

## Output

`FindContradictionsOutput` from `@hindsight/types`:

```json
{ "contradictions": "ContradictionPair[]" }
```

## Invocation

POST /skills/find-contradictions
