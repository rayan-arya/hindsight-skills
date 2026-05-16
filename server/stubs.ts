import type {
  ExtractTakesOutput,
  FindContradictionsOutput,
  ResolveOutcomesOutput,
  HindsightProfileOutput,
  CalibratedAdviseOutput,
} from "@hindsight/types";

/**
 * Hard-coded, contract-shaped responses for the scaffolding phase.
 *
 * Each skill's real logic lives in skills/<name>/index.ts and replaces the
 * corresponding stub here in work unit A.1 onward. Values are Paul-Graham-
 * flavored so curling an endpoint previews the demo data shape.
 */

const extractTakes: ExtractTakesOutput = {
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

const findContradictions: FindContradictionsOutput = {
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

const resolveOutcomes: ResolveOutcomesOutput = {
  outcome: {
    outcome: "partially correct",
    evidence: [
      {
        url: "https://example.com/sf-startup-dominance",
        summary: "SF retained startup dominance through 2020.",
      },
      {
        url: "https://example.com/remote-work-shift",
        summary: "Remote work redistributed some concentration between 2020 and 2023.",
      },
    ],
    verdict: "Prescient on durability, missed the remote shift.",
    resolved_at: "2026-05-16T11:00:00.000Z",
  },
};

const hindsightProfile: HindsightProfileOutput = {
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

const calibratedAdvise: CalibratedAdviseOutput = {
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

export const stubs = {
  extractTakes,
  findContradictions,
  resolveOutcomes,
  hindsightProfile,
  calibratedAdvise,
};
