import type {
  FindContradictionsInput,
  FindContradictionsOutput,
} from "@hindsight/types";

const EXAMPLE_OUTPUT: FindContradictionsOutput = {
  contradictions: [
    {
      topic: "remote work",
      claim_a: {
        text: "Founders must be co-located to ship at the velocity that makes startups work.",
        source_page: "essays/co-location.md",
        date: "2007-04-01",
      },
      claim_b: {
        text: "The best teams I've seen in 2020 are fully remote and shipping faster than anyone.",
        source_page: "essays/remote-2020.md",
        date: "2020-11-01",
      },
      contradiction_summary:
        "In 2007 he argued co-location was non-negotiable; in 2020 he conceded distributed teams shipped faster.",
    },
  ],
};

/**
 * find-contradictions — scaffold.
 *
 * Returns hardcoded example output matching the @hindsight/types contract.
 * Real logic (call Claude over the takes set to surface genuine
 * contradictions) lands in work unit A.6 (v2).
 */
export async function runSkill(
  input: FindContradictionsInput,
): Promise<FindContradictionsOutput> {
  return EXAMPLE_OUTPUT;
}
