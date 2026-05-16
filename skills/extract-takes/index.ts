import Anthropic from "@anthropic-ai/sdk";
import { basename } from "node:path";
import type {
  Conviction,
  ExtractTakesInput,
  ExtractTakesOutput,
  Take,
  TakeDomain,
} from "@hindsight/types";

/**
 * extract-takes — finds gradeable claims in a brain page and returns them as
 * structured takes. Calls Claude with the hindsight prompts-doc §5 prompt,
 * then assembles each claim into a contract-shaped Take.
 */

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8000;

const CONVICTIONS: readonly Conviction[] = ["high", "medium", "low"];
const DOMAINS: readonly TakeDomain[] = [
  "startup-tactics",
  "tech-trends",
  "geography",
  "hiring",
  "market-timing",
  "founder-behavior",
  "ai",
  "other",
];

/**
 * Internal Claude prompt — hindsight prompts-doc §5, A.PROMPT.extract-takes,
 * tuned during the gold-standard iteration loop: "falsifiable" broadened to
 * include interpretive theses, an explicit exclusion for evidence/citations,
 * worked examples, and a granularity bound (major theses, not every sentence).
 * The essay body is appended after "INPUT:".
 */
const EXTRACT_PROMPT = `You are extracting gradeable claims from an essay.

A GRADEABLE CLAIM is any claim the author commits to that COULD TURN OUT TO BE WRONG — a prediction, a recommendation, or an interpretive judgment about how the world works (cities, founders, technology, markets, people). It does NOT have to be numerical or precisely measurable. An interpretive thesis counts as long as you can imagine evidence that would contradict it.

EXAMPLES of gradeable claims (all of these count):
- "Default-alive companies will outperform default-dead ones over the next decade" (prediction)
- "Most successful founders are technical" (empirical claim)
- "Great cities attract ambitious people" (interpretive thesis — falsifiable in spirit: it implies things about migration, talent concentration, and how a place shapes the people in it)
- "The most important quality in founders is determination" (interpretive judgment — it could be wrong)

NOT takes — exclude these:
- Statistics, specific examples, and historical citations the author uses to SUPPORT a claim. Only the underlying claim is a take, never the evidence. If the text says "Boston has 3000 startups, which shows it's a center," the take is "Boston is a startup center" — NOT "Boston has 3000 startups."
- Pure opinion with nothing that could be wrong ("startups are exciting")
- Tautologies, definitions, explanations, and hypothetical questions
- Advice with no underlying claim that could be wrong

WORKED EXAMPLES:
- TAKE: "Cities send strong messages to ambitious people about what's worth doing." An interpretive thesis — not a number, but it could be wrong, so it is a take.
- NOT A TAKE: "47% of the Forbes 400 cluster in 4 metros." A statistic used as evidence. Extract the claim it supports (ambition concentrates geographically), never the statistic itself.

GRANULARITY — extract the essay's MAJOR theses, not every sentence:
- Aim for the handful of claims a careful reader would summarize the essay by. A typical essay yields a few takes — roughly 3 to 8 — not one per paragraph.
- If the author states the same point several times, or builds one thesis from parts (a general claim followed by per-case illustrations), that is ONE take. Use the clearest, most general statement.
- Supporting observations and elaborations of a take you already captured are not separate takes.
Example: in the cities essay, PG argues that each city sends a unique message about what matters. He illustrates this with Cambridge (intellect), New York (money), Florence in 1500 (painting), etc. This is ONE take — 'cities send strong messages about what matters' — illustrated by multiple examples. Not five separate takes about each city.

For each essay, ALSO ensure the essay's broadest 1-2 theses are captured even if they overlap with narrower claims you've already extracted. The broadest version of a thesis is the most useful one.

For each gradeable claim, extract:
- claim_text: the exact quote or close paraphrase (max 200 chars)
- conviction: high / medium / low (based on hedging language — "I think X" is medium, "X will definitely happen" is high, "Maybe X" is low)
- domain: one of [startup-tactics, tech-trends, geography, hiring, market-timing, founder-behavior, ai, other]
- falsifiable_form: a rewritten version that makes the claim explicit and checkable in principle (max 200 chars)

Capture every thesis the author genuinely commits to, including interpretive ones. Missing a headline claim is worse than including a borderline one — but never include evidence, examples, or restatements as separate takes.

List the claims in the order they appear in the essay.

Output ONLY a JSON array. No prose, no markdown fences. Each object has the four fields above. If no gradeable claims, return [].

INPUT:
`;

