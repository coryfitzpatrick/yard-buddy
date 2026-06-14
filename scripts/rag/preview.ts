/**
 * Show which chunks would be retrieved for each validation scenario.
 * Quick sanity check that retrieval is matching the right sources.
 *
 * Usage: npx tsx scripts/rag/preview.ts
 */
import * as fs from "fs";
import * as path from "path";
import { retrieveRelevant, inferTopicHints } from "../../lib/rag";
import type { Scenario } from "../validation/types";

const SCENARIO_DIRS = ["cool-season", "warm-season", "edge-cases"];

function loadAll(): Scenario[] {
  const all: Scenario[] = [];
  for (const d of SCENARIO_DIRS) {
    const dir = path.join(__dirname, "..", "validation", "scenarios", d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      all.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Scenario);
    }
  }
  return all;
}

function profileText(s: Scenario): string {
  const p = s.profile;
  const parts = [
    `grass type: ${p.grassType}`,
    `zip: ${p.zipCode ?? "none"}`,
    p.soilPh && `soil pH: ${p.soilPh}`,
    p.soilMoisture && `soil moisture: ${p.soilMoisture}`,
    p.weatherSummary,
    p.notes,
  ].filter(Boolean);
  return parts.join(" ");
}

const scenarios = loadAll();
for (const s of scenarios) {
  const text = profileText(s);
  const hints = inferTopicHints(text, s.profile.notes);
  const chunks = retrieveRelevant({
    grassType: s.profile.grassType,
    scenarioText: text,
    topicHints: hints,
    k: 5,
  });
  console.log(`\n=== ${s.id} (${s.profile.grassType}) ===`);
  console.log(`  topics: ${hints.join(", ") || "(none)"}`);
  chunks.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.title} :: ${c.id}`);
  });
}
