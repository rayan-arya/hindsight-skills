# calibrated-advise

## Description

Answers a current question using the calibration profile, retrieved brain pages, and fresh outside signal.

## Input

`CalibratedAdviseInput` from `@hindsight/types`:

```json
{
  "question": "string — the current question",
  "profile": "Profile — the user's calibration profile",
  "force_pattern": "string (optional) — pin which calibration pattern fires"
}
```

`brain_pages` and `fresh_signal` are **not** inputs — this skill fetches them internally (ZeroEntropy retrieval + The Hog fresh signal), wired in work unit A.5.

## Output

`CalibratedAdviseOutput` from `@hindsight/types`:

```json
{ "advice": "AdviceResult" }
```

## Invocation

POST /skills/calibrated-advise
