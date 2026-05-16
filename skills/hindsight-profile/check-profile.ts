import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { runSkill as extractTakes } from "../extract-takes/index.js";
import {
  loadCuratedOutcomes,
  runSkill as resolveOutcomes,
} from "../resolve-outcomes/index.js";
import { runSkill as hindsightProfile } from "./index.js";
import type { Take } from "@hindsight/types";

/**
 * Live harness for hindsight-profile.
 *
 * Rebuilds the real pipeline against the curated essays: extract-takes (A.2)
 * → resolve-outcomes (A.3) → hindsight-profile (A.4), then prints the produced
 * Profile JSON so pattern sharpness and the hero stats can be eyeballed.
 *
 *   npm run hindsight-profile:check     (needs ANTHROPIC_API_KEY in .env)
 *
 * Run from the repo root — corpus paths below are repo-relative.
 */

const CORPUS_CONCURRENCY = 4;

/** Run `fn` over `items` with at most `limit` in flight at once. */
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

/** Pull the YYYY-MM-DD date out of a corpus file's frontmatter. */
function parseDate(content: string): string {
  const m = content.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m);
  return m?.[1] ?? "2000-01-01";
}

async function main(): Promise<void> {
  const curated = await loadCuratedOutcomes();
  const slugs: string[] = [];
  for (const e of curated) {
    if (!slugs.includes(e.essay_slug)) slugs.push(e.essay_slug);
  }

  console.log(`Extracting + resolving ${slugs.length} essays…`);
  const perEssay = await mapLimit<string, Take[]>(
    slugs,
    CORPUS_CONCURRENCY,
    async (slug): Promise<Take[]> => {
      const path = `data/corpus/${slug}.md`;
      if (!existsSync(path)) {
        console.error(`  (skipped — ${path} not found)`);
        return [];
      }
      const content = await readFile(path, "utf8");
      const { takes } = await extractTakes({
        brain_page_content: content,
        brain_page_path: path,
        brain_page_date: parseDate(content),
      });
      const resolved: Take[] = [];
      for (const take of takes) {
        const { outcome } = await resolveOutcomes({ take });
        resolved.push({ ...take, outcome });
      }
      return resolved;
    },
  );

  const allTakes = perEssay.flat();
  const graded = allTakes.filter((t) => t.outcome !== null).length;
  console.log(`Total takes: ${allTakes.length} · graded: ${graded}`);

  const { profile } = await hindsightProfile({ resolved_takes: allTakes });

  console.log(`\n${"=".repeat(72)}`);
  console.log("hindsight-profile — produced Profile");
  console.log("=".repeat(72));
  console.log(JSON.stringify(profile, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
