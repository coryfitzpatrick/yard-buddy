import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { computeCostUsd, type AiUsageInput } from "./prices";

export type AiFeature =
  | "analyze"
  | "identify-grass"
  | "recommendations"
  | "watering"
  | "critique"
  | "overdue-assessor";

export interface AiCallCtx {
  userId: string | null;
  feature: AiFeature;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(
  params: Anthropic.MessageCreateParams,
  ctx: AiCallCtx,
): Promise<Anthropic.Message> {
  try {
    const response = await client.messages.create(params) as Anthropic.Message;
    void recordUsage({
      ...ctx,
      model: response.model,
      usage: response.usage as AiUsageInput,
      success: true,
    });
    return response;
  } catch (err) {
    void recordUsage({
      ...ctx,
      model: typeof params.model === "string" ? params.model : "unknown",
      usage: null,
      success: false,
      errorCode: extractErrorCode(err),
    });
    throw err;
  }
}

interface RecordArgs extends AiCallCtx {
  model: string;
  usage: AiUsageInput | null;
  success: boolean;
  errorCode?: string;
}

async function recordUsage(args: RecordArgs): Promise<void> {
  try {
    const usage = args.usage ?? {};
    const costUsd = args.success ? computeCostUsd(args.model, usage) : 0;
    await db.aiUsageEvent.create({
      data: {
        userId: args.userId,
        feature: args.feature,
        model: args.model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        costUsd,
        success: args.success,
        errorCode: args.errorCode ?? null,
      },
    });
  } catch (err) {
    console.warn("recordUsage: failed to write AiUsageEvent", err);
  }
}

function extractErrorCode(err: unknown): string {
  if (typeof err !== "object" || err === null) return "unknown";
  const e = err as { status?: number; error?: { type?: string } };
  if (e.error?.type) return e.error.type;
  if (typeof e.status === "number") return String(e.status);
  return "unknown";
}
