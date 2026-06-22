import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { withAxiom, logger } from "@/lib/observability/logger";

export const POST = withAxiom(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body?.confirmation !== "DELETE") {
    return NextResponse.json(
      { error: "Type DELETE to confirm", code: "confirmation_required" },
      { status: 400 },
    );
  }

  const analyses = await db.lawnAnalysis.findMany({
    where: { yardSection: { yard: { userId: session.user.id, archivedAt: { not: null } } } },
    select: { imageUrls: true },
  });
  const allUrls = analyses.flatMap((a) => a.imageUrls);

  if (allUrls.length > 0) {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const paths = allUrls
      .map((url) => {
        const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
        return match ? match[1] : null;
      })
      .filter((p): p is string => p !== null);
    if (paths.length > 0) {
      const { error } = await supabase.storage.from("lawn-photos").remove(paths);
      if (error) {
        logger.warn("yards/archived/delete: supabase remove failed", {
          userId: session.user.id,
          err: error.message,
        });
      }
    }
  }

  const result = await db.yard.deleteMany({
    where: { userId: session.user.id, archivedAt: { not: null } },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
});
