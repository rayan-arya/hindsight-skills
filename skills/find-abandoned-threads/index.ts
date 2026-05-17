import Anthropic from "@anthropic-ai/sdk";
import type {
  AbandonedThread,
  FindAbandonedThreadsInput,
  FindAbandonedThreadsOutput,
  Take,
} from "@hindsight/types";

/**
 * find-abandoned-threads — surfaces threads of thought the author opened in an
 * essay (a question raised, an idea floated, a line promised) and never
 * returned to. An honesty layer: not what the author got wrong, but what they
 * left unfinished.
 *
 * Calls Claude once over the takes, parses a fence-stripped JSON array, retries
 * once, never throws. Returns at most 3 threads, most demo-worthy first.
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const MAX_THREADS = 3;
const QUOTE_MAX = 300;

/**
 * Internal Claude prompt — Keshav's ground-truth-validated text, verbatim from
 * data/scripts/find-abandoned-threads.prompt.txt. The `{takes_json}` token is
 * replaced with the projected takes at call time.
 */
const ABANDONED_PROMPT = `You are finding abandoned threads in Paul Graham's essay corpus — high-conviction predictions or proposals he made in one essay and never revisited in any later essay, even though the topic remained alive in the world.

DEFINITION of an abandoned thread:
- A take with conviction=high (must be a confident prediction, proposal, or framework, not a hedge or observation)
- The SAME topic does not appear in any take from a later essay by PG. The silence is itself the surprise — PG made the call, the world moved on, and he never returned to it.
- Bonus signal: the original take was the headline thesis of its essay (not a one-line aside)

RULES:
1. Only pick takes with conviction=high.
2. Verify the topic genuinely goes silent. If PG writes about the SAME topic in any later essay, it is NOT abandoned — it's a thread he kept developing. Exclude it.
3. Multi-prediction essays (e.g. "Frighteningly Ambitious Startup Ideas" which lists 7 distinct ideas) count as ONE thread — the meta-call that all seven were ambitious bets, not seven separate threads.
4. Output the 3 strongest abandoned threads. Better to find fewer striking ones than five mediocre ones.

For each thread:
- thread_title: a short, evocative name (e.g. "The Frighteningly Ambitious Seven")
- source_essay: essay slug (filename without .md)
- source_date: YYYY-MM-DD from the take
- original_quote: verbatim or close paraphrase, max 300 chars
- why_unfinished: one sentence framing what's surprising about the silence

Output ONLY a JSON array. No prose, no markdown fences. Empty array if no genuine abandoned threads exist.

INPUT:
{takes_json}
`;

/** A take is usable when it carries the fields this skill sends to Claude. */
function isUsableTake(t: unknown): t is Take {
  if (typeof t !== "object" || t === null) return false;
  const x = t as Record<string, unknown>;
  return (
    typeof x.claim_text === "string" &&
    x.claim_text.trim().length > 0 &&
    typeof x.claim_date === "string" &&
    typeof x.essay_slug === "string" &&
    typeof x.conviction === "string"
  );
}

/** Prompt = Keshav's template with `{takes_json}` filled by the full takes array. */
function buildPrompt(takes: Take[]): string {
  // Send every take in full (not a stripped projection): Keshav's prompt reads
  // conviction, essay_slug, source_page, claim_date and claim_text, and it must
  // see every take to confirm a topic goes silent across all later essays.
  return ABANDONED_PROMPT.replace("{takes_json}", JSON.stringify(takes));
}

/** Call Claude once with the prompt; return the raw text reply. */
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

/** Validate one raw element into an AbandonedThread, or null. */
function toThread(x: unknown): AbandonedThread | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (
    typeof o.thread_title !== "string" ||
    o.thread_title.trim().length === 0 ||
    typeof o.source_essay !== "string" ||
    typeof o.source_date !== "string" ||
    typeof o.original_quote !== "string" ||
    o.original_quote.trim().length === 0 ||
    typeof o.why_unfinished !== "string" ||
    o.why_unfinished.trim().length === 0
  ) {
    return null;
  }
  const quote = o.original_quote.trim();
  return {
    thread_title: o.thread_title.trim(),
    source_essay: o.source_essay.trim(),
    source_date: o.source_date.trim(),
    original_quote:
      quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX - 1)}…` : quote,
    why_unfinished: o.why_unfinished.trim(),
  };
}

/** Strip a markdown fence if present, JSON.parse, keep well-formed threads. */
function parseThreads(raw: string): AbandonedThread[] {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) text = (fenced[1] ?? "").trim();
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Claude response was not a JSON array");
  }
  const threads: AbandonedThread[] = [];
  for (const x of parsed) {
    const thread = toThread(x);
    if (thread) threads.push(thread);
  }
  return threads;
}

export async function runSkill(
  input: FindAbandonedThreadsInput,
): Promise<FindAbandonedThreadsOutput> {
  try {
    const takes = Array.isArray(input?.takes)
      ? input.takes.filter(isUsableTake)
      : [];
    if (takes.length === 0) {
      console.error("[find-abandoned-threads] no usable takes — returning []");
      return { threads: [] };
    }

    const prompt = buildPrompt(takes);
    let threads: AbandonedThread[] = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        threads = parseThreads(await callClaude(prompt));
        break;
      } catch (err) {
        console.error(
          `[find-abandoned-threads] attempt ${attempt} failed: ${String(err)}`,
        );
      }
    }
    return { threads: threads.slice(0, MAX_THREADS) };
  } catch (err) {
    // Never throw — a failure here just means no threads for the demo.
    console.error(`[find-abandoned-threads] unexpected failure: ${String(err)}`);
    return { threads: [] };
  }
}
