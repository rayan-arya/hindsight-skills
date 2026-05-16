import Anthropic from "@anthropic-ai/sdk";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdviceResult,
  BrainPage,
  CalibratedAdviseInput,
  CalibratedAdviseOutput,
  CalibrationAdjustment,
  FreshSignalItem,
} from "@hindsight/types";

/**
 * calibrated-advise — answers a question the way the thinker would, corrected
 * for the blind spots in their measured forecasting record and updated with
 * fresh external signal.
 *
 * Pipeline (never throws — always returns a valid AdviceResult):
 *   1. relevant_pages — keyword recall over data/corpus, then a ZeroEntropy
 *      rerank on top of those candidates. ZeroEntropy's API is a reranker, so
 *      retrieval is two-stage rather than an indexed collection; if the rerank
 *      call fails, the keyword ranking stands.
 *   2. fresh_signal — Track C's POST :8000/fetch-fresh-signal, else the
 *      data/fresh-signal-fixture.json fallback.
 *   3 + 4. calibration_adjustment + synthesized_take — one Claude call that
 *      picks the applicable pattern (or honors force_pattern) and writes the
 *      calibrated take.
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

const ZE_RERANK_URL = "https://api.zeroentropy.dev/v1/models/rerank";
const ZE_MODEL = "zerank-1";
const ZE_TIMEOUT_MS = 12_000;

const FRESH_SIGNAL_URL = "http://localhost:8000/fetch-fresh-signal";
const FRESH_SIGNAL_TIMEOUT_MS = 30_000;

const CANDIDATE_POOL = 20; // keyword-recall candidates handed to the reranker
const TOP_PAGES = 7; // brain pages kept after rerank
const EXCERPT_CHARS = 800; // per-page excerpt for rerank input + synthesis
const RELEVANCE_CHARS = 180; // BrainPage.relevance snippet length

const EMPTY_ADJUSTMENT = "Insufficient calibration data — no patterns to apply";

/** Function words dropped before keyword scoring. */
const STOPWORDS = new Set<string>([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "as", "is", "are", "was", "were", "be", "been", "it", "its", "that",
  "this", "these", "those", "will", "would", "can", "could", "should", "you",
  "your", "they", "their", "we", "our", "by", "from", "into", "than", "then",
  "so", "if", "not", "no", "do", "does", "did", "have", "has", "had", "more",
  "most", "about", "what", "which", "who", "how", "when", "where", "should",
  "down", "up", "out", "over", "expand",
]);

/**
 * Internal Claude prompt — hindsight prompts-doc §5, A.PROMPT.calibrated-advise.
 * The QUESTION + CALIBRATION + PAST WRITING + FRESH SIGNAL block is appended.
 */
const SYNTHESIS_PROMPT = `You are producing CALIBRATED ADVICE.

A thinker has a measured forecasting track record — we know the systematic ways they tend to be right and wrong (their CALIBRATION PATTERNS). Answer the user's QUESTION the way this thinker would, but corrected for their known blind spots and updated with FRESH SIGNAL.

You are given:
- QUESTION — what the user is asking.
- CALIBRATION PATTERNS — how this thinker is systematically right or wrong. The blind spots.
- PAST WRITING — excerpts from the thinker's relevant essays: their instinct, their prior view.
- FRESH SIGNAL — recent external developments bearing on the question.

Produce three things:

1. applicable_pattern — the ONE calibration pattern most relevant to this question. If a pattern is marked FORCED, use that one verbatim. If there are no patterns, use "".

2. adjustment_text — one or two sentences: name the blind spot and how it should shift the answer. If there are no patterns, use exactly: "${EMPTY_ADJUSTMENT}".

3. synthesized_take — the calibrated answer, 120-200 words. It MUST explicitly contrast what the thinker's instinct or past writing points toward against the calibrated conclusion once the blind spot and the fresh signal are accounted for. Be concrete and decisive — name a direction, not "it depends". Where the fresh signal supports a point, use it.

Output ONLY a JSON object. No prose, no markdown fences:
{"applicable_pattern": "...", "adjustment_text": "...", "synthesized_take": "..."}
`;

