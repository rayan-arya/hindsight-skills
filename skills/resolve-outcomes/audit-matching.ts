import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { runSkill as extractTakes } from "../extract-takes/index.js";
import {
  DEFAULT_MATCH_THRESHOLD,
  findCuratedMatch,
  loadCuratedOutcomes,
  runSkill as resolveOutcomes,
} from "./index.js";
import type { Take } from "@hindsight/types";

/**
 * Matching audit for resolve-outcomes.
 *
 * For every essay referenced in data/outcomes.json: run extract-takes, then
 * run resolve-outcomes' matcher on each extracted take and tally how the join
 * lands. Two views, both of which gate work unit A.3:
 *
 *   - PER-ESSAY     — takes extracted / matched to a curated row / unmatched
 *   - ORPHAN VIEW   — curated outcomes that no extracted take matched
 *
 *   npm run resolve-outcomes:audit                  (threshold 0.70)
 *   npm run resolve-outcomes:audit -- --threshold 0.6
 *
 * Run from the repo root — corpus paths below are repo-relative. Needs
 * ANTHROPIC_API_KEY in .env (extract-takes calls Claude).
 */

const CORPUS_CONCURRENCY = 4;

/** extract-takes needs a date; the audit never reads claim_date, so pin one. */
const AUDIT_DATE = "2000-01-01";

/** Read --threshold from argv, else the skill's shipped default. */
function parseThreshold(): number {
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--threshold");
  if (flag !== -1) {
    const raw = argv[flag + 1];
    const n = raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(n) && n > 0 && n <= 1) return n;
    console.error(`ignoring invalid --threshold ${raw ?? "(missing)"}`);
  }
  return DEFAULT_MATCH_THRESHOLD;
}

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
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

interface EssayAudit {
  slug: string;
  corpusFound: boolean;
  takes: Take[];
  /** Per take: index of the curated row it matched, or null. */
  matchIndex: (number | null)[];
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

async function main(): Promise<void> {
  const threshold = parseThreshold();
  const curated = await loadCuratedOutcomes();

  // Essay slugs in first-seen order, so the report mirrors outcomes.json.
  const slugs: string[] = [];
  for (const entry of curated) {
    if (!slugs.includes(entry.essay_slug)) slugs.push(entry.essay_slug);
  }

  console.log(`${"=".repeat(78)}`);
  console.log(
    `resolve-outcomes — matching audit   (threshold ${threshold.toFixed(2)})`,
  );
  console.log(
    `${slugs.length} essays · ${curated.length} curated outcomes · extracting takes…`,
  );
  console.log("=".repeat(78));

  const audits = await mapLimit<string, EssayAudit>(
    slugs,
    CORPUS_CONCURRENCY,
    async (slug): Promise<EssayAudit> => {
      const path = `data/corpus/${slug}.md`;
      if (!existsSync(path)) {
        return { slug, corpusFound: false, takes: [], matchIndex: [] };
      }
      const content = await readFile(path, "utf8");
      const { takes } = await extractTakes({
        brain_page_content: content,
        brain_page_path: path,
        brain_page_date: AUDIT_DATE,
      });
      const matchIndex = takes.map((take) => {
        const match = findCuratedMatch(take, curated, threshold);
        return match === null ? null : match.index;
      });
      return { slug, corpusFound: true, takes, matchIndex };
    },
  );

  // ---- Per-essay view --------------------------------------------------
  const hitByIndex = new Set<number>();
  let totalTakes = 0;
  let totalMatched = 0;

  console.log("\nPER-ESSAY   essay · takes extracted / matched / unmatched");
  console.log("-".repeat(78));
  for (const a of audits) {
    if (!a.corpusFound) {
      console.log(`  ${a.slug.padEnd(18)} (corpus file data/corpus/${a.slug}.md not found)`);
      continue;
    }
    const matched = a.matchIndex.filter((i) => i !== null).length;
    const unmatched = a.takes.length - matched;
    totalTakes += a.takes.length;
    totalMatched += matched;
    for (const i of a.matchIndex) {
      if (i !== null) hitByIndex.add(i);
    }
    console.log(
      `  ${a.slug.padEnd(18)} extracted ${String(a.takes.length).padStart(2)}` +
        `   matched ${String(matched).padStart(2)}` +
        `   unmatched ${String(unmatched).padStart(2)}`,
    );
  }
  console.log("-".repeat(78));
  console.log(
    `  ${"TOTALS".padEnd(18)} extracted ${String(totalTakes).padStart(2)}` +
      `   matched ${String(totalMatched).padStart(2)}` +
      `   unmatched ${String(totalTakes - totalMatched).padStart(2)}`,
  );

  // ---- Orphan view -----------------------------------------------------
  const orphans = curated
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !hitByIndex.has(index));

  console.log("\nORPHANED CURATED OUTCOMES   (no extracted take matched these)");
  console.log("-".repeat(78));
  if (orphans.length === 0) {
    console.log("  (none — every curated outcome was matched)");
  } else {
    for (const { entry } of orphans) {
      console.log(
        `  · [${entry.essay_slug}] ${entry.outcome}` +
          `\n      ${truncate(entry.claim_text, 96)}`,
      );
    }
  }

  // ---- Ship gate -------------------------------------------------------
  console.log(`\n${"=".repeat(78)}`);
  console.log(
    `ORPHAN COUNT: ${orphans.length} of ${curated.length} curated outcomes unmatched`,
  );

  // End-to-end smoke check: resolve-outcomes' runSkill on a real matched take.
  const sample = audits
    .flatMap((a) => a.takes.map((take, i) => ({ take, i: a.matchIndex[i] })))
    .find((x) => x.i !== null && x.i !== undefined);
  if (sample) {
    const { outcome } = await resolveOutcomes({ take: sample.take });
    console.log(
      `runSkill smoke check: a matched take resolved to ` +
        `${outcome === null ? "null (UNEXPECTED)" : `verdict "${outcome.outcome}"`}`,
    );
  }
  console.log("=".repeat(78));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
