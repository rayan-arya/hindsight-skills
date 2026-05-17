import { readFile, readdir, writeFile } from "node:fs/promises";
import type { AbandonedThread, Take } from "@hindsight/types";
import { runSkill as extractTakes } from "../extract-takes/index.js";
import { runSkill as findAbandonedThreads } from "./index.js";

/**
 * Live harness for find-abandoned-threads.
 *
 * Extracts takes from corpus essays sampled evenly by date, with the three
 * source essays of Keshav's captured fixture pinned in (ambitious, superangels,
 * siliconvalley), runs find-abandoned-threads, writes the live result to
 * data/captured/abandoned-threads.live.json, and prints it side-by-side with
 * Keshav's validated data/captured/abandoned-threads.json.
 *
 *   npm run find-abandoned-threads:check     (needs ANTHROPIC_API_KEY in .env)
 *
 * Run from the repo root.
 */

const TARGET_SAMPLE = 40;
const PINNED = ["ambitious", "superangels", "siliconvalley"];
const EXTRACT_CONCURRENCY = 3;
const LIVE_OUT = "data/captured/abandoned-threads.live.json";
const CAPTURED = "data/captured/abandoned-threads.json";

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

function printThread(t: AbandonedThread, i: number): void {
  console.log(`\n[${i + 1}] ${t.thread_title}`);
  console.log(`  ${t.source_essay} · ${t.source_date}`);
  console.log(`  quote: ${t.original_quote}`);
  console.log(`  why unfinished: ${t.why_unfinished}`);
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

  // Even-by-date sample, then pin the three captured-fixture source essays.
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

  const { threads } = await findAbandonedThreads({ takes: allTakes });
  await writeFile(LIVE_OUT, `${JSON.stringify(threads, null, 2)}\n`, "utf8");

  console.log(`\n${"=".repeat(72)}`);
  console.log(`LIVE RUN — ${threads.length} abandoned thread(s)  → ${LIVE_OUT}`);
  console.log("=".repeat(72));
  threads.forEach(printThread);
  if (threads.length === 0) {
    console.log("\n(none — empty array)");
  }

  let captured: AbandonedThread[] = [];
  try {
    captured = JSON.parse(await readFile(CAPTURED, "utf8")) as AbandonedThread[];
  } catch {
    console.error(`\n(could not read ${CAPTURED})`);
  }
  console.log(`\n${"=".repeat(72)}`);
  console.log(`KESHAV'S CAPTURED — ${captured.length} abandoned thread(s)  (${CAPTURED})`);
  console.log("=".repeat(72));
  captured.forEach(printThread);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
