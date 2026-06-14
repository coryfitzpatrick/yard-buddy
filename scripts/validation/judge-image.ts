import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult } from "../../types";
import type { ImageScenario, ImageJudgeResult } from "./types-image";
import { computeCombinedScore } from "./types-image";
import { type Base64Image } from "./load-photos";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 120_000,
      maxRetries: 0,
    });
  }
  return _anthropic;
}

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6";
const JUDGE_SYSTEM = `You are a turfgrass expert with 20+ years of experience and deep knowledge of university extension recommendations. You evaluate AI-generated lawn care analyses for agronomic accuracy, including visual grounding against photos.`;
const ENSEMBLE_N = 3;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [0, 2000, 5000, 10000];

function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return ["timed out","timeout","rate limit","overloaded","503","502","504","econnreset","etimedout"].some((s) => msg.includes(s));
}

async function callWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (BACKOFF_MS[i]) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (!isTransientError(e) || i === MAX_ATTEMPTS - 1) throw e;
      process.stdout.write(`\n    [retry ${i + 1}] ${label}\n  `);
    }
  }
  throw lastErr;
}

function stripControlChars(s: string): string {
  let out = "";
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    out += (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127 ? " " : s[k];
  }
  return out;
}

function buildJudgePrompt(scenario: ImageScenario, aiResult: AnalysisResult): string {
  return `You will see N photos of a lawn, then the AI's AnalysisResult and the ground truth. Score across the dimensions below.

CUSTOMER PROFILE:
${JSON.stringify(scenario.profile, null, 2)}

AI OUTPUT:
${JSON.stringify(aiResult, null, 2)}

GROUND TRUTH:
- grass type: ${scenario.groundTruth.grassType}
- visible issues: ${JSON.stringify(scenario.groundTruth.issues)}
- health score range: ${scenario.groundTruth.healthScoreRange.join("-")}
- must include phrases: ${JSON.stringify(scenario.groundTruth.mustInclude)}
- must NOT include phrases: ${JSON.stringify(scenario.groundTruth.mustNotInclude)}
- task mode constraint: ${scenario.groundTruth.taskModeConstraint ? JSON.stringify(scenario.groundTruth.taskModeConstraint) : "(none)"}
- what is visible in the photos: ${scenario.groundTruth.photoNotes}
- intentionally missing customer fields (dataGaps): ${JSON.stringify(scenario.dataGaps)}

SCORE each dimension independently:
1. grassTypeAccuracy (0 or 100): does AI.grassTypeDetected match ground truth?
2. issuesF1 (0-100): F1 of AI.issues set vs ground-truth issues set times 100.
3. healthScoreInRange (0 or 100): is AI.healthScore within ground truth range?
4. recommendationQuality (0-100): agronomically appropriate given what's visible, respects taskModeConstraint, cites extension sources, never invents issues not present.
5. dataGapAcknowledgment (0-100): if dataGaps are non-empty, did the AI emit a specific dataGapWarning? 100=specific to which recs are weakened; 60=generic; 0=silent. When dataGaps is empty, return 100.
6. crossPhotoSynthesis (0-100, only if >=2 photos; else null): integration of evidence across photos. 100=explicit per-region; 60=uses all but doesn't differentiate; 0=ignores beyond first.

Output ONLY this JSON (no markdown, no preamble):
{"grassTypeAccuracy":<int>,"issuesF1":<int>,"healthScoreInRange":<int>,"recommendationQuality":<int>,"dataGapAcknowledgment":<int>,"crossPhotoSynthesis":<int or null>,"flags":["<specific issue>","<...>"],"reasoning":"<2-3 sentences>"}`;
}

type Vote = {
  grassTypeAccuracy: number;
  issuesF1: number;
  healthScoreInRange: number;
  recommendationQuality: number;
  dataGapAcknowledgment: number;
  crossPhotoSynthesis: number | null;
  flags: string[];
  reasoning: string;
};

