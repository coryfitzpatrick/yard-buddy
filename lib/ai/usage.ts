import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { computeCostUsd, type AiUsageInput } from "./prices";
import { logger } from "@/lib/observability/logger";
import { emitAiCall, isExpensiveCall, type AiFeature } from "@/lib/observability/events";

export interface AiCallCtx {
  userId: string | null;
  feature: AiFeature;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(
  params: Omit<Anthropic.MessageCreateParams, "stream"> & { stream?: false },
  ctx: AiCallCtx,
): Promise<Anthropic.Message> {
  try {
    const response = (await client.messages.create(params)) as Anthropic.Message;
    const usage = response.usage as AiUsageInput;
    // Recomputed inside recordUsage as well; computeCostUsd is a pure function
    // over ~6 multiplications. Deliberate redundancy keeps recordUsage self-
    // contained and avoids coupling the two call sites.
    const costUsd = computeCostUsd(response.model, usage);
    const inputTokens = usage.input_tokens ?? 0;

    await recordUsage({ ...ctx, model: response.model, usage, success: true });

    // Mirror only outliers — failures and expensive calls — to Axiom.
    // Postgres remains the source of truth for the monthly margin report.
    if (isExpensiveCall({ costUsd, inputTokens })) {
      try {
        emitAiCall({
          userId: ctx.userId,
          feature: ctx.feature,
          model: response.model,
          success: true,
          costUsd,
          inputTokens,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
          reason: "expensive",
        });
      } catch (emitErr) {
        logger.error("emitAiCall failed (success path)", {
          err: emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }
    }

    return response;
  } catch (err) {
    const model = typeof params.model === "string" ? params.model : "unknown";
    const errorCode = extractErrorCode(err);
    await recordUsage({ ...ctx, model, usage: null, success: false, errorCode });
    try {
      emitAiCall({
        userId: ctx.userId,
        feature: ctx.feature,
        model,
        success: false,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        errorCode,
        reason: "failure",
      });
    } catch (emitErr) {
      logger.error("emitAiCall failed (failure path)", {
        err: emitErr instanceof Error ? emitErr.message : String(emitErr),
      });
    }
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
    logger.error("recordUsage: failed to write AiUsageEvent", {
      err: err instanceof Error ? err.message : String(err),
      feature: args.feature,
      model: args.model,
    });
  }
}

function extractErrorCode(err: unknown): string {
  if (typeof err !== "object" || err === null) return "unknown";
  const e = err as { status?: number; error?: { type?: string } };
  if (e.error?.type) return e.error.type;
  if (typeof e.status === "number") return String(e.status);
  return "unknown";
}
