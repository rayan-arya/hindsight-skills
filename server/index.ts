import express from "express";
import cors from "cors";
import { stubs } from "./stubs.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * One POST route per skill at /skills/<skill-name>.
 *
 * Each route currently returns a hard-coded, contract-shaped stub (see
 * stubs.ts). Work unit A.1 onward swaps each stub for the skill's real
 * runSkill() implementation from skills/<skill-name>/index.ts.
 */
const skillStubs = {
  "extract-takes": stubs.extractTakes,
  "find-contradictions": stubs.findContradictions,
  "resolve-outcomes": stubs.resolveOutcomes,
  "hindsight-profile": stubs.hindsightProfile,
  "calibrated-advise": stubs.calibratedAdvise,
} as const;

for (const [name, response] of Object.entries(skillStubs)) {
  app.post(`/skills/${name}`, (_req, res) => {
    res.json(response);
  });
}

const PORT = Number(process.env.PORT ?? 3001);

app.listen(PORT, () => {
  console.log(`hindsight-skills server listening on http://localhost:${PORT}`);
  console.log("  GET  /health");
  for (const name of Object.keys(skillStubs)) {
    console.log(`  POST /skills/${name}`);
  }
});
