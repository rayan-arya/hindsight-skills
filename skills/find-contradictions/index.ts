import Anthropic from "@anthropic-ai/sdk";
import type {
  ContradictionClaim,
  ContradictionPair,
  FindContradictionsInput,
  FindContradictionsOutput,
  Take,
} from "@hindsight/types";

/**
 * find-contradictions — surfaces pairs of takes by the same author that
 * contradict each other across time (claimed X, later claimed not-X about the
 * same topic). Evolution and nuance do not count — only direct conflict.
 *
 * Takes are grouped by domain (contradictions cluster within a domain), each
 * domain is chunked, and each chunk is one batched Claude call. Hard caps:
 * <=10 Claude calls, <=90s wall-clock, no retries. Returns the top high-
 * severity pairs, or an empty array (the caller then uses the curated
 * data/contradiction-fallback.json).
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const MAX_CALLS = 10;
const WALL_CLOCK_MS = 90_000;
const CALL_TIMEOUT_MS = 25_000;
const CHUNK_SIZE = 15;
const TOP_RESULTS = 5;

const SEVERITIES = ["high", "medium", "low"] as const;
type Severity = (typeof SEVERITIES)[number];

/**
 * Internal Claude prompt — hindsight prompts-doc §5, A.PROMPT.find-contradictions.
 * The numbered TAKES block + output instruction are appended.
 */
const CONTRADICT_PROMPT = `You're looking for direct contradictions in an author's writing across years. NOT evolution. NOT nuance. Pairs where the author claimed X and later claimed not-X about the same topic.

Examples of contradiction:
- 2005: "VCs are piratical and sneaky"
- 2008: "VCs turn out to be more upstanding but timid"

Examples of NOT contradiction:
- 2005: "Startups are hard"
- 2010: "Startups require resilience"
(Same idea, different angle. Evolution.)

For each pair you find, name the topic and explain the contradiction in one sentence. Severity: HIGH if the claims are nearly opposite, MEDIUM if they're in tension, LOW if it's mostly tonal.`;

/** A contradiction pair plus the fields used to rank it (not in the contract). */
interface RankedPair {
  pair: ContradictionPair;
  severity: Severity;
  dateGapMs: number;
  key: string;
}

/** A take is usable when it carries the fields contradiction-finding needs. */
function isUsableTake(t: unknown): t is Take {
  if (typeof t !== "object" || t === null) return false;
  const x = t as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.claim_text === "string" &&
    x.claim_text.trim().length > 0 &&
    typeof x.claim_date === "string" &&
    typeof x.source_page === "string" &&
    typeof x.domain === "string"
  );
}

/**
 * Split takes into chunks of at most `size`. For oversized domains, round-robin
 * over date-sorted takes so each chunk spans the full time range — a contiguous
 * slice would isolate old takes from new ones and miss old-vs-new contradictions.
 */
function chunkRoundRobin(takes: Take[], size: number): Take[][] {
  if (takes.length <= size) return [takes];
  const numChunks = Math.ceil(takes.length / size);
  const chunks: Take[][] = Array.from({ length: numChunks }, () => []);
  const sorted = [...takes].sort((a, b) =>
    a.claim_date.localeCompare(b.claim_date),
  );
  sorted.forEach((t, i) => {
    const c = chunks[i % numChunks];
    if (c) c.push(t);
  });
  return chunks;
}

/** Build the batches: chunk-0 of every domain (biggest first), then chunk-1, … */
function buildBatches(takes: Take[]): Take[][] {
  const groups = new Map<string, Take[]>();
  for (const t of takes) {
    const arr = groups.get(t.domain) ?? [];
    arr.push(t);
    groups.set(t.domain, arr);
  }
  const bySize = [...groups.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length);
  const chunksByDomain = bySize.map((g) => chunkRoundRobin(g, CHUNK_SIZE));
  const maxChunks = chunksByDomain.reduce((m, c) => Math.max(m, c.length), 0);
  const batches: Take[][] = [];
  for (let ci = 0; ci < maxChunks; ci += 1) {
    for (const chunks of chunksByDomain) {
      const chunk = chunks[ci];
      if (chunk && chunk.length >= 2) batches.push(chunk);
    }
  }
  return batches;
}

/** Call Claude once with an AbortController timeout; return the raw text. */
async function callClaude(prompt: string): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from process.env
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: ctrl.signal },
    );
    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Claude returned no text content");
    }
    return block.text;
  } finally {
    clearTimeout(timer);
  }
}