/**
 * slugify — essay title to the title-slug used in a take id.
 *
 *   slugify("Cities and Ambition")        === "cities-and-ambition"
 *   slugify("Startup = Growth")           === "startup-growth"
 *   slugify("Do Things That Don't Scale") === "do-things-that-dont-scale"
 *   slugify("What We Look for in Founders (Summer 2010)")
 *                                         === "what-we-look-for-in-founders-summer-2010"
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // strip punctuation; keep alphanumerics, whitespace, hyphens
    .trim()
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse repeated hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/** Split a corpus markdown file into its frontmatter title and its body. */
function parseFrontmatter(content: string): { title: string; body: string } {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fm) return { title: "", body: content };
  const inner = fm[1] ?? "";
  const titleLine = inner.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return {
    title: (titleLine?.[1] ?? "").trim(),
    body: content.slice(fm[0].length),
  };
}

interface RawClaim {
  claim_text: string;
  conviction: Conviction;
  domain: TakeDomain;
  falsifiable_form: string;
}

/** Strip a markdown code fence if present, then JSON.parse. Throws on failure. */
function parseClaims(raw: string): unknown[] {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) text = (fenced[1] ?? "").trim();
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Claude response was not a JSON array");
  }
  return parsed;
}

/** True when an unknown value carries all four valid Claude-supplied claim fields. */
function isValidClaim(x: unknown): x is RawClaim {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.claim_text === "string" &&
    c.claim_text.trim().length > 0 &&
    typeof c.falsifiable_form === "string" &&
    c.falsifiable_form.trim().length > 0 &&
    typeof c.conviction === "string" &&
    (CONVICTIONS as readonly string[]).includes(c.conviction) &&
    typeof c.domain === "string" &&
    (DOMAINS as readonly string[]).includes(c.domain)
  );
}

/** Call Claude once with the extract-takes prompt; return the raw text reply. */
async function callClaude(body: string): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from process.env
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    messages: [{ role: "user", content: EXTRACT_PROMPT + body }],
  });
  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return block.text;
}

export async function runSkill(
  input: ExtractTakesInput,
): Promise<ExtractTakesOutput> {
  const { brain_page_content, brain_page_path, brain_page_date } = input;

  const { title, body } = parseFrontmatter(brain_page_content);
  const essay_slug = basename(brain_page_path).replace(/\.md$/, "");
  const titleSlug = title ? slugify(title) : essay_slug;

  // Call Claude; retry once on any failure (API error, malformed JSON, non-array).
  let claims: unknown[] | null = null;
  for (let attempt = 1; attempt <= 2 && claims === null; attempt += 1) {
    try {
      claims = parseClaims(await callClaude(body));
    } catch (err) {
      console.error(
        `[extract-takes] attempt ${attempt} failed for ${brain_page_path}: ${String(err)}`,
      );
    }
  }
  if (claims === null) return { takes: [] };

  const extracted_at = new Date().toISOString();
  const takes: Take[] = [];
  let dropped = 0;
  for (const raw of claims) {
    if (!isValidClaim(raw)) {
      dropped += 1;
      continue;
    }
    const claim_index = takes.length + 1;
    takes.push({
      id: `${titleSlug}-claim-${claim_index}`,
      essay_slug,
      claim_index,
      source_page: brain_page_path,
      claim_text: raw.claim_text.trim(),
      claim_date: brain_page_date,
      conviction: raw.conviction,
      domain: raw.domain,
      falsifiable_form: raw.falsifiable_form.trim(),
      extracted_at,
      logged_explicitly: false,
      outcome: null,
    });
  }
  if (dropped > 0) {
    console.error(
      `[extract-takes] dropped ${dropped} invalid claim(s) from ${brain_page_path}`,
    );
  }
  return { takes };
}
