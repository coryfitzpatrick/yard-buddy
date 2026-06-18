import Anthropic from "@anthropic-ai/sdk";
import { generateRecommendations } from "../../lib/claude";
import type { Scenario, JudgeResult } from "./types";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 90_000,
      maxRetries: 0,
    });
  }
  return _anthropic;
}

const JUDGE_SYSTEM = `You are a turfgrass expert with 20+ years of experience and deep knowledge of university extension recommendations. You evaluate AI-generated lawn care advice for agronomic accuracy.`;

// JUDGE_MODEL — defaults to Sonnet for cost-effective routine iteration.
// Opus (claude-opus-4-7) gives more authoritative scores (R35 finding: +4.6 mean
// points higher on identical AI output, fewer hallucinated citations) but costs
// roughly 5x more per validation run. For milestone/release validation, override
// with: JUDGE_MODEL=claude-opus-4-7 npm run validate
// For iteration, Sonnet's biases are characterized (underestimates by ~4-5 points
// on certain stuck scenarios) so relative changes between runs are still meaningful.
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6";

const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [0, 2000, 5000, 10000];

function isTransientError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("rate limit") ||
    message.includes("overloaded") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("504") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

async function callWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === MAX_ATTEMPTS - 1) throw err;
      const message = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n    [retry ${attempt + 1}/${MAX_ATTEMPTS - 1}] ${label}: ${message.slice(0, 80)}\n  `);
    }
  }
  throw lastErr;
}

// Strip non-printable control chars (keep tab, newline, carriage return) so
// stray bytes inside JSON string values don't break JSON.parse. Built with
// charCodeAt to avoid edit-tool mangling of regex escape sequences.
function stripControlChars(s: string): string {
  let out = "";
  for (let k = 0; k < s.length; k++) {
    const code = s.charCodeAt(k);
    const isCtl = (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
    out += isCtl ? " " : s[k];
  }
  return out;
}

async function judgeScenario(scenario: Scenario): Promise<JudgeResult> {
  try {
    const recs = await callWithRetry(
      `generate ${scenario.id}`,
      () => generateRecommendations(scenario.profile, { userId: null, feature: "recommendations" }),
    );
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

    // ENSEMBLE JUDGING: call judge 3x and average the scores. Judge variance
    // test showed sigma up to 2.5 on identical inputs; ensemble cuts variance
    // to ~sigma/sqrt(3) so future improvements are measurable. Also averages
    // out the judge's tendency to bin scores at 82/88/91.
    const ENSEMBLE_N = 3;
    type Vote = { score: number; flags: string[]; reasoning: string };
    const votes: Vote[] = [];
    for (let i = 0; i < ENSEMBLE_N; i++) {
      // Retry the whole call+parse chain on JSON parse failures. The model
      // occasionally emits raw control characters inside string values which
      // breaks JSON.parse; we strip them and retry.
      let parsed: { score?: number; flags?: string[]; reasoning?: string } | undefined;
      let parseAttempt = 0;
      while (parseAttempt < 3 && !parsed) {
        const message = await callWithRetry(`judge ${scenario.id} (${i + 1}/${ENSEMBLE_N})`, () =>
          getAnthropic().messages.create({
            model: JUDGE_MODEL,
            max_tokens: 1024,
            system: JUDGE_SYSTEM,
            messages: [{ role: "user", content: prompt }],
          }),
        );
        const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const cleaned = stripControlChars(jsonMatch?.[0] ?? "{}");
        try {
          parsed = JSON.parse(cleaned) as { score?: number; flags?: string[]; reasoning?: string };
        } catch (err) {
          parseAttempt += 1;
          process.stdout.write(`\n    [parse-retry ${parseAttempt}/3] ${scenario.id}: ${(err as Error).message.slice(0, 60)}\n  `);
        }
      }
      if (!parsed) {
        throw new Error(`Judge returned unparseable JSON after 3 attempts for ${scenario.id}`);
      }
      votes.push({
        score: parsed.score ?? 0,
        flags: parsed.flags ?? [],
        reasoning: parsed.reasoning ?? "",
      });
    }

    const sorted = [...votes].sort((a, b) => a.score - b.score);
    const median = sorted[Math.floor(sorted.length / 2)];
    const meanScore = votes.reduce((sum, v) => sum + v.score, 0) / votes.length;

    return {
      scenarioId: scenario.id,
      score: Math.round(meanScore),
      flags: median.flags,
      reasoning: `[ensemble n=${ENSEMBLE_N} votes=${votes.map(v => v.score).join(",")} mean=${meanScore.toFixed(1)}] ${median.reasoning}`,
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
