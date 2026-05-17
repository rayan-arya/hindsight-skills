import express from "express";
import cors from "cors";
import { runSkill as extractTakes } from "../skills/extract-takes/index.js";
import { runSkill as findContradictions } from "../skills/find-contradictions/index.js";
import { runSkill as resolveOutcomes } from "../skills/resolve-outcomes/index.js";
import { runSkill as hindsightProfile } from "../skills/hindsight-profile/index.js";
import { runSkill as calibratedAdvise } from "../skills/calibrated-advise/index.js";
import { runSkill as findAbandonedThreads } from "../skills/find-abandoned-threads/index.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * One POST route per skill at /skills/<skill-name>.
 *
 * Each route calls the corresponding skill's runSkill(). The skills currently
 * return hardcoded example output (see skills/<name>/index.ts); work units
 * A.2-A.6 replace each runSkill body with real logic. Express 5 forwards any
 * rejected promise to the default error handler, so no try/catch is needed.
 */
app.post("/skills/extract-takes", async (req, res) => {
  res.json(await extractTakes(req.body));
});

app.post("/skills/find-contradictions", async (req, res) => {
  res.json(await findContradictions(req.body));
});

app.post("/skills/resolve-outcomes", async (req, res) => {
  res.json(await resolveOutcomes(req.body));
});

app.post("/skills/hindsight-profile", async (req, res) => {
  res.json(await hindsightProfile(req.body));
});

app.post("/skills/calibrated-advise", async (req, res) => {
  res.json(await calibratedAdvise(req.body));
});

app.post("/skills/find-abandoned-threads", async (req, res) => {
  res.json(await findAbandonedThreads(req.body));
});

const PORT = Number(process.env.PORT ?? 3001);

app.listen(PORT, () => {
  console.log(`hindsight-skills server listening on http://localhost:${PORT}`);
  console.log("  GET  /health");
  for (const name of [
    "extract-takes",
    "find-contradictions",
    "resolve-outcomes",
    "hindsight-profile",
    "calibrated-advise",
    "find-abandoned-threads",
  ]) {
    console.log(`  POST /skills/${name}`);
  }
});