/** Prompt for one batch: numbered takes plus the JSON output instruction. */
function buildBatchPrompt(batch: Take[]): string {
  const lines: string[] = [CONTRADICT_PROMPT, "", "TAKES BY THE SAME AUTHOR:"];
  batch.forEach((t, i) => {
    lines.push(`[${i}] (${t.claim_date}) ${t.claim_text}`);
  });
  lines.push(
    "",
    'Output ONLY a JSON array, no prose, no markdown fences. Each element: {"take_a": <number>, "take_b": <number>, "topic": "...", "contradiction_summary": "...", "severity": "high"|"medium"|"low"}. take_a and take_b are the [bracketed] indices above. If there are no contradictions, output [].',
  );
  return lines.join("\n");
}

interface RawPair {
  take_a: number;
  take_b: number;
  topic: string;
  contradiction_summary: string;
  severity: Severity;
}

/** Strip a markdown fence, JSON.parse, keep well-formed pair objects. */
function parsePairs(raw: string): RawPair[] {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) text = (fenced[1] ?? "").trim();
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];
  const out: RawPair[] = [];
  for (const p of parsed) {
    if (typeof p !== "object" || p === null) continue;
    const x = p as Record<string, unknown>;
    if (
      typeof x.take_a === "number" &&
      typeof x.take_b === "number" &&
      x.take_a !== x.take_b &&
      typeof x.topic === "string" &&
      typeof x.contradiction_summary === "string" &&
      typeof x.severity === "string" &&
      (SEVERITIES as readonly string[]).includes(x.severity)
    ) {
      out.push({
        take_a: x.take_a,
        take_b: x.take_b,
        topic: x.topic,
        contradiction_summary: x.contradiction_summary,
        severity: x.severity as Severity,
      });
    }
  }
  return out;
}

function toClaim(t: Take): ContradictionClaim {
  return { text: t.claim_text, source_page: t.source_page, date: t.claim_date };
}

/** Resolve one raw pair against its batch into a ranked ContradictionPair. */
function toRankedPair(raw: RawPair, batch: Take[]): RankedPair | null {
  const ta = batch[raw.take_a];
  const tb = batch[raw.take_b];
  if (!ta || !tb || ta.id === tb.id) return null;
  // Order claims oldest-first — reads better and makes the time gap obvious.
  const [older, newer] = ta.claim_date <= tb.claim_date ? [ta, tb] : [tb, ta];
  const gap = Math.abs(
    Date.parse(older.claim_date) - Date.parse(newer.claim_date),
  );
  return {
    pair: {
      topic: raw.topic,
      claim_a: toClaim(older),
      claim_b: toClaim(newer),
      contradiction_summary: raw.contradiction_summary,
    },
    severity: raw.severity,
    dateGapMs: Number.isFinite(gap) ? gap : 0,
    key: [older.id, newer.id].sort().join("|"),
  };
}

export async function runSkill(
  input: FindContradictionsInput,
): Promise<FindContradictionsOutput> {
  const takes = Array.isArray(input.takes)
    ? input.takes.filter(isUsableTake)
    : [];
  if (takes.length < 2) return { contradictions: [] };

  const batches = buildBatches(takes);
  const started = Date.now();
  const ranked = new Map<string, RankedPair>();
  let calls = 0;

  for (const batch of batches) {
    if (calls >= MAX_CALLS) break;
    // Do not start a call that could run past the 90s wall-clock budget.
    if (Date.now() - started > WALL_CLOCK_MS - CALL_TIMEOUT_MS) break;
    calls += 1;
    try {
      const pairs = parsePairs(await callClaude(buildBatchPrompt(batch)));
      for (const raw of pairs) {
        const rp = toRankedPair(raw, batch);
        if (rp && !ranked.has(rp.key)) ranked.set(rp.key, rp);
      }
    } catch (err) {
      // Skip a failed batch — speed matters more than this batch's pairs.
      console.error(
        `[find-contradictions] batch ${calls} failed: ${String(err)}`,
      );
    }
  }

  const contradictions = [...ranked.values()]
    .filter((r) => r.severity === "high")
    .sort((a, b) => b.dateGapMs - a.dateGapMs)
    .slice(0, TOP_RESULTS)
    .map((r) => r.pair);

  console.error(
    `[find-contradictions] ${calls} call(s), ${ranked.size} pair(s) found, ` +
      `${contradictions.length} high-severity returned`,
  );
  return { contradictions };
}
