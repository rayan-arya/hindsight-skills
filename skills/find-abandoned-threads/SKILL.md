# find-abandoned-threads

## Description

Surfaces threads of thought the author opened in an essay — a question raised,
an idea floated, a line of inquiry promised — and never returned to. An honesty
layer over the corpus: not what the author got wrong, but what they left
unfinished.

## Input

`FindAbandonedThreadsInput` from `@hindsight/types`:

```json
{ "takes": "Take[]" }
```

## Output

`FindAbandonedThreadsOutput` from `@hindsight/types`:

```json
{ "threads": "AbandonedThread[]" }
```

At most 3 threads, most demo-worthy first. Each `AbandonedThread` carries
`thread_title`, `source_essay`, `source_date`, `original_quote` (verbatim,
≤300 chars), and `why_unfinished`.

## Error paths

- Malformed input / no usable takes → `{ "threads": [] }`.
- Claude call fails → retried once, then `{ "threads": [] }`.
- Malformed Claude JSON → fence-stripped and reparsed; still bad → `{ "threads": [] }`.
- Never throws.

## Invocation

POST /skills/find-abandoned-threads
