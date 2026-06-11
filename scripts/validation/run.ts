import * as fs from "fs";
import * as path from "path";
import { generateRecommendations } from "../../lib/claude";
import { ALL_RULES } from "./rules/assertions";
import { runInputGuardTests } from "./input-quality";
import { runJudge } from "./judge";
import type { Scenario, RunReport, PillarResult, RuleResult } from "./types";

const SCENARIOS_DIR = path.join(__dirname, "scenarios");
const RESULTS_DIR = path.join(__dirname, "results");
const BASELINE_FILE = path.join(RESULTS_DIR, "baseline.json");
const SCORE_THRESHOLD = 60;
const REGRESSION_DELTA = 5;

function loadScenarios(): Scenario[] {
  if (!fs.existsSync(SCENARIOS_DIR)) {
    console.error(`Scenarios directory not found: ${SCENARIOS_DIR}`);
    process.exit(1);
  }
  const scenarios: Scenario[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) {
        scenarios.push(JSON.parse(fs.readFileSync(full, "utf8")) as Scenario);
      }
    }
  };
  walk(SCENARIOS_DIR);
  return scenarios;
}

function printHeader(date: string) {
  console.log(`\nYard Analyzer Validation Report — ${date}`);
  console.log("─".repeat(60));
}

function printPillar1(results: { testId: string; pass: boolean; reason: string }[]) {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nPillar 1: Input Guard Tests     ${passed}/${results.length} passed`);
  results.filter((r) => !r.pass).forEach((r) => {
    console.log(`  FAIL [input] ${r.testId}: ${r.reason}`);
  });
}

function printPillar2(results: RuleResult[]) {
  const passed = results.filter((r) => r.pass).length;
  console.log(`Pillar 2: Rule Assertions       ${passed}/${results.length} passed`);
  results.filter((r) => !r.pass).forEach((r) => {
    const prefix = r.scenarioId ? `${r.scenarioId}/${r.ruleId}` : r.ruleId;
    console.log(`  FAIL [rule] ${prefix}: ${r.reason}`);
  });
}

function printPillar3(results: { scenarioId: string; score: number; flags: string[] }[], mean: number) {
  console.log(`Pillar 3: LLM-as-Judge          ${mean.toFixed(1)} / 100 mean score`);
  results.filter((r) => r.score < SCORE_THRESHOLD).forEach((r) => {
    console.log(`  LOW [judge] ${r.scenarioId}: score=${r.score} flags=${r.flags.join(", ")}`);
  });
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  printHeader(date);

  const scenarios = loadScenarios();
  console.log(`Loaded ${scenarios.length} scenarios\n`);

  const failures: string[] = [];
  const pillars: PillarResult[] = [];

  // --- Pillar 1: Input Guard ---
  console.log("Running Pillar 1: Input Guard Tests...");
  const inputResults = await runInputGuardTests();
  pillars.push({ pillar: 1, results: inputResults });
  printPillar1(inputResults);
  inputResults.filter((r) => !r.pass).forEach((r) => failures.push(`[input] ${r.testId}`));

  // --- Pillar 2: Rule Assertions ---
  console.log("\nRunning Pillar 2: Rule Assertions...");
  const ruleResults: RuleResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  ${scenario.id}... `);
    try {
      const recs = await generateRecommendations(scenario.profile);
      const responseText = JSON.stringify(recs);
      for (const rule of ALL_RULES) {
        const result = rule.check(scenario, responseText);
        ruleResults.push({ ...result, scenarioId: scenario.id });
      }
      process.stdout.write("done\n");
    } catch (err) {
      process.stdout.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      failures.push(`[pillar2-error] ${scenario.id}`);
    }
  }
  pillars.push({ pillar: 2, results: ruleResults });
  printPillar2(ruleResults);
  ruleResults.filter((r) => !r.pass).forEach((r) => failures.push(`[rule] ${r.ruleId}`));

  // --- Pillar 3: LLM-as-Judge ---
  if (!process.env.OPENAI_API_KEY) {
    console.log("\nPillar 3: LLM-as-Judge         SKIPPED (no OPENAI_API_KEY)");
  } else {
    console.log("\nRunning Pillar 3: LLM-as-Judge...");
    const { results: judgeResults, mean } = await runJudge(scenarios);
    pillars.push({ pillar: 3, results: judgeResults, mean });
    printPillar3(judgeResults, mean);
    judgeResults.filter((r) => r.score < SCORE_THRESHOLD).forEach((r) =>
      failures.push(`[judge-low] ${r.scenarioId}`)
    );

    // Regression check against baseline
    if (fs.existsSync(BASELINE_FILE)) {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) as { mean: number };
      if (mean < baseline.mean - REGRESSION_DELTA) {
        failures.push(
          `[regression] mean score dropped from ${baseline.mean.toFixed(1)} to ${mean.toFixed(1)}`
        );
      }
    } else {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      fs.writeFileSync(BASELINE_FILE, JSON.stringify({ mean, date }, null, 2));
      console.log(`\nBaseline saved: ${mean.toFixed(1)}/100`);
    }
  }

  // --- Write results ---
  const report: RunReport = {
    timestamp: new Date().toISOString(),
    pillars,
    overallPass: failures.length === 0,
    failures,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = path.join(RESULTS_DIR, `${date}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log("\n" + "─".repeat(60));
  if (failures.length === 0) {
    console.log("Overall: PASS");
  } else {
    console.log(`Overall: FAIL (${failures.length} issue${failures.length > 1 ? "s" : ""})`);
    failures.forEach((f) => console.log(`  ${f}`));
  }
  console.log(`Results written to ${outFile}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Validation runner crashed:", err);
  process.exit(1);
});
