import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

const FAILURE_THRESHOLD = 3;

function getApp() {
  if (getApps().length > 0) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const tokens = await db.deviceToken.findMany({
    where: { userId },
    select: { id: true, token: true, platform: true, failureCount: true },
  });
  if (tokens.length === 0) return;

  const messaging = getMessaging(getApp());
  const result = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title: payload.title, body: payload.body },
    ...(payload.data ? { data: payload.data } : {}),
  });

  const settled = await Promise.allSettled(
    result.responses.map(async (resp, i) => {
      const dt = tokens[i]!;
      if (resp.success) {
        await db.deviceToken.update({
          where: { id: dt.id },
          data: { lastUsedAt: new Date(), failureCount: 0 },
        });
        return;
      }
      const next = dt.failureCount + 1;
      if (next >= FAILURE_THRESHOLD) {
        // deleteMany (not delete) so we no-op if the row was concurrently removed
        // by an unregister call or a parallel cron run that also tripped the threshold.
        // Matches the IDOR-safe pattern in app/api/devices/[id]/route.ts.
        await db.deviceToken.deleteMany({ where: { id: dt.id } });
        return;
      }
      await db.deviceToken.update({
        where: { id: dt.id },
        data: { failureCount: next },
      });
    }),
  );
  const bookkeepingErrors = settled.filter((s) => s.status === "rejected");
  if (bookkeepingErrors.length > 0) {
    logger.warn("push.send: some bookkeeping writes failed", {
      userId,
      count: bookkeepingErrors.length,
    });
  }

  if (result.failureCount > 0) {
    const failures = result.responses
      .map((r, i) =>
        r.success
          ? null
          : { id: tokens[i]!.id, code: (r as { error?: { code?: string } }).error?.code ?? "unknown" },
      )
      .filter(Boolean);
    logger.warn("push.send: some deliveries failed", {
      userId,
      success: result.successCount,
      failed: result.failureCount,
      failures,
    });
  }
}
