import { after } from "next/server";
import { logger } from "@/lib/observability/logger";
import { grantEngagementBonusIfEligible } from "@/lib/subscription";

/**
 * Trigger an engagement bonus check after the response is sent. Wraps the
 * grant in next/server's `after()` so the work survives serverless lifecycle,
 * a plain fire-and-forget Promise can be cut off mid-flight on Vercel.
 *
 * Lives in its own file (not lib/subscription.ts) so that Edge runtime
 * consumers (middleware, etc.) that transitively import subscription helpers
 * don't pull `next/server`'s `after()` into their bundle.
 */
export function triggerEngagementBonusCheck(userId: string): void {
  after(async () => {
    try {
      await grantEngagementBonusIfEligible(userId);
    } catch (err) {
      logger.warn("engagement-bonus: grant check failed", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
