import Anthropic from "@anthropic-ai/sdk";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DomainProfile,
  HighlightTake,
  HindsightProfileInput,
  HindsightProfileOutput,
  Outcome,
  OutcomeVerdict,
  Profile,
  Take,
  TakeDomain,
  VerdictDistribution,
} from "@hindsight/types";

/**
 * hindsight-profile — aggregates takes that have been through resolve-outcomes
 * into a calibration Profile: hero stats over the graded subset, per-domain
 * accuracy, a verdict distribution, Claude-written pattern statements, and a
 * deterministic pick of the most striking takes.
 *
 * Input carries ALL takes (most have `outcome: null`); the graded subset
 * (`outcome !== null`) is the calibration sample.
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const USER = "paul-graham";

const VALID_VERDICTS: readonly OutcomeVerdict[] = [
  "correct",
  "partially correct",
  "incorrect",
  "unresolvable",
];

/**
 * Internal Claude prompt — hindsight prompts-doc §5, A.PROMPT.hindsight-profile.
 * The STATS + GRADED TAKES block is appended after a blank line.
 */
const PROFILE_PROMPT = `You are analyzing a thinker's forecasting track record to find sharp, falsifiable patterns.

You are given GRADED TAKES — claims the author made, each with a verdict on how it turned out (correct / partially correct / incorrect / unresolvable) and a one-line explanation of that verdict.

Your job: write 2 to 4 PATTERN STATEMENTS describing HOW this author tends to be right or wrong.

A GOOD pattern statement:
- Names a domain, a topic, or a KIND of claim (e.g. high-conviction calls).
- States a direction: right, wrong, early, late, over-optimistic, over-confident.
- Is specific and FALSIFIABLE — a reader could check it against the takes.
- Carries a magnitude or timeframe where the takes support one.

GOOD: "Right on startup tactics, but late on macro tech timing by 18+ months."
GOOD: "Over-confident on geography — his high-conviction calls about cities underperform his hedged ones."
BAD: "The author makes interesting predictions." (generic, not falsifiable)
BAD: "Sometimes right, sometimes wrong." (says nothing)

RULES:
- Ground every pattern in the takes below. Do not invent claims or outcomes.
- A domain with fewer than 3 graded takes is LOW SAMPLE — do not build a pattern on it alone.
- If the data is thin or uniform, return fewer patterns (even 1 or 2). Never pad with generic statements.
- 2 to 4 statements. Each is ONE sentence, max 160 characters.

Output ONLY a JSON array of strings. No prose, no markdown fences.
Example: ["pattern one", "pattern two"]
`;

/** A Take whose outcome is present and carries a recognized verdict. */
type GradedTake = Take & { outcome: Outcome };

/** Walk up from this module until a directory containing data/corpus. */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "data", "corpus"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Server and harness both run from the repo root — fall back to cwd.
  return process.cwd();
}

let corpusCountCache: Promise<number | null> | null = null;

/** Count `.md` files in data/corpus — the real corpus size. null on failure. */
async function countCorpusFiles(): Promise<number | null> {
  if (corpusCountCache === null) {
    corpusCountCache = (async (): Promise<number | null> => {
      const entries = await readdir(join(repoRoot(), "data", "corpus"));
      return entries.filter((f) => f.endsWith(".md")).length;
    })().catch((err: unknown) => {
      console.error(
        `[hindsight-profile] could not count data/corpus: ${String(err)}`,
      );
      corpusCountCache = null;
      return null;
    });
  }
  return corpusCountCache;
}

/** True when a take has a non-null outcome with a recognized verdict. */
function isGraded(take: Take): take is GradedTake {
  return (
    take.outcome !== null &&
    (VALID_VERDICTS as readonly string[]).includes(take.outcome.outcome)
  );
}

/** Round to 3 decimals — enough precision, no 0.733333333 noise. */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Count graded takes by verdict. */
function countVerdicts(takes: readonly GradedTake[]): VerdictDistribution {
  const d: VerdictDistribution = {
    correct: 0,
    partial: 0,
    incorrect: 0,
    unresolvable: 0,
  };
  for (const t of takes) {
    const v = t.outcome.outcome;
    if (v === "correct") d.correct += 1;
    else if (v === "partially correct") d.partial += 1;
    else if (v === "incorrect") d.incorrect += 1;
    else d.unresolvable += 1;
  }
  return d;
}

/**
 * Hit rate: correct plus half-credit for partial, over graded minus
 * unresolvable. Unresolvable takes were never settled, so they neither
 * help nor hurt. Returns 0 when there is nothing settled to score.
 */
function hitRate(d: VerdictDistribution): number {
  const settled = d.correct + d.partial + d.incorrect;
  if (settled === 0) return 0;
  return round3((d.correct + 0.5 * d.partial) / settled);
}

/** Per-domain calibration, most-sampled domain first. */
function buildDomainProfiles(graded: readonly GradedTake[]): DomainProfile[] {
  const groups = new Map<TakeDomain, GradedTake[]>();
  for (const t of graded) {
    const arr = groups.get(t.domain) ?? [];
    arr.push(t);
    groups.set(t.domain, arr);
  }
  const profiles: DomainProfile[] = [];
  for (const [domain, takes] of groups) {
    profiles.push({
      domain,
      hit_rate: hitRate(countVerdicts(takes)),
      n: takes.length,
    });
  }
  profiles.sort((a, b) => b.n - a.n || a.domain.localeCompare(b.domain));
  return profiles;
}

/**
 * Strikingness score for the verdict feed. Rewards surprising results —
 * a high-conviction call that went wrong, or a hedged call that landed —
 * over expected ones, plus a nudge for takes that carry evidence.
 */
