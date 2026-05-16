import type {
  HindsightProfileInput,
  HindsightProfileOutput,
} from "@hindsight/types";

const EXAMPLE_OUTPUT: HindsightProfileOutput = {
  profile: {
    user: "paul-graham",
    corpus_size: 200,
    total_takes: 47,
    resolved_takes: 38,
    overall_hit_rate: 0.71,
    by_domain: [
      { domain: "startup-tactics", hit_rate: 0.82, n: 17 },
      { domain: "market-timing", hit_rate: 0.54, n: 12 },
      { domain: "geography", hit_rate: 0.6, n: 9 },
    ],
    patterns: [
      "Consistently right about startup tactics and founder behavior (82%).",
      "Mixed on macro tech timing — often early by 2-4 years.",
      "Has under-weighted geographic shifts, especially since 2020.",
    ],
    highlight_takes: [
      {
        take_id: "cities-and-ambition-claim-1",
        claim_text:
          "Great cities attract ambitious people — you can sense it walking around one.",
        verdict_summary: "Prescient on durability, missed the remote shift.",
      },
    ],
  },
};

/**
 * hindsight-profile — scaffold.
 *
 * Returns hardcoded example output matching the @hindsight/types contract.
 * Real logic (compute quantitative stats, call Claude for qualitative
 * pattern statements) lands in work unit A.4.
 */
export async function runSkill(
  input: HindsightProfileInput,
): Promise<HindsightProfileOutput> {
  return EXAMPLE_OUTPUT;
}
