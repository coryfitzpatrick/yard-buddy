/**
 * Measure judge variance on a FIXED set of recommendations.
 *
 * Why: validation P3 mean swings ±2-4 between identical runs because both the
 * AI (generating recs) AND the judge (scoring them) are stochastic. To know
 * if the judge itself is the bottleneck, we need to score the SAME outputs
 * multiple times.
 *
 * Method: pick 3 scenarios, generate ONE set of recs each, then call the
 * judge N times on the locked recs. Report std dev per scenario.
 *
 * Usage: npx tsx --env-file .env.local scripts/validation/judge-variance.ts [N]
 *   N defaults to 5
 */
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { generateRecommendations } from "../../lib/claude";
import type { Scenario } from "./types";

const SCENARIO_IDS = ["kbg-july-heat", "ryegrass-spring", "tall-fescue-low-ph"];

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 90_000,
  maxRetries: 2,
});

const JUDGE_SYSTEM = `You are a turfgrass expert with 20+ years of experience and deep knowledge of university extension recommendations. You evaluate AI-generated lawn care advice for agronomic accuracy.`;

function buildJudgePrompt(scenario: Scenario, recsJson: string): string {
  return `A homeowner's AI lawn care advisor produced the following recommendations.

## Yard Profile
${JSON.stringify(scenario.profile, null, 2)}

## AI Recommendations
${recsJson}

## Ground Truth (from university extension research)
Things the recommendation SHOULD address: ${JSON.stringify(scenario.groundTruth.mustInclude)}
Things the recommendation MUST NOT include: ${JSON.stringify(scenario.groundTruth.mustNotInclude)}
Source: ${scenario.groundTruth.source}

## Your Task
Score this recommendation 0–100 for agronomic correctness given the yard profile above.
- 90–100: Excellent. Accurate, specific, safe, matches extension guidance.
- 70–89: Good. Mostly correct with minor omissions or imprecise language.
- 50–69: Acceptable but has notable gaps or vague advice.
- Below 50: Contains incorrect, unsafe, or missing critical guidance.

Return ONLY valid JSON, no other text:
{
  "score": <number 0-100>,
  "flags": ["<specific issue 1>", "<specific issue 2>"],
  "reasoning": "<2-3 sentence explanation>"
}`;
}

async function callJudge(prompt: string): Promise<number> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}";
  const match = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? "{}") as { score?: number };
  return parsed.score ?? 0;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function loadScenario(id: string): Scenario {
  const roots = ["cool-season", "warm-season", "edge-cases"];
  for (const root of roots) {
    const p = path.join(__dirname, "scenarios", root, `${id}.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as Scenario;
  }
  throw new Error(`Scenario not found: ${id}`);
}

async function main(): Promise<void> {
  const N = Number(process.argv[2] ?? 5);
  console.log(`Judge variance test: ${SCENARIO_IDS.length} scenarios × ${N} judge calls each\n`);

  for (const id of SCENARIO_IDS) {
    const scenario = loadScenario(id);
    process.stdout.write(`[${id}] generating recs... `);
    const recs = await generateRecommendations(scenario.profile, { userId: null, feature: "recommendations" });
    const recsJson = JSON.stringify(recs, null, 2);
    process.stdout.write(`done. judging ${N}x: `);

    const prompt = buildJudgePrompt(scenario, recsJson);
    const scores: number[] = [];
    for (let i = 0; i < N; i++) {
      const score = await callJudge(prompt);
      scores.push(score);
      process.stdout.write(`${score} `);
    }

    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sd = stdDev(scores);
    console.log(`\n  min=${min}  max=${max}  spread=${max - min}  mean=${mean.toFixed(1)}  σ=${sd.toFixed(2)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