function strikingness(take: GradedTake): number {
  const v = take.outcome.outcome;
  const c = take.conviction;
  let s = 0;
  if (v === "incorrect") s += 3;
  else if (v === "partially correct") s += 2;
  else if (v === "correct") s += 1;
  const wrong = v === "incorrect" || v === "partially correct";
  if (wrong && c === "high") s += 3; // sure of it, and wrong
  else if (v === "correct" && c === "low") s += 3; // hedged, and right
  else if (wrong && c === "medium") s += 1;
  if (take.outcome.evidence.length > 0) s += 1;
  return s;
}

/** The 3-5 most striking graded takes, for the Profile view's verdict feed. */
function pickHighlights(graded: readonly GradedTake[]): HighlightTake[] {
  const ranked = [...graded].sort((a, b) => strikingness(b) - strikingness(a));
  return ranked.slice(0, 5).map((t) => ({
    take_id: t.id,
    claim_text: t.claim_text,
    verdict_summary: t.outcome.verdict,
  }));
}

/** Render the STATS + GRADED TAKES block appended to the Claude prompt. */
function buildClaudeInput(
  graded: readonly GradedTake[],
  domains: readonly DomainProfile[],
  dist: VerdictDistribution,
  overallHitRate: number,
  corpusSize: number,
  totalTakes: number,
): string {
  const lines: string[] = ["STATS:"];
  lines.push("- Author: Paul Graham");
  lines.push(
    `- Corpus: ${corpusSize} essays, ${totalTakes} takes extracted, ` +
      `${graded.length} graded as the calibration sample`,
  );
  lines.push(
    `- Overall hit rate: ${overallHitRate} ` +
      "(correct + half-credit for partial, over graded minus unresolvable)",
  );
  lines.push(
    `- Verdict distribution: ${dist.correct} correct, ${dist.partial} ` +
      `partially correct, ${dist.incorrect} incorrect, ` +
      `${dist.unresolvable} unresolvable`,
  );
  lines.push("- Per domain (hit_rate, n):");
  for (const d of domains) {
    lines.push(
      `    ${d.domain}: ${d.hit_rate}, n=${d.n}${d.n < 3 ? "  [LOW SAMPLE]" : ""}`,
    );
  }
  lines.push("", "GRADED TAKES:");
  graded.forEach((t, i) => {
    lines.push(
      `${i + 1}. [${t.domain}] (${t.conviction} conviction, ${t.claim_date})`,
    );
    lines.push(`   Claim: ${t.claim_text}`);
    lines.push(`   Verdict: ${t.outcome.outcome} — ${t.outcome.verdict}`);
  });
  return lines.join("\n");
}

/** Call Claude once with the profile prompt; return the raw text reply. */
async function callClaude(prompt: string): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from process.env
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return block.text;
}

/** Strip a markdown fence if present, JSON.parse, keep non-empty strings. */
function parsePatterns(raw: string): string[] {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) text = (fenced[1] ?? "").trim();
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Claude pattern response was not a JSON array");
  }
  return parsed
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

/** Number of distinct essays the takes were drawn from. */
function distinctEssaySlugs(takes: readonly Take[]): number {
  return new Set(takes.map((t) => t.essay_slug)).size;
}

function emptyProfile(totalTakes: number, corpusSize: number): Profile {
  return {
    user: USER,
    corpus_size: corpusSize,
    total_takes: totalTakes,
    resolved_takes: 0,
    overall_hit_rate: 0,
    by_domain: [],
    patterns: [],
    highlight_takes: [],
    verdict_distribution: {
      correct: 0,
      partial: 0,
      incorrect: 0,
      unresolvable: 0,
    },
  };
}

export async function runSkill(
  input: HindsightProfileInput,
): Promise<HindsightProfileOutput> {
  const takes = Array.isArray(input.resolved_takes) ? input.resolved_takes : [];
  const totalTakes = takes.length;

  // Real corpus size off disk; fall back to distinct essays if the read fails.
  const corpusSize = (await countCorpusFiles()) ?? distinctEssaySlugs(takes);

  const graded: GradedTake[] = [];
  let invalid = 0;
  for (const t of takes) {
    if (isGraded(t)) graded.push(t);
    else if (t.outcome !== null) invalid += 1; // has an outcome, bad verdict
  }
  if (invalid > 0) {
    console.error(
      `[hindsight-profile] skipped ${invalid} take(s) with an unrecognized verdict`,
    );
  }

  if (graded.length === 0) {
    console.error(
      "[hindsight-profile] no graded takes in input — returning empty profile",
    );
    return { profile: emptyProfile(totalTakes, corpusSize) };
  }

  const dist = countVerdicts(graded);
  const overallHitRate = hitRate(dist);
  const byDomain = buildDomainProfiles(graded);
  const highlights = pickHighlights(graded);

  // Pattern statements — Claude, retry once. A failure degrades to an empty
  // patterns list; the quantitative profile is still valid and worth returning.
  let patterns: string[] = [];
  const prompt =
    PROFILE_PROMPT +
    "\n" +
    buildClaudeInput(
      graded,
      byDomain,
      dist,
      overallHitRate,
      corpusSize,
      totalTakes,
    );
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      patterns = parsePatterns(await callClaude(prompt)).slice(0, 4);
      break;
    } catch (err) {
      console.error(
        `[hindsight-profile] pattern attempt ${attempt} failed: ${String(err)}`,
      );
    }
  }

  const profile: Profile = {
    user: USER,
    corpus_size: corpusSize,
    total_takes: totalTakes,
    resolved_takes: graded.length,
    overall_hit_rate: overallHitRate,
    by_domain: byDomain,
    patterns,
    highlight_takes: highlights,
    verdict_distribution: dist,
  };
  return { profile };
}
