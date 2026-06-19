import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { DAYS_30_MS } from "@/lib/time";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  // Expired account data deletion
  const deletionCutoff = new Date(Date.now() - DAYS_30_MS);

  const usersToDelete = await db.user.findMany({
    where: {
      OR: [
        {
          planStatus: { in: ["trialing", "expired"] },
          trialEndsAt: { lt: deletionCutoff },
          stripeSubscriptionId: null,
        },
        {
          planStatus: "canceled",
          currentPeriodEnd: { lt: deletionCutoff },
        },
      ],
    },
    select: { id: true, email: true },
    take: 50,
  });

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let deletedCount = 0;
  for (const user of usersToDelete) {
    try {
      const analyses = await db.lawnAnalysis.findMany({
        where: { yardSection: { yard: { userId: user.id } } },
        select: { imageUrls: true },
      });
      const allUrls = analyses.flatMap((a) => a.imageUrls);

      if (allUrls.length > 0) {
        const paths = allUrls
          .map((url) => {
            const match = url.match(/\/object\/public\/[^/]+\/(.+)$/);
            return match ? match[1] : null;
          })
          .filter((p): p is string => p !== null);

        if (paths.length > 0) {
          await supabase.storage.from("lawn-photos").remove(paths);
        }
      }

      await db.user.delete({ where: { id: user.id } });
      deletedCount++;
      console.log(`Deleted expired account: ${user.id}`);
    } catch (err) {
      console.error(`Failed to delete user ${user.id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, deletedAccounts: deletedCount });
}
