import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { GrassType } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_GRASS_TYPES: GrassType[] = [
  "bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue",
  "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { imageUrl } = await req.json();
  if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });

  const message = await client.messages.create({
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
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Could not parse response" }, { status: 500 });

  const result = JSON.parse(match[0]);
  if (!VALID_GRASS_TYPES.includes(result.grassType)) result.grassType = "unknown";

  return NextResponse.json(result);
}
