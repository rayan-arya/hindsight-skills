import { readFile } from "node:fs/promises";
import { runSkill } from "./index.js";

/**
 * Gold-standard harness for extract-takes.
 *
 * Runs extract-takes against the 3 hand-marked essays and prints each essay's
 * extracted takes beside the data/gold-standard.md expectations, so precision
 * (no junk) and recall (every expected take found) can be eyeballed during the
 * prompt-iteration loop.
 *
 *   npm run extract-takes:check     (needs ANTHROPIC_API_KEY in .env)
 *
 * Run from the repo root — paths below are repo-relative.
 */

const ESSAYS: ReadonlyArray<{ slug: string; date: string }> = [
  { slug: "cities", date: "2008-05-01" },
  { slug: "relres", date: "2009-03-01" },
  { slug: "founders", date: "2010-10-01" },
];

/** Parse data/gold-standard.md into essay_slug -> expected claim_text[]. */
async function loadGoldStandard(): Promise<Map<string, string[]>> {
  const md = await readFile("data/gold-standard.md", "utf8");
  const expected = new Map<string, string[]>();
  let current = "";
  for (const line of md.split("\n")) {
    const header = line.match(/^##\s+([A-Za-z0-9-]+)\.md\b/);
    if (header) {
      current = header[1] ?? "";
      expected.set(current, []);
      continue;
    }
    const claim = line.match(/^\s*-\s*\*\*claim_text:\*\*\s*(.+)$/);
    if (claim && current) expected.get(current)?.push((claim[1] ?? "").trim());
  }
  return expected;
}

async function main(): Promise<void> {
  const gold = await loadGoldStandard();
  for (const { slug, date } of ESSAYS) {
    const path = `data/corpus/${slug}.md`;
    const content = await readFile(path, "utf8");
    const { takes } = await runSkill({
      brain_page_content: content,
      brain_page_path: path,
      brain_page_date: date,
    });
    const want = gold.get(slug) ?? [];

    console.log(`\n${"=".repeat(72)}`);
    console.log(`${slug}.md — extracted ${takes.length}, gold-standard ${want.length}`);
    console.log("=".repeat(72));

    console.log("\n  EXTRACTED:");
    for (const t of takes) {
      console.log(`  · [${t.id}]  (${t.conviction} / ${t.domain})`);
      console.log(`      claim:       ${t.claim_text}`);
      console.log(`      falsifiable: ${t.falsifiable_form}`);
    }
    if (takes.length === 0) console.log("  (none)");

    console.log("\n  GOLD-STANDARD EXPECTED:");
    for (const c of want) console.log(`  · ${c}`);
  }
  console.log(`\n${"=".repeat(72)}`);
  console.log("recall  = every expected take has a clear counterpart above");
  console.log("precision = no takes beyond the expected set (see excluded claims)");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
