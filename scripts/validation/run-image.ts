import * as fs from "fs";
import * as path from "path";
import { analyzeImagesBase64 } from "../../lib/claude";
import { loadPhotosForScenario, type Base64Image } from "./load-photos";
import { IMAGE_RULES } from "./rules/image-assertions";
import { runImageJudge } from "./judge-image";
import type { ImageScenario, ImageRuleResult, ImageRunReport, ImageJudgeResult } from "./types-image";
import type { AnalysisResult } from "../../types";

const SCENARIOS_DIR = path.join(__dirname, "scenarios-image");
const RESULTS_DIR = path.join(__dirname, "results");

function loadScenarios(): ImageScenario[] {
  if (!fs.existsSync(SCENARIOS_DIR)) {
    console.error(`Scenarios directory not found: ${SCENARIOS_DIR}`);
    process.exit(1);
  }
  const out: ImageScenario[] = [];
  for (const entry of fs.readdirSync(SCENARIOS_DIR)) {
    if (entry.endsWith(".json")) {
      out.push(JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, entry), "utf8")) as ImageScenario);
    }
  }
  return out;
}

function meanByKey(results: ImageJudgeResult[], key: keyof Omit<ImageJudgeResult, 'scenarioId' | 'flags' | 'reasoning'>): number {
  const values = results
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return 0;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

async function main() {
  const smokeOnly = process.argv.includes("--smoke");
  const date = new Date().toISOString().slice(0, 10);
  console.log(`\nYard Analyzer IMAGE-PATH Validation Report - ${date}`);
  console.log("-".repeat(60));

  let scenarios = loadScenarios();
  if (smokeOnly) {
    scenarios = scenarios.filter((s) => s.id === "healthy-kbg-front").slice(0, 1);
    console.log(`SMOKE MODE: running 1 scenario only`);
  }
  console.log(`Loaded ${scenarios.length} image scenarios\n`);

  const failures: string[] = [];

  console.log("Pillar 1: Scenario integrity checks...");
  for (const s of scenarios) {
    if (!s.photos || s.photos.length === 0) {
      failures.push(`[scenario-integrity] ${s.id}: no photos`);
      console.log(`  FAIL ${s.id}: no photos`);
    } else if (!s.groundTruth) {
      failures.push(`[scenario-integrity] ${s.id}: no groundTruth`);
      console.log(`  FAIL ${s.id}: no groundTruth`);
    }
  }
  console.log(`Pillar 1: Integrity                ${scenarios.length - failures.length}/${scenarios.length} passed\n`);

  console.log("Running Pillar 2: Image Rule Assertions...");
  const ruleResults: ImageRuleResult[] = [];
  const aiResults = new Map<string, AnalysisResult>();
  const photoMap = new Map<string, Base64Image[]>();

  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.id}... `);
    try {
      const photos = loadPhotosForScenario(scenario.id, scenario.photos);
      photoMap.set(scenario.id, photos);
      const result = await analyzeImagesBase64(photos, scenario.profile);
      aiResults.set(scenario.id, result);
      const responseText = JSON.stringify(result);
      for (const rule of IMAGE_RULES) {
        ruleResults.push(rule.check(scenario, responseText));
      }
      process.stdout.write("done\n");
    } catch (err) {
      process.stdout.write(`ERROR: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}\n`);
      failures.push(`[pillar2-error] ${scenario.id}`);
    }
  }
  const passedRules = ruleResults.filter((r) => r.pass).length;
  console.log(`Pillar 2: Rule Assertions          ${passedRules}/${ruleResults.length} passed`);
  for (const r of ruleResults.filter((x) => !x.pass)) {
    console.log(`  FAIL [rule] ${r.scenarioId}/${r.ruleId}: ${r.reason}`);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("\nPillar 3: SKIPPED (no ANTHROPIC_API_KEY)");
  } else {
    console.log("\nRunning Pillar 3: Image-aware Judge...");
    const { results: judgeResults, mean } = await runImageJudge(scenarios, aiResults, photoMap);
    console.log(`Pillar 3: Image Judge              ${mean.toFixed(1)} / 100 combined mean`);

    const dimensionMeans = {
      grassTypeAccuracy: meanByKey(judgeResults, 'grassTypeAccuracy'),
      issuesF1: meanByKey(judgeResults, 'issuesF1'),
      healthScoreInRange: meanByKey(judgeResults, 'healthScoreInRange'),
      recommendationQuality: meanByKey(judgeResults, 'recommendationQuality'),
      dataGapAcknowledgment: meanByKey(judgeResults, 'dataGapAcknowledgment'),
      crossPhotoSynthesis: meanByKey(judgeResults, 'crossPhotoSynthesis'),
    };
    console.log(`         dim means -> grass=${dimensionMeans.grassTypeAccuracy} issues=${dimensionMeans.issuesF1} health=${dimensionMeans.healthScoreInRange} recs=${dimensionMeans.recommendationQuality} gap=${dimensionMeans.dataGapAcknowledgment} cross=${dimensionMeans.crossPhotoSynthesis}`);

    const report: ImageRunReport = {
      timestamp: new Date().toISOString(),
      pillar2Results: ruleResults,
      pillar3Results: judgeResults,
      pillar3Mean: mean,
      pillar3DimensionMeans: dimensionMeans,
      overallPass: failures.length === 0 && ruleResults.every((r) => r.pass),
      failures,
    };
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const outFile = path.join(RESULTS_DIR, `image-${date}-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`\nResults written to ${outFile}`);
  }

  console.log("\n" + "-".repeat(60));
  console.log(failures.length === 0 ? "Overall: PASS" : `Overall: FAIL (${failures.length} issue${failures.length > 1 ? "s" : ""})`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Image validation runner crashed:", err);
  process.exit(1);
});
