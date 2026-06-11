import Anthropic from "@anthropic-ai/sdk";
import { generateRecommendations } from "../../lib/claude";
import type { LawnContext } from "../../lib/claude";
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

  results.push(
    await runInputTest("boundary-ph-zero", async () => {
      const ctx: LawnContext = { grassType: "tall_fescue", zipCode: "27601", soilPh: -1 };
      const recs = await generateRecommendations(ctx);
      assertUncertain(JSON.stringify(recs), "pH=-1");
      return "pH=-1 handled with uncertainty";
    })
  );

  results.push(
    await runInputTest("boundary-ph-fourteen", async () => {
      const ctx: LawnContext = { grassType: "tall_fescue", zipCode: "27601", soilPh: 14 };
      const recs = await generateRecommendations(ctx);
      assertUncertain(JSON.stringify(recs), "pH=14");
      return "pH=14 handled with uncertainty";
    })
  );

  results.push(
    await runInputTest("boundary-nitrogen-extreme", async () => {
      const ctx: LawnContext = {
        grassType: "tall_fescue",
        zipCode: "27601",
        nitrogenPpm: 99999,
      };
      const recs = await generateRecommendations(ctx);
      assertUncertain(JSON.stringify(recs), "nitrogen=99999");
      return "nitrogen=99999 handled with uncertainty";
    })
  );

  results.push(
    await runInputTest("boundary-sqft-zero", async () => {
      const ctx: LawnContext = {
        grassType: "kentucky_bluegrass",
        zipCode: "66101",
        yardSizeSqft: -500,
      };
      const recs = await generateRecommendations(ctx);
      assertUncertain(JSON.stringify(recs), "sqft=-500");
      return "sqft=-500 handled";
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
