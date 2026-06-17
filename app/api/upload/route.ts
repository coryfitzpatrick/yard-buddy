import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/gif": "gif",
};

// Returns a signed upload URL — the client uploads directly to Supabase,
// bypassing Vercel's 4.5MB serverless body limit.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rate = await checkRateLimit(`upload:${session.user.id}`, 60, 60 * 60 * 1000);
  if (rate.limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { contentType } = await req.json();
  if (!contentType || !MIME_TO_EXT[contentType]) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const ext = MIME_TO_EXT[contentType];
  const path = `${session.user.id}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from("lawn-photos")
    .createSignedUploadUrl(path);

  if (error) {
    console.error("Failed to create signed upload URL:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("lawn-photos").getPublicUrl(path);
  return NextResponse.json({ token: data.token, path, publicUrl });
}
