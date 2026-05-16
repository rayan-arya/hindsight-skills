import type {
  ResolveOutcomesInput,
  ResolveOutcomesOutput,
} from "@hindsight/types";

const EXAMPLE_OUTPUT: ResolveOutcomesOutput = {
  outcome: {
    outcome: "partially correct",
    evidence: [
      {
        url: "https://example.com/sf-startup-dominance",
        summary: "SF retained startup dominance through 2020.",
      },
      {
        url: "https://example.com/remote-work-shift",
        summary:
          "Remote work redistributed some concentration between 2020 and 2023.",
      },
    ],
    verdict: "Prescient on durability, missed the remote shift.",
    resolved_at: "2026-05-16T11:00:00.000Z",
  },
};

/**
 * resolve-outcomes — scaffold.
 *
 * Returns hardcoded example output matching the @hindsight/types contract.
 * Real logic (look up data/outcomes.json, else call Claude to grade the
 * take against public evidence) lands in work unit A.3.
 */
export async function runSkill(
  input: ResolveOutcomesInput,
): Promise<ResolveOutcomesOutput> {
  return EXAMPLE_OUTPUT;
}
