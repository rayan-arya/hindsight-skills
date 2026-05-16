import { readFile, readdir } from "node:fs/promises";
import { runSkill as extractTakes } from "../extract-takes/index.js";
import { runSkill as findContradictions } from "./index.js";
import type { Take } from "@hindsight/types";

/**
 * Live harness for find-contradictions.
 *
 * Extracts takes from ~48 corpus essays sampled evenly by date across the
 * 228-essay corpus, with venturecapital.md + googles.md pinned in (Keshav's
 * known VC contradiction lives there), runs find-contradictions, and prints
 * the top contradictions.
 *
 *   npm run find-contradictions:check     (needs ANTHROPIC_API_KEY in .env)
 *
 * Run from the repo root.
 */

const TARGET_SAMPLE = 48;
const PINNED = ["venturecapital", "googles"];
const EXTRACT_CONCURRENCY = 6;

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next;
      next += 1;
      const item = items[i];
      if (item === undefined) continue;
      results[i] = await fn(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/** Pull YYYY-MM-DD from a corpus file's frontmatter. */
function parseDate(content: string): string {
  const m = content.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m);
  return m?.[1] ?? "2000-01-01";
}

interface Essay {
  slug: string;
  path: string;
  content: string;
  date: string;
}

async function main(): Promise<void> {
  const dir = "data/corpus";
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  const essays: Essay[] = [];
  for (const f of files) {
    const content = await readFile(`${dir}/${f}`, "utf8");
    essays.push({
      slug: f.replace(/\.md$/, ""),
      path: `${dir}/${f}`,
      content,
      date: parseDate(content),
    });
  }
  essays.sort((a, b) => a.date.localeCompare(b.date));

  // Even-by-date sample, then pin the VC-contradiction essays.
  const stride = Math.max(1, Math.round(essays.length / TARGET_SAMPLE));
  const picked = new Map<string, Essay>();
  essays.forEach((e, i) => {
    if (i % stride === 0) picked.set(e.slug, e);
  });
  for (const slug of PINNED) {
    const e = essays.find((x) => x.slug === slug);
    if (e) picked.set(e.slug, e);
    else console.error(`  (pin skipped — ${slug}.md not found)`);
  }
  const selected = [...picked.values()];
  console.log(
    `Corpus: ${essays.length} essays · sampling ${selected.length} ` +
      `(${selected[0]?.date ?? "?"} … ${selected[selected.length - 1]?.date ?? "?"})`,
  );
  console.log(`Extracting takes (concurrency ${EXTRACT_CONCURRENCY})…`);

  const perEssay = await mapLimit<Essay, Take[]>(
    selected,
    EXTRACT_CONCURRENCY,
    async (e): Promise<Take[]> => {
      const { takes } = await extractTakes({
        brain_page_content: e.content,
        brain_page_path: e.path,
        brain_page_date: e.date,
      });
      return takes;
    },
  );
  const allTakes = perEssay.flat();
  console.log(`Extracted ${allTakes.length} takes from ${selected.length} essays.`);

  const { contradictions } = await findContradictions({ takes: allTakes });

  console.log(`\n${"=".repeat(72)}`);
  console.log(`find-contradictions — ${contradictions.length} high-severity pair(s)`);
  console.log("=".repeat(72));
  contradictions.forEach((c, i) => {
    console.log(`\n[${i + 1}] TOPIC: ${c.topic}`);
    console.log(`  A (${c.claim_a.date}, ${c.claim_a.source_page}):`);
    console.log(`     ${c.claim_a.text}`);
    console.log(`  B (${c.claim_b.date}, ${c.claim_b.source_page}):`);
    console.log(`     ${c.claim_b.text}`);
    console.log(`  → ${c.contradiction_summary}`);
  });
  if (contradictions.length === 0) {
    console.log("\n(none — demo falls back to data/contradiction-fallback.json)");
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
