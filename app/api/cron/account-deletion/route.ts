import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { DAYS_30_MS } from "@/lib/time";
import { withAxiom, logger } from "@/lib/observability/logger";
import { emitCronRun } from "@/lib/observability/events";

export const maxDuration = 300;

export const GET = withAxiom(async (req: NextRequest) => {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  let deleted = 0;
  let failed = 0;

  try {
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
        deleted++;
        logger.info("account-deletion: deleted expired account", { userId: user.id });
      } catch (err) {
        failed++;
        logger.error("account-deletion: failed to delete user", {
          userId: user.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    emitCronRun({
      route: "account-deletion",
      ok: true,
      durationMs: Date.now() - startedAt,
      counts: { deleted, failed },
    });
    return NextResponse.json({ ok: true, deletedAccounts: deleted });
  } catch (err) {
    emitCronRun({
      route: "account-deletion",
      ok: false,
      durationMs: Date.now() - startedAt,
      counts: { deleted, failed },
      error: {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      },
    });
    throw err;
  }
});
