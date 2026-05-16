import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EvidenceItem,
  Outcome,
  OutcomeVerdict,
  ResolveOutcomesInput,
  ResolveOutcomesOutput,
  Take,
} from "@hindsight/types";

/**
 * resolve-outcomes — given one Take, return its curated Outcome from
 * data/outcomes.json, or `null` when that take was never curated.
 *
 * This is a LOOKUP, not a grader: Track C hand-curates outcomes into
 * data/outcomes.json and this skill joins a take to its curated row.
 *
 * The join is deliberately NOT on `take.id`. The `-claim-N` suffix in a take
 * id reflects extract-takes' document order, which diverges from the curation
 * order in outcomes.json (settled during work unit A.2). Instead we match on
 * `essay_slug` (exact) plus `claim_text` (normalized overlap), so a paraphrase
 * gap between extract-takes and the curator does not break the join.
 */

/**
 * Token-overlap fraction at or above which two claim_texts are the same claim.
 * Tuned with skills/resolve-outcomes/audit-matching.ts against data/outcomes.json.
 */
export const DEFAULT_MATCH_THRESHOLD = 0.7;

const VALID_VERDICTS: readonly OutcomeVerdict[] = [
  "correct",
  "partially correct",
  "incorrect",
  "unresolvable",
];

/** Function words carrying no identifying signal — dropped before overlap. */
const STOPWORDS = new Set<string>([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "as", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "that", "this", "these", "those", "will", "would", "can", "could", "should",
  "shall", "may", "might", "must", "you", "your", "they", "their", "them", "we",
  "our", "us", "he", "she", "his", "her", "by", "from", "into", "than", "then",
  "so", "if", "no", "not", "do", "does", "did", "have", "has", "had", "more",
  "most", "much", "very", "also", "only", "just", "about", "out", "up", "what",
  "which", "who", "how", "when", "where", "there", "here", "because", "while",
  "get", "got", "one", "all", "any", "some", "such", "own",
]);

/** A validated row of data/outcomes.json with its claim_text pre-tokenized. */
export interface CuratedOutcome {
  take_id: string;
  essay_slug: string;
  claim_text: string;
  outcome: OutcomeVerdict;
  evidence: EvidenceItem[];
  verdict: string;
  resolved_at: string;
  /** `normalize(claim_text)` — precomputed for substring matching. */
  norm: string;
  /** `tokenize(claim_text)` — precomputed, deduped, stopwords removed. */
  tokens: string[];
}

/** A curated row matched to a take, with its index into the loaded array. */
export interface CuratedMatch {
  index: number;
  entry: CuratedOutcome;
  score: number;
}

/** Lowercase, drop punctuation, collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized content words: length >= 2, not a stopword, deduped. */
function tokenize(text: string): string[] {
  const seen = new Set<string>();
  for (const tok of normalize(text).split(" ")) {
    if (tok.length >= 2 && !STOPWORDS.has(tok)) seen.add(tok);
  }
  return [...seen];
}

/**
 * True when two tokens are the same word. Exact match, or — to absorb the
 * inflections a paraphrase introduces (found/founder, percent/percentage) —
 * one token is a prefix of the other and both are at least 4 chars.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    return a.startsWith(b) || b.startsWith(a);
  }
  return false;
}

/** Overlap coefficient: covered tokens of the smaller set / its size. */
function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  let covered = 0;
  for (const t of small) {
    if (large.some((o) => tokensMatch(t, o))) covered += 1;
  }
  return covered / small.length;
}

/** Match strength of a take's claim_text against one curated row, in [0, 1]. */
function matchScore(
  takeNorm: string,
  takeTokens: string[],
  entry: CuratedOutcome,
): number {
  if (
    takeNorm.length > 0 &&
    entry.norm.length > 0 &&
    (takeNorm.includes(entry.norm) || entry.norm.includes(takeNorm))
  ) {
    return 1;
  }
  return tokenOverlap(takeTokens, entry.tokens);
}

/**
 * Find the curated row for `take`: the same-essay row whose claim_text best
 * matches, provided it clears `threshold`. Returns null when none qualifies.
 */
export function findCuratedMatch(
  take: Take,
  curated: readonly CuratedOutcome[],
  threshold: number = DEFAULT_MATCH_THRESHOLD,
): CuratedMatch | null {
  const takeNorm = normalize(take.claim_text);
  const takeTokens = tokenize(take.claim_text);
  let best: CuratedMatch | null = null;
  for (let i = 0; i < curated.length; i += 1) {
    const entry = curated[i];
    if (!entry || entry.essay_slug !== take.essay_slug) continue;
    const score = matchScore(takeNorm, takeTokens, entry);
    if (score >= threshold && (best === null || score > best.score)) {
      best = { index: i, entry, score };
    }
  }
  return best;
}

