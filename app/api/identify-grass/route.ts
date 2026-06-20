import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GrassType } from "@/types";
import { isOwnedLawnPhotoUrl } from "@/lib/storage-url";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { callClaude } from "@/lib/ai/usage";
import { withAxiom } from "@/lib/observability/logger";

const VALID_GRASS_TYPES: GrassType[] = [
  "bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue",
  "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown",
];

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit(
    `identify-grass:${session.user.id}`,
    10,
    60 * 60 * 1000,
    { route: "/api/identify-grass", ip: getClientIp(req), userId: session.user.id },
  );
  if (rate.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many identifications in the last hour. Try again shortly." },
      { status: 429 },
    );
  }

  const { imageUrl } = await req.json();
  if (!isOwnedLawnPhotoUrl(imageUrl, session.user.id)) {
    return NextResponse.json({ error: "invalid_image_url" }, { status: 400 });
  }

  const message = await callClaude({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: imageUrl } },
        {
          type: "text",
          text: `You are an expert turfgrass agronomist. Identify the grass type in this image.

Return JSON only, no other text:
{
  "grassType": one of exactly ["bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue", "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown"],
  "confidence": "high" | "medium" | "low",
  "explanation": "1-2 sentences describing what visual characteristics led to this identification"
}`,
        },
      ],
    }],
  }, { userId: session.user.id, feature: "identify-grass" });

  const text = (message.content[0] as { type: string; text: string }).text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Could not parse response" }, { status: 500 });

  const result = JSON.parse(match[0]);
  if (!VALID_GRASS_TYPES.includes(result.grassType)) result.grassType = "unknown";

  return NextResponse.json(result);
});
