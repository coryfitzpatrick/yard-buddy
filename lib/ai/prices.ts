// USD per 1M tokens. Update when Anthropic changes prices.
export const AI_PRICES_USD_PER_MTOK: Record<string, {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}> = {
  "claude-sonnet-4-6":         { input: 3, output: 15, cacheRead: 0.30, cacheCreation: 3.75 },
  "claude-haiku-4-5-20251001": { input: 1, output:  5, cacheRead: 0.10, cacheCreation: 1.25 },
};

const FALLBACK_MODEL = "claude-sonnet-4-6";

export interface AiUsageInput {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function computeCostUsd(model: string, usage: AiUsageInput): number {
  let prices = AI_PRICES_USD_PER_MTOK[model];
  if (!prices) {
    console.warn(`computeCostUsd: unknown model "${model}" - pricing as ${FALLBACK_MODEL}`);
    prices = AI_PRICES_USD_PER_MTOK[FALLBACK_MODEL];
  }
  return (
    (usage.input_tokens                ?? 0) * prices.input +
    (usage.output_tokens               ?? 0) * prices.output +
    (usage.cache_read_input_tokens     ?? 0) * prices.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * prices.cacheCreation
  ) / 1_000_000;
}