/** Walk up from this module until a directory containing data/outcomes.json. */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "data", "outcomes.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Server and audit both run from the repo root — fall back to cwd.
  return process.cwd();
}

function isEvidence(x: unknown): x is EvidenceItem {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.url === "string" && typeof e.summary === "string";
}

/** Validate one raw outcomes.json row; return it pre-tokenized, or null. */
function toCuratedOutcome(x: unknown): CuratedOutcome | null {
  if (typeof x !== "object" || x === null) return null;
  const e = x as Record<string, unknown>;
  if (
    typeof e.essay_slug !== "string" ||
    e.essay_slug.trim().length === 0 ||
    typeof e.claim_text !== "string" ||
    e.claim_text.trim().length === 0 ||
    typeof e.outcome !== "string" ||
    !(VALID_VERDICTS as readonly string[]).includes(e.outcome) ||
    typeof e.verdict !== "string" ||
    typeof e.resolved_at !== "string" ||
    !Array.isArray(e.evidence) ||
    !e.evidence.every(isEvidence)
  ) {
    return null;
  }
  return {
    take_id: typeof e.take_id === "string" ? e.take_id : "",
    essay_slug: e.essay_slug,
    claim_text: e.claim_text,
    outcome: e.outcome as OutcomeVerdict,
    evidence: e.evidence as EvidenceItem[],
    verdict: e.verdict,
    resolved_at: e.resolved_at,
    norm: normalize(e.claim_text),
    tokens: tokenize(e.claim_text),
  };
}

let curatedCache: Promise<CuratedOutcome[]> | null = null;

/** Load + validate data/outcomes.json once; cached for the process lifetime. */
export async function loadCuratedOutcomes(): Promise<CuratedOutcome[]> {
  if (curatedCache === null) {
    curatedCache = (async (): Promise<CuratedOutcome[]> => {
      const raw = await readFile(
        join(repoRoot(), "data", "outcomes.json"),
        "utf8",
      );
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("data/outcomes.json is not a JSON array");
      }
      const valid: CuratedOutcome[] = [];
      let dropped = 0;
      for (const row of parsed) {
        const entry = toCuratedOutcome(row);
        if (entry) valid.push(entry);
        else dropped += 1;
      }
      if (dropped > 0) {
        console.error(
          `[resolve-outcomes] dropped ${dropped} malformed outcomes.json row(s)`,
        );
      }
      return valid;
    })().catch((err: unknown) => {
      curatedCache = null; // let a later call retry the read
      throw err;
    });
  }
  return curatedCache;
}

/** Append an unmatched take to the diagnostic log. Best-effort — never throws. */
async function logUnmatched(take: Take): Promise<void> {
  try {
    const dir = join(repoRoot(), "data", "notes");
    await mkdir(dir, { recursive: true });
    const claim = take.claim_text.replace(/\s+/g, " ").trim();
    const line = `${new Date().toISOString()}\t${take.essay_slug}\t${claim}\n`;
    await appendFile(join(dir, "unmatched-outcomes.log"), line, "utf8");
  } catch {
    // The log is a diagnostic aid — losing a line must not fail resolution.
  }
}

/**
 * resolve-outcomes — look up the curated Outcome for one take.
 *
 * Returns `{ outcome: null }` when the take has no curated row; this is NOT
 * the `unresolvable` verdict (a curated, graded result) — it means the take
 * was never curated at all. Unmatched takes are appended to
 * data/notes/unmatched-outcomes.log for Track C to triage.
 */
export async function runSkill(
  input: ResolveOutcomesInput,
): Promise<ResolveOutcomesOutput> {
  const { take } = input;
  const curated = await loadCuratedOutcomes();
  const match = findCuratedMatch(take, curated, DEFAULT_MATCH_THRESHOLD);
  if (match === null) {
    await logUnmatched(take);
    return { outcome: null };
  }
  const { entry } = match;
  const outcome: Outcome = {
    outcome: entry.outcome,
    evidence: entry.evidence.map((e) => ({ url: e.url, summary: e.summary })),
    verdict: entry.verdict,
    resolved_at: entry.resolved_at,
  };
  return { outcome };
}
