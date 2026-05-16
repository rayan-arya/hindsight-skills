# extract-takes

## Description

Finds gradeable claims — predictions, recommendations, calls — in a brain page and returns them as structured takes.

## Input

`ExtractTakesInput` from `@hindsight/types`:

```json
{
  "brain_page_content": "string — full markdown of the brain page",
  "brain_page_path": "string — e.g. essays/cities-and-ambition.md",
  "brain_page_date": "string — ISO date the page was written"
}
```

## Output

`ExtractTakesOutput` from `@hindsight/types`:

```json
{ "takes": "Take[]" }
```

## Invocation

POST /skills/extract-takes
