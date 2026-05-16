import type {
  CalibratedAdviseInput,
  CalibratedAdviseOutput,
} from "@hindsight/types";

const EXAMPLE_OUTPUT: CalibratedAdviseOutput = {
  advice: {
    question:
      "Should YC double down on Bay Area founders or expand to global remote founders?",
    relevant_pages: [
      {
        title: "Cities and Ambition",
        url: "https://paulgraham.com/cities.html",
        relevance: "Directly addresses the geographic concentration of ambition.",
      },
    ],
    calibration_adjustment: {
      applicable_pattern:
        "Has under-weighted geographic shifts, especially since 2020.",
      adjustment_text:
        "Your past takes on geography were right on durability but late on shifts. Adjust toward weighting recent geographic data more heavily.",
    },
    fresh_signal: [
      {
        source: "TheHog",
        title: "Remote-first AI startups are raising larger seed rounds",
        url: "https://example.com/remote-ai-startups",
        date: "2026-05-14",
        summary:
          "Distributed AI teams are closing bigger early rounds than co-located peers.",
      },
    ],
    synthesized_take:
      "Calibrated answer: weight the geographic shift more than instinct suggests. The Bay Area still concentrates ambition, but your record shows you under-weight geographic change — so expanding toward global remote founders is the bet your past self would have missed.",
  },
};

/**
 * calibrated-advise — scaffold.
 *
 * Returns hardcoded example output matching the @hindsight/types contract.
 * Real logic (ZeroEntropy brain-page retrieval, The Hog fresh signal, Claude
 * synthesis) lands in work unit A.5. brain_pages and fresh_signal are fetched
 * internally, not received as inputs.
 */
export async function runSkill(
  input: CalibratedAdviseInput,
): Promise<CalibratedAdviseOutput> {
  return EXAMPLE_OUTPUT;
}