interface CorpusEssay {
  slug: string;
  title: string;
  url: string;
  body: string;
  titleTokens: Set<string>;
  bodyTokens: Set<string>;
}

/** A retrieved essay paired with the excerpt that matched the question. */
interface Candidate {
  essay: CorpusEssay;
  excerpt: string;
}

interface Synthesis {
  applicable_pattern: string;
  adjustment_text: string;
  synthesized_take: string;
}

/** Lowercase content words: length >= 2, not a stopword. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Walk up from this module until a directory containing data/corpus. */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "data", "corpus"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Split a corpus file into title, source url, and body. */
function parseEssay(slug: string, content: string): CorpusEssay {
  let title = slug;
  let url = "";
  let body = content;
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    const inner = fm[1] ?? "";
    title = (inner.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? slug).trim();
    url = (inner.match(/^source_url:\s*["']?(\S+?)["']?\s*$/m)?.[1] ?? "").trim();
    body = content.slice(fm[0].length);
  }
  return {
    slug,
    title,
    url,
    body,
    titleTokens: new Set(tokenize(title)),
    bodyTokens: new Set(tokenize(body)),
  };
}

let corpusCache: Promise<CorpusEssay[]> | null = null;

/** Load + parse every data/corpus/*.md once; cached for the process. */
async function loadCorpus(): Promise<CorpusEssay[]> {
  if (corpusCache === null) {
    corpusCache = (async (): Promise<CorpusEssay[]> => {
      const dir = join(repoRoot(), "data", "corpus");
      const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
      const essays: CorpusEssay[] = [];
      for (const f of files) {
        const content = await readFile(join(dir, f), "utf8");
        essays.push(parseEssay(f.replace(/\.md$/, ""), content));
      }
      return essays;
    })().catch((err: unknown) => {
      console.error(`[calibrated-advise] could not load data/corpus: ${String(err)}`);
      corpusCache = null;
      return [];
    });
  }
  return corpusCache;
}

/** ~EXCERPT_CHARS window of the body around the first matched question term. */
function excerptFor(body: string, queryTokens: Set<string>): string {
  const lower = body.toLowerCase();
  let pos = -1;
  for (const tok of queryTokens) {
    const i = lower.indexOf(tok);
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  const start = pos === -1 ? 0 : Math.max(0, pos - 200);
  return body.slice(start, start + EXCERPT_CHARS).replace(/\s+/g, " ").trim();
}

/** Keyword recall: the CANDIDATE_POOL essays with the most question-term overlap. */
function keywordCandidates(question: string, corpus: CorpusEssay[]): Candidate[] {
  const queryTokens = new Set(tokenize(question));
  if (queryTokens.size === 0) return [];
  const scored = corpus
    .map((essay) => {
      let score = 0;
      for (const tok of queryTokens) {
        if (essay.titleTokens.has(tok)) score += 3; // title hits weigh more
        if (essay.bodyTokens.has(tok)) score += 1;
      }
      return { essay, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_POOL);
  return scored.map(({ essay }) => ({
    essay,
    excerpt: excerptFor(essay.body, queryTokens),
  }));
}

/** POST JSON with an AbortController timeout. Throws on non-2xx or timeout. */
async function postJSON(
  url: string,
  body: unknown,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rerank keyword candidates with ZeroEntropy for sharper ordering. Returns the
 * reordered candidates, or null when ZeroEntropy is unavailable (the caller
 * then keeps the keyword ranking).
 */
async function rerankCandidates(
  question: string,
  candidates: Candidate[],
): Promise<Candidate[] | null> {
  const key = process.env.ZEROENTROPY_API_KEY;
  if (!key || candidates.length === 0) return null;
  try {
    const data = await postJSON(
      ZE_RERANK_URL,
      {
        model: ZE_MODEL,
        query: question,
        documents: candidates.map((c) => `${c.essay.title}\n${c.excerpt}`),
        top_n: TOP_PAGES,
        latency: "fast",
      },
      ZE_TIMEOUT_MS,
      { Authorization: `Bearer ${key}` },
    );
    const results = (data as { results?: unknown }).results;
    if (!Array.isArray(results) || results.length === 0) return null;
    const ordered: Candidate[] = [];
    for (const r of results) {
      const idx = (r as { index?: unknown }).index;
      if (typeof idx !== "number") continue;
      const cand = candidates[idx];
      if (cand) ordered.push(cand);
    }
    return ordered.length > 0 ? ordered : null;
  } catch (err) {
    console.error(`[calibrated-advise] ZeroEntropy rerank failed: ${String(err)}`);
    return null;
  }
}

/** Validate an unknown value into a FreshSignalItem[]. */
function toFreshSignalItems(x: unknown): FreshSignalItem[] {
  if (!Array.isArray(x)) return [];
  const out: FreshSignalItem[] = [];
  for (const it of x) {
    if (typeof it !== "object" || it === null) continue;
    const o = it as Record<string, unknown>;
    if (
      typeof o.source === "string" &&
      typeof o.title === "string" &&
      typeof o.url === "string" &&
      typeof o.date === "string" &&
      typeof o.summary === "string"
    ) {
      out.push({
        source: o.source,
        title: o.title,
        url: o.url,
        date: o.date,
        summary: o.summary,
      });
    }
  }
  return out;
}

/**
 * Fresh signal from Track C's endpoint, falling back to the bundled HN
 * fixture, then to an empty list. Never throws.
 */
async function fetchFreshSignal(topic: string): Promise<FreshSignalItem[]> {
  try {
    const data = await postJSON(FRESH_SIGNAL_URL, { topic }, FRESH_SIGNAL_TIMEOUT_MS);
    const items = toFreshSignalItems((data as { items?: unknown }).items);
    if (items.length > 0) return items;
    console.error("[calibrated-advise] fresh-signal endpoint returned nothing — using fixture");
  } catch (err) {
    console.error(
      `[calibrated-advise] fresh-signal endpoint unavailable (${String(err)}) — using fixture`,
    );
  }
  try {
    const raw = await readFile(
      join(repoRoot(), "data", "fresh-signal-fixture.json"),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    return toFreshSignalItems((parsed as { items?: unknown }).items);
  } catch (err) {
    console.error(
      `[calibrated-advise] fresh-signal fixture unreadable (${String(err)}) — none`,
    );
    return [];
  }
}

/** Call Claude once with the synthesis prompt; return the raw text reply. */
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

/** Strip a markdown fence if present, JSON.parse, validate the 3 fields. */
function parseSynthesis(raw: string): Synthesis {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) text = (fenced[1] ?? "").trim();
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("synthesis response was not a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  if (
    typeof o.applicable_pattern !== "string" ||
    typeof o.adjustment_text !== "string" ||
    typeof o.synthesized_take !== "string" ||
    o.synthesized_take.trim().length === 0
  ) {
    throw new Error("synthesis response missing required string fields");
  }
  return {
    applicable_pattern: o.applicable_pattern.trim(),
    adjustment_text: o.adjustment_text.trim(),
    synthesized_take: o.synthesized_take.trim(),
  };
}

/** Render the data block appended to the synthesis prompt. */
function buildSynthesisInput(
  question: string,
  patterns: string[],
  forced: string | null,
  pages: Candidate[],
  freshSignal: FreshSignalItem[],
): string {
  const lines: string[] = [`QUESTION:`, question, "", "CALIBRATION PATTERNS:"];
  if (patterns.length === 0) lines.push("(none — no calibration data available)");
  else patterns.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  if (forced) lines.push(`FORCED — you MUST use this exact pattern: ${forced}`);
  lines.push("", "PAST WRITING (the thinker's relevant essays):");
  if (pages.length === 0) lines.push("(none retrieved)");
  else for (const p of pages) lines.push(`- ${p.essay.title}\n  ${p.excerpt}`);
  lines.push("", "FRESH SIGNAL (recent external developments):");
  if (freshSignal.length === 0) lines.push("(none)");
  else {
    for (const f of freshSignal) {
      lines.push(`- [${f.source}] ${f.title} (${f.date}): ${f.summary}`);
    }
  }
  return lines.join("\n");
}

/** Synthesis with retry-once; a total failure degrades to a usable result. */
async function synthesize(
  question: string,
  patterns: string[],
  forced: string | null,
  pages: Candidate[],
  freshSignal: FreshSignalItem[],
): Promise<Synthesis> {
  const prompt =
    SYNTHESIS_PROMPT +
    "\n" +
    buildSynthesisInput(question, patterns, forced, pages, freshSignal);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const parsed = parseSynthesis(await callClaude(prompt));
      if (forced) parsed.applicable_pattern = forced; // force_pattern always wins
      return parsed;
    } catch (err) {
      console.error(
        `[calibrated-advise] synthesis attempt ${attempt} failed: ${String(err)}`,
      );
    }
  }
  const fallbackPattern = forced ?? patterns[0] ?? "";
  return {
    applicable_pattern: fallbackPattern,
    adjustment_text: fallbackPattern
      ? "Synthesis unavailable — weigh this pattern manually against the answer."
      : EMPTY_ADJUSTMENT,
    synthesized_take:
      "Synthesis unavailable — could not generate a calibrated take. The retrieved pages, fresh signal, and calibration adjustment above still apply.",
  };
}

/** Trim an excerpt to a short BrainPage.relevance snippet. */
function relevanceSnippet(excerpt: string): string {
  const s = excerpt.replace(/\s+/g, " ").trim();
  return s.length <= RELEVANCE_CHARS ? s : `${s.slice(0, RELEVANCE_CHARS - 1)}…`;
}

export async function runSkill(
  input: CalibratedAdviseInput,
): Promise<CalibratedAdviseOutput> {
  const question = typeof input.question === "string" ? input.question : "";
  const profile = input.profile;
  const patterns = Array.isArray(profile?.patterns)
    ? profile.patterns.filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      )
    : [];
  const forced =
    typeof input.force_pattern === "string" &&
    input.force_pattern.trim().length > 0
      ? input.force_pattern.trim()
      : null;
  const hasCalibration = patterns.length > 0 || forced !== null;

  // Step 1 — brain pages: keyword recall, ZeroEntropy rerank on top.
  const corpus = await loadCorpus();
  const candidates = keywordCandidates(question, corpus);
  const reranked = await rerankCandidates(question, candidates);
  const selected = (reranked ?? candidates).slice(0, TOP_PAGES);
  const relevant_pages: BrainPage[] = selected.map((c) => ({
    title: c.essay.title,
    url: c.essay.url,
    relevance: relevanceSnippet(c.excerpt),
  }));

  // Step 2 — fresh signal (Track C endpoint → fixture → empty).
  const fresh_signal = await fetchFreshSignal(question);

  // Steps 3 + 4 — synthesis picks the pattern and writes the calibrated take.
  const synthesis = await synthesize(
    question,
    patterns,
    forced,
    selected,
    fresh_signal,
  );

  const calibration_adjustment: CalibrationAdjustment = hasCalibration
    ? {
        applicable_pattern: synthesis.applicable_pattern,
        adjustment_text: synthesis.adjustment_text,
      }
    : { applicable_pattern: "", adjustment_text: EMPTY_ADJUSTMENT };

  const advice: AdviceResult = {
    question,
    relevant_pages,
    calibration_adjustment,
    fresh_signal,
    synthesized_take: synthesis.synthesized_take,
  };
  return { advice };
}
