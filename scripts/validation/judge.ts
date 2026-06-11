import "dotenv/config";
import OpenAI from "openai";
import { generateRecommendations } from "../../lib/claude";
import type { Scenario, JudgeResult } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JUDGE_SYSTEM = `You are a turfgrass expert with 20+ years of experience and deep knowledge of university extension recommendations. You evaluate AI-generated lawn care advice for agronomic accuracy.`;

async function judgeScenario(scenario: Scenario): Promise<JudgeResult> {
  try {
    const recs = await generateRecommendations(scenario.profile);
    const responseText = JSON.stringify(recs, null, 2);

    const prompt = `A homeowner's AI lawn care advisor produced the following recommendations.

## Yard Profile
${JSON.stringify(scenario.profile, null, 2)}

## AI Recommendations
${responseText}

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message.content ?? "{}";
    const parsed = JSON.parse(raw) as { score?: number; flags?: string[]; reasoning?: string };
    return {
      scenarioId: scenario.id,
      score: parsed.score ?? 0,
      flags: parsed.flags ?? [],
      reasoning: parsed.reasoning ?? "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`ERROR: ${message}\n`);
    return {
      scenarioId: scenario.id,
      score: 0,
      flags: [`error: ${message}`],
      reasoning: "Scenario could not be evaluated due to an API error.",
    };
  }
}

export async function runJudge(scenarios: Scenario[]): Promise<{ results: JudgeResult[]; mean: number }> {
  const results: JudgeResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  Judging ${scenario.id}... `);
    const result = await judgeScenario(scenario);
    process.stdout.write(`${result.score}/100\n`);
    results.push(result);
  }
  const mean = results.length > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / results.length
    : 0;
  return { results, mean };
}
