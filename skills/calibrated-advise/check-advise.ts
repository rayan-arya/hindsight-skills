import { runSkill as calibratedAdvise } from "./index.js";
import type { CalibratedAdviseInput, Profile } from "@hindsight/types";

/**
 * Live harness for calibrated-advise.
 *
 * Runs Keshav's locked candidate demo question through the real pipeline
 * twice — once with natural pattern selection, once with force_pattern set —
 * and prints both AdviceResults so synthesized_take quality can be compared.
 *
 *   npm run calibrated-advise:check     (needs ANTHROPIC_API_KEY in .env)
 *
 * Run from the repo root. The profile below is A.4's verified live output —
 * hardcoded so the harness exercises calibrated-advise without re-running the
 * extract → resolve → profile pipeline. localhost:8000 is unlikely to be up
 * here, so fresh_signal will exercise the fixture fallback (expected).
 */

const QUESTION =
  "Should YC double down on Bay Area founders or expand to global remote founders?";

/** Profile from the A.4 hindsight-profile live run. */
const PROFILE: Profile = {
  user: "paul-graham",
  corpus_size: 228,
  total_takes: 162,
  resolved_takes: 12,
  overall_hit_rate: 0.667,
  by_domain: [
    { domain: "startup-tactics", hit_rate: 0.8, n: 5 },
    { domain: "founder-behavior", hit_rate: 0.625, n: 4 },
    { domain: "tech-trends", hit_rate: 0.5, n: 2 },
    { domain: "geography", hit_rate: 0.5, n: 1 },
  ],
  patterns: [
    "Right on startup tactics: high-conviction calls about founder behavior and product strategy hit at 0.8, with multiple claims becoming literal YC curriculum within a decade.",
    "Wrong on market-structure predictions: both high-conviction calls about competitive dynamics (super-angels vs VCs, risk/reward dampening startup formation) were incorrect, suggesting overconfidence when predicting how incentive systems reshape industries.",
    "Founder-behavior calls are accurate on psychology and culture but slip when the claim depends on tooling constraints — the solo-founder take softened as AI changed what one person could ship.",
    "High conviction correlates with correctness in product/founder domains but backfires in macro/structural domains — all 3 incorrect takes were high-conviction calls outside pure startup tactics.",
  ],
  highlight_takes: [],
  verdict_distribution: { correct: 7, partial: 2, incorrect: 3, unresolvable: 0 },
};

async function run(label: string, forcePattern?: string): Promise<void> {
  console.log(`\n${"=".repeat(72)}`);
  console.log(label);
  console.log("=".repeat(72));
  const input: CalibratedAdviseInput =
    forcePattern === undefined
      ? { question: QUESTION, profile: PROFILE }
      : { question: QUESTION, profile: PROFILE, force_pattern: forcePattern };
  const { advice } = await calibratedAdvise(input);
  console.log(JSON.stringify(advice, null, 2));
}

async function main(): Promise<void> {
  console.log(`Question: ${QUESTION}`);
  await run("RUN 1 — natural pattern selection (no force_pattern)");
  await run(
    "RUN 2 — demo path (force_pattern = pattern 4, macro/structural blind spot)",
    PROFILE.patterns[3],
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
