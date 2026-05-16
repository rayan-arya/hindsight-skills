import type { ExtractTakesInput, ExtractTakesOutput } from "@hindsight/types";

const EXAMPLE_OUTPUT: ExtractTakesOutput = {
  takes: [
    {
      id: "cities-and-ambition-claim-1",
      source_page: "essays/cities-and-ambition.md",
      claim_text:
        "Great cities attract ambitious people — you can sense it walking around one.",
      claim_date: "2008-05-01",
      conviction: "high",
      domain: "geography",
      falsifiable_form:
        "Geographic concentration of ambitious people persists in a small set of cities over time.",
      extracted_at: "2026-05-16T10:00:00.000Z",
      logged_explicitly: false,
      outcome: null,
    },
  ],
};

/**
 * extract-takes — scaffold.
 *
 * Returns hardcoded example output matching the @hindsight/types contract.
 * Real logic (call Claude, parse gradeable claims from brain_page_content)
 * lands in work unit A.2.
 */
export async function runSkill(
  input: ExtractTakesInput,
): Promise<ExtractTakesOutput> {
  return EXAMPLE_OUTPUT;
}
