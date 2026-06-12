import Anthropic from "@anthropic-ai/sdk";
import { generateRecommendations } from "../../lib/claude";
import type { LawnContext } from "../../lib/claude";
import { yardSectionSchema } from "../../lib/validations/yard";
import type { InputTestResult } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Minimal 1×1 pixel PNGs — black and white — for photo quality tests
const BLACK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const WHITE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQI12NgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==";

async function validateBase64Images(
  images: Array<{ data: string; mediaType: "image/png" | "image/jpeg" }>
): Promise<{ valid: boolean; feedback: string | null }> {
  const imageContent = images.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
  }));
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text" as const,
            text: `Review these photos submitted for lawn analysis. Evaluate on three criteria:
1. SUBJECT: Do the images show lawn, grass, or outdoor ground cover?
2. QUALITY: Are the images clear and in focus, well-lit, and close enough to see the grass condition?
3. VARIETY: If multiple images, do they show different angles or areas?

Return JSON only, no other text:
{
  "valid": true or false,
  "feedback": null or "explanation"
}`,
          },
        ],
      },
    ],
  });
  try {
    const text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    const json = JSON.parse(text.replace(/^```json\n?/, "").replace(/\n?```$/, ""));
    return { valid: json.valid === true, feedback: json.feedback ?? null };
  } catch {
    return { valid: false, feedback: "Failed to parse image validation response" };
  }
}

async function runInputTest(
  testId: string,
  run: () => Promise<string | null>
): Promise<InputTestResult> {
  try {
    const response = await run();
    return { testId, pass: true, reason: response ?? "OK" };
  } catch (err) {
    return { testId, pass: false, reason: String(err) };
  }
}

function assertUncertain(response: string, context: string): void {
  const confidentPatterns = [
    /apply \d+(?:\.\d+)?\s*(?:lb|lbs|pound|pounds|bag|bags)/i,
    /fertilize\s+(?:now|this week|this weekend|immediately|today|tonight)/i,
    /use\s+\d+-\d+-\d+/i,
    /apply\s+(?:at\s+)?\d+(?:\.\d+)?\s*(?:lb|lbs)\s+per\s+\d+\s*(?:sq\s*ft|square)/i,
    /spread\s+\d+(?:\.\d+)?\s*(?:lb|lbs)/i,
  ];
  const uncertainPatterns = [
    "unknown", "unable to", "cannot", "don't know", "not sure",
    "please provide", "would help to know", "unclear", "uncertain",
    "not specified", "insufficient", "more information",
  ];
  const lower = response.toLowerCase();
  const isConfident = confidentPatterns.some((p) => p.test(response));
  const isUncertain = uncertainPatterns.some((p) => lower.includes(p));
  if (isConfident && !isUncertain) {
    throw new Error(`Confident specific advice for ${context} without acknowledging uncertainty`);
  }
}

export async function runInputGuardTests(): Promise<InputTestResult[]> {
  const results: InputTestResult[] = [];

  // --- Value boundary tests ---

  // Boundary tests: verify that impossible values are rejected by input validation (Zod schema),
  // not that the AI handles them gracefully. These values should never reach generateRecommendations()
  // in production because the form UI (min/max) and Zod schema block them at the API layer.

  results.push(
    await runInputTest("boundary-ph-zero", async () => {
      const result = yardSectionSchema.safeParse({ grassType: "tall_fescue", soilPh: -1 });
      if (result.success) throw new Error("Schema accepted invalid soilPh=-1 (below minimum 4)");
      return "soilPh=-1 correctly rejected by schema validation";
    })
  );

  results.push(
    await runInputTest("boundary-ph-fourteen", async () => {
      const result = yardSectionSchema.safeParse({ grassType: "tall_fescue", soilPh: 14 });
      if (result.success) throw new Error("Schema accepted invalid soilPh=14 (above maximum 9)");
      return "soilPh=14 correctly rejected by schema validation";
    })
  );

  results.push(
    await runInputTest("boundary-nitrogen-extreme", async () => {
      const result = yardSectionSchema.safeParse({ grassType: "tall_fescue", nitrogenPpm: 99999 });
      if (result.success) throw new Error("Schema accepted invalid nitrogenPpm=99999 (above maximum 1000 ppm)");
      return "nitrogenPpm=99999 correctly rejected by schema validation";
    })
  );

  results.push(
    await runInputTest("boundary-sqft-zero", async () => {
      const result = yardSectionSchema.safeParse({ grassType: "kentucky_bluegrass", yardSizeSqft: -500 });
      if (result.success) throw new Error("Schema accepted invalid yardSizeSqft=-500 (below minimum 1)");
      return "yardSizeSqft=-500 correctly rejected by schema validation";
    })
  );

  // --- Incomplete profile tests ---

  results.push(
    await runInputTest("incomplete-unknown-grass", async () => {
      const ctx: LawnContext = { grassType: "unknown", zipCode: "10001" };
      const recs = await generateRecommendations(ctx);
      const text = JSON.stringify(recs).toLowerCase();
      const hasAcknowledgment =
        text.includes("unknown") ||
        text.includes("identify") ||
        text.includes("grass type") ||
        text.includes("unable to determine");
      if (!hasAcknowledgment) {
        throw new Error("Unknown grass type did not produce acknowledgment of uncertainty");
      }
      return "Unknown grass type acknowledged";
    })
  );

  results.push(
    await runInputTest("incomplete-no-location", async () => {
      const ctx: LawnContext = { grassType: "bermuda", zipCode: "" };
      const recs = await generateRecommendations(ctx);
      if (!recs || recs.length === 0) {
        throw new Error("Returned empty recommendations for missing location");
      }
      const text = JSON.stringify(recs).toLowerCase();
      const hasLocationAcknowledgment =
        text.includes("general") ||
        text.includes("location") ||
        text.includes("region") ||
        text.includes("climate") ||
        text.includes("zip") ||
        text.includes("area");
      if (!hasLocationAcknowledgment) {
        throw new Error("Response made no reference to location/region context with empty ZIP");
      }
      return `Got ${recs.length} recommendations with location context acknowledged`;
    })
  );

  results.push(
    await runInputTest("incomplete-empty-profile", async () => {
      const ctx: LawnContext = { grassType: "unknown", zipCode: "00000" };
      const recs = await generateRecommendations(ctx);
      if (!recs || recs.length === 0) {
        throw new Error("Returned empty recommendations for empty profile");
      }
      const text = JSON.stringify(recs).toLowerCase();
      const hasAcknowledgment =
        text.includes("unknown") ||
        text.includes("identify") ||
        text.includes("grass type") ||
        text.includes("general");
      if (!hasAcknowledgment) {
        throw new Error("Minimal profile did not produce any uncertainty acknowledgment or general guidance note");
      }
      return `Got ${recs.length} recommendations with uncertainty acknowledgment`;
    })
  );

  // --- Photo quality tests ---

  results.push(
    await runInputTest("photo-solid-black", async () => {
      const result = await validateBase64Images([{ data: BLACK_PNG, mediaType: "image/png" }]);
      if (result.valid) {
        throw new Error("Solid black 1×1 PNG was accepted as a valid lawn photo");
      }
      return `Correctly rejected: ${result.feedback}`;
    })
  );

  results.push(
    await runInputTest("photo-solid-white", async () => {
      const result = await validateBase64Images([{ data: WHITE_PNG, mediaType: "image/png" }]);
      if (result.valid) {
        throw new Error("Solid white 1×1 PNG was accepted as a valid lawn photo");
      }
      return `Correctly rejected: ${result.feedback}`;
    })
  );

  return results;
}