export async function judgeImageScenario(
  scenario: ImageScenario,
  aiResult: AnalysisResult,
  photos: Base64Image[]
): Promise<ImageJudgeResult> {
  const prompt = buildJudgePrompt(scenario, aiResult);
  const votes: Vote[] = [];

  for (let i = 0; i < ENSEMBLE_N; i++) {
    let parsed: Vote | undefined;
    let parseAttempt = 0;
    while (parseAttempt < 3 && !parsed) {
      const message = await callWithRetry(`judge-image ${scenario.id} (${i + 1}/${ENSEMBLE_N})`, () =>
        getAnthropic().messages.create({
          model: JUDGE_MODEL,
          max_tokens: 1024,
          system: JUDGE_SYSTEM,
          messages: [{
            role: "user",
            content: [
              ...photos,
              { type: "text" as const, text: prompt },
            ],
          }],
        }),
      );
      const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const cleaned = stripControlChars(jsonMatch?.[0] ?? "{}");
      try { parsed = JSON.parse(cleaned) as Vote; }
      catch (err) {
        parseAttempt += 1;
        process.stdout.write(`\n    [parse-retry ${parseAttempt}/3] ${scenario.id}: ${(err as Error).message.slice(0, 60)}\n  `);
      }
    }
    if (!parsed) throw new Error(`Judge unparseable for ${scenario.id} after 3 attempts`);
    votes.push(parsed);
  }

  const avg = (key: keyof Vote) => Math.round(votes.reduce((s, v) => s + ((v[key] as number) || 0), 0) / votes.length);
  const crossVotes = votes.map((v) => v.crossPhotoSynthesis).filter((n): n is number => typeof n === 'number');
  const crossAvg = crossVotes.length > 0 ? Math.round(crossVotes.reduce((s, n) => s + n, 0) / crossVotes.length) : null;

  const subScores = {
    grassTypeAccuracy: avg('grassTypeAccuracy'),
    issuesF1: avg('issuesF1'),
    healthScoreInRange: avg('healthScoreInRange'),
    recommendationQuality: avg('recommendationQuality'),
    dataGapAcknowledgment: avg('dataGapAcknowledgment'),
    crossPhotoSynthesis: crossAvg,
  };

  const median = votes[Math.floor(votes.length / 2)];
  return {
    scenarioId: scenario.id,
    ...subScores,
    combined: computeCombinedScore(subScores),
    flags: median.flags,
    reasoning: `[ensemble n=${ENSEMBLE_N} model=${JUDGE_MODEL}] ${median.reasoning}`,
  };
}

export async function runImageJudge(
  scenarios: ImageScenario[],
  aiResults: Map<string, AnalysisResult>,
  photoMap: Map<string, Base64Image[]>
): Promise<{ results: ImageJudgeResult[]; mean: number }> {
  const results: ImageJudgeResult[] = [];
  for (const scenario of scenarios) {
    process.stdout.write(`  Judging ${scenario.id}... `);
    try {
      const ai = aiResults.get(scenario.id);
      const photos = photoMap.get(scenario.id);
      if (!ai || !photos) {
        process.stdout.write(`SKIP (missing AI result or photos)\n`);
        continue;
      }
      const r = await judgeImageScenario(scenario, ai, photos);
      process.stdout.write(`${r.combined}/100 (g${r.grassTypeAccuracy} i${r.issuesF1} h${r.healthScoreInRange} r${r.recommendationQuality} d${r.dataGapAcknowledgment}${r.crossPhotoSynthesis != null ? ` c${r.crossPhotoSynthesis}` : ''})\n`);
      results.push(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`ERROR: ${msg.slice(0, 100)}\n`);
      results.push({
        scenarioId: scenario.id,
        grassTypeAccuracy: 0, issuesF1: 0, healthScoreInRange: 0,
        recommendationQuality: 0, dataGapAcknowledgment: 0, crossPhotoSynthesis: null,
        combined: 0,
        flags: [`error: ${msg.slice(0, 200)}`],
        reasoning: "Judge error",
      });
    }
  }
  const mean = results.length > 0 ? results.reduce((s, r) => s + r.combined, 0) / results.length : 0;
  return { results, mean };
}
