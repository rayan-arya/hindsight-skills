# hindsight-profile

## Description

Aggregates resolved takes into a calibration profile — hit rate, per-domain accuracy, and qualitative pattern statements.

## Input

`HindsightProfileInput` from `@hindsight/types`:

```json
{ "resolved_takes": "Take[]" }
```

## Output

`HindsightProfileOutput` from `@hindsight/types`:

```json
{ "profile": "Profile" }
```

## Invocation

POST /skills/hindsight-profile
